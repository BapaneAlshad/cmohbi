import { NextRequest, NextResponse } from "next/server";
import { authEmailFromUsername, isValidPin } from "@/lib/auth-identity";
import { nextCampaignLifecycle } from "@/lib/campaign-lifecycle";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseAuthVerifier } from "@/lib/supabase/auth-verifier";

export const dynamic = "force-dynamic";

type Lifecycle = "active" | "archived" | "trashed";
type LifecycleAction = "archive" | "unarchive" | "trash" | "restore";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function campaignContext(request: NextRequest, id: string) {
  const admin = createSupabaseAdminClient();
  const token = bearerToken(request);
  if (!admin) return { response: NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 }) };
  if (!token) return { response: NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 }) };
  if (!isUuid(id)) return { response: NextResponse.json({ error: "ID campaign tidak valid." }, { status: 400 }) };

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return { response: NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir." }, { status: 401 }) };

  const campaignResult = await admin.from("campaigns")
    .select("id, workspace_id, name, lifecycle_status, archived_at, archived_by, deleted_at, deleted_by, previous_lifecycle_status")
    .eq("id", id).maybeSingle();
  if (campaignResult.error) return { response: NextResponse.json({ error: campaignResult.error.message }, { status: 500 }) };
  if (!campaignResult.data) return { response: NextResponse.json({ error: "Campaign tidak ditemukan." }, { status: 404 }) };

  const membership = await admin.from("workspace_members").select("role")
    .eq("workspace_id", campaignResult.data.workspace_id).eq("user_id", authData.user.id).maybeSingle();
  if (membership.error) return { response: NextResponse.json({ error: membership.error.message }, { status: 500 }) };
  if (!membership.data || !["owner", "admin"].includes(membership.data.role)) {
    return { response: NextResponse.json({ error: "Hanya Owner atau Admin workspace yang dapat mengubah lifecycle campaign." }, { status: 403 }) };
  }
  return { admin, user: authData.user, campaign: campaignResult.data, membership: membership.data };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await campaignContext(request, id);
  if ("response" in context) return context.response;
  const body = await request.json().catch(() => null) as { action?: LifecycleAction } | null;
  const action = body?.action;
  if (!action || !["archive", "unarchive", "trash", "restore"].includes(action)) {
    return NextResponse.json({ error: "Aksi lifecycle tidak valid." }, { status: 400 });
  }

  const current = context.campaign.lifecycle_status as Lifecycle;
  const now = new Date().toISOString();
  const update: Record<string, string | null> = {};
  let next: Lifecycle;
  try {
    next = nextCampaignLifecycle(current, context.campaign.previous_lifecycle_status as Lifecycle | null, action);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transisi lifecycle tidak diizinkan." }, { status: 409 });
  }

  if (action === "archive") {
    Object.assign(update, { lifecycle_status: next, archived_at: now, archived_by: context.user.id });
  } else if (action === "unarchive") {
    Object.assign(update, { lifecycle_status: next, archived_at: null, archived_by: null });
  } else if (action === "trash") {
    Object.assign(update, { lifecycle_status: next, previous_lifecycle_status: current, deleted_at: now, deleted_by: context.user.id });
  } else {
    Object.assign(update, { lifecycle_status: next, previous_lifecycle_status: null, deleted_at: null, deleted_by: null });
    if (next === "active") Object.assign(update, { archived_at: null, archived_by: null });
  }

  const updated = await context.admin.from("campaigns").update(update).eq("id", id).eq("workspace_id", context.campaign.workspace_id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  await context.admin.from("campaign_audit_logs").insert({
    workspace_id: context.campaign.workspace_id,
    campaign_id: id,
    campaign_name: context.campaign.name,
    action,
    actor_id: context.user.id,
    metadata: { from: current, to: next },
  });
  return NextResponse.json({ campaign: updated.data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await campaignContext(request, id);
  if ("response" in context) return context.response;
  if (context.campaign.lifecycle_status !== "trashed") return NextResponse.json({ error: "Campaign harus berada di daftar Dihapus sebelum dihapus permanen." }, { status: 409 });

  const profile = await context.admin.from("profiles").select("username, job_title").eq("id", context.user.id).maybeSingle();
  if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 500 });
  const title = String(profile.data?.job_title || "").trim().toLowerCase();
  if (!profile.data?.username || (!['cmo', 'super admin'].includes(title) && context.membership.role !== "owner")) {
    return NextResponse.json({ error: "Hapus permanen hanya dapat dilakukan oleh CMO atau Super Admin." }, { status: 403 });
  }

  const attempts = await context.admin.from("campaign_delete_pin_attempts").select("failed_attempts, locked_until").eq("user_id", context.user.id).maybeSingle();
  if (attempts.error) return NextResponse.json({ error: "Migrasi keamanan Campaign belum diterapkan." }, { status: 503 });
  const lockedUntil = attempts.data?.locked_until ? new Date(attempts.data.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
    return NextResponse.json({ error: `Terlalu banyak PIN salah. Coba lagi dalam ${Math.ceil(seconds / 60)} menit.`, retryAfter: seconds }, { status: 429, headers: { "Retry-After": String(seconds) } });
  }

  const body = await request.json().catch(() => null) as { pin?: string } | null;
  const pin = String(body?.pin || "");
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN keamanan harus terdiri dari 6 angka." }, { status: 400 });
  const verifier = createSupabaseAuthVerifier();
  if (!verifier) return NextResponse.json({ error: "Konfigurasi verifikasi PIN server belum lengkap." }, { status: 503 });
  const verification = await verifier.auth.signInWithPassword({ email: authEmailFromUsername(profile.data.username), password: pin });
  const pinValid = !verification.error && verification.data.user?.id === context.user.id;
  if (!pinValid) {
    const previousFailures = lockedUntil && lockedUntil.getTime() <= Date.now() ? 0 : Number(attempts.data?.failed_attempts || 0);
    const failedAttempts = Math.min(5, previousFailures + 1);
    const newLock = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await context.admin.from("campaign_delete_pin_attempts").upsert({ user_id: context.user.id, failed_attempts: failedAttempts, locked_until: newLock, last_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await context.admin.from("campaign_audit_logs").insert({ workspace_id: context.campaign.workspace_id, campaign_id: id, campaign_name: context.campaign.name, action: "permanent_delete_pin_failed", actor_id: context.user.id, metadata: { failed_attempts: failedAttempts, cooldown_started: Boolean(newLock) } });
    return NextResponse.json({ error: newLock ? "PIN salah 5 kali. Penghapusan dikunci selama 15 menit." : `PIN salah. Sisa percobaan: ${5 - failedAttempts}.` }, { status: newLock ? 429 : 401 });
  }
  await context.admin.from("campaign_delete_pin_attempts").delete().eq("user_id", context.user.id);

  const [tasks, bookings] = await Promise.all([
    context.admin.from("tasks").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    context.admin.from("influencer_bookings").select("id", { count: "exact", head: true }).eq("campaign_id", id),
  ]);
  if (tasks.error || bookings.error) return NextResponse.json({ error: (tasks.error || bookings.error)?.message || "Dependency campaign gagal diperiksa." }, { status: 500 });
  const dependencyCounts = { tasks: tasks.count || 0, influencerBookings: bookings.count || 0 };
  if (dependencyCounts.tasks || dependencyCounts.influencerBookings) {
    await context.admin.from("campaign_audit_logs").insert({ workspace_id: context.campaign.workspace_id, campaign_id: id, campaign_name: context.campaign.name, action: "permanent_delete_blocked", actor_id: context.user.id, metadata: dependencyCounts });
    return NextResponse.json({ error: `Campaign tidak dapat dihapus permanen karena masih memiliki ${dependencyCounts.tasks} tugas dan ${dependencyCounts.influencerBookings} jadwal influencer. Pulihkan lalu pindahkan/hapus relasinya terlebih dahulu.` }, { status: 409 });
  }

  const deleted = await context.admin.from("campaigns").delete().eq("id", id).eq("workspace_id", context.campaign.workspace_id);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  await context.admin.from("campaign_audit_logs").insert({ workspace_id: context.campaign.workspace_id, campaign_id: id, campaign_name: context.campaign.name, action: "permanent_delete", actor_id: context.user.id, metadata: { verified_with_login_pin: true } });
  return NextResponse.json({ message: "Campaign berhasil dihapus permanen." });
}

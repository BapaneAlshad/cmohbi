import { NextRequest, NextResponse } from "next/server";
import { demoData } from "@/lib/demo-data";
import { isValidUsername, normalizeUsername } from "@/lib/auth-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function displayRole(jobTitle: string | null | undefined, membershipRole: string | null | undefined) {
  if (jobTitle) return jobTitle;
  if (membershipRole === "owner") return "Super Admin";
  if (membershipRole === "admin") return "Admin";
  if (membershipRole === "viewer") return "Viewer";
  return "Member";
}

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const token = bearerToken(request);

  if (!admin) {
    return NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 });
  }
  if (!token) {
    return NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) {
    return NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir." }, { status: 401 });
  }

  const existingProfileResult = await admin
    .from("profiles")
    .select("full_name, username, email, whatsapp, job_title")
    .eq("id", user.id)
    .maybeSingle();
  if (existingProfileResult.error) return NextResponse.json({ error: existingProfileResult.error.message }, { status: 500 });

  const existingProfile = existingProfileResult.data;
  const metadata = user.user_metadata || {};
  const rawUsername = String(existingProfile?.username || metadata.username || user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`);
  const username = normalizeUsername(rawUsername);
  const fullName = String(existingProfile?.full_name || metadata.full_name || metadata.name || "Pengguna HBI");
  const profileEmail = String(existingProfile?.email || metadata.email || "").trim().toLowerCase();
  const whatsapp = String(existingProfile?.whatsapp || metadata.whatsapp || "").trim();
  const profilePayload: Record<string, string> = {
    id: user.id,
    username: isValidUsername(username) ? username : `user_${user.id.slice(0, 8)}`,
    full_name: fullName,
    email: profileEmail,
    whatsapp,
    updated_at: new Date().toISOString(),
  };
  if (!existingProfile) profilePayload.job_title = "CMO";
  const { error: profileError } = await admin.from("profiles").upsert(profilePayload);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const membershipResult = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipResult.error) return NextResponse.json({ error: membershipResult.error.message }, { status: 500 });

  let workspaceId = membershipResult.data?.workspace_id as string | undefined;
  let membershipRole = membershipResult.data?.role as "owner" | "admin" | "member" | "viewer" | undefined;
  if (!workspaceId) {
    const ownedWorkspace = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (ownedWorkspace.error) return NextResponse.json({ error: ownedWorkspace.error.message }, { status: 500 });

    workspaceId = ownedWorkspace.data?.id;
    if (!workspaceId) {
      const createdWorkspace = await admin.from("workspaces").insert({
        name: "HBI Marketing",
        slug: `hbi-marketing-${user.id.slice(0, 8)}`,
        owner_id: user.id,
      }).select("id").single();
      if (createdWorkspace.error) return NextResponse.json({ error: createdWorkspace.error.message }, { status: 500 });
      workspaceId = createdWorkspace.data.id;
    }

    const { error: memberError } = await admin.from("workspace_members").upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
    });
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
    membershipRole = "owner";
  }

  const countResult = await admin.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (countResult.error) return NextResponse.json({ error: countResult.error.message }, { status: 500 });

  if ((countResult.count ?? 0) === 0) {
    const campaignIds = demoData.campaigns.map(() => crypto.randomUUID());
    const campaigns = demoData.campaigns.map((campaign, index) => ({
      id: campaignIds[index],
      workspace_id: workspaceId,
      name: campaign.name,
      brand: campaign.brand,
      objective: campaign.kpi,
      kpi: campaign.kpi,
      budget: campaign.budget,
      spent: campaign.spent,
      status: campaign.status,
      progress: campaign.progress,
      owner_id: user.id,
      start_date: `2026-${index === 3 ? "07" : "08"}-01`,
      end_date: `2026-${index === 0 || index === 3 ? "08-31" : "09-30"}`,
    }));
    const campaignInsert = await admin.from("campaigns").insert(campaigns);
    if (campaignInsert.error) return NextResponse.json({ error: campaignInsert.error.message }, { status: 500 });

    const tasks = demoData.tasks.map((task, index) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      campaign_id: typeof task.campaign === "number" ? campaignIds[task.campaign - 1] : null,
      title: task.title,
      status: ({ Backlog: "backlog", "To Do": "todo", "In Progress": "in_progress", Review: "review", Revisi: "revision", Done: "done" } as Record<string, string>)[task.status],
      priority: task.priority,
      due_date: `2026-08-${String(11 + index).padStart(2, "0")}`,
      assignee_id: user.id,
      created_by: user.id,
    }));
    const taskInsert = await admin.from("tasks").insert(tasks);
    if (taskInsert.error) return NextResponse.json({ error: taskInsert.error.message }, { status: 500 });

    const bookingInsert = await admin.from("influencer_bookings").insert([
      { id: crypto.randomUUID(), workspace_id: workspaceId, influencer_name: "Nadia Kuliner", platform: "instagram", campaign_id: campaignIds[0], content_title: "Reels menu spesial kemerdekaan", scheduled_at: "2026-10-12T19:00:00+07:00", status: "Terjadwal", rate: 8500000, spent: 4250000, payment_status: "DP dibayar", notes: "Final brief sudah dikirim", created_by: user.id },
      { id: crypto.randomUUID(), workspace_id: workspaceId, influencer_name: "Arief Makan", platform: "tiktok", campaign_id: campaignIds[2], content_title: "Review paket weekend", scheduled_at: "2026-10-14T16:00:00+07:00", status: "Selesai", rate: 5500000, spent: 5500000, payment_status: "Lunas", notes: "Insight menunggu upload", created_by: user.id },
      { id: crypto.randomUUID(), workspace_id: workspaceId, influencer_name: "Jalan-Jalan Yuk", platform: "facebook", campaign_id: campaignIds[1], content_title: "Video kunjungan outlet BSD", scheduled_at: "2026-10-18T12:00:00+07:00", status: "Draft", rate: 12000000, spent: 0, payment_status: "Belum dibayar", notes: "Menunggu konfirmasi jadwal", created_by: user.id },
    ]);
    if (bookingInsert.error && bookingInsert.error.code !== "42P01") return NextResponse.json({ error: bookingInsert.error.message }, { status: 500 });
  }

  return NextResponse.json({
    workspaceId,
    profile: {
      id: user.id,
      name: fullName,
      username: profilePayload.username,
      email: profileEmail,
      whatsapp,
      role: displayRole(existingProfile?.job_title, membershipRole),
      accessRole: membershipRole || "member",
    },
  });
}

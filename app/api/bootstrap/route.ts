import { NextRequest, NextResponse } from "next/server";
import { demoData } from "@/lib/demo-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
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

  const fullName = String(user.user_metadata.full_name || user.user_metadata.name || user.email?.split("@")[0] || "Pengguna HBI");
  const { error: profileError } = await admin.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    job_title: "CMO",
    updated_at: new Date().toISOString(),
  });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const membershipResult = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipResult.error) return NextResponse.json({ error: membershipResult.error.message }, { status: 500 });

  let workspaceId = membershipResult.data?.workspace_id as string | undefined;
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
  }

  return NextResponse.json({
    workspaceId,
    profile: { id: user.id, name: fullName, email: user.email || "" },
  });
}

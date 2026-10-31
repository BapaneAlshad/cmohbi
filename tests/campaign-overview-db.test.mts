import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("campaign overview and activity migrations enforce KPI RLS and retain combined immutable histories", async () => {
  const db = new PGlite();
  const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const workspace = "10000000-0000-4000-8000-000000000001";
  const otherWorkspace = "10000000-0000-4000-8000-000000000002";
  const campaign = "20000000-0000-4000-8000-000000000001";
  const task = "30000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create type public.task_status as enum ('backlog','todo','in_progress','review','revision','done');
      create table public.profiles (id uuid primary key, full_name text);
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid, role text);
      create table public.campaigns (id uuid primary key, workspace_id uuid, lifecycle_status text default 'active', timeline_config jsonb default '{"phases":[{"id":"phase-a"}],"taskPhase":{}}');
      create table public.tasks (id uuid primary key, workspace_id uuid, campaign_id uuid, title text, status public.task_status default 'todo', due_date date, priority text, content_calendar_type text, assignee_id uuid, created_by uuid, updated_at timestamptz);
      create table public.task_assignees(task_id uuid references public.tasks, user_id uuid references public.profiles, primary key(task_id,user_id));
      create function public.is_workspace_member(w uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()) $$;
      create function public.is_workspace_manager(w uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','admin')) $$;
      grant select on public.profiles,public.workspace_members,public.campaigns to authenticated;
      grant update on public.campaigns to authenticated;
      grant select,insert,update on public.tasks to authenticated;
      grant select,insert,delete on public.task_assignees to authenticated;
      alter table public.tasks enable row level security;
      create policy read_tasks on public.tasks for select to authenticated using(public.is_workspace_member(workspace_id));
      create policy write_tasks on public.tasks for update to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=tasks.workspace_id and m.user_id=auth.uid() and m.role <> 'viewer'));
      insert into public.workspaces values ('${workspace}'),('${otherWorkspace}');
      insert into public.profiles values ${[1, 2, 3, 4, 5].map((n) => `('${user(n)}','User ${n}')`).join(",")};
      insert into public.workspace_members values ('${workspace}','${user(1)}','owner'),('${workspace}','${user(2)}','admin'),('${workspace}','${user(3)}','member'),('${workspace}','${user(4)}','viewer'),('${otherWorkspace}','${user(5)}','owner');
      insert into public.campaigns(id,workspace_id,lifecycle_status) values ('${campaign}','${workspace}','active');
      insert into public.tasks(id,workspace_id,campaign_id,title,status,content_calendar_type) values ('${task}','${workspace}','${campaign}','Task awal','todo','reels');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261030100000_campaign_overview_and_task_history.sql", import.meta.url), "utf8"));
    await db.exec(`
      create table public.campaign_influencer_themes(id uuid primary key, workspace_id uuid, campaign_id uuid, name text);
      create table public.influencer_bookings(
        id uuid primary key, workspace_id uuid not null, campaign_id uuid, influencer_id uuid,
        influencer_name text not null, campaign_influencer_theme_id uuid, content_title text,
        status text not null, payment_status text not null
      );
      grant select,update,delete on public.influencer_bookings to authenticated;
      alter table public.influencer_bookings enable row level security;
      create policy workspace_reads_bookings on public.influencer_bookings for select to authenticated using(public.is_workspace_member(workspace_id));
      create policy workspace_updates_bookings on public.influencer_bookings for update to authenticated using(public.is_workspace_member(workspace_id));
      insert into public.campaign_influencer_themes values ('40000000-0000-4000-8000-000000000001','${workspace}','${campaign}','Menu Baru');
      insert into public.influencer_bookings values ('50000000-0000-4000-8000-000000000001','${workspace}','${campaign}',null,'Nadia Kuliner','40000000-0000-4000-8000-000000000001','Menu Baru','Terjadwal','Belum dibayar');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261031130000_campaign_activity_history.sql", import.meta.url), "utf8"));
    const login = async (n: number) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user(n)]); await db.exec("set role authenticated"); };
    const mutate = (patch: Record<string, unknown>) => db.query("select public.update_marketing_task($1,$2::jsonb)", [task, JSON.stringify(patch)]);
    const historyCount = async () => (await db.query<{ count: number }>("select count(*)::int as count from public.task_status_history")).rows[0].count;

    await login(1);
    await db.query("insert into public.campaign_kpis(workspace_id,campaign_id,name,unit,baseline,target_increase,current_value) values($1,$2,'Followers','followers',1000,200,1080)", [workspace, campaign]);
    assert.equal((await db.query("select * from public.campaign_kpis")).rows.length, 1);
    await login(2);
    await db.query("update public.campaign_kpis set current_value=1300");
    assert.equal((await db.query<{ value: string }>("select current_value::text as value from public.campaign_kpis")).rows[0].value, "1300.0000");
    await assert.rejects(db.query("update public.campaign_kpis set target_increase=0"));
    await login(3);
    assert.equal((await db.query("update public.campaign_kpis set current_value=9999 returning id")).rows.length, 0);
    await assert.rejects(db.query("insert into public.campaign_kpis(workspace_id,campaign_id,name,unit,target_increase) values($1,$2,'Denied','followers',10)", [workspace, campaign]));
    await mutate({ status: "review", title: "Task diperbarui", assignee_ids: [user(2), user(3)], content_calendar_type: null, due_date: "2020-01-01", phase_id: "phase-a" });
    assert.equal(await historyCount(), 1);
    const record = (await db.query<{ actor_id: string; task_title: string; old_status: string; new_status: string }>("select * from public.task_status_history")).rows[0];
    assert.equal(record.actor_id, user(3)); assert.equal(record.task_title, "Task diperbarui"); assert.equal(record.old_status, "todo"); assert.equal(record.new_status, "review");
    assert.equal((await db.query<{ value: string | null }>("select content_calendar_type as value from public.tasks")).rows[0].value, null);
    assert.equal((await db.query("select * from public.task_assignees")).rows.length, 2);
    await db.query("select public.save_campaign_timeline($1,false,'[]'::jsonb)", [campaign]);
    assert.equal((await db.query<{ phase: string }>("select timeline_config->'taskPhase'->>$1 as phase from public.campaigns", [task])).rows[0].phase, "phase-a");
    await mutate({ status: "review" }); assert.equal(await historyCount(), 1);
    await mutate({ status: "done" }); assert.equal(await historyCount(), 2);
    await assert.rejects(mutate({ status: "todo", assignee_ids: [user(5)] }));
    assert.equal(await historyCount(), 2); // Invalid edit rolls back both task and log.
    await assert.rejects(db.query("delete from public.task_status_history"));
    await assert.rejects(db.query("update public.task_status_history set actor_name='Spoofed'"));
    await assert.rejects(db.query("insert into public.task_status_history(workspace_id,task_id,task_title,actor_name,old_status,new_status) values($1,$2,'Fake','Fake','todo','done')", [workspace, task]));
    await login(4); await assert.rejects(mutate({ status: "todo" })); assert.equal(await historyCount(), 2);
    await login(5); assert.equal((await db.query("select * from public.campaign_kpis")).rows.length, 0); assert.equal(await historyCount(), 0); await assert.rejects(mutate({ status: "todo" }));
    await login(3);
    const booking = "50000000-0000-4000-8000-000000000001";
    await db.query("update public.influencer_bookings set status='Sudah visit' where id=$1", [booking]);
    await db.query("update public.influencer_bookings set status='Sudah visit' where id=$1", [booking]);
    await db.query("update public.influencer_bookings set payment_status='DP dibayar' where id=$1", [booking]);
    const influencerHistory = (await db.query<{ actor_id: string; actor_name: string; influencer_name: string; content_label: string; old_status: string; new_status: string }>("select * from public.campaign_influencer_status_history")).rows;
    assert.equal(influencerHistory.length, 1);
    assert.equal(influencerHistory[0].actor_id, user(3)); assert.equal(influencerHistory[0].actor_name, "User 3");
    assert.equal(influencerHistory[0].influencer_name, "Nadia Kuliner"); assert.equal(influencerHistory[0].content_label, "Menu Baru");
    assert.equal(influencerHistory[0].old_status, "Terjadwal"); assert.equal(influencerHistory[0].new_status, "Sudah visit");
    const feed = (await db.query<{ kind: string; label: string; from_status: string; to_status: string }>("select * from public.campaign_activity_feed where campaign_id=$1 order by created_at desc", [campaign])).rows;
    assert.equal(feed.length, 3); assert.equal(feed[0].kind, "influencer_status");
    assert.equal(feed[0].label, "Jadwal influencer: Nadia Kuliner · Menu Baru"); assert.equal(feed[0].from_status, "Terjadwal");
    assert.ok(feed.some((item) => item.kind === "task_status" && item.label === "Tugas: Task diperbarui"));
    await assert.rejects(db.query("insert into public.campaign_influencer_status_history(workspace_id,campaign_id,booking_id,influencer_name,content_label,actor_name,old_status,new_status) values($1,$2,$3,'X','Y','Fake','A','B')", [workspace,campaign,booking]));
    await login(5); assert.equal((await db.query("select * from public.campaign_activity_feed where campaign_id=$1", [campaign])).rows.length, 0);
    await login(3); await db.query("delete from public.influencer_bookings where id=$1", [booking]);
    assert.equal((await db.query("select * from public.campaign_influencer_status_history")).rows.length, 1);
    await db.exec("reset role"); await db.query("update public.campaigns set lifecycle_status='archived' where id=$1", [campaign]);
    await login(1); await assert.rejects(mutate({ status: "todo" })); await assert.rejects(db.query("update public.campaign_kpis set current_value=1400"));
  } finally { await db.close(); }
});

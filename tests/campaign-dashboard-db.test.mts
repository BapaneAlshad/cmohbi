import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("dashboard note migration persists campaign membership and enforces recipient/author permissions", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const workspace = id(100), otherWorkspace = id(101), campaign = id(200), otherCampaign = id(201), task = id(300);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.profiles(id uuid primary key, full_name text);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid references public.workspaces(id), user_id uuid references public.profiles(id), role text not null, primary key(workspace_id,user_id));
      create table public.campaigns(id uuid primary key, workspace_id uuid references public.workspaces(id), lifecycle_status text default 'active');
      create table public.tasks(id uuid primary key, workspace_id uuid references public.workspaces(id), campaign_id uuid references public.campaigns(id), assignee_id uuid references public.profiles(id), title text, status text default 'todo');
      create table public.task_assignees(task_id uuid references public.tasks(id), user_id uuid references public.profiles(id), primary key(task_id,user_id));
      create function public.is_workspace_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=auth.uid()) $$;
      create function public.is_workspace_manager(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=auth.uid() and m.role in ('owner','admin')) $$;
      grant select on public.profiles,public.workspaces,public.workspace_members,public.campaigns,public.tasks,public.task_assignees to authenticated;
      grant update on public.campaigns to authenticated;
      grant insert on public.tasks to authenticated;
      insert into public.workspaces values ('${workspace}'),('${otherWorkspace}');
      insert into public.profiles values ('${id(1)}','Owner'),('${id(2)}','Member'),('${id(3)}','Viewer'),('${id(4)}','Other workspace member');
      insert into public.workspace_members values ('${workspace}','${id(1)}','owner'),('${workspace}','${id(2)}','member'),('${workspace}','${id(3)}','viewer'),('${otherWorkspace}','${id(4)}','owner');
      insert into public.campaigns(id,workspace_id) values ('${campaign}','${workspace}'),('${otherCampaign}','${otherWorkspace}');
      insert into public.tasks(id,workspace_id,campaign_id,assignee_id,title) values ('${task}','${workspace}','${campaign}','${id(2)}','Task lama');
      insert into public.task_assignees values ('${task}','${id(2)}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261031150000_campaign_dashboard_notes.sql", import.meta.url), "utf8"));
    const login = async (userId: string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]); await db.exec("set role authenticated"); };

    await login(id(1));
    assert.deepEqual((await db.query("select campaign_id,user_id from public.campaign_members")).rows, [{ campaign_id: campaign, user_id: id(2) }]);
    await db.query("select public.save_campaign_members($1,$2::uuid[])", [campaign, [id(2), id(1)]]);
    await db.query("insert into public.tasks(id,workspace_id,campaign_id,assignee_id,title) values($1,$2,$3,$4,'Task baru')", [id(301), workspace, campaign, id(3)]);
    assert.equal((await db.query("select count(*)::int as n from public.campaign_members where user_id=$1", [id(3)])).rows[0].n, 1);
    const adminNote = (await db.query<{ save_admin_dashboard_note: { id: string } }>("select public.save_admin_dashboard_note($1,null,'Brief penting','Cek visual',null,$2::uuid[])", [workspace, [id(2)]])).rows[0].save_admin_dashboard_note;
    assert.ok(adminNote.id);
    await db.query("select public.create_campaign_note($1,'Catatan yang dipin',null)", [campaign]);
    const noteId = (await db.query<{ id: string }>("select id from public.campaign_notes where body='Catatan yang dipin'")).rows[0].id;
    await db.query("select public.set_campaign_note_pinned($1,$2,true)", [campaign, noteId]);
    await assert.rejects(db.query("insert into public.admin_dashboard_notes(workspace_id,title,body,created_by_name) values($1,'Direct','Denied','Owner')", [workspace]));

    await login(id(2));
    assert.equal((await db.query("select id from public.admin_dashboard_notes")).rows.length, 1);
    assert.equal((await db.query("select count(*)::int as n from public.admin_dashboard_note_recipients")).rows[0].n, 1);
    assert.equal((await db.query("select pinned_to_dashboard from public.campaign_notes where id=$1", [noteId])).rows[0].pinned_to_dashboard, true);
    await db.query("select public.create_campaign_note($1,'Balasan', $2)", [campaign, noteId]);
    await assert.rejects(db.query("select public.save_campaign_members($1,$2::uuid[])", [campaign, [id(4)]]));
    await assert.rejects(db.query("select public.save_admin_dashboard_note($1,null,'Denied','Denied',null,$2::uuid[])", [workspace, [id(2)]]));
    await assert.rejects(db.query("select public.set_campaign_note_pinned($1,$2,false)", [campaign, noteId]));
    await assert.rejects(db.query("select public.delete_admin_dashboard_note($1,$2)", [workspace, adminNote.id]));
    await assert.rejects(db.query("select public.create_campaign_note($1,'Cross-workspace',null)", [otherCampaign]));

    await login(id(3));
    await assert.rejects(db.query("select public.create_campaign_note($1,'Viewer cannot write',null)", [campaign]));
    await assert.rejects(db.query("select public.set_campaign_note_pinned($1,$2,false)", [campaign, noteId]));
    await login(id(4));
    assert.equal((await db.query("select * from public.campaign_notes")).rows.length, 0);
    assert.equal((await db.query("select * from public.admin_dashboard_notes")).rows.length, 0);
  } finally { await db.close(); }
});

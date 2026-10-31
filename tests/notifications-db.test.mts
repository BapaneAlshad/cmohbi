import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("notification migration creates private rows from task and campaign changes", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role bypassrls;
      create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create or replace function public.gen_random_uuid() returns uuid language sql volatile as $$ select (substr(md5(random()::text),1,8)||'-'||substr(md5(random()::text),9,4)||'-4'||substr(md5(random()::text),14,3)||'-8'||substr(md5(random()::text),18,3)||'-'||substr(md5(random()::text),21,12))::uuid $$;
      create table public.profiles(id uuid primary key);
      create table public.workspaces(id uuid primary key, owner_id uuid);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
      create table public.campaigns(id uuid primary key,workspace_id uuid not null,name text not null,brand text not null,status text,start_date date,end_date date,owner_id uuid);
      create table public.tasks(id uuid primary key,workspace_id uuid not null,campaign_id uuid,title text,status text,due_date date,priority text,assignee_id uuid,created_by uuid);
      create table public.task_assignees(task_id uuid,user_id uuid,primary key(task_id,user_id));
      create or replace function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable as $$ select true $$;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261030041828_user_notifications.sql", import.meta.url), "utf8"));
    const workspace = id(10), user = id(1), campaign = id(20), task = id(30);
    await db.exec(`insert into public.workspaces values('${workspace}','${user}'); insert into public.profiles values('${user}'); insert into public.workspace_members values('${workspace}','${user}','member'); insert into public.campaigns values('${campaign}','${workspace}','Campaign HBI','HBI','Rencana','2026-10-01','2026-10-31',null);`);
    await db.exec(`insert into public.tasks values('${task}','${workspace}','${campaign}','Tugas pertama','todo','2026-10-30','Sedang','${user}',null);`);
    let rows = await db.query<{ id: string; kind: string; title: string; recipient_id: string }>("select id,kind,title,recipient_id from public.notifications");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].kind, "task_created");
    assert.equal(rows.rows[0].recipient_id, user);
    await db.exec(`update public.tasks set status='review' where id='${task}'; update public.campaigns set name='Campaign HBI Baru' where id='${campaign}';`);
    rows = await db.query<{ id: string; kind: string; title: string }>("select id,kind,title from public.notifications order by created_at asc, id asc");
    assert.equal(rows.rows.length, 3);
    assert.equal(rows.rows.filter((row) => row.kind === "task_changed").length, 1);
    assert.equal(rows.rows.find((row) => row.kind === "task_changed")?.title, "Status tugas berubah");
    assert.equal(rows.rows.filter((row) => row.kind === "campaign_changed").length, 1);
    await db.query("select public.mark_notification_read($1::uuid)", [rows.rows[0].id]);
  } finally { await db.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Obsidian marketing memory is allowlisted, workspace-scoped, and read-only for app users", async () => {
  const db = new PGlite();
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  const workspace = id(10), otherWorkspace = id(11), member = id(1), foreignMember = id(2);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid not null, user_id uuid not null, role text not null);
      insert into public.workspaces values ('${workspace}'), ('${otherWorkspace}');
      insert into public.workspace_members values ('${workspace}', '${member}', 'member'), ('${otherWorkspace}', '${foreignMember}', 'member');
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid())
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant select on public.workspace_members, public.workspaces to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261125000000_hermes_marketing_memory.sql", import.meta.url), "utf8"));

    await db.exec("set role service_role");
    await db.query(`insert into public.hermes_marketing_memory(workspace_id,source_path,title,content) values($1,$2,'Brief','approved')`, [workspace, "Business/Brief-Konten-Opening-Sukho.md"]);
    await assert.rejects(db.query(`insert into public.hermes_marketing_memory(workspace_id,source_path,title,content) values($1,$2,'Private','no')`, [workspace, "Profile/Keuangan.md"]));

    const login = async (userId: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.exec("set role authenticated");
    };
    await login(member);
    assert.equal((await db.query("select content from public.hermes_marketing_memory")).rows.length, 1);
    await assert.rejects(db.query("update public.hermes_marketing_memory set content='changed'"));
    await assert.rejects(db.query("delete from public.hermes_marketing_memory"));

    await login(foreignMember);
    assert.equal((await db.query("select content from public.hermes_marketing_memory")).rows.length, 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from public.hermes_marketing_memory"));
  } finally {
    await db.close();
  }
});

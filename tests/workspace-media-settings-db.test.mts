import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("workspace companion settings are readable by members and writable only by workspace managers", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const workspace = id(10), foreignWorkspace = id(11), owner = id(1), member = id(2), viewer = id(3), foreignOwner = id(4);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.workspaces(id uuid primary key);
      create table public.profiles(id uuid primary key);
      create table public.workspace_members(workspace_id uuid not null, user_id uuid not null, role text not null);
      insert into public.workspaces values ('${workspace}'),('${foreignWorkspace}');
      insert into public.profiles values ('${owner}'),('${member}'),('${viewer}'),('${foreignOwner}');
      insert into public.workspace_members values
        ('${workspace}','${owner}','owner'),('${workspace}','${member}','member'),('${workspace}','${viewer}','viewer'),('${foreignWorkspace}','${foreignOwner}','owner');
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid())
      $$;
      create function public.is_workspace_manager(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role in ('owner','admin'))
      $$;
      grant usage on schema public,auth to anon,authenticated;
      grant select,insert,update on public.workspace_members,public.workspaces,public.profiles to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261113032449_workspace_media_companion_settings.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261113060540_gallery_lan_storage_url.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261113071018_gallery_lan_storage_pairing.sql", import.meta.url), "utf8"));

    const login = async (userId: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.exec("set role authenticated");
    };

    await login(owner);
    await db.query("insert into public.workspace_media_settings(workspace_id,updated_by) values($1,$2)", [workspace, owner]);
    const initial = (await db.query("select lan_storage_id,lan_storage_url from public.workspace_media_settings")).rows[0];
    assert.equal(initial.lan_storage_url, "");
    assert.match(String(initial.lan_storage_id), /^[a-f0-9-]{36}$/);
    await db.query("insert into public.workspace_media_settings(workspace_id,updated_by) values($1,$2) on conflict do nothing", [workspace, owner]);
    await db.query("update public.workspace_media_settings set companion_url=$1, companion_access_pin=$2", ["http://192.168.0.10:8765", "access-pin-123"]);
    await assert.rejects(db.query("update public.workspace_media_settings set lan_storage_url='http://files.example.com:8766'"));
    await assert.rejects(db.query("update public.workspace_media_settings set lan_storage_url='https://files.example.com:65536'"));
    await db.query("update public.workspace_media_settings set lan_storage_url='https://files.example.com:9876'");
    assert.equal((await db.query("select lan_storage_id from public.workspace_media_settings")).rows[0].lan_storage_id, initial.lan_storage_id);
    await db.query("update public.workspace_media_settings set lan_storage_url='https://files.example.com:8766'");
    assert.equal((await db.query("select companion_access_pin from public.workspace_media_settings")).rows[0].companion_access_pin, "access-pin-123");
    assert.equal((await db.query("select column_name from information_schema.columns where table_name='workspace_media_settings' and column_name ilike '%compress%'")).rows.length, 0);

    await login(member);
    assert.deepEqual((await db.query("select workspace_id,lan_storage_url from public.workspace_media_settings")).rows,
      [{ workspace_id: workspace, lan_storage_url: "https://files.example.com:8766" }]);
    assert.equal((await db.query("update public.workspace_media_settings set lan_storage_url='https://other.example.com:8766'")).affectedRows, 0);
    await assert.rejects(db.query("insert into public.workspace_media_settings(workspace_id,companion_url,companion_access_pin,updated_by) values($1,'http://192.168.1.2:8765','pin-1234',$2)", [foreignWorkspace, member]));
    const memberUpdate = await db.query("update public.workspace_media_settings set companion_access_pin='changed-pin' where workspace_id=$1", [workspace]);
    assert.equal(memberUpdate.affectedRows, 0, "RLS should make unauthorized updates affect no rows");

    await login(viewer);
    assert.equal((await db.query("select workspace_id from public.workspace_media_settings")).rows.length, 1);
    await assert.rejects(db.query("insert into public.workspace_media_settings(workspace_id,companion_url,companion_access_pin,updated_by) values($1,'http://192.168.1.2:8765','pin-1234',$2)", [workspace, viewer]));

    await login(foreignOwner);
    assert.equal((await db.query("select lan_storage_url from public.workspace_media_settings")).rows.length, 0);

    await login(owner);
    await db.query("update public.workspace_media_settings set companion_access_pin='new-access-pin',updated_by=$2 where workspace_id=$1", [workspace, owner]);
    assert.equal((await db.query("select companion_access_pin from public.workspace_media_settings")).rows[0].companion_access_pin, "new-access-pin");

    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select * from public.workspace_media_settings"));
  } finally {
    await db.close();
  }
});

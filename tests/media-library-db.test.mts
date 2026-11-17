import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Gallery GDrive keeps credentials server-only and catalog writes behind the service role", async () => {
  const db = new PGlite();
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  const workspace = id(10), otherWorkspace = id(11);
  const owner = id(1), member = id(2), viewer = id(3), foreignOwner = id(4);
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
      create table public.profiles(id uuid primary key);
      create table public.workspace_members(workspace_id uuid not null, user_id uuid not null, role text not null);
      create table public.campaigns(id uuid primary key, workspace_id uuid not null references public.workspaces(id));
      insert into public.workspaces values ('${workspace}'), ('${otherWorkspace}');
      insert into public.profiles values ('${owner}'), ('${member}'), ('${viewer}'), ('${foreignOwner}');
      insert into public.workspace_members values
        ('${workspace}', '${owner}', 'owner'),
        ('${workspace}', '${member}', 'member'),
        ('${workspace}', '${viewer}', 'viewer'),
        ('${otherWorkspace}', '${foreignOwner}', 'owner');
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid())
      $$;
      create function public.is_workspace_manager(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role in ('owner','admin'))
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant select on public.workspace_members, public.workspaces, public.profiles, public.campaigns to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261112041407_media_library_catalog.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261116115834_gallery_gdrive_sync_permissions.sql", import.meta.url), "utf8"));

    const login = async (userId: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.exec("set role authenticated");
    };
    const addAsset = (assetId: string, userId: string, targetWorkspace = workspace) => db.query(`
      insert into public.media_assets(id,workspace_id,created_by,storage_source,folder_path,file_name,mime_type,byte_size,original_location,original_file_id)
      values($1,$2,$3,'drive','Campaign','footage.jpg','image/jpeg',123,'https://drive.google.com/file/d/file/view','file-123') returning id
    `, [assetId, targetWorkspace, userId]);

    const ownerAsset = id(20);
    await db.exec("reset role; set role service_role");
    assert.equal((await addAsset(ownerAsset, owner)).rows.length, 1);
    assert.equal((await db.query(`
      insert into public.workspace_google_drive_connections(workspace_id,connected_by,google_subject,account_email,root_folder_id,encrypted_refresh_token)
      values($1,$2,'google-user','owner@example.com','root-1','encrypted') returning workspace_id
    `, [workspace, owner])).rows.length, 1);

    await login(owner);
    assert.equal((await db.query("select id from public.media_assets")).rows.length, 1);
    await assert.rejects(addAsset(id(21), owner));
    await assert.rejects(db.query("select * from public.workspace_google_drive_connections"));
    await assert.rejects(db.query("delete from public.media_assets where id=$1", [ownerAsset]));

    await login(member);
    assert.equal((await db.query("select id from public.media_assets")).rows.length, 1);
    await assert.rejects(addAsset(id(22), member));
    await assert.rejects(db.query("update public.media_assets set compression_status='failed' where id=$1", [ownerAsset]));
    await assert.rejects(db.query("delete from public.media_assets where id=$1", [ownerAsset]));

    await login(viewer);
    assert.equal((await db.query("select id from public.media_assets")).rows.length, 1);
    await assert.rejects(addAsset(id(23), viewer));
    await assert.rejects(db.query("delete from public.media_assets where id=$1", [ownerAsset]));

    await login(foreignOwner);
    assert.equal((await db.query("select id from public.media_assets")).rows.length, 0);
    await assert.rejects(addAsset(id(24), foreignOwner, workspace));

    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from public.media_assets"));
  } finally {
    await db.close();
  }
});

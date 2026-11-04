import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Brand RLS keeps workspace reads and restricts brand, menu, and asset writes to Super Admin", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const workspace = id(10), otherWorkspace = id(11), brand = id(20), otherBrand = id(21), owner = id(1), admin = id(2), member = id(3), viewer = id(4), foreignOwner = id(5);
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create schema storage;
      create function storage.foldername(path text) returns text[] language sql immutable as $$ select string_to_array(path, '/') $$;
      create table public.workspace_members(workspace_id uuid not null, user_id uuid not null, role text not null);
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members member where member.workspace_id=target_workspace and member.user_id=auth.uid()) $$;
      create table public.brands(id uuid primary key, workspace_id uuid not null, name text not null);
      create table public.brand_menus(id uuid primary key, workspace_id uuid not null, brand_id uuid not null, name text not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
      insert into public.workspace_members values
        ('${workspace}','${owner}','owner'),('${workspace}','${admin}','admin'),('${workspace}','${member}','member'),('${workspace}','${viewer}','viewer'),('${otherWorkspace}','${foreignOwner}','owner');
      insert into public.brands values ('${brand}','${workspace}','Brand Utama'),('${otherBrand}','${otherWorkspace}','Brand Luar');
      insert into public.brand_menus values ('${id(30)}','${workspace}','${brand}','Menu Utama'),('${id(31)}','${otherWorkspace}','${otherBrand}','Menu Luar');
      alter table public.brands enable row level security;
      alter table public.brand_menus enable row level security;
      alter table storage.objects enable row level security;
      grant select on public.workspace_members to authenticated;
      grant select,insert,update,delete on public.brands,public.brand_menus to authenticated;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261104063029_brand_super_admin_write_access.sql", import.meta.url), "utf8"));

    const login = async (userId: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await db.exec("set role authenticated");
    };
    await login(member);
    assert.equal(Number((await db.query("select count(*) as count from public.brands")).rows[0].count), 1);
    assert.equal(Number((await db.query("select count(*) as count from public.brand_menus")).rows[0].count), 1);
    await assert.rejects(db.query("insert into public.brands values($1,$2,'Nope')", [id(22), workspace]));
    assert.equal((await db.query("update public.brands set name='Diubah anggota' where id=$1 returning id", [brand])).rows.length, 0);
    assert.equal((await db.query("delete from public.brand_menus where id=$1 returning id", [id(30)])).rows.length, 0);
    await assert.rejects(db.query("insert into public.brand_menus values($1,$2,$3,'Nope')", [id(32), workspace, otherBrand]));
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)", [`${workspace}/brand/logo.png`]));

    await login(viewer);
    assert.equal(Number((await db.query("select count(*) as count from public.brands")).rows[0].count), 1);
    await assert.rejects(db.query("insert into public.brands values($1,$2,'Nope')", [id(23), workspace]));

    await login(admin);
    await db.query("update public.brands set name='Brand diubah admin legacy' where id=$1", [brand]);
    await db.query("insert into public.brand_menus values($1,$2,$3,'Menu Baru')", [id(33), workspace, brand]);
    await db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)", [`${workspace}/brand/logo.png`]);
    await db.query("update storage.objects set name=$1 where bucket_id='brand-assets'", [`${workspace}/brand/logo-v2.png`]);
    await db.query("delete from storage.objects where bucket_id='brand-assets'");
    assert.equal((await db.query("select name from public.brands where id=$1", [brand])).rows[0].name, "Brand diubah admin legacy");
    assert.equal(Number((await db.query("select count(*) as count from public.brand_menus where name='Menu Baru'")).rows[0].count), 1);

    await login(owner);
    await db.query("update public.brands set name='Brand owner' where id=$1", [brand]);
    await db.query("insert into public.brand_menus values($1,$2,$3,'Menu Owner')", [id(35), workspace, brand]);
    await db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)", [`${workspace}/brand/owner-logo.png`]);

    await login(foreignOwner);
    assert.equal(Number((await db.query("select count(*) as count from public.brands")).rows[0].count), 1);
    await assert.rejects(db.query("insert into public.brand_menus values($1,$2,$3,'Lintas workspace')", [id(34), otherWorkspace, brand]));
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)", [`${workspace}/brand/foreign-logo.png`]));
  } finally {
    await db.close();
  }
});

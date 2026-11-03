import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("all Ngapaya migrations initialize an empty Supabase-compatible database without demo records", async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant all on all tables in schema auth,storage to service_role;
    `);
    const directory=new URL('../supabase/migrations/',import.meta.url);
    const files=(await readdir(directory)).filter(f=>f.endsWith('.sql')).sort();
    for(const file of files){
      // PGlite has gen_random_uuid built in; production Supabase provides pgcrypto.
      const sql=(await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists "pgcrypto";','');
      try {await db.exec(sql);}catch(error){throw new Error(`Migration ${file}: ${(error as Error).message}`);}
    }
    assert.equal((await db.query<{v:number}>('select public.campaign_schema_version() as v')).rows[0].v,1);
    for(const table of ['profiles','workspaces','campaigns','tasks','influencer_bookings']) assert.equal((await db.query<{n:number}>(`select count(*)::int as n from public.${table}`)).rows[0].n,0,table);
    const unprotected=await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public' and not rowsecurity");
    assert.deepEqual(unprotected.rows,[]);
    const id='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002';
    await db.query("insert into auth.users(id,email) values($1,'owner@auth.ngapaya.local')",[id]);
    await db.query("insert into public.profiles(id,full_name,username,job_title) values($1,'Owner','owner','Super Admin')",[id]);
    await db.query("insert into public.workspaces(id,name,slug,owner_id) values($1,'Ngapaya','ngapaya',$2)",[workspace,id]);
    await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",[workspace,id]);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
    assert.equal((await db.query('select id from public.profiles where id=$1',[id])).rows.length,1);
    assert.equal((await db.query('select workspace_id from public.workspace_members where user_id=$1',[id])).rows.length,1);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select * from public.profiles'));
  } finally {await db.close();}
});

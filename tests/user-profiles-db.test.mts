import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("unified Super Admin migration preserves users, locks client profile edits and allows server-managed photos", async () => {
  const db=new PGlite(), id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`, w=id(10), w2=id(11);
  const input={name:"User Updated",username:"user3",email:"",whatsapp:"",role:"Finance",accessRole:"member"};
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create type public.workspace_role as enum('owner','admin','member','viewer');
      create table public.profiles(id uuid primary key,full_name text,username text,email text,whatsapp text,job_title text,avatar_url text,updated_at timestamptz);
      create table public.workspaces(id uuid primary key,owner_id uuid);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role public.workspace_role,primary key(workspace_id,user_id));
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      alter table public.profiles enable row level security;
      create policy "users update own profile" on public.profiles for update to authenticated using(true) with check(true);
      create policy "read profiles" on public.profiles for select to authenticated using(true);
      insert into public.profiles(id,full_name,username,job_title,avatar_url) values ${[1,2,3,4,5].map(n=>`('${id(n)}','User ${n}','user${n}','${n===2?'CMO':'Finance'}',${n===3?"'https://legacy.example/avatar.jpg'":"null"})`).join(",")};
      insert into public.workspaces values('${w}','${id(1)}'),('${w2}','${id(5)}');
      insert into public.workspace_members values('${w}','${id(1)}','owner'),('${w}','${id(2)}','admin'),('${w}','${id(3)}','member'),('${w}','${id(4)}','viewer'),('${w2}','${id(5)}','owner');
      grant usage on schema storage to anon,authenticated,service_role;
      grant select,insert,update,delete on public.profiles,public.workspaces,public.workspace_members,storage.objects to authenticated,service_role;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261030022141_workspace_user_management.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261030032247_unified_super_admin_profiles.sql',import.meta.url),'utf8'));
    assert.equal((await db.query<{role:string}>('select role from public.workspace_members where user_id=$1',[id(2)])).rows[0].role,'owner');
    assert.equal((await db.query<{job_title:string}>('select job_title from public.profiles where id=$1',[id(2)])).rows[0].job_title,'Super Admin');
    const change=(actor:string,target:string,value:object)=>db.query<{user:{name:string;avatarUrl:string|null;accessRole:string}}>("select public.manage_workspace_user($1,$2,$3,$4::jsonb) as user",[w,actor,target,JSON.stringify(value)]);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(change(id(1),id(3),input));
      await assert.rejects(db.query("update public.profiles set full_name='Forged',job_title='Super Admin',avatar_url='https://evil.test/x' where id=$1",[id(3)]));
      if(role==='authenticated') {
        await assert.rejects(db.query("insert into storage.objects values($1,'user-avatars','forged.png')",[id(20)]));
      }
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const preserved=await change(id(2),id(3),input); // former admin has the same privileges
    assert.equal(preserved.rows[0].user.avatarUrl,'https://legacy.example/avatar.jpg');
    for(const actor of [id(3),id(4),id(5)]) await assert.rejects(change(actor,id(3),input));
    await assert.rejects(change(id(1),id(5),{...input,username:'user5'}));
    await assert.rejects(change(id(1),id(1),{...input,username:'user1'}));
    await assert.rejects(change(id(1),id(3),{...input,accessRole:'admin'}));
    await assert.rejects(change(id(1),id(3),{...input,role:'CMO'}));
    await assert.rejects(change(id(1),id(3),{...input,avatarUrl:'https://evil.test/a.jpg'}));
    const photo=`https://example.supabase.co/storage/v1/object/public/user-avatars/${w}/${id(3)}/${id(20)}.png`;
    assert.equal((await change(id(1),id(3),{...input,avatarUrl:photo})).rows[0].user.avatarUrl,photo);
    assert.equal((await change(id(1),id(3),{...input,avatarUrl:null})).rows[0].user.avatarUrl,null);
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.profiles')).rows[0].count,5);
  } finally { await db.close(); }
});

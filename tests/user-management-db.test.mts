import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("user-management RPC is server-only, workspace-scoped and protects primary/self Super Admin; updates profile and access atomically", async () => {
  const db = new PGlite();
  const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`, w=id(10), w2=id(11);
  const input = {name:"User Updated",username:"user3",email:"updated@example.test",whatsapp:"+62812345678",role:"Finance",accessRole:"viewer"};
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create type public.workspace_role as enum('owner','admin','member','viewer');
      create table public.profiles(id uuid primary key,full_name text,username text,email text,whatsapp text,job_title text,avatar_url text,updated_at timestamptz);
      create table public.workspaces(id uuid primary key,owner_id uuid);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role public.workspace_role,primary key(workspace_id,user_id));
      insert into public.profiles(id,full_name,username) values ${[1,2,3,4,5].map(n=>`('${id(n)}','User ${n}','user${n}')`).join(",")};
      insert into public.workspaces values('${w}','${id(1)}'),('${w2}','${id(5)}');
      insert into public.workspace_members values('${w}','${id(1)}','owner'),('${w}','${id(2)}','admin'),('${w}','${id(3)}','member'),('${w}','${id(4)}','viewer'),('${w2}','${id(5)}','owner');
      grant select,update on public.profiles,public.workspaces,public.workspace_members to service_role;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261030022141_workspace_user_management.sql',import.meta.url),'utf8'));
    const change=(actor:string,target:string,value:object)=>db.query("select public.manage_workspace_user($1,$2,$3,$4::jsonb) as user",[w,actor,target,JSON.stringify(value)]);
    for (const role of ['anon','authenticated']) { await db.exec(`set role ${role}`); await assert.rejects(change(id(1),id(3),input)); await db.exec('reset role'); }
    await db.exec('set role service_role');
    for (const actor of [id(2),id(3),id(4),id(5)]) await assert.rejects(change(actor,id(3),input));
    await assert.rejects(change(id(1),id(5),{...input,username:'user5'}));
    const changed=await change(id(1),id(3),input);
    assert.equal((changed.rows[0] as {user:{accessRole:string}}).user.accessRole,'viewer');
    await assert.rejects(change(id(1),id(1),{...input,username:'user1'}));
    await assert.rejects(change(id(1),id(3),{...input,accessRole:'root'}));
    await assert.rejects(change(id(1),id(3),{...input,username:'hacked'}));
    await change(id(1),id(3),{...input,accessRole:'owner'});
    await assert.rejects(change(id(3),id(1),{...input,username:'user1'}));
    await change(id(1),id(3),{...input,accessRole:'member'});
    await assert.rejects(change(id(3),id(4),{...input,username:'user4'}));
    const profile=(await db.query<{full_name:string}>('select full_name from public.profiles where id=$1',[id(1)])).rows[0];
    assert.equal(profile.full_name,'User 1');
  } finally { await db.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("DB validates brand colors, dates/bounds/overlaps on RPC and direct updates, preserves legacy and task links, enforces manager role", async () => {
  const db = new PGlite();
  const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const campaign = uid(10), workspace = uid(11), brand = uid(12);
  const phase = (id: string, startDate?: string, endDate = startDate) => ({ id, name: id, period: "1–11 September", startDate, endDate, color: "#2F9D78" });
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create table public.brands(id uuid primary key,workspace_id uuid);
      create table public.campaigns(id uuid primary key,workspace_id uuid,lifecycle_status text default 'active',start_date date,end_date date,timeline_config jsonb);
      create function public.is_workspace_manager(w uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','admin')) $$;
      insert into public.workspace_members values('${workspace}','${uid(1)}','owner'),('${workspace}','${uid(2)}','admin'),('${workspace}','${uid(3)}','member'),('${workspace}','${uid(4)}','viewer');
      grant select on public.workspace_members to authenticated;
      grant select,update on public.campaigns,public.brands to authenticated;
      alter table public.campaigns enable row level security;
      create policy read_campaign on public.campaigns for select to authenticated using(exists(select 1 from public.workspace_members where workspace_id=campaigns.workspace_id and user_id=auth.uid()));
      create policy update_campaign on public.campaigns for update to authenticated using(exists(select 1 from public.workspace_members where workspace_id=campaigns.workspace_id and user_id=auth.uid() and role<>'viewer')) with check(exists(select 1 from public.workspace_members where workspace_id=campaigns.workspace_id and user_id=auth.uid() and role<>'viewer'));
      insert into public.brands values('${brand}','${workspace}');
    `);
    await db.query("insert into public.campaigns values($1,$2,'active','2026-10-01','2026-10-31',$3::jsonb)", [campaign,workspace,JSON.stringify({ phaseMode: true, phases: [phase("legacy")], taskPhase: { task: "legacy" } })]);
    await db.exec(await readFile(new URL("../supabase/migrations/20261030140000_brand_colors_and_phase_dates.sql", import.meta.url), "utf8"));
    const login = async (n: number) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]); await db.exec("set role authenticated"); };
    const save = (phases: unknown[]) => db.query("select public.save_campaign_timeline($1,true,$2::jsonb)", [campaign,JSON.stringify(phases)]);
    const config = async () => (await db.query<{ timeline_config: { phases: ReturnType<typeof phase>[]; taskPhase: object } }>("select timeline_config from public.campaigns where id=$1", [campaign])).rows[0].timeline_config;
    await login(1);
    for (const color of ["#FFFFFF","#0011aa",null]) await db.query("update public.brands set primary_color=$1 where id=$2",[color,brand]);
    for (const color of ["red","#abc","url(x)",""]) await assert.rejects(db.query("update public.brands set primary_color=$1 where id=$2",[color,brand]));
    await save([phase("legacy")]); // Existing unstructured period is preserved.
    await assert.rejects(save([phase("new")]));
    const phases=[phase("legacy","2026-10-02","2026-10-04"),phase("next","2026-10-06")];
    await save(phases);
    assert.deepEqual((await config()).taskPhase,{task:"legacy"});
    for (const invalid of [[phase("a","2026-10-04","2026-10-02")], [phase("a","2026-02-30")], [phase("a","2026-09-30")], [phase("a","2026-11-01")], [phases[0],phase("b","2026-10-04")], [phase("a","2026-10-02","")], [{...phases[0],color:"red"}], [phases[0],phases[0]], [phase("legacy")]]) await assert.rejects(save(invalid));
    await assert.rejects(db.query("update public.campaigns set end_date='2026-10-03' where id=$1",[campaign]));
    await assert.rejects(db.query("update public.campaigns set start_date='2026-10-05' where id=$1",[campaign]));
    await db.query("update public.campaigns set start_date=null,end_date=null where id=$1",[campaign]);
    await save([phase("legacy","2026-09-01"),phases[1]]);
    await login(2); await save(phases);
    for (const n of [3,4,5]) { await login(n); await assert.rejects(save(phases)); }
    await login(3); await assert.rejects(db.query("update public.campaigns set timeline_config=jsonb_set(timeline_config,'{phases}',$1::jsonb) where id=$2",[JSON.stringify([phase("hacked","2026-10-10")]),campaign]));
    await login(1); assert.deepEqual((await config()).phases,phases);
    await db.query("update public.campaigns set lifecycle_status='archived' where id=$1",[campaign]);
    await assert.rejects(save(phases));
  } finally { await db.close(); }
});

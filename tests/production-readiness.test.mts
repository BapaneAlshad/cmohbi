import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Campaign, UserIdentity } from "../lib/types.ts";
import { demoLoginAllowed, emptyWorkspaceData } from "../lib/production-policy.ts";
import { resolveLiveWorkspace, WorkspaceAccessError } from "../lib/live-workspace.ts";
import { sameSupabaseProject, validSupabaseUrl } from "../lib/supabase/config.ts";
import { CampaignConflict, persistCampaignRecord } from "../lib/supabase/campaign-record-data.ts";
import { filteredBoardTasks } from "../lib/task-workflow.ts";

function connection(overrides: Record<string,unknown> = {}, schemaError = false) {
  const source: Record<string,unknown> = { profiles: {id:"owner",full_name:"Owner",username:"owner",job_title:"Super Admin"}, workspace_members: {workspace_id:"workspace",role:"owner"}, campaigns: [], task_status_requests: [], ...overrides };
  const reads: string[] = [];
  const client = {
    from(table:string) {
      reads.push(table);
      const result={data:source[table],error:null};
      const query={select(){return query;},eq(){return query;},limit(){return query;},maybeSingle:async()=>result,then: (resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
      return query;
    },
    rpc:async()=>({data:schemaError?null:1,error:schemaError?{code:"PGRST202"}:null}),
  } as unknown as SupabaseClient;
  return {client,reads};
}

test("production refuses demo fallback and empty workspaces contain no seeded business records", async () => {
  assert.equal(demoLoginAllowed("production"),false); assert.equal(demoLoginAllowed("development"),true);
  const empty=emptyWorkspaceData();
  for(const value of Object.values(empty)) assert.deepEqual(value,[]);
  const {client,reads}=connection();
  const result=await resolveLiveWorkspace(client,"owner");
  assert.equal(result.workspaceId,"workspace"); assert.equal(result.profile.accessRole,"owner");
  assert.deepEqual(reads,["profiles","workspace_members","campaigns","task_status_requests"]);
});

test("bootstrap requires a registered profile, actual membership and matching schema; job titles grant no permission", async () => {
  for(const overrides of [{profiles:null},{workspace_members:null},{workspace_members:{workspace_id:"workspace",role:"invented"}}]) {
    await assert.rejects(resolveLiveWorkspace(connection(overrides).client,"owner"),(error:unknown)=>error instanceof WorkspaceAccessError && error.status===403);
  }
  await assert.rejects(resolveLiveWorkspace(connection({},true).client,"owner"),(error:unknown)=>error instanceof WorkspaceAccessError && error.status===503);
  const member=await resolveLiveWorkspace(connection({workspace_members:{workspace_id:"workspace",role:"member"}}).client,"owner");
  assert.equal(member.profile.accessRole,"member");
  assert.equal(validSupabaseUrl("not-a-url"),false); assert.equal(validSupabaseUrl("javascript:alert(1)"),false);
  assert.equal(sameSupabaseProject("https://one.supabase.co/","https://one.supabase.co"),true);
  assert.equal(sameSupabaseProject("https://one.supabase.co","https://two.supabase.co"),false);
});

test("campaign saves wait for RPC acknowledgement and stale writes return the latest record without retrying an overwrite", async () => {
  const previous={id:"campaign",name:"Before",brand:"Brand",rowVersion:1} as Campaign;
  const row={id:"campaign",name:"Saved",brand:"Brand",row_version:2,status:"Rencana",budget:0,spent:0,lifecycle_status:"active"};
  const calls: unknown[]=[];
  const client={rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:row,error:null};}} as unknown as SupabaseClient;
  assert.equal((await persistCampaignRecord(client,"workspace",previous,{name:"Saved"},1)).rowVersion,2);
  assert.equal(previous.name,"Before");
  assert.deepEqual(calls,[["save_campaign_record",{p_workspace_id:"workspace",p_campaign_id:"campaign",p_expected_version:1,p_patch:{name:"Saved"}}]]);
  const conflict={rpc:async()=>({data:null,error:{code:"40001",message:"CAMPAIGN_CONFLICT"}}),from:()=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:row,error:null})};return query;}} as unknown as SupabaseClient;
  await assert.rejects(persistCampaignRecord(conflict,"workspace",previous,{name:"Overwrite"},1),(error:unknown)=>error instanceof CampaignConflict && error.latest.name==="Saved");
  const failed={rpc:async()=>({data:null,error:{code:"PGRST202",message:"missing RPC"}})} as unknown as SupabaseClient;
  await assert.rejects(persistCampaignRecord(failed,"workspace",previous,{name:"Failed"},1),/migrasi/);
});

test("Super Admin filters any PIC by stable ID including multi-PIC; members cannot select a teammate", () => {
  const owner={id:"o",name:"Owner",username:"owner",accessRole:"owner"} as UserIdentity;
  const data={...emptyWorkspaceData(),users:[{id:"a",name:"Same Name",username:"member.a"},{id:"b",name:"Same Name",username:"member.b"}],tasks:[{id:"1",campaign:null,status:"To Do",assigneeIds:["a","b"],brand:"A"},{id:"2",campaign:null,status:"Done",assigneeIds:["b"],brand:"A"},{id:"3",campaign:null,status:"Backlog",assigneeIds:["a"],brand:"A"}]} as AppData;
  const filter={brand:"all",pic:"a",campaign:"all"};
  assert.deepEqual(filteredBoardTasks(data,owner,filter).map(t=>t.id),["1","3"]);
  assert.deepEqual(filteredBoardTasks(data,owner,{...filter,pic:"b"}).map(t=>t.id),["1","2"]);
  assert.deepEqual(filteredBoardTasks(data,{...owner,accessRole:"member",id:"a"},{...filter,pic:"b"}),[]);
});

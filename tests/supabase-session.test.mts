import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createBrowserClient } from "@supabase/ssr";
import { createSupabaseSessionClient, requestBearerToken, verifiedSessionUser, SessionAccessError } from "../lib/supabase/session.ts";
import { isPublishableSupabaseKey, publicSupabaseConfig } from "../lib/supabase/config.ts";

const jwt = (id: string, exp = Math.floor(Date.now()/1000)+3600) => ["eyJhbGciOiJIUzI1NiJ9",Buffer.from(JSON.stringify({ sub:id,role:"authenticated",exp })).toString("base64url"),"test-signature"].join(".");
const isStatus = (status:number) => (error:unknown) => error instanceof SessionAccessError && error.status === status;

test("public configuration accepts publishable/anon keys and refuses secret/service-role keys", () => {
  assert.equal(isPublishableSupabaseKey("sb_publishable_test"),true);
  assert.equal(isPublishableSupabaseKey("sb_secret_test"),false);
  const key = (role:string) => `e30.${Buffer.from(JSON.stringify({role})).toString("base64url")}.sig`;
  assert.equal(isPublishableSupabaseKey(key("anon")),true);
  assert.equal(isPublishableSupabaseKey(key("service_role")),false);
  assert.equal(publicSupabaseConfig("https://htoregsddeiabfeefnhy.supabase.co","sb_secret_test"),null);
  assert.equal(publicSupabaseConfig("javascript:alert(1)","sb_publishable_test"),null);
  assert.throws(()=>createSupabaseSessionClient({getAll:()=>[]},undefined,null),isStatus(503));
  assert.equal(requestBearerToken(null),undefined);
  assert.equal(requestBearerToken("Bearer valid-token"),"valid-token");
  for(const header of ["", "Basic abc", "Bearer ", "Bearer one two"]) assert.throws(()=>requestBearerToken(header),isStatus(401));
});

test("server session verifies Auth, refreshes expired cookies, preserves RLS identity and isolates requests", async () => {
  const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002";
  const user=(id:string)=>({id,email:`${id}@auth.ngapaya.local`,aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()});
  let refreshes=0, revoked=false;
  const identities:string[]=[];
  const server=createServer(async(req,res)=>{
    res.setHeader("Content-Type","application/json");
    const body=await Array.fromAsync(req).then(parts=>JSON.parse(Buffer.concat(parts).toString()||"{}"));
    if(req.url?.startsWith("/auth/v1/token")){
      if(req.url.includes("refresh_token")){refreshes++;assert.equal(body.refresh_token,"refresh-a");}
      res.end(JSON.stringify({access_token:jwt(a),refresh_token:"refresh-a",token_type:"bearer",expires_in:3600,user:user(a)}));return;
    }
    const token=String(req.headers.authorization||"").replace(/^Bearer /,"");
    let id="";try{id=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString()).sub;}catch{}
    if(req.url==="/auth/v1/user"){
      if(revoked || ![a,b].includes(id)){res.statusCode=401;res.end(JSON.stringify({message:"Session revoked",code:"session_not_found"}));return;}
      res.end(JSON.stringify(user(id)));return;
    }
    if(req.url?.startsWith("/rest/v1/profiles")){identities.push(id);res.end(JSON.stringify([{id}]));return;}
    res.statusCode=404;res.end("{}");
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address && typeof address==="object");
  const config={url:`http://127.0.0.1:${address.port}`,key:"sb_publishable_test"};
  const jar=new Map<string,string>(), writes:Array<{name:string;options:Record<string,unknown>}>=[];
  const cacheHeaders:Record<string,string>={};
  const cookies={getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll(updates:Array<{name:string;value:string;options:Record<string,unknown>}>,headers:Record<string,string>={}){for(const c of updates){jar.set(c.name,c.value);writes.push(c);}Object.assign(cacheHeaders,headers);}};
  try {
    const missing=createSupabaseSessionClient({getAll:()=>[]},undefined,config);
    await assert.rejects(verifiedSessionUser(missing),isStatus(401));
    const browser=createBrowserClient(config.url,config.key,{cookies,isSingleton:false,auth:{autoRefreshToken:false,detectSessionInUrl:false}});
    const login=await browser.auth.signInWithPassword({email:"a@auth.ngapaya.local",password:"not-a-real-pin"});assert.equal(login.error,null);
    assert.ok(login.data.session);
    const sessionCookie=Array.from(jar.keys()).find(name=>name.endsWith("-auth-token"));assert.ok(sessionCookie);
    jar.set(sessionCookie,`base64-${Buffer.from(JSON.stringify({...login.data.session,access_token:jwt(a,1),expires_at:1})).toString("base64url")}`);
    const refreshed=createSupabaseSessionClient(cookies,undefined,config,true);
    assert.equal((await verifiedSessionUser(refreshed)).id,a);
    assert.equal(refreshes,1);assert.match(cacheHeaders["Cache-Control"],/no-store/);
    assert.equal(writes.at(-1)?.options.secure,true);assert.equal(writes.at(-1)?.options.sameSite,"lax");
    // A new server request reads the updated cookie without refreshing again.
    assert.equal((await verifiedSessionUser(createSupabaseSessionClient(cookies,undefined,config))).id,a);
    assert.equal(refreshes,1);
    const clientA=createSupabaseSessionClient(cookies,jwt(a),config),clientB=createSupabaseSessionClient(cookies,jwt(b),config);
    assert.deepEqual((await Promise.all([verifiedSessionUser(clientA,jwt(a)),verifiedSessionUser(clientB,jwt(b))])).map(u=>u.id),[a,b]);
    await Promise.all([clientA.from("profiles").select("id"),clientB.from("profiles").select("id")]);
    assert.deepEqual(identities.sort(),[a,b]);
    // A forged/stored user object cannot override the current Auth response.
    revoked=true;await assert.rejects(verifiedSessionUser(createSupabaseSessionClient(cookies,undefined,config)),isStatus(401));
    await browser.auth.signOut({scope:"local"});
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

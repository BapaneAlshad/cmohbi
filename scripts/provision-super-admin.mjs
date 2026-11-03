import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { serverPublicSupabaseConfig } from "../lib/supabase/config.ts";

// Explicit, one-time provisioning. Never called by login, build or deployment.
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i=arg.indexOf("=");return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)]; }));
const config=serverPublicSupabaseConfig(), secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const name=String(args["--name"] || "Super Admin").trim(), username=String(args["--username"] || "superadmin").trim().toLowerCase();
if (!config || !secret || !args["--apply"] || new URL(config.url).hostname!==`${args["--project-ref"]}.supabase.co`) throw new Error("Konfirmasi --apply dan --project-ref yang cocok dengan environment wajib diberikan.");
if (name.length<2 || !/^[a-z][a-z0-9._-]{2,31}$/.test(username) || username.startsWith("demo.")) throw new Error("Nama atau username tidak valid.");
const admin=createClient(config.url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const [users, profiles, workspaces] = await Promise.all([
  admin.auth.admin.listUsers({page:1,perPage:1}),
  admin.from("profiles").select("id",{count:"exact",head:true}),
  admin.from("workspaces").select("id",{count:"exact",head:true}),
]);
if (users.error || profiles.error || workspaces.error) throw new Error("Schema atau akses provisioning belum siap.");
if (users.data.users.length || profiles.count || workspaces.count) throw new Error("Provisioning dibatalkan: target tidak kosong. Tidak mereset atau mengganti akun existing.");
const pin=String(randomInt(100000,1000000)), email=`${username}@auth.ngapaya.local`;
const credentialsPath=new URL('../.ngapaya-super-admin.local.json',import.meta.url);
const handoff={projectRef:args["--project-ref"],name,username,pin,createdAt:new Date().toISOString(),status:"pending"};
await writeFile(credentialsPath,JSON.stringify(handoff,null,2)+"\n",{flag:"wx",mode:0o600});
const created=await admin.auth.admin.createUser({email,password:pin,email_confirm:true,user_metadata:{full_name:name,username}});
if (created.error || !created.data.user) throw new Error("Pembuatan Auth belum terkonfirmasi. Periksa target sebelum mencoba kembali; file kredensial dipertahankan.");
const userId=created.data.user.id;
const profile=await admin.from("profiles").insert({id:userId,full_name:name,username,job_title:"Super Admin",email:"",whatsapp:""});
if (profile.error) throw new Error("Auth telah dibuat tetapi profil gagal. Hentikan dan periksa provisioning; jangan membuat akun baru.");
const workspace=await admin.from("workspaces").insert({name:"HBI Marketing",slug:"ngapaya-hbi",owner_id:userId}).select("id").single();
if (workspace.error) throw new Error("Profil telah dibuat tetapi workspace gagal. Hentikan dan periksa provisioning.");
const membership=await admin.from("workspace_members").insert({workspace_id:workspace.data.id,user_id:userId,role:"owner"});
if (membership.error) throw new Error("Workspace telah dibuat tetapi membership gagal. Hentikan dan periksa provisioning.");
await writeFile(credentialsPath,JSON.stringify({...handoff,status:"ready",userId,workspaceId:workspace.data.id},null,2)+"\n",{mode:0o600});
console.log("Satu Super Admin dan workspace dibuat. PIN tersedia di .ngapaya-super-admin.local.json; tidak dicetak atau dimasukkan ke Git.");

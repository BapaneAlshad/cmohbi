import test from "node:test";
import assert from "node:assert/strict";
import { demoAccounts } from "../lib/demo-account.ts";
import { accessLevels, canManageUsers, cleanLocalUsers, profileJobTitle, roleForJobTitle, userAccessRole, validateManagedUser, type ManagedUserInput } from "../lib/user-management.ts";
import { isManagedAvatarUrl, MAX_USER_AVATAR_BYTES, userAvatarExtension, validateUserAvatar } from "../lib/user-avatar.ts";
import { authenticateLocalUser, hashLocalPin, setLocalPin, verifyLocalPin } from "../lib/local-users.ts";
import type { User } from "../lib/types.ts";

const owner: User = { id: "demo.superadmin", ...demoAccounts[0], status: "Aktif" };
const member: User = { id: "member", name: "Anggota Baru", username: "anggota.baru", email: "anggota@example.test", whatsapp: "+62812345678", role: "Finance", accessRole: "viewer", status: "Aktif" };
const input: ManagedUserInput = { ...member, accessRole: "viewer", pin: "135790" };

test("only one demo login remains and old seeded users are removed without losing custom users", () => {
  assert.equal(demoAccounts.length, 1); assert.equal(demoAccounts[0].accessRole, "owner");
  const old = [{ ...member, id: undefined, username: "demo.cmo", accessRole: undefined }, { ...member, id: undefined, username: "rani.putri", accessRole: undefined }];
  const cleaned = cleanLocalUsers([...old, member, { ...owner, name: "Profil diperbarui" }], owner);
  assert.deepEqual(cleaned.map((user) => user.username), ["demo.superadmin", "anggota.baru"]);
  assert.equal(cleaned[0].name, "Profil diperbarui"); assert.equal(cleaned[0].accessRole, "owner");
  assert.deepEqual(cleanLocalUsers(cleaned, owner), cleaned);
});

test("user management depends on actual access, independently from job title", () => {
  for (const accessRole of ["member", "viewer"] as const) assert.equal(canManageUsers({ accessRole }), false);
  assert.equal(canManageUsers({ accessRole: "admin" }), true);
  assert.equal(canManageUsers(undefined), false); assert.equal(canManageUsers({accessRole:"owner"}), true);
  assert.equal(roleForJobTitle("Finance"), "member"); assert.equal(roleForJobTitle("CMO"), "owner");
  assert.equal(userAccessRole({role:"Finance",accessRole:"admin"}),"owner");
  assert.equal(profileJobTitle("CMO"),"Super Admin");
  assert.deepEqual(accessLevels.map(level=>level.value),["owner","member","viewer"]);
});

test("user inputs reject invalid roles, reserved demo usernames, PINs and incomplete profiles", () => {
  assert.equal(validateManagedUser(input, true), null);
  for (const patch of [{name:" "},{username:"bad name"},{username:"demo.cmo"},{pin:"123"},{email:"abc"},{whatsapp:"1"},{role:"Owner forged"},{accessRole:"superuser"}]) assert.ok(validateManagedUser({...input,...patch} as ManagedUserInput,true));
  assert.equal(validateManagedUser({...input,pin:undefined},false),null);
  assert.equal(validateManagedUser({...input,email:"",whatsapp:""},true),null);
  assert.ok(validateManagedUser({...input,accessRole:"admin"},true));
  assert.ok(validateManagedUser({...input,role:"CMO"},true));
});

test("profile photos enforce size, real file signature and workspace/user storage location", () => {
  assert.equal(validateUserAvatar({size:200,type:"image/png"}),null);
  assert.ok(validateUserAvatar({size:MAX_USER_AVATAR_BYTES+1,type:"image/png"}));
  assert.ok(validateUserAvatar({size:0,type:"image/png"}));
  assert.ok(validateUserAvatar({size:200,type:"image/svg+xml"}));
  assert.equal(userAvatarExtension(new Uint8Array([137,80,78,71,13,10,26,10]),"image/png"),"png");
  assert.equal(userAvatarExtension(new Uint8Array([255,216,255]),"image/jpeg"),"jpg");
  assert.equal(userAvatarExtension(new TextEncoder().encode("RIFF1234WEBP"),"image/webp"),"webp");
  assert.equal(userAvatarExtension(new TextEncoder().encode("<script>"),"image/png"),null);
  const base="https://example.supabase.co", file="00000000-0000-4000-8000-000000000003.png";
  const url=`${base}/storage/v1/object/public/user-avatars/workspace/user/${file}`;
  assert.equal(isManagedAvatarUrl(url,base,"workspace","user"),true);
  for(const wrong of [url.replace("example.supabase.co","evil.test"),url+"?token=x",url.replace("/user/","/other/"),url.replace("user-avatars","brand-assets"),"javascript:alert(1)"]) assert.equal(isManagedAvatarUrl(wrong,base,"workspace","user"),false);
});

test("local PIN hashes have random salt and reject incorrect credentials", async () => {
  const first = await hashLocalPin("135790"), second = await hashLocalPin("135790");
  assert.notEqual(first.salt,second.salt); assert.notEqual(first.hash,second.hash);
  assert.equal(await verifyLocalPin("135790",first),true); assert.equal(await verifyLocalPin("000000",first),false);
  await assert.rejects(hashLocalPin("abc"));
});

test("new local users can log in after reload; resetting PIN invalidates old PIN and retains assigned access", async () => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}}});
  try {
    assert.equal((await authenticateLocalUser([owner],"demo.superadmin","123456"))?.accessRole,"owner");
    assert.equal(await authenticateLocalUser([owner],"demo.cmo","234567"),null);
    await setLocalPin(member.username,"135790");
    const users = JSON.parse(JSON.stringify([owner,{...member,avatarUrl:"data:image/png;base64,test"}])) as User[];
    assert.equal((await authenticateLocalUser(users,member.username,"135790"))?.accessRole,"viewer");
    await setLocalPin(member.username,"246802");
    assert.equal(await authenticateLocalUser(users,member.username,"135790"),null);
    assert.equal((await authenticateLocalUser(users,member.username,"246802"))?.id,member.id);
    assert.equal((await authenticateLocalUser(users,member.username,"246802"))?.avatarUrl,"data:image/png;base64,test");
    await setLocalPin(owner.username,"246802");
    assert.equal(await authenticateLocalUser(users,owner.username,"123456"),null);
    assert.equal((await authenticateLocalUser(users,owner.username,"246802"))?.accessRole,"owner");
    assert.equal([...values.values()].some((value)=>value.includes("246802")),false);
  } finally { Reflect.deleteProperty(globalThis,"window"); }
});

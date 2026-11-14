import { createHmac, randomUUID } from "node:crypto";

export type LanPurpose = "access" | "start" | "check";
export type LanRole = "owner" | "member" | "viewer";

export function lanStorageKey(master: string, workspace: string, storageId: string, origin: string) {
  return createHmac("sha256", master)
    .update(JSON.stringify(["ngapaya-storage-v2", workspace, storageId, origin]))
    .digest();
}

export function issueLanPermit(key: Buffer, claims: {
  workspace: string; storageId: string; origin: string; user: string;
} & ({ role: "owner"; purpose: "start"; url?: never } |
     { role: "owner"; purpose: "check"; url: string } |
     { role: LanRole; purpose: "access"; url: string }), now = Math.floor(Date.now() / 1000)) {
  const exp = now + (claims.purpose === "access" ? 300 : 90);
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: now, exp, jti: randomUUID() })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: exp * 1000 };
}

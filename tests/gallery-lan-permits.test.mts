import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeLanStorageUrl } from "../lib/gallery-lan.ts";
import { issueLanPermit, lanStorageKey } from "../lib/gallery-lan-permits.ts";

test("LAN settings accept a dedicated HTTPS subdomain and port", () => {
  assert.equal(normalizeLanStorageUrl(" https://Storage.Example.com:8766/ "), "https://storage.example.com:8766");
  assert.equal(normalizeLanStorageUrl("https://storage.example.com:9876"), "https://storage.example.com:9876");
  assert.equal(normalizeLanStorageUrl(""), "");
  for (const invalid of [
    "http://storage.example.com:8766", "https://192.168.0.108:8766",
    "https://storage.example.com", "https://storage.example.com:8766/files",
    "https://storage.example.com:1023", "https://storage.example.com:65536",
    "https://user@storage.example.com:8766", "https://storage.example.com:8766/?token=1",
  ]) assert.equal(normalizeLanStorageUrl(invalid), null, invalid);
});

test("LAN permits use a per-workspace, per-PC, per-origin key and short expiry", () => {
  const url = "https://storage.example.com:8766";
  const storageId = "pc-a";
  const origin = "https://app.example.com";
  const secret = "test-master-secret-for-local-unit-test";
  const key = lanStorageKey(secret, "workspace-a", storageId, origin);
  assert.notDeepEqual(key, lanStorageKey(secret, "workspace-b", storageId, origin));
  assert.notDeepEqual(key, lanStorageKey(secret, "workspace-a", "pc-b", origin));
  assert.notDeepEqual(key, lanStorageKey(secret, "workspace-a", storageId, "https://other.example.com"));
  for (const [purpose, ttl] of [["start", 90], ["check", 90], ["access", 300]] as const) {
    const identity = { workspace: "workspace-a", storageId, origin, user: "user-a", role: "owner" as const };
    const { token, expiresAt } = issueLanPermit(key,
      purpose === "start" ? { ...identity, purpose } : { ...identity, url, purpose }, 1000);
    const [payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.equal(claims.exp - claims.iat, ttl);
    assert.equal(claims.purpose, purpose);
    assert.equal(claims.url, purpose === "start" ? undefined : url);
    assert.equal(expiresAt, (1000 + ttl) * 1000);
    assert.equal(signature, createHmac("sha256", key).update(payload).digest("base64url"));
  }
});

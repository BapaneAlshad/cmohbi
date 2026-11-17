import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptRefreshToken, encryptRefreshToken, signGooglePayload, verifyGooglePayload } from "../lib/google-drive/crypto.ts";

test("Google Drive refresh tokens are encrypted and authenticated", () => {
  const previous = process.env.NGAPAYA_GOOGLE_MASTER_KEY;
  process.env.NGAPAYA_GOOGLE_MASTER_KEY = randomBytes(32).toString("base64");
  try {
    const encrypted = encryptRefreshToken("refresh-token-secret");
    assert.ok(!encrypted.includes("refresh-token-secret"));
    assert.equal(decryptRefreshToken(encrypted), "refresh-token-secret");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3].slice(0, -1)}${parts[3].endsWith("A") ? "B" : "A"}`;
    assert.throws(() => decryptRefreshToken(parts.join(".")));
  } finally {
    if (previous === undefined) delete process.env.NGAPAYA_GOOGLE_MASTER_KEY;
    else process.env.NGAPAYA_GOOGLE_MASTER_KEY = previous;
  }
});

test("signed Google Drive payloads reject tampering and expiry", () => {
  const previous = process.env.NGAPAYA_GOOGLE_MASTER_KEY;
  process.env.NGAPAYA_GOOGLE_MASTER_KEY = randomBytes(32).toString("base64");
  try {
    const signed = signGooglePayload({ workspaceId: "workspace", exp: 2_000 }, "upload");
    assert.equal(verifyGooglePayload<{ workspaceId: string; exp: number }>(signed, "upload", 1_000).workspaceId, "workspace");
    const [payload, signature] = signed.split(".");
    const tampered = `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    assert.throws(() => verifyGooglePayload(tampered, "upload", 1_000));
    assert.throws(() => verifyGooglePayload(signed, "upload", 3_000), /kedaluwarsa/i);
    assert.throws(() => verifyGooglePayload(signed, "oauth-state", 1_000));
  } finally {
    if (previous === undefined) delete process.env.NGAPAYA_GOOGLE_MASTER_KEY;
    else process.env.NGAPAYA_GOOGLE_MASTER_KEY = previous;
  }
});

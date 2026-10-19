import assert from "node:assert/strict";
import test from "node:test";
import { nextCampaignLifecycle } from "../lib/campaign-lifecycle.ts";

test("active dapat diarsipkan dan archived dapat dibuka kembali", () => {
  assert.equal(nextCampaignLifecycle("active", null, "archive"), "archived");
  assert.equal(nextCampaignLifecycle("archived", null, "unarchive"), "active");
});

test("active dan archived dapat dipindahkan ke trash", () => {
  assert.equal(nextCampaignLifecycle("active", null, "trash"), "trashed");
  assert.equal(nextCampaignLifecycle("archived", null, "trash"), "trashed");
});

test("restore kembali ke lifecycle sebelum soft delete", () => {
  assert.equal(nextCampaignLifecycle("trashed", "active", "restore"), "active");
  assert.equal(nextCampaignLifecycle("trashed", "archived", "restore"), "archived");
});

test("transisi lifecycle ilegal ditolak", () => {
  assert.throws(() => nextCampaignLifecycle("active", null, "restore"));
  assert.throws(() => nextCampaignLifecycle("trashed", "active", "archive"));
  assert.throws(() => nextCampaignLifecycle("archived", null, "archive"));
});

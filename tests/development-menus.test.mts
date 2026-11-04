import test from "node:test";
import assert from "node:assert/strict";
import { developmentOnlyViews, isDevelopmentMenuLocked } from "../lib/development-menus.ts";

test("development menus are locked for members and viewers, including legacy admin normalization", () => {
  assert.deepEqual(developmentOnlyViews, ["requests", "partners", "analytics", "social-hub"]);
  for (const view of developmentOnlyViews) {
    assert.equal(isDevelopmentMenuLocked(view, { accessRole: "member" }), true);
    assert.equal(isDevelopmentMenuLocked(view, { accessRole: "viewer" }), true);
    assert.equal(isDevelopmentMenuLocked(view, { accessRole: "owner" }), false);
    assert.equal(isDevelopmentMenuLocked(view, { accessRole: "admin" }), false);
  }
});

test("non-premium workspace pages stay navigable for non-admin roles", () => {
  for (const view of ["dashboard", "campaigns", "brands", "todo", "calendar", "influencers", "account"])
    assert.equal(isDevelopmentMenuLocked(view, { accessRole: "member" }), false);
  assert.equal(isDevelopmentMenuLocked("analytics", null), true);
});

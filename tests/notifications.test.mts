import test from "node:test";
import assert from "node:assert/strict";
import { deriveNotifications, taskInvolvesUser, unreadNotifications } from "../lib/notifications.ts";
import type { AppData, Task, UserIdentity } from "../lib/types.ts";

const identity: UserIdentity = { id: "user-1", name: "Rani Putri", username: "rani.putri", email: "", whatsapp: "", role: "Content Creator", accessRole: "member" };
const base = (): AppData => ({ campaigns: [{ id: "campaign-1", name: "Campaign HBI", brand: "HBI", objective: "", period: "", status: "Berjalan", progress: 0, budget: 0, spent: 0, kpi: "", tasks: 0, content: 0, lifecycleStatus: "active" }], brands: [], tasks: [], content: [], requests: [], influencers: [], influencerSchedules: [], influencerThemes: [], transactions: [], users: [], socialAccounts: [], socialSnapshots: [], socialPosts: [], socialInbox: [] });
const task = (patch: Partial<Task> = {}): Task => ({ id: "task-1", title: "Finalisasi konten", brand: "HBI", pic: "Rani Putri", assigneeIds: ["user-1"], due: "Besok", priority: "Sedang", isPriority: false, status: "To Do", campaign: "campaign-1", ...patch });

test("notifications only include tasks involving the logged-in user", () => {
  const previous = base(), next = base();
  next.tasks = [task()];
  assert.equal(taskInvolvesUser(next.tasks[0], identity), true);
  assert.equal(deriveNotifications(previous, next, identity, "2026-10-30T10:00:00.000Z").length, 1);
  assert.equal(deriveNotifications(previous, next, { ...identity, id: "other", name: "Dimas Arya", username: "dimas.arya" }, "2026-10-30T10:00:00.000Z").length, 0);
});

test("status changes produce one actionable notification and same status produces none", () => {
  const previous = base(), next = base();
  previous.tasks = [task()]; next.tasks = [task({ status: "Review" })];
  const changed = deriveNotifications(previous, next, identity, "2026-10-30T10:01:00.000Z");
  assert.equal(changed.length, 1);
  assert.equal(changed[0].title, "Status tugas berubah");
  assert.match(changed[0].body, /To Do → Review/);
  assert.equal(deriveNotifications(next, next, identity).length, 0);
  assert.equal(unreadNotifications([{ ...changed[0], readAt: null }, { ...changed[0], id: "read", readAt: "2026-10-30T10:02:00.000Z" }]).length, 1);
});

test("legacy PIC names and campaign edits remain scoped to involved users", () => {
  const previous = base(), next = base();
  previous.tasks = [task({ assigneeIds: undefined, pic: "Rani Putri" })];
  next.tasks = [task({ assigneeIds: undefined, pic: "Rani Putri" })];
  next.campaigns[0].name = "Campaign HBI diperbarui";
  const notices = deriveNotifications(previous, next, identity, "2026-10-30T10:03:00.000Z");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "campaign_changed");
  assert.equal(notices[0].target, "campaigns");
});

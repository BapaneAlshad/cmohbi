import test from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../lib/demo-data.ts";
import { isMemberDashboard, memberCampaigns, memberDashboardNotes, memberDashboardTasks } from "../lib/member-dashboard.ts";
import type { AppData, Task, UserIdentity } from "../lib/types.ts";

const member: UserIdentity = { id: "u-1", name: "Ayu Putri", username: "ayu", email: "ayu@example.test", whatsapp: "", role: "Social Media", accessRole: "member" };
const baseTask: Task = { id: "task-1", title: "Carousel", brand: "HBI", pic: "Ayu Putri", assigneeIds: ["u-1"], due: "2026-10-10", dueDate: "2026-10-10", priority: "Sedang", isPriority: false, status: "To Do", campaign: "c-1" };
function data(overrides: Partial<AppData> = {}): AppData {
  return { ...structuredClone(demoData), users: [{ id: "u-1", name: "Ayu Putri", username: "ayu", email: member.email, whatsapp: "", role: member.role, status: "Aktif" }], campaigns: [{ id: "c-1", name: "Campaign A", brand: "HBI", objective: "", period: "", status: "Berjalan", progress: 0, budget: 0, spent: 0, kpi: "", tasks: 0, content: 0, lifecycleStatus: "active" }], tasks: [baseTask], campaignMembers: [], campaignNotes: [], adminDashboardNotes: [], ...overrides };
}

test("member dashboard shows only assigned open work and prioritizes overdue, then nearest deadlines", () => {
  const tasks: Task[] = [
    { ...baseTask, id: "later", dueDate: "2026-10-20" },
    { ...baseTask, id: "soon", dueDate: "2026-10-02" },
    { ...baseTask, id: "overdue", dueDate: "2026-09-30", isPriority: true },
    { ...baseTask, id: "done", status: "Done", dueDate: "2026-09-29" },
    { ...baseTask, id: "backlog", status: "Backlog", dueDate: "2026-09-20" },
    { ...baseTask, id: "other", assigneeIds: ["u-2"], dueDate: "2026-09-01" },
  ];
  const result = memberDashboardTasks(data({ tasks }), member, "2026-10-01", 5);
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map(({ task }) => task.id), ["overdue", "soon", "later"]);
  assert.equal(result.items[0].overdue, true);
  assert.equal(result.items[1].nearDeadline, true);
  assert.equal(memberDashboardTasks(data({ tasks }), member, "2026-10-01", 2).items.length, 2);
});

test("member dashboard resolves demo relative deadlines and legacy PIC names", () => {
  const task = { ...baseTask, dueDate: undefined, due: "Besok", assigneeIds: undefined };
  const result = memberDashboardTasks(data({ tasks: [task] }), member, "2026-10-01");
  assert.equal(result.items[0].nearDeadline, true);
  assert.equal(result.items[0].overdue, false);
  assert.equal(memberDashboardTasks(data({ tasks: [{ ...task, pic: "Anggota lain" }] }), member, "2026-10-01").total, 0);
});

test("active campaigns include explicit members and legacy task participants only", () => {
  const campaigns = [
    { ...data().campaigns[0], id: "explicit", name: "Explicit" },
    { ...data().campaigns[0], id: "task-linked", name: "Task linked" },
    { ...data().campaigns[0], id: "archived", lifecycleStatus: "archived" as const },
  ];
  const result = memberCampaigns(data({ campaigns, campaignMembers: [{ campaignId: "explicit", userId: "u-1" }], tasks: [{ ...baseTask, campaign: "task-linked", assigneeIds: undefined }] }), member);
  assert.deepEqual(result.map((campaign) => campaign.id).sort(), ["explicit", "task-linked"]);
});

test("dashboard notes combine pinned campaign notes for included campaigns and assigned active admin notes", () => {
  const source = data({
    campaigns: [{ ...data().campaigns[0], contentConfig: { tagline: "", bigMessage: "", intro: "", instructions: "Instruksi yang disinkronkan", instructionsPinned: true, instructionsPinnedAt: "2026-10-01T11:00:00Z", steps: [], promos: [] } }],
    campaignMembers: [{ campaignId: "c-1", userId: "u-1" }],
    campaignNotes: [
      { id: "pinned", campaignId: "c-1", authorName: "Ayu", body: "Brief final", createdAt: "2026-10-01T10:00:00Z", pinnedToDashboard: true },
      { id: "unPinned", campaignId: "c-1", authorName: "Ayu", body: "Biasa", createdAt: "2026-10-01T10:01:00Z", pinnedToDashboard: false },
      { id: "otherCampaign", campaignId: "c-2", authorName: "Ayu", body: "Lain", createdAt: "2026-10-01T10:02:00Z", pinnedToDashboard: true },
    ],
    adminDashboardNotes: [
      { id: "mine", title: "Perhatian", body: "Cek materi", recipientIds: ["u-1"], isActive: true, createdAt: "2026-10-01T12:00:00Z", createdByName: "Admin" },
      { id: "notMine", title: "Lain", body: "Lain", recipientIds: ["u-2"], isActive: true, createdAt: "2026-10-01T13:00:00Z", createdByName: "Admin" },
      { id: "expired", title: "Kedaluwarsa", body: "Lain", recipientIds: ["u-1"], isActive: true, expiresAt: "2026-09-30", createdAt: "2026-10-01T14:00:00Z", createdByName: "Admin" },
    ],
  });
  const result = memberDashboardNotes(source, member, "2026-10-01");
  assert.deepEqual(result.campaign.map((note) => note.id), ["brief:c-1", "pinned"]);
  assert.equal(result.campaign[0].source, "brief");
  assert.equal(result.campaign[0].body, "Instruksi yang disinkronkan");
  assert.deepEqual(result.admin.map((note) => note.id), ["mine"]);
  const blankPinned = memberDashboardNotes(data({ campaigns: [{ ...source.campaigns[0], contentConfig: { ...source.campaigns[0].contentConfig!, instructions: "   " } }], campaignMembers: source.campaignMembers, campaignNotes: source.campaignNotes }), member, "2026-10-01");
  assert.deepEqual(blankPinned.campaign.map((note) => note.id), ["pinned"]);
});

test("owner and admin retain the management dashboard, while member and viewer use their personal dashboard", () => {
  assert.equal(isMemberDashboard(member), true);
  assert.equal(isMemberDashboard({ ...member, accessRole: "viewer" }), true);
  assert.equal(isMemberDashboard({ ...member, accessRole: "admin" }), false);
  assert.equal(isMemberDashboard({ ...member, accessRole: "owner" }), false);
  assert.equal(isMemberDashboard(undefined), false);
});

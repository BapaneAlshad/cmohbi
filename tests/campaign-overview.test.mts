import test from "node:test";
import assert from "node:assert/strict";
import { applyTaskPatch, kpiProgress, mergeCampaignActivities, myCampaignTasks, validateKpi, validateTaskPatch, visibleCampaignActivities } from "../lib/campaign-overview.ts";
import type { AppData, Task, UserIdentity } from "../lib/types.ts";

const identity: UserIdentity = { id: "user-a", name: "Andi", username: "andi", email: "andi@example.test", whatsapp: "", role: "CMO", accessRole: "admin" };
const users = [{ id: "user-a", name: "Andi", username: "andi", email: identity.email, whatsapp: "", role: "CMO", status: "Aktif" }];
const task: Task = { id: "task-a", title: "Konten", brand: "HBI", pic: "Andi", assigneeIds: ["user-a", "user-b"], due: "2026-10-20", dueDate: "2026-10-20", priority: "Sedang", status: "To Do", campaign: "campaign-a", contentCalendarType: "reels" };
const kpi = { name: "Followers", unit: "followers", baseline: 1000, targetIncrease: 200, current: 1080 };

test("My Task uses stable IDs, multi-PIC, active status, and deadline order", () => {
  const tasks: Task[] = [task, { ...task, id: "done", status: "Done" }, { ...task, id: "other", assigneeIds: ["user-b"] }, { ...task, id: "unassigned", assigneeIds: [] }, { ...task, id: "earlier", dueDate: "2026-10-01" }];
  assert.deepEqual(myCampaignTasks(tasks, users, identity).map((row) => row.id), ["earlier", "task-a"]);
  assert.equal(myCampaignTasks(tasks, users, { ...identity, id: "user-b" }).length, 3);
  assert.equal(myCampaignTasks(tasks, users, { ...identity, id: "different" }).length, 0);
  assert.equal(myCampaignTasks(tasks, users, undefined).length, 0);
});
test("My Task supports legacy PIC and demo username, without treating explicit empty assignments as legacy", () => {
  const legacy = { ...task, assigneeIds: undefined };
  assert.equal(myCampaignTasks([legacy], users, { ...identity, id: undefined }).length, 1);
  assert.equal(myCampaignTasks([{ ...task, assigneeIds: ["andi"] }], users.map((user) => ({ ...user, id: undefined })), { ...identity, id: undefined }).length, 1);
  assert.equal(myCampaignTasks([{ ...legacy, pic: "Someone else" }], users, identity).length, 0);
});
test("My Task puts priority first and keeps deadline order within each group", () => {
  const tasks: Task[] = [
    { ...task, id: "normal-early", dueDate: "2026-10-01" },
    { ...task, id: "priority-late", isPriority: true, dueDate: "2026-10-30" },
    { ...task, id: "normal-late", dueDate: "2026-10-20" },
    { ...task, id: "priority-legacy", priority: "Tinggi", dueDate: "2026-10-10" },
    { ...task, id: "priority-disabled", priority: "Tinggi", isPriority: false, dueDate: "2026-10-15" },
  ];
  assert.deepEqual(myCampaignTasks(tasks, users, identity).map((row) => row.id), ["priority-legacy", "priority-late", "normal-early", "priority-disabled", "normal-late"]);
  assert.equal(tasks[0].id, "normal-early");
});
test("KPI measures growth from baseline, retains negative and excess progress, and clamps only bar", () => {
  assert.deepEqual(kpiProgress(kpi), { achieved: 80, percentage: 40, bar: 40 });
  assert.deepEqual(kpiProgress({ ...kpi, current: 960 }), { achieved: -40, percentage: -20, bar: 0 });
  assert.deepEqual(kpiProgress({ ...kpi, current: 1300 }), { achieved: 300, percentage: 150, bar: 100 });
  assert.equal(validateKpi(kpi), null);
  for (const patch of [{ baseline: -1 }, { current: -1 }, { targetIncrease: 0 }, { current: NaN }, { targetIncrease: Infinity }, { name: " " }, { unit: "" }]) assert.ok(validateKpi({ ...kpi, ...patch }));
});
test("task edit clears content type, preserves identity and existing phase, and records each actual status transition once", () => {
  const data = { tasks: [task], users, campaigns: [{ id: "campaign-a", timelineConfig: { phaseMode: false, phases: [], taskPhase: { "task-a": "phase-old" } } }] } as unknown as AppData;
  const edited = applyTaskPatch(data, task.id, { title: "Konten diperbarui", contentCalendarType: null, status: "Review" }, identity, "event-a", "2026-10-29T00:00:00Z");
  assert.equal(edited.tasks.length, 1); assert.equal(edited.tasks[0].id, task.id); assert.equal(edited.tasks[0].campaign, task.campaign);
  assert.equal(edited.tasks[0].contentCalendarType, null); assert.equal(edited.campaigns[0].timelineConfig?.taskPhase["task-a"], "phase-old");
  const sameStatus = applyTaskPatch(edited, task.id, { status: "Review" }, identity, "event-b", "2026-10-29T00:00:01Z");
  assert.equal(sameStatus.taskStatusHistory?.length, 1);
  const completed = applyTaskPatch(sameStatus, task.id, { status: "Done", phaseId: "", assigneeIds: [] }, identity, "event-c", "2026-10-29T00:00:02Z");
  assert.equal(completed.taskStatusHistory?.length, 2); assert.equal(completed.taskStatusHistory?.[0].fromStatus, "Review");
  assert.equal(completed.campaigns[0].timelineConfig?.taskPhase["task-a"], undefined); assert.equal(completed.tasks[0].pic, "Belum ditentukan");
  assert.equal(myCampaignTasks(completed.tasks, users, identity).length, 0);
});
test("edit permits past due dates but rejects missing or invalid calendar dates", () => {
  assert.equal(validateTaskPatch({ dueDate: "2020-02-29" }), null);
  for (const dueDate of ["", "Hari ini", "2026-02-30", "2026-99-01"]) assert.ok(validateTaskPatch({ dueDate }));
  assert.ok(validateTaskPatch({ title: " " }));
});
test("campaign activity merges task and influencer history newest first without losing audit fields", () => {
  const taskHistory = [
    { id: "task-1", taskId: "t1", campaignId: "campaign-a", taskTitle: "Upload assets", actorId: "user-a", actorName: "Andi", fromStatus: "To Do", toStatus: "In Progress", createdAt: "2026-10-30T10:00:00.000Z" },
    { id: "other", taskId: "t2", campaignId: "campaign-b", taskTitle: "Other", actorName: "Budi", fromStatus: "To Do", toStatus: "Done", createdAt: "2026-10-31T10:00:00.000Z" },
  ] as AppData["taskStatusHistory"];
  const influencerHistory = [
    { id: "booking-1", bookingId: "booking-1", campaignId: "campaign-a", influencerName: "Nadia Kuliner", contentLabel: "Menu baru", actorId: "user-b", actorName: "Budi", fromStatus: "Terjadwal", toStatus: "Sudah visit", createdAt: "2026-10-30T11:00:00.000Z" },
  ];
  const merged = mergeCampaignActivities(taskHistory!, influencerHistory, "campaign-a");
  assert.deepEqual(merged.map((item) => item.kind), ["influencer_status", "task_status"]);
  assert.equal(merged[0].label, "Jadwal influencer: Nadia Kuliner · Menu baru");
  assert.equal(merged[0].actorName, "Budi"); // Retained for audit, not rendered by the UI.
  assert.equal(merged[1].label, "Tugas: Upload assets");
});
test("activity feed initially shows five events and reveals all remaining on request", () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index), campaignId: "campaign-a", kind: "task_status" as const, label: `Tugas ${index}`, actorName: "Audit actor", fromStatus: "To Do", toStatus: "Review", createdAt: new Date(2026, 9, 31, 0, 0, index).toISOString() }));
  assert.equal(visibleCampaignActivities(rows, false).length, 5);
  assert.equal(visibleCampaignActivities(rows, true).length, 8);
  assert.equal(visibleCampaignActivities(rows, false)[0].label, "Tugas 0");
});

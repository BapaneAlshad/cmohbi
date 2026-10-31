import test from "node:test";
import assert from "node:assert/strict";
import { allowedTaskStatuses, applyStatusRequest, boardTaskStatus, filteredBoardTasks, isTaskManager, taskIsPriority } from "../lib/task-workflow.ts";
import { applyTaskPatch } from "../lib/campaign-overview.ts";
import type { AppData, Task, UserIdentity } from "../lib/types.ts";

const member: UserIdentity = { id: "member", name: "Tim", username: "tim", email: "tim@example.test", whatsapp: "", role: "Content Creator", accessRole: "member" };
const owner = { ...member, id: "owner", accessRole: "owner" } as UserIdentity;
const task: Task = { id: "task", title: "Produksi konten", brand: "Brand A", campaign: "campaign-a", pic: "Tim", assigneeIds: ["member", "second"], due: "2026-11-01", priority: "Tinggi", status: "To Do" };
const data = { tasks: [task, { ...task, id: "private", status: "Backlog" }, { ...task, id: "standalone", campaign: null, brand: "Brand B", assigneeIds: ["second"] }, { ...task, id: "archived", campaign: "archived" }], users: [], campaigns: [{ id: "campaign-a", lifecycleStatus: "active" }, { id: "archived", lifecycleStatus: "archived" }] } as unknown as AppData;

test("board filters all brands/campaigns, limits PIC choices to mine/all, and hides Backlog from non-managers", () => {
  assert.equal(filteredBoardTasks(data, owner, { brand: "all", pic: "all", campaign: "all" }).length, 3);
  assert.equal(filteredBoardTasks(data, member, { brand: "all", pic: "all", campaign: "all" }).length, 2);
  assert.deepEqual(filteredBoardTasks(data, member, { brand: "all", pic: "mine", campaign: "all" }).map((item) => item.id), ["task"]);
  assert.equal(filteredBoardTasks(data, member, { brand: "Brand B", pic: "all", campaign: "none" })[0].id, "standalone");
  assert.equal(filteredBoardTasks(data, member, { brand: "all", pic: "all", campaign: "campaign-a" }).length, 1);
});
test("only assigned members can request defined next statuses; manager and Viewer permissions differ", () => {
  assert.deepEqual(allowedTaskStatuses(task, [], member), ["In Progress"]);
  assert.deepEqual(allowedTaskStatuses({ ...task, status: "Review" }, [], member), ["Done", "Revisi"]);
  assert.deepEqual(allowedTaskStatuses({ ...task, status: "Revisi" }, [], member), ["In Progress", "Review"]);
  assert.equal(allowedTaskStatuses({ ...task, assigneeIds: [] }, [], member).length, 0);
  assert.equal(allowedTaskStatuses(task, [], { ...member, accessRole: "viewer" }).length, 0);
  assert.equal(allowedTaskStatuses({ ...task, status: "Backlog" }, [], member).length, 0);
  assert.equal(allowedTaskStatuses(task, [], owner).length, 6);
  assert.equal(isTaskManager(member), false);
});
test("pending cards move visually once while official status/progress/history remain unchanged", () => {
  const request = { id: "request", fromStatus: "To Do", toStatus: "In Progress", requestedBy: "member", requestedByName: "Tim", createdAt: "2026-10-29T00:00:00Z" } as const;
  const pending = applyStatusRequest(data, task.id, request);
  assert.equal(pending.tasks[0].status, "To Do"); assert.equal(boardTaskStatus(pending.tasks[0]), "In Progress");
  assert.equal(pending.taskStatusHistory?.length || 0, 0); assert.equal(pending.tasks.filter((item) => item.id === task.id).length, 1);
  assert.equal(allowedTaskStatuses(pending.tasks[0], [], member).length, 0);
  const approved = applyTaskPatch(pending, task.id, { status: "In Progress" }, owner, "history", "2026-10-29T00:00:02Z");
  assert.equal(approved.tasks[0].pendingStatusRequest, null); assert.equal(approved.taskStatusHistory?.length, 1); assert.equal(approved.taskStatusHistory?.[0].actorId, "owner");
});
test("legacy priority is binary and changing campaign keeps one record, clears pending, and removes old phase", () => {
  assert.equal(taskIsPriority(task), true); assert.equal(taskIsPriority({ priority: "Sedang" }), false); assert.equal(taskIsPriority({ priority: "Rendah" }), false); assert.equal(taskIsPriority({ priority: "Tinggi", isPriority: false }), false);
  const original = { ...data, campaigns: [{ id: "campaign-a", timelineConfig: { phaseMode: true, phases: [], taskPhase: { task: "old" } } }, { id: "campaign-b", timelineConfig: { phaseMode: false, phases: [], taskPhase: {} } }] } as AppData;
  const changed = applyTaskPatch(original, task.id, { campaign: "campaign-b", brand: "Brand B", isPriority: false }, owner, "event", "2026-10-29T00:00:03Z");
  assert.equal(changed.tasks.filter((item) => item.id === task.id).length, 1); assert.equal(changed.tasks[0].campaign, "campaign-b"); assert.equal(changed.tasks[0].priority, "Rendah"); assert.equal(changed.campaigns[0].timelineConfig?.taskPhase.task, undefined);
});

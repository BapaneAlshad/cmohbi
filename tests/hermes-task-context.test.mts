import test from "node:test";
import assert from "node:assert/strict";
import type { AppData } from "../lib/types.ts";
import { buildHermesTaskContext } from "../lib/hermes-task-context.ts";

const workspaceData: Pick<AppData, "users" | "tasks"> = {
  users: [
    { id: "user-anggit", name: "Anggit", username: "anggit", email: "anggit@example.test", whatsapp: "", role: "Member", status: "Aktif" },
    { id: "user-dian", name: "Dian", username: "dian", email: "dian@example.test", whatsapp: "", role: "Member", status: "Aktif" },
    { id: "user-anggit-duplicate", name: "Anggit", username: "anggit-duplicate", email: "anggit-duplicate@example.test", whatsapp: "", role: "Member", status: "Aktif" },
  ],
  tasks: [
    { id: "task-1", title: "Review konten campaign", brand: "Java Tea", pic: "Anggit", assigneeIds: ["user-anggit", "user-dian"], due: "30 Nov 2026", dueDate: "2026-11-30", priority: "Tinggi", status: "To Do", campaign: "campaign-1" },
    { id: "task-2", title: "Siapkan caption", brand: "Javacafe", pic: "Dian", assigneeIds: ["user-dian"], due: "2 Des 2026", dueDate: "2026-12-02", priority: "Normal", status: "In Progress", campaign: "campaign-2" },
    { id: "task-3", title: "PIC name conflicts with assignee ID", brand: "Java Tea", pic: "Anggit", assigneeIds: ["user-anggit-duplicate"], due: "3 Des 2026", dueDate: "2026-12-03", priority: "Normal", status: "To Do", campaign: "campaign-1" },
    { id: "task-4", title: "Legacy PIC without assignee ID", brand: "Java Tea", pic: "Anggit", assigneeIds: [], due: "4 Des 2026", dueDate: "2026-12-04", priority: "Normal", status: "To Do", campaign: "campaign-1" },
  ],
};

test("Hermes task context includes PIC names and identifies tasks assigned to the logged-in user", () => {
  const context = buildHermesTaskContext(workspaceData, "user-anggit");
  assert.deepEqual(context.currentUser, { name: "Anggit" });
  assert.equal(context.tasks[0].pic, "Anggit");
  assert.equal(context.tasks[0].dueDate, "2026-11-30");
  assert.deepEqual(context.tasks[0].assignees, ["Anggit", "Dian"]);
  assert.equal(context.tasks[0].assignedToCurrentUser, true);
  assert.deepEqual(context.tasks[1].assignees, ["Dian"]);
  assert.equal(context.tasks[1].assignedToCurrentUser, false);
  assert.deepEqual(context.tasks[2].assignees, ["Anggit"]);
  assert.equal(context.tasks[2].assignedToCurrentUser, false);
  assert.deepEqual(context.tasks[3].assignees, ["Anggit"]);
  assert.equal(context.tasks[3].assignedToCurrentUser, false);
});

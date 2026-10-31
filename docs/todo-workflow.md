# To-Do and Campaign task workflow

To-Do and Campaign use the same task IDs and records. The board shows tasks from every brand and active campaign in the current workspace, including tasks without a campaign. Archived/trashed campaign tasks remain outside the active board.

## Permissions and status changes

- Owner/admin are the CMO/Super Admin managers. They alone create/edit task details, assign PICs, select a brand/campaign, and set official status directly.
- Members see all non-Backlog work. They may request status changes only for tasks where they are one of the assignees. Viewers are read-only.
- Member transitions: To Do → In Progress → Review; Review → Done/Revisi; Revisi → In Progress/Review. Backlog and Done have no member transition.
- One pending request is allowed per task, including multi-PIC tasks. The card appears once in the proposed destination column, with gray styling and an explicit approval label. Official status and Campaign progress remain unchanged.
- CMO can approve or reject. Approval updates the actual task and produces one existing status history record. Rejection removes the proposal and leaves actual status unchanged. Requests and decisions persist in `task_status_requests`.
- Changing official status/campaign or removing the requesting PIC invalidates pending proposals. Duplicate or stale approvals cannot update a task twice.

## UI and persistence

- Filters: Brand, PIC (Semua/Hanya saya), Campaign (including Tanpa campaign). The PIC filter never lists individual teammates.
- Cards show brand, connected campaign, deadline and assignee avatars. PIC selection is in the manager-only form. The three-dot menu opens Edit tugas.
- Priority is a boolean; only priority tasks display a filled star. Existing `Tinggi` becomes true; `Sedang` and `Rendah` become false. The legacy text column remains for compatibility.
- A shared TaskDialog handles creation/editing from To-Do and Campaign. Campaign choices follow the selected brand. Changes keep the same record and clear old phase assignments when moving campaigns.
- Live tasks/requests refresh every 15 seconds while the page is visible and on focus. Refreshes cannot overwrite an in-flight local mutation. Demo data persists in the existing browser storage.

## Database and verification

Apply `20261030120000_todo_workflow_approvals.sql` after `20261030100000_campaign_overview_and_task_history.sql` and its prerequisites, including brands. This is an additive development migration and has not been applied to production.

The migration adds `is_priority` and the request table, tightens task/assignee RLS (including legacy permissive policies), and restricts Backlog/history visibility. Private, explicitly authorized functions lock task/request rows for member requests and CMO decisions. Public invoker wrappers expose only these operations. New task creation and structural editing are manager-only.

Run `npm run typecheck`, `npm test`, and `npm run build`. PGlite tests validate database permissions, private Backlog reads, cross-workspace isolation, duplicate requests, approval/rejection, assignment changes, Campaign/brand consistency, archive access, and exact status-history counts without touching production.

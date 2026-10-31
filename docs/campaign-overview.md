# Campaign overview

The overview contains only My Task, measurable KPIs, and task status activity.

- My Task uses the authenticated profile ID, supports multiple assignees, excludes Done, and orders by deadline. Legacy/demo records fall back to existing profile identity.
- KPI values are manual. Achievement is `current - baseline`; percentage is achievement divided by target increase. Only the visual bar is clamped to 0–100. Owner/admin writes are enforced by database RLS as well as the UI.
- Existing textual `campaigns.kpi` is retained. No numerical target is guessed from legacy text.
- Manager task edits use a per-task queue and the `update_marketing_task` RPC. The RPC updates task fields and assignees in one database transaction, including phase assignment where present. Members now submit status requests, governed by the [To-Do workflow](todo-workflow.md).
- Workspace autosave inserts new tasks only. It no longer rewrites existing tasks or assignees; timeline autosave preserves assignments committed by task editing.
- The database status triggers record real task and influencer cooperation-status transitions, including actor, item/theme snapshots, campaign and timestamp. Payment changes are excluded. There is no historical backfill or client-side history insertion in live mode. Read access follows workspace membership; authenticated clients cannot modify history.
- The overview combines both histories newest first, shows five items initially, then reveals all remaining items with **Lihat lainnya**. Demo KPIs and activity use browser storage; live activity uses the RLS-protected `campaign_activity_feed` view.

## Development migration

`supabase/migrations/20261030100000_campaign_overview_and_task_history.sql` is additive and requires the existing campaign lifecycle, campaign timeline, multi-assignee and content type migrations first. `supabase/migrations/20261031130000_campaign_activity_history.sql` adds influencer cooperation-status history and the merged activity view. Production migrations must be applied separately after review; neither migration is applied automatically. Until migrations are available, live activity shows an explicit error rather than reporting success.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`.

The database test uses PGlite, a PostgreSQL engine running in memory. It applies the migrations against a minimal existing schema and checks owner/admin KPI permissions, workspace isolation, immutable task/influencer history, no-op and payment-only changes, snapshot retention after booking deletion, assignment rollback and phase preservation. It does not connect to production.

UI checks: edit task from Timeline and My Task; verify multi-PIC ownership, removal after Done, To-Do status synchronization, calendar changes after setting/clearing content type, KPI baseline/growth, persisted demo data after reload, and Viewer/desktop/mobile behavior.

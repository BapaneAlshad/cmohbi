import { workspaceSessionResponse } from "@/lib/supabase/workspace-session";

export const dynamic = "force-dynamic";

// Backwards-compatible Bearer endpoint; browser cookie sessions also work.
export const POST = workspaceSessionResponse;

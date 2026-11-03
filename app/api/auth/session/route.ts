import { workspaceSessionResponse } from "@/lib/supabase/workspace-session";

export const dynamic = "force-dynamic";

// Returns a verified profile and membership, never access/refresh tokens.
export const GET = workspaceSessionResponse;

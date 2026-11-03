import "server-only";
import { NextResponse } from "next/server";
import { resolveLiveWorkspace, WorkspaceAccessError } from "../live-workspace";
import { requireSupabaseSession } from "./server";
import { SessionAccessError, sessionResponseHeaders } from "./session";

export async function workspaceSessionResponse(request: Request) {
  try {
    const { client, user } = await requireSupabaseSession(request);
    // Reads use the verified user's token and RLS, never service-role access.
    const workspace = await resolveLiveWorkspace(client, user.id);
    return NextResponse.json(workspace, { headers: sessionResponseHeaders });
  } catch (error) {
    const known = error instanceof SessionAccessError || error instanceof WorkspaceAccessError;
    return NextResponse.json({ error: known ? error.message : "Koneksi Supabase gagal diperiksa. Coba lagi." }, { status: known ? error.status : 503, headers: sessionResponseHeaders });
  }
}

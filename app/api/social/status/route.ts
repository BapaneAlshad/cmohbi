import { NextResponse } from "next/server";
import { connectorHealth, productionDataMode } from "@/lib/social/connectors";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    mode: productionDataMode() ? "supabase" : "demo",
    connectors: connectorHealth().map(({ accountId: _accountId, ...connector }) => connector),
  });
}

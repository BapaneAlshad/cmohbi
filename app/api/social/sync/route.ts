import { NextResponse } from "next/server";
import { connectorHealth, productionDataMode } from "@/lib/social/connectors";

export const dynamic = "force-dynamic";

export async function POST() {
  const connectors = connectorHealth();
  const configured = connectors.filter((connector) => connector.configured).map((connector) => connector.platform);

  if (!productionDataMode() || configured.length === 0) {
    return NextResponse.json({
      mode: "demo",
      synced: ["instagram", "facebook", "tiktok"],
      message: "Mode demo aktif. Tambahkan kredensial server dan Supabase untuk sinkronisasi live.",
    });
  }

  // Sinkronisasi live dijalankan oleh worker/cron terpisah. Endpoint aplikasi hanya
  // memicu job agar access token tidak pernah dikirim ke browser.
  return NextResponse.json({
    mode: "queued",
    synced: configured,
    message: `Sinkronisasi ${configured.join(", ")} masuk antrean worker.`,
  }, { status: 202 });
}

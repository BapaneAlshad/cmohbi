import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function verifySignature(request: NextRequest, rawBody: string) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  const received = request.headers.get("x-hub-signature-256") || "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Webhook verification gagal." }, { status: 403 });
}

function valueText(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "text" in raw) return String((raw as { text?: unknown }).text || "");
  return "";
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(request, rawBody)) return NextResponse.json({ error: "Signature webhook tidak valid." }, { status: 403 });
  const payload = JSON.parse(rawBody) as { object?: string; entry?: Array<Record<string, unknown>> };
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ received: true, stored: 0, message: "Supabase belum dikonfigurasi." });

  let stored = 0;
  for (const entry of payload.entry || []) {
    const entryId = String(entry.id || "");
    const changes = Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : [];
    const messaging = Array.isArray(entry.messaging) ? entry.messaging as Array<Record<string, unknown>> : [];
    const rows = changes.map((change) => {
      const value = (change.value || {}) as Record<string, unknown>;
      const field = String(change.field || "");
      const platform = payload.object === "instagram" ? "instagram" : "facebook";
      const kind = field === "messages" ? "message" : "comment";
      const externalId = String(value.comment_id || value.message_id || value.id || `${entryId}:${field}:${Date.now()}`);
      const from = (value.from || {}) as Record<string, unknown>;
      return { externalId, platform, kind, author: String(from.username || from.name || "Pengguna sosial"), body: valueText(value, "message") || valueText(value, "text") || "Event sosial baru", postTitle: String(value.post_id || "") || null, occurredAt: new Date().toISOString(), rawPayload: value };
    });
    for (const message of messaging) {
      const sender = (message.sender || {}) as Record<string, unknown>;
      const messageBody = (message.message || {}) as Record<string, unknown>;
      rows.push({ externalId: String(messageBody.mid || `${entryId}:message:${Date.now()}`), platform: "facebook", kind: "message", author: String(sender.id || "Pengguna Facebook"), body: String(messageBody.text || "Pesan Facebook baru"), postTitle: null, occurredAt: new Date().toISOString(), rawPayload: message });
    }
    if (!rows.length) continue;

    const connection = await admin.from("social_accounts").select("workspace_id, id").eq("external_account_id", entryId).limit(1).maybeSingle();
    const workspaceId = connection.data?.workspace_id || process.env.SOCIAL_WEBHOOK_WORKSPACE_ID;
    if (!workspaceId) continue;
    const insertRows = rows.map((row) => ({
      workspace_id: workspaceId,
      social_account_id: connection.data?.id || null,
      platform: row.platform,
      kind: row.kind,
      external_id: row.externalId,
      author: row.author,
      body: row.body,
      post_title: row.postTitle,
      occurred_at: row.occurredAt,
      raw_payload: row.rawPayload,
    }));
    const result = await admin.from("social_inbox").upsert(insertRows, { onConflict: "platform,external_id" });
    if (!result.error) stored += insertRows.length;
  }
  return NextResponse.json({ received: true, stored });
}

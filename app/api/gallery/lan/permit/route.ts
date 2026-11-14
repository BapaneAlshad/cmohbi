import { normalizeLanStorageUrl } from "@/lib/gallery-lan";
import { issueLanPermit, lanStorageKey } from "@/lib/gallery-lan-permits";
import { resolveLiveWorkspace, WorkspaceAccessError } from "@/lib/live-workspace";
import { requireSupabaseSession } from "@/lib/supabase/server";
import { SessionAccessError, sessionResponseHeaders } from "@/lib/supabase/session";

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: sessionResponseHeaders });
}

export async function POST(request: Request) {
  // Next can use the bind address (0.0.0.0) in request.url. Host retains
  // the address the browser opened. Forwarded protocol accounts for TLS termination.
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!host || !origin || (protocol !== "http" && protocol !== "https") ||
    (fetchSite !== null && fetchSite !== "same-origin") ||
    origin.toLowerCase() !== `${protocol}://${host.toLowerCase()}`) {
    return json({ error: "Asal permintaan tidak diizinkan." }, 403);
  }
  const body = await request.json().catch(() => null);
  const purpose = body?.purpose;
  if (purpose !== "access" && purpose !== "start" && purpose !== "setup" && purpose !== "check") {
    return json({ error: "Jenis izin tidak valid." }, 400);
  }
  const candidate = purpose === "check" && typeof body.url === "string" ? normalizeLanStorageUrl(body.url) : "";
  if (purpose === "check" && !candidate) return json({ error: "Alamat HTTPS Storage LAN tidak valid." }, 400);

  try {
    const { client, user } = await requireSupabaseSession(request);
    if (user.is_anonymous) return json({ error: "Login diperlukan." }, 401);
    const { workspaceId, profile } = await resolveLiveWorkspace(client, user.id);
    const role = profile.accessRole;
    if (role !== "owner" && role !== "member" && role !== "viewer") {
      return json({ error: "Akses workspace diperlukan." }, 403);
    }
    if (purpose !== "access" && role !== "owner") {
      return json({ error: "Hanya Super Admin yang dapat menjalankan atau memasang storage." }, 403);
    }
    const master = process.env.NGAPAYA_LAN_SIGNING_SECRET;
    if (!master || master.length < 32) {
      return json({ error: "Kunci Storage LAN belum dikonfigurasi di server Ngapaya." }, 503);
    }
    if (purpose === "setup" || purpose === "start") {
      const { error } = await client.from("workspace_media_settings").upsert({
        workspace_id: workspaceId, updated_by: user.id,
      }, { onConflict: "workspace_id", ignoreDuplicates: true, defaultToNull: false });
      if (error) return json({ error: "Pengaturan Storage LAN gagal disiapkan di database." }, 503);
    }
    const settings = await client.from("workspace_media_settings").select("lan_storage_id,lan_storage_url")
      .eq("workspace_id", workspaceId).maybeSingle();
    if (settings.error) return json({ error: "Pengaturan Storage LAN belum tersedia di database." }, 503);
    const storageId = settings.data?.lan_storage_id;
    if (!storageId) return json({ error: "Super Admin belum memasang Storage LAN." }, 409);
    const key = lanStorageKey(master, workspaceId, storageId, origin);
    const claims = { workspace: workspaceId, storageId, origin, user: user.id };
    if (purpose === "setup") {
      return json({ workspace: workspaceId, storageId, origin, key: key.toString("base64url") });
    }
    if (purpose === "start") return json(issueLanPermit(key, { ...claims, role: "owner", purpose }));
    if (purpose === "check" && candidate) {
      return json({ url: candidate, ...issueLanPermit(key, { ...claims, url: candidate, role: "owner", purpose }) });
    }
    const url = normalizeLanStorageUrl(settings.data?.lan_storage_url || "");
    if (!url) return json({ error: "Super Admin belum menyimpan alamat HTTPS Storage LAN." }, 409);
    return json({ url, ...issueLanPermit(key, { ...claims, url, role, purpose: "access" }) });
  } catch (error) {
    if (error instanceof SessionAccessError || error instanceof WorkspaceAccessError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "Izin Storage LAN gagal dibuat. Coba lagi." }, 503);
  }
}

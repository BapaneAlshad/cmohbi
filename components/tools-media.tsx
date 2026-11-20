"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaAsset, MediaCompressionStatus, MediaStorageSource, UserIdentity } from "@/lib/types";
import { GalleryLan, GalleryLanSettings } from "./gallery-lan";
import { Icon, PageHeading } from "./ui";

type GalleryMode = "lan" | "drive" | "settings";
const ADMIN_PIN_KEY = "ngapaya-media-admin-pin";
const MAX_FILE_BYTES = 50 * 1024 * 1024 * 1024;
const NEW_ALBUM_VALUE = "__new_album__";

type DriveConnectionState = {
  configured: boolean;
  connected: boolean;
  account: { name: string; email: string; connectedAt: string } | null;
};

type GalleryProps = {
  mode: GalleryMode;
  workspaceId?: string;
  identity?: UserIdentity;
  supabaseClient: SupabaseClient | null;
  liveMode?: boolean;
  notify: (message: string) => void;
  getAccessToken: () => Promise<string | null>;
};

function fromRow(row: Record<string, unknown>): MediaAsset {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), source: row.storage_source as MediaStorageSource,
    folderPath: String(row.folder_path || ""), fileName: String(row.file_name), mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size || 0), originalLocation: String(row.original_location || ""),
    originalFileId: row.original_file_id ? String(row.original_file_id) : null,
    compressedLocation: row.compressed_location ? String(row.compressed_location) : null,
    compressedFileId: row.compressed_file_id ? String(row.compressed_file_id) : null,
    compressedByteSize: row.compressed_byte_size == null ? null : Number(row.compressed_byte_size),
    compressionStatus: (row.compression_status as MediaCompressionStatus) || "original",
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function normalizeBaseUrl(value: string) { return value.trim().replace(/\/+$/, ""); }

export function ToolsMediaView({ mode, ...props }: GalleryProps) {
  if (mode === "lan") {
    const isOwner = props.identity?.accessRole === "owner" || props.identity?.accessRole === "admin";
    return <GalleryLan key={`${props.workspaceId}:${props.identity?.id}`} liveMode={Boolean(props.liveMode)}
      isOwner={isOwner} canWrite={isOwner || props.identity?.accessRole === "member"} notify={props.notify} />;
  }
  return <DriveMediaView {...props} mode={mode} />;
}

function DriveMediaView({ mode, workspaceId, identity, supabaseClient, liveMode, notify, getAccessToken }: Omit<GalleryProps, "mode"> & { mode: "drive" | "settings" }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [connection, setConnection] = useState<DriveConnectionState>({ configured: true, connected: false, account: null });
  const [folder, setFolder] = useState("all");
  const [uploadAlbum, setUploadAlbum] = useState("");
  const [newAlbumInput, setNewAlbumInput] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pcUrl, setPcUrl] = useState("");
  const [pcPin, setPcPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [companionOnline, setCompanionOnline] = useState(false);
  const [companionDriveConnected, setCompanionDriveConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const isSuperAdmin = identity?.accessRole === "owner" || identity?.accessRole === "admin";
  const canWrite = isSuperAdmin || identity?.accessRole === "member";
  const baseUrl = normalizeBaseUrl(pcUrl);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error || "Permintaan Gallery GDrive gagal."));
    return result;
  }, [getAccessToken]);

  const loadCatalog = useCallback(async () => {
    if (!liveMode || !workspaceId || !supabaseClient) { setAssets([]); return; }
    const result = await supabaseClient.from("media_assets").select("*").eq("workspace_id", workspaceId).eq("storage_source", "drive").order("created_at", { ascending: false });
    if (result.error) throw new Error(`Katalog media belum tersedia. (${result.error.message})`);
    setAssets((result.data || []).map((row) => fromRow(row as Record<string, unknown>)));
  }, [liveMode, supabaseClient, workspaceId]);

  const loadConnection = useCallback(async () => {
    if (!liveMode) { setConnection({ configured: false, connected: false, account: null }); return; }
    setConnection(await api("/api/gallery/drive/connection") as unknown as DriveConnectionState);
  }, [api, liveMode]);

  useEffect(() => {
    setAdminPin(sessionStorage.getItem(ADMIN_PIN_KEY) || "");
    let active = true;
    const load = async () => {
      setError("");
      try {
        await Promise.all([loadCatalog(), loadConnection()]);
        if (liveMode && workspaceId && supabaseClient) {
          const settings = await supabaseClient.from("workspace_media_settings").select("companion_url,companion_access_pin").eq("workspace_id", workspaceId).maybeSingle();
          if (active && settings.data) { setPcUrl(String(settings.data.companion_url || "")); setPcPin(String(settings.data.companion_access_pin || "")); }
        }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Galeri gagal dimuat."); }
    };
    void load();
    return () => { active = false; };
  }, [liveMode, loadCatalog, loadConnection, supabaseClient, workspaceId]);

  useEffect(() => {
    if (!pcPin || !baseUrl) { setCompanionOnline(false); setCompanionDriveConnected(false); return; }
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/drive/connection`, { headers: { "X-Oper-PIN": pcPin } });
        const value = response.ok ? await response.json() : null;
        if (active) { setCompanionOnline(response.ok); setCompanionDriveConnected(value?.status === "connected"); }
      } catch { if (active) { setCompanionOnline(false); setCompanionDriveConnected(false); } }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [baseUrl, pcPin]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.source !== "ngapaya-google-drive") return;
      if (event.data.ok) { notify(String(event.data.message || "Google Drive berhasil dihubungkan.")); void loadConnection(); }
      else setError(String(event.data.message || "Koneksi Google Drive gagal."));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [loadConnection, notify]);

  const connectDrive = async (replace = false) => {
    if (!isSuperAdmin) { setError("Hanya Super Admin yang dapat menghubungkan akun Google Drive."); return; }
    if (replace && !window.confirm("Hubungkan ulang atau ganti akun Google Drive? Jika akun berbeda dipilih, katalog Drive lama akan dilepas dari workspace tanpa menghapus file di akun lama.")) return;
    const popup = window.open("about:blank", "ngapaya-google-drive", "popup,width=560,height=720");
    if (!popup) { setError("Popup diblokir browser. Izinkan popup untuk ngapaya.my.id lalu coba lagi."); return; }
    setBusy(true); setError("");
    try {
      const result = await api("/api/gallery/drive/oauth/start", { method: "POST", body: JSON.stringify({ replace }) });
      popup.location.href = String(result.url);
    } catch (failure) { popup.close(); setError(failure instanceof Error ? failure.message : "Koneksi Google Drive gagal dimulai."); }
    finally { setBusy(false); }
  };

  const disconnectDrive = async () => {
    if (!isSuperAdmin || !window.confirm("Putuskan akun Google Drive dari workspace? File tidak dihapus dari Google Drive.")) return;
    setBusy(true); setError("");
    try { await api("/api/gallery/drive/connection", { method: "DELETE" }); await loadConnection(); notify("Koneksi Google Drive diputus. File tetap aman di Google Drive."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Koneksi gagal diputus."); }
    finally { setBusy(false); }
  };

  const saveCompanionSettings = async () => {
    const url = normalizeBaseUrl(pcUrl), pin = pcPin.trim();
    if (!isSuperAdmin) return;
    if ((url || pin) && (!url || !pin)) { setError("Isi alamat dan PIN companion, atau kosongkan keduanya."); return; }
    if (url) {
      try { const parsed = new URL(url); if (parsed.protocol !== "https:" && window.location.protocol === "https:") throw new Error(); }
      catch { setError("Alamat companion kompresi harus berupa URL HTTPS yang valid."); return; }
      if (pin.length < 6 || pin.length > 64) { setError("PIN companion harus berisi 6–64 karakter."); return; }
    }
    setBusy(true); setError("");
    try {
      if (!liveMode || !workspaceId || !supabaseClient) throw new Error("Pengaturan companion hanya tersedia pada workspace live.");
      const result = await supabaseClient.from("workspace_media_settings").upsert({ workspace_id: workspaceId, companion_url: url, companion_access_pin: pin, updated_by: identity?.id || null, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
      if (result.error) throw result.error;
      setPcUrl(url); setPcPin(pin); notify("Pengaturan companion kompresi tersimpan.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pengaturan companion gagal disimpan."); }
    finally { setBusy(false); }
  };

  const connectCompanionDrive = async () => {
    if (!isSuperAdmin || !pcPin || !baseUrl || !adminPin) { setError("Lengkapi alamat, PIN companion, dan PIN kompresi."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${baseUrl}/api/drive/connect`, { method: "POST", headers: { "X-Oper-PIN": pcPin, "X-Oper-Admin-PIN": adminPin } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Companion gagal memulai koneksi Drive untuk kompresi.");
      notify(result.status === "connected" ? "Companion kompresi terhubung." : "Selesaikan otorisasi Google pada PC companion.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Companion tidak dapat dijangkau."); }
    finally { setBusy(false); }
  };

  const uploadChunked = async (file: File, uploadToken: string, chunkSize: number, signal: AbortSignal) => {
    let offset = 0, fileId = "";
    while (offset < file.size) {
      const endExclusive = Math.min(offset + chunkSize, file.size);
      let result: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await api("/api/gallery/drive/upload-chunk", { method: "POST", headers: { "X-Upload-Token": uploadToken, "Content-Type": file.type, "Content-Range": `bytes ${offset}-${endExclusive - 1}/${file.size}` }, body: file.slice(offset, endExclusive), signal });
          break;
        } catch (failure) {
          if (signal.aborted || attempt === 2) throw failure;
          await new Promise((resolve) => window.setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
      if (!result) throw new Error("Upload ke Google Drive terputus.");
      if (result.status === "complete") {
        fileId = String(result.fileId || ""); offset = file.size;
      } else if (result.status === "partial") {
        const committed = String(result.range || "").match(/bytes=0-(\d+)/i)?.[1];
        offset = committed ? Number(committed) + 1 : endExclusive;
      } else {
        throw new Error("Google Drive tidak mengembalikan status upload yang dikenali.");
      }
      setUpload({ name: file.name, percent: Math.min(100, Math.round((offset / file.size) * 100)) });
    }
    if (!fileId) throw new Error("Google Drive belum mengonfirmasi file hasil upload.");
    return fileId;
  };

  const uploadFiles = async (files: File[]) => {
    if (!canWrite) { setError("Viewer hanya dapat melihat dan mengunduh media."); return; }
    if (!connection.connected) { setError("Google Drive belum dihubungkan oleh Super Admin."); return; }
    const selectedPath = uploadAlbum === NEW_ALBUM_VALUE ? newAlbumInput : uploadAlbum;
    const path = selectedPath.trim().replace(/^[/\\]+|[/\\]+$/g, "");
    if (uploadAlbum === NEW_ALBUM_VALUE && !path) { setError("Isi nama album baru atau pilih Tanpa album."); return; }
    const controller = new AbortController(); uploadAbortRef.current = controller;
    let completed = false;
    setBusy(true); setError("");
    try {
      for (const file of files) {
        setUpload({ name: file.name, percent: 0 });
        const session = await api("/api/gallery/drive/upload-session", { method: "POST", body: JSON.stringify({ folderPath: path, fileName: file.name, mimeType: file.type, byteSize: file.size }) });
        const fileId = await uploadChunked(file, String(session.uploadToken), Number(session.chunkSize || 4 * 1024 * 1024), controller.signal);
        await api("/api/gallery/drive/uploads/complete", { method: "POST", body: JSON.stringify({ uploadToken: session.uploadToken, fileId }) });
      }
      await loadCatalog(); notify(`${files.length} media berhasil disimpan ke Google Drive.`); completed = true;
    } catch (failure) { setError(controller.signal.aborted ? "Upload dibatalkan." : failure instanceof Error ? failure.message : "Upload media gagal."); }
    finally { setBusy(false); setUpload(null); uploadAbortRef.current = null; if (inputRef.current) inputRef.current.value = ""; if (completed) setUploadModalOpen(false); }
  };

  const acceptFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    const valid = files.filter((file) => /^(image|video|audio)\//.test(file.type) && file.size > 0 && file.size <= MAX_FILE_BYTES);
    if (valid.length !== files.length) { setError("Pilih gambar, video, atau audio berukuran maksimal 50 GB per file."); return; }
    if (valid.length) void uploadFiles(valid);
  };

  const syncDrive = async () => {
    setBusy(true); setError("");
    try { const result = await api("/api/gallery/drive/sync", { method: "POST" }); await loadCatalog(); notify(`${Number(result.synced || 0)} media terkelola disinkronkan dari Google Drive.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Sinkronisasi Google Drive gagal."); }
    finally { setBusy(false); }
  };

  const removeAsset = async (asset: MediaAsset) => {
    if (!canWrite || !window.confirm(`Pindahkan ${asset.fileName} ke Sampah Google Drive?`)) return;
    setBusy(true); setError("");
    try { await api(`/api/gallery/drive/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" }); setAssets((current) => current.filter((item) => item.id !== asset.id)); notify("Media dipindahkan ke Sampah Google Drive."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Media gagal dihapus."); }
    finally { setBusy(false); }
  };

  const setCompressionStatus = async (asset: MediaAsset, status: "queued" | "compressed" | "failed", result?: { compressedId?: string; bytes?: number }) => {
    await api(`/api/gallery/drive/assets/${encodeURIComponent(asset.id)}/compression`, { method: "POST", body: JSON.stringify({ status, compressedFileId: result?.compressedId, compressedByteSize: result?.bytes }) });
    await loadCatalog();
  };

  const compress = async (asset: MediaAsset) => {
    if (!isSuperAdmin || !pcPin || !adminPin || !baseUrl || !companionDriveConnected) { setError("Kompresi opsional memerlukan companion aktif, akun Drive yang sama, dan PIN kompresi."); return; }
    setBusy(true); setError("");
    try {
      await setCompressionStatus(asset, "queued");
      const started = await fetch(`${baseUrl}/api/drive/compress/${encodeURIComponent(asset.originalFileId || "")}`, { method: "POST", headers: { "X-Oper-PIN": pcPin, "X-Oper-Admin-PIN": adminPin } });
      if (!started.ok) throw new Error("Companion gagal memulai kompresi.");
      notify("Kompresi dimulai di PC. File asli tetap tersedia.");
      for (let attempt = 0; attempt < 360; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const status = await fetch(`${baseUrl}/api/drive/status/${encodeURIComponent(asset.originalFileId || "")}`, { headers: { "X-Oper-PIN": pcPin } });
        if (!status.ok) continue;
        const result = await status.json();
        if (result.status === "compressed") { await setCompressionStatus(asset, "compressed", { compressedId: String(result.compressedId), bytes: Number(result.bytes || 0) }); notify("Kompresi selesai."); return; }
        if (result.status === "failed") throw new Error(result.error || "Kompresi gagal.");
      }
      throw new Error("Kompresi masih berjalan. Periksa kembali beberapa saat lagi.");
    } catch (failure) { try { await setCompressionStatus(asset, "failed"); } catch { /* keep original */ } setError(failure instanceof Error ? failure.message : "Kompresi gagal."); }
    finally { setBusy(false); }
  };

  const albums = useMemo(() => [...new Set(assets.map((asset) => asset.folderPath).filter(Boolean))].sort(), [assets]);
  const visibleAssets = assets.filter((asset) => folder === "all" || (asset.folderPath || "Tanpa album") === folder);
  const needsCompression = assets.filter((asset) => /^(image|video)\//.test(asset.mimeType) && asset.compressionStatus !== "compressed").length;

  const openUploadModal = () => {
    setError("");
    setUploadAlbum(folder !== "all" && folder !== "Tanpa album" ? folder : "");
    setNewAlbumInput("");
    setUploadModalOpen(true);
  };

  useEffect(() => {
    if (!uploadModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setUploadModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, uploadModalOpen]);

  if (mode === "settings") return <>
    <PageHeading title="Setting Gallery" description="Atur Storage LAN, akun Google Drive, dan companion kompresi opsional." />
    <section className="tools-media-page">
      {isSuperAdmin && liveMode && <GalleryLanSettings workspaceId={workspaceId} userId={identity?.id ? String(identity.id) : undefined} client={supabaseClient} notify={notify} />}
      {!isSuperAdmin ? <div className="card tools-media-empty"><div><Icon name="lock" size={20} /></div><strong>Setting hanya untuk Super Admin</strong><span>Anggota tetap dapat memakai galeri yang sudah dihubungkan.</span></div> : <>
        <section className="card tools-media-settings">
          <div><h2><Icon name="cloud" size={16} /> Google Drive workspace</h2><p>Hubungkan satu kali. Upload seluruh tim tersimpan di folder “Ngapaya Media” pada akun ini.</p></div>
          <div className="tools-media-settings-drive">
            <div className={`tools-drive-state ${connection.connected ? "connected" : ""}`}><span className="tools-state-dot" /><span>{connection.connected ? <>Drive terhubung<small>{connection.account?.name || connection.account?.email} · {connection.account?.email}</small></> : connection.configured ? "Drive belum terhubung" : "OAuth Google belum dikonfigurasi di server"}</span></div>
            <div className="tools-media-gallery-actions"><button className="button button-primary" disabled={busy || !connection.configured} onClick={() => void connectDrive(Boolean(connection.connected))}>{connection.connected ? "Hubungkan / ganti akun" : "Hubungkan Google Drive"}</button>{connection.connected && <button className="button button-soft" disabled={busy} onClick={() => void disconnectDrive()}>Putuskan</button>}</div>
          </div>
        </section>
        <section className="card tools-media-settings">
          <div><h2><Icon name="sparkles" size={16} /> Companion kompresi (opsional)</h2><p>Gallery, upload, preview, dan download tetap berfungsi tanpa PC ini. Companion hanya diperlukan saat Super Admin menjalankan kompresi manual.</p></div>
          <div className="tools-media-settings-fields"><label>Alamat HTTPS companion<input value={pcUrl} onChange={(event) => setPcUrl(event.target.value)} placeholder="https://lan.ngapaya.my.id:8765" /></label><label>PIN akses companion<input value={pcPin} onChange={(event) => setPcPin(event.target.value)} placeholder="PIN akses PC" /></label><button className="button button-primary" disabled={busy} onClick={() => void saveCompanionSettings()}>Simpan companion</button></div>
          <div className="tools-media-settings-drive"><div className={`tools-drive-state ${companionOnline ? "connected" : ""}`}><span className="tools-state-dot" /><span>{companionOnline ? companionDriveConnected ? "Companion aktif · Drive kompresi terhubung" : "Companion aktif · Drive kompresi belum terhubung" : "Companion offline (tidak memengaruhi Gallery)"}</span></div><label>PIN kompresi Super Admin<input value={adminPin} onChange={(event) => { setAdminPin(event.target.value); sessionStorage.setItem(ADMIN_PIN_KEY, event.target.value); }} type="password" autoComplete="current-password" /></label><button className="button button-soft" disabled={busy || !baseUrl || !pcPin} onClick={() => void connectCompanionDrive()}>Hubungkan Drive untuk kompresi</button></div>
        </section>
      </>}
      {error && <div className="tools-media-note tools-media-error" role="alert"><Icon name="alert" size={15} />{error}</div>}
    </section>
  </>;

  return <>
    <PageHeading title="Gallery GDrive" description="Galeri tim yang tersimpan langsung di Google Drive workspace." />
    <section className="tools-media-page">
      {!liveMode && <div className="tools-media-note"><Icon name="info" size={15} /> Gallery GDrive tidak tersedia pada mode demo lokal.</div>}
      <div className="tools-media-intro card"><div className="tools-media-intro-icon"><Icon name="cloud" size={20} /></div><div><strong>Google Drive workspace</strong><p>{connection.connected ? `Terhubung ke ${connection.account?.email || "akun Super Admin"}. Companion PC tidak diperlukan.` : "Super Admin perlu menghubungkan akun Google Drive dari menu Setting."}</p></div><div className="tools-media-stat"><b>{assets.length}</b><span>media</span></div></div>
      {!connection.connected && <div className="tools-media-note"><Icon name="info" size={15} /> Google Drive belum terhubung. Katalog lama tetap terlihat, tetapi file tidak dapat dibuka sampai Super Admin menghubungkan akun.</div>}
      {!canWrite && <div className="tools-media-note"><Icon name="lock" size={15} /> Mode Viewer: Anda dapat melihat, preview, dan mengunduh media.</div>}
      {error && <div className="tools-media-note tools-media-error" role="alert"><Icon name="alert" size={15} />{error}</div>}
      <section id="tools-media-gallery" className="card tools-media-gallery"><div className="tools-media-gallery-head"><div><h2>Album media</h2><p>Konten pada folder terkelola “Ngapaya Media”.</p></div><div className="tools-media-gallery-actions">{canWrite && <button className="button button-primary button-sm" disabled={busy || !connection.connected} onClick={openUploadModal}><Icon name="upload" size={13} />Tambah media</button>}<div className="tools-media-filters"><select value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Filter album"><option value="all">Semua album</option><option value="Tanpa album">Tanpa album</option>{albums.map((album) => <option key={album} value={album}>{album}</option>)}</select></div>{canWrite && <button className="button button-soft button-sm" disabled={busy || !connection.connected} onClick={() => void syncDrive()}><Icon name="restore" size={13} />Segarkan dari Drive</button>}</div></div>
        {visibleAssets.length ? <div className="tools-media-cards">{visibleAssets.map((asset) => <MediaCard key={asset.id} asset={asset} onOpen={() => setPreview(asset)} onDelete={() => void removeAsset(asset)} onCompress={() => void compress(asset)} onDownload={(compressed) => { const anchor = document.createElement("a"); anchor.href = `/api/gallery/drive/assets/${encodeURIComponent(asset.id)}/content?download=1${compressed ? "&version=compressed" : ""}`; anchor.click(); }} isSuperAdmin={Boolean(isSuperAdmin)} canDelete={Boolean(canWrite)} canCompress={companionDriveConnected} busy={busy} />)}</div> : <div className="tools-media-empty"><div><Icon name="cloud" size={20} /></div><strong>Belum ada media</strong><span>{canWrite ? "Unggah media atau segarkan katalog dari Google Drive." : "Belum ada media untuk workspace ini."}</span></div>}
      </section>
      <section className={`tools-compression-callout ${needsCompression ? "has-pending" : ""}`}><div><Icon name="sparkles" size={17} /><strong>Kompresi manual opsional</strong></div><p>File asli selalu tersimpan. Super Admin dapat menjalankan kompresi melalui companion Windows tanpa memengaruhi upload dan galeri utama.</p></section>
    </section>
    {uploadModalOpen && canWrite && <div className="media-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setUploadModalOpen(false); }}><div className="tools-media-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="tools-media-upload-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="tools-media-upload-title">Tambah media</h2><p>Simpan gambar, video, atau audio ke Google Drive.</p></div><button className="icon-button" aria-label="Tutup tambah media" disabled={busy} onClick={() => setUploadModalOpen(false)}><Icon name="close" /></button></header><div className="tools-media-upload-form"><label>Album / folder<select value={uploadAlbum} onChange={(event) => setUploadAlbum(event.target.value)}><option value="">Tanpa album</option>{albums.map((album) => <option key={album} value={album}>{album}</option>)}<option value={NEW_ALBUM_VALUE}>+ Tambah album baru</option></select></label>{uploadAlbum === NEW_ALBUM_VALUE && <label>Nama album baru<input autoFocus value={newAlbumInput} onChange={(event) => setNewAlbumInput(event.target.value)} placeholder="Contoh: Campaign / Opening RUMA / Reels" /></label>}<div className={`tools-media-dropzone tools-media-upload-dropzone ${dragActive ? "active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); acceptFiles(event.dataTransfer.files); }}><Icon name="upload" size={20} /><strong>Tarik media ke sini</strong><span>Gambar, video, atau audio · maksimal 50 GB per file</span>{upload ? <><b>{upload.name} · {upload.percent}%</b><progress max={100} value={upload.percent} /><button className="button button-soft button-sm" onClick={() => uploadAbortRef.current?.abort()}>Batalkan</button></> : <button className="button button-primary" disabled={busy || !connection.connected} onClick={() => inputRef.current?.click()}>Pilih file</button>}<input ref={inputRef} type="file" hidden multiple accept="image/*,video/*,audio/*" onChange={() => { if (inputRef.current?.files?.length) acceptFiles(inputRef.current.files); }} /></div>{error && <div className="tools-media-note tools-media-error" role="alert"><Icon name="alert" size={15} />{error}</div>}</div></div></div>}
    {preview && <div className="media-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="media-preview-dialog" role="dialog" aria-modal="true" aria-label={preview.fileName} onClick={(event) => event.stopPropagation()}><button className="icon-button" aria-label="Tutup preview" onClick={() => setPreview(null)}><Icon name="close" /></button>{preview.mimeType.startsWith("video/") ? <video src={`/api/gallery/drive/assets/${encodeURIComponent(preview.id)}/content${preview.compressionStatus === "compressed" ? "?version=compressed" : ""}`} controls autoPlay /> : preview.mimeType.startsWith("audio/") ? <audio src={`/api/gallery/drive/assets/${encodeURIComponent(preview.id)}/content`} controls autoPlay /> : <img src={`/api/gallery/drive/assets/${encodeURIComponent(preview.id)}/content${preview.compressionStatus === "compressed" ? "?version=compressed" : ""}`} alt={preview.fileName} />}</div></div>}
  </>;
}

function MediaCard({ asset, onOpen, onDelete, onCompress, onDownload, isSuperAdmin, canDelete, canCompress, busy }: {
  asset: MediaAsset; onOpen: () => void; onDelete: () => void; onCompress: () => void; onDownload: (compressed: boolean) => void;
  isSuperAdmin: boolean; canDelete: boolean; canCompress: boolean; busy: boolean;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const hasCompressed = asset.compressionStatus === "compressed" && Boolean(asset.compressedFileId);
  const canThumbnail = !thumbnailFailed && (asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/"));
  const size = (hasCompressed ? asset.compressedByteSize : asset.byteSize) || 0;
  return <article className="tools-media-card"><button className="tools-media-thumb" onClick={onOpen} aria-label={`Buka ${asset.fileName}`}>{canThumbnail ? <img src={`/api/gallery/drive/assets/${encodeURIComponent(asset.id)}/thumbnail`} alt="" loading="lazy" onError={() => setThumbnailFailed(true)} /> : <span className="tools-media-type"><Icon name={asset.mimeType.startsWith("video/") ? "film" : "cloud"} size={25} /><small>{asset.mimeType.startsWith("video/") ? "VIDEO" : asset.mimeType.startsWith("audio/") ? "AUDIO" : "DRIVE"}</small></span>}</button><div className="tools-media-card-info"><strong title={asset.fileName}>{asset.fileName}</strong><span>{asset.folderPath || "Tanpa album"}</span><div><span>{hasCompressed ? "Versi ringan" : "Asli"}</span><span>{formatBytes(size)}</span></div><div className="tools-media-card-actions"><button className="button button-soft button-sm" onClick={onOpen}><Icon name="eye" size={13} />Preview</button>{isSuperAdmin && canCompress && /^(image|video)\//.test(asset.mimeType) && !hasCompressed && <button className="button button-soft button-sm" disabled={busy} onClick={onCompress}><Icon name="sparkles" size={13} />{asset.compressionStatus === "queued" ? "Berjalan" : "Kompres"}</button>}{hasCompressed && <button className="button button-soft button-sm" onClick={() => onDownload(true)}><Icon name="download" size={13} />Ringan</button>}<button className="button button-soft button-sm" onClick={() => onDownload(false)}><Icon name="download" size={13} />Asli</button>{canDelete && <button className="icon-button media-delete" title="Pindahkan ke Sampah Google Drive" aria-label={`Hapus ${asset.fileName}`} disabled={busy} onClick={onDelete}><Icon name="trash" size={14} /></button>}</div></div></article>;
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

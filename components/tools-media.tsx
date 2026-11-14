"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaAsset, MediaCompressionStatus, MediaStorageSource, UserIdentity } from "@/lib/types";
import { GalleryLan, GalleryLanSettings } from "./gallery-lan";
import { Icon, PageHeading } from "./ui";

type GalleryMode = "lan" | "drive" | "settings";
const LOCAL_KEY = "ngapaya-media-catalog-v1";
const LOCAL_SETTINGS_KEY = "ngapaya-media-connection-v1";
const ADMIN_PIN_KEY = "ngapaya-media-admin-pin";

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
    createdBy: row.created_by ? String(row.created_by) : null, createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function localCatalog(): MediaAsset[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as MediaAsset[]; } catch { return []; }
}

function normalizeBaseUrl(value: string) { return value.trim().replace(/\/+$/, ""); }

type GalleryProps = {
  mode: GalleryMode; workspaceId?: string; identity?: UserIdentity; supabaseClient: SupabaseClient | null;
  liveMode?: boolean; notify: (message: string) => void;
};

export function ToolsMediaView({ mode, ...props }: GalleryProps) {
  if (mode === "lan") {
    const isOwner = props.identity?.accessRole === "owner" || props.identity?.accessRole === "admin";
    return <GalleryLan key={`${props.workspaceId}:${props.identity?.id}`} liveMode={Boolean(props.liveMode)}
      isOwner={isOwner} canWrite={isOwner || props.identity?.accessRole === "member"} notify={props.notify} />;
  }
  return <DriveMediaView {...props} mode={mode} />;
}

function DriveMediaView({ mode, workspaceId, identity, supabaseClient, liveMode, notify }: Omit<GalleryProps, "mode"> & {
  mode: "drive" | "settings";
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [folder, setFolder] = useState("all");
  const [folderInput, setFolderInput] = useState("");
  const [pcUrl, setPcUrl] = useState("");
  const [pcPin, setPcPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [driveAgentConnected, setDriveAgentConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ asset: MediaAsset; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSuperAdmin = identity?.accessRole === "owner" || identity?.accessRole === "admin";
  const baseUrl = normalizeBaseUrl(pcUrl);

  useEffect(() => {
    setAdminPin(sessionStorage.getItem(ADMIN_PIN_KEY) || "");
    let active = true;
    if (!liveMode || !workspaceId || !supabaseClient) {
      try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) || "{}");
        setPcUrl(saved.url || "http://127.0.0.1:8765");
        setPcPin(saved.pin || "");
      } catch { setPcUrl("http://127.0.0.1:8765"); setPcPin(""); }
      setAssets(localCatalog());
      return () => { active = false; };
    }

    setAssets([]);
    setPcUrl("");
    setPcPin("");
    void Promise.all([
      supabaseClient.from("media_assets").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      supabaseClient.from("workspace_media_settings").select("companion_url,companion_access_pin").eq("workspace_id", workspaceId).maybeSingle(),
    ]).then(([mediaResult, settingsResult]) => {
      if (!active) return;
      if (mediaResult.error) setError(`Katalog media belum tersedia. (${mediaResult.error.message})`);
      else setAssets((mediaResult.data || []).map((row) => fromRow(row as Record<string, unknown>)));
      if (settingsResult.error) setError((current) => current || `Pengaturan companion belum tersedia. Siapkan migrasi lokal terlebih dahulu. (${settingsResult.error.message})`);
      else if (settingsResult.data) {
        setPcUrl(String(settingsResult.data.companion_url || ""));
        setPcPin(String(settingsResult.data.companion_access_pin || ""));
      }
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "Gagal memuat galeri."); });
    return () => { active = false; };
  }, [liveMode, workspaceId, supabaseClient]);

  useEffect(() => {
    if (!pcPin || !baseUrl) { setDriveAgentConnected(false); return; }
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/drive/connection`, { headers: { "X-Oper-PIN": pcPin } });
        const value = response.ok ? await response.json() : null;
        if (active) setDriveAgentConnected(value?.status === "connected");
      } catch { if (active) setDriveAgentConnected(false); }
    };
    void check();
    const timer = window.setInterval(() => void check(), 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pcPin, baseUrl]);

  const persist = useCallback(async (asset: MediaAsset) => {
    if (liveMode && workspaceId && supabaseClient) {
      const { error: saveError } = await supabaseClient.from("media_assets").insert({
        id: asset.id, workspace_id: workspaceId, campaign_id: asset.campaignId || null,
        created_by: identity?.id || null, storage_source: asset.source, folder_path: asset.folderPath,
        file_name: asset.fileName, mime_type: asset.mimeType, byte_size: asset.byteSize,
        original_location: asset.originalLocation, original_file_id: asset.originalFileId || null,
        compressed_location: asset.compressedLocation || null, compressed_file_id: asset.compressedFileId || null,
        compression_status: asset.compressionStatus,
      });
      if (saveError) throw saveError;
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([asset, ...localCatalog()]));
    }
    setAssets((current) => [asset, ...current]);
  }, [identity?.id, liveMode, supabaseClient, workspaceId]);

  const updateCatalog = useCallback(async (asset: MediaAsset, patch: Partial<MediaAsset>) => {
    const next = { ...asset, ...patch };
    if (liveMode && workspaceId && supabaseClient) {
      const { error: updateError } = await supabaseClient.from("media_assets").update({
        compressed_location: next.compressedLocation || null, compressed_file_id: next.compressedFileId || null,
        compressed_byte_size: next.compressedByteSize ?? null, compression_status: next.compressionStatus,
        updated_at: new Date().toISOString(),
      }).eq("workspace_id", workspaceId).eq("id", asset.id);
      if (updateError) throw updateError;
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(localCatalog().map((item) => item.id === asset.id ? next : item)));
    }
    setAssets((current) => current.map((item) => item.id === asset.id ? next : item));
  }, [liveMode, supabaseClient, workspaceId]);

  const syncLock = useRef(false);
  useEffect(() => {
    if (!pcPin || !baseUrl || !assets.some((asset) => asset.source === "drive" && asset.compressionStatus === "queued")) return;
    let active = true;
    const sync = async () => {
      if (syncLock.current) return;
      syncLock.current = true;
      try {
        for (const asset of assets.filter((item) => item.source === "drive" && item.compressionStatus === "queued" && item.originalFileId)) {
          const route = `/api/drive/status/${encodeURIComponent(asset.originalFileId!)}`;
          const response = await fetch(`${baseUrl}${route}`, { headers: { "X-Oper-PIN": pcPin } });
          if (!response.ok) continue;
          const result = await response.json();
          if (!active) return;
          if (result.status === "compressed" && result.compressedId) {
            await updateCatalog(asset, {
              compressionStatus: "compressed",
              compressedLocation: `https://drive.google.com/file/d/${result.compressedId}/view`,
              compressedFileId: String(result.compressedId), compressedByteSize: Number(result.bytes || 0),
            });
          } else if (result.status === "failed") await updateCatalog(asset, { compressionStatus: "failed" });
        }
      } catch { /* The companion may be offline; originals stay available. */ }
      finally { syncLock.current = false; }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [assets, pcPin, baseUrl, updateCatalog]);

  const uploadFiles = useCallback(async (files: File[]) => {
    setBusy(true); setError("");
    try {
      if (!pcPin || !baseUrl) throw new Error("Alamat companion dan PIN akses belum diatur oleh Super Admin.");
      if (!driveAgentConnected) throw new Error("Google Drive Super Admin belum terhubung ke companion PC.");
      for (const file of files) {
        const folder = folderInput.trim().replace(/^\/+|\/+$/g, "");
        const query = new URLSearchParams({ folder, name: file.name });
        const route = "/api/drive/upload";
        const response = await fetch(`${baseUrl}${route}?${query}`, {
          method: "POST", headers: { "X-Oper-PIN": pcPin, "Content-Type": file.type || "application/octet-stream" }, body: file,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Upload ke Google Drive gagal.");
        const asset: MediaAsset = {
          id: crypto.randomUUID(), workspaceId: workspaceId || "local", source: "drive",
          folderPath: String(result.folder || folder), fileName: String(result.name || file.name),
          mimeType: String(result.mime || file.type || "application/octet-stream"), byteSize: file.size,
          originalLocation: String(result.location || `https://drive.google.com/file/d/${result.id}/view`),
          originalFileId: String(result.id), compressionStatus: "original",
          createdBy: identity?.id ? String(identity.id) : null, createdAt: new Date().toISOString(),
        };
        await persist(asset);
      }
      notify(`${files.length} media berhasil disimpan di Google Drive Super Admin.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Upload media gagal."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }, [baseUrl, driveAgentConnected, folderInput, identity?.id, notify, pcPin, persist, workspaceId]);

  const acceptFiles = (files: FileList | File[]) => {
    if (!folderInput.trim()) { setError("Isi nama album/folder sebelum mengunggah."); return; }
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"));
    if (!selected.length) { setError("Pilih file gambar, video, atau audio."); return; }
    void uploadFiles(selected);
  };

  const saveSharedSettings = async () => {
    const url = normalizeBaseUrl(pcUrl);
    const pin = pcPin.trim();
    if (!isSuperAdmin) { setError("Hanya Super Admin yang dapat mengubah pengaturan Gallery."); return; }
    if ((url || pin) && (!url || !pin)) { setError("Isi alamat companion dan PIN akses, atau kosongkan keduanya untuk menghapus konfigurasi."); return; }
    if (url) {
      try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
      catch { setError("Alamat companion harus berupa URL HTTP atau HTTPS yang valid."); return; }
      if (pin.length < 6 || pin.length > 64) { setError("PIN akses companion harus berisi 6–64 karakter, sesuai aplikasi companion PC."); return; }
    }
    setBusy(true); setError("");
    try {
      if (liveMode && workspaceId && supabaseClient) {
        const { error: saveError } = await supabaseClient.from("workspace_media_settings").upsert({
          workspace_id: workspaceId, companion_url: url, companion_access_pin: pin,
          updated_by: identity?.id || null, updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id" });
        if (saveError) throw saveError;
      } else localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ url, pin }));
      setPcUrl(url); setPcPin(pin); notify("Pengaturan companion Gallery tersimpan untuk workspace.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pengaturan gagal disimpan."); }
    finally { setBusy(false); }
  };

  const connectDriveToCompanion = async () => {
    if (!isSuperAdmin || !pcPin || !baseUrl || !adminPin) { setError("Isi alamat companion, PIN akses, dan PIN kompresi Super Admin."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${baseUrl}/api/drive/connect`, { method: "POST", headers: { "X-Oper-PIN": pcPin, "X-Oper-Admin-PIN": adminPin } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menghubungkan Drive ke companion PC.");
      if (result.status === "connected") { setDriveAgentConnected(true); notify("Google Drive Super Admin sudah terhubung ke companion PC."); }
      else notify("Selesaikan otorisasi Google di komputer companion. Status akan diperiksa otomatis.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Companion PC tidak bisa memulai koneksi Drive."); }
    finally { setBusy(false); }
  };

  const albums = useMemo(() => [...new Set(assets.filter((asset) => asset.source === "drive").map((asset) => asset.folderPath || "Tanpa album"))].sort(), [assets]);
  const sourceAssets = assets.filter((asset) => asset.source === "drive");
  const visibleAssets = sourceAssets.filter((asset) => folder === "all" || (asset.folderPath || "Tanpa album") === folder);
  const needsCompression = mode === "drive" ? sourceAssets.filter((asset) => (asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/")) && (asset.compressionStatus === "original" || asset.compressionStatus === "failed")).length : 0;

  const openPreview = async (asset: MediaAsset) => {
    setError("");
    try {
      if (!pcPin || !baseUrl) throw new Error("Akses companion belum diatur oleh Super Admin.");
      const compressed = asset.source === "drive" && asset.compressionStatus === "compressed";
      const fileId = compressed ? asset.compressedFileId : asset.originalFileId;
      if (!fileId) throw new Error("ID file media tidak tersedia.");
      const route = `/api/drive/stream-ticket/${encodeURIComponent(fileId)}`;
      const ticketResponse = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "X-Oper-PIN": pcPin } });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error || "Companion tidak dapat menyiapkan streaming media.");
      const streamRoute = `/api/drive/stream/${encodeURIComponent(fileId)}`;
      setPreview({ asset, url: `${baseUrl}${streamRoute}?ticket=${encodeURIComponent(ticket.ticket)}` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Media gagal dibuka."); }
  };

  const downloadVersion = async (asset: MediaAsset, compressed: boolean) => {
    try {
      if (!pcPin || !baseUrl) throw new Error("Akses companion belum diatur oleh Super Admin.");
      const useCompressed = asset.source === "drive" && compressed;
      const fileId = useCompressed ? asset.compressedFileId : asset.originalFileId;
      if (!fileId) throw new Error("ID file media tidak tersedia.");
      const route = `/api/drive/stream-ticket/${encodeURIComponent(fileId)}`;
      const ticketResponse = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "X-Oper-PIN": pcPin } });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error || "Companion tidak dapat menyiapkan unduhan.");
      const streamRoute = `/api/drive/stream/${encodeURIComponent(fileId)}`;
      const anchor = document.createElement("a");
      anchor.href = `${baseUrl}${streamRoute}?ticket=${encodeURIComponent(ticket.ticket)}&download=1`;
      anchor.download = compressed ? `${asset.fileName.replace(/\.[^.]+$/, "")}_ringan${asset.mimeType.startsWith("video/") ? ".mp4" : asset.mimeType.startsWith("image/") ? ".jpg" : ""}` : asset.fileName;
      anchor.click();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unduhan gagal."); }
  };

  const compress = async (asset: MediaAsset) => {
    if (!isSuperAdmin || !pcPin || !adminPin || !baseUrl) { setError("Kompresi manual memerlukan akses Super Admin, PIN akses, dan PIN kompresi PC."); return; }
    if (asset.source !== "drive") { setError("Kompresi hanya tersedia untuk media di Gallery GDrive."); return; }
    if (!driveAgentConnected) { setError("Hubungkan Google Drive Super Admin ke companion PC sebelum meminta kompresi."); return; }
    setBusy(true); setError("");
    try {
      await updateCatalog(asset, { compressionStatus: "queued" });
      const route = `/api/drive/compress/${encodeURIComponent(asset.originalFileId || "")}`;
      const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "X-Oper-PIN": pcPin, "X-Oper-Admin-PIN": adminPin } });
      if (!response.ok) throw new Error("Companion PC gagal memulai kompresi.");
      notify("Kompresi dimulai di PC. File asli tetap digunakan sampai hasil kompresi siap.");
      for (let attempt = 0; attempt < 360; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const statusRoute = `/api/drive/status/${encodeURIComponent(asset.originalFileId || "")}`;
        const status = await fetch(`${baseUrl}${statusRoute}`, { headers: { "X-Oper-PIN": pcPin } });
        if (!status.ok) continue;
        const result = await status.json();
        if (result.status === "compressed") {
          await updateCatalog(asset, {
            compressionStatus: "compressed",
            compressedLocation: `https://drive.google.com/file/d/${result.compressedId}/view`,
            compressedFileId: String(result.compressedId), compressedByteSize: Number(result.bytes || 0),
          });
          notify("Kompresi selesai. Preview memakai salinan yang lebih ringan."); return;
        }
        if (result.status === "failed") throw new Error(result.error || "Kompresi gagal di companion PC.");
      }
      throw new Error("Kompresi masih berjalan di PC; hasil akan disinkronkan saat tersedia.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Kompresi gagal.");
      try { await updateCatalog(asset, { compressionStatus: "failed" }); } catch { /* preserve source file */ }
    } finally { setBusy(false); }
  };

  const removeAsset = async (asset: MediaAsset) => {
    if (!window.confirm(`Hapus ${asset.fileName} dari katalog Ngapaya? File sumber tidak ikut dihapus.`)) return;
    try {
      if (liveMode && workspaceId && supabaseClient) {
        const { error: removeError } = await supabaseClient.from("media_assets").delete().eq("workspace_id", workspaceId).eq("id", asset.id);
        if (removeError) throw removeError;
      } else localStorage.setItem(LOCAL_KEY, JSON.stringify(localCatalog().filter((item) => item.id !== asset.id)));
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Gagal menghapus dari katalog."); }
  };

  const title = mode === "drive" ? "Gallery GDrive" : "Setting Gallery";
  const description = mode === "drive" ? "Galeri media di Google Drive workspace, tersimpan pada akun Super Admin." : "Atur Storage LAN dan koneksi Google Drive.";

  return <>
    <PageHeading title={title} description={description} />
    <section className="tools-media-page">
      {!liveMode && <div className="tools-media-note"><Icon name="info" size={15} /> Mode lokal: katalog dan pengaturan hanya tersimpan di browser ini.</div>}
      {liveMode && !workspaceId && <div className="tools-media-note tools-media-error"><Icon name="alert" size={15} /> Workspace aktif belum tersedia.</div>}
      {mode === "settings" ? <>
        {isSuperAdmin && liveMode && <GalleryLanSettings workspaceId={workspaceId}
          userId={identity?.id ? String(identity.id) : undefined} client={supabaseClient} notify={notify} />}
        {!isSuperAdmin ? <div className="card tools-media-empty"><div><Icon name="lock" size={20} /></div><strong>Setting hanya untuk Super Admin</strong><span>Anggota tetap dapat menggunakan koneksi bersama dari Gallery LAN dan Gallery GDrive.</span></div> : <section className="card tools-media-settings">
          <div><h2><Icon name="cloud" size={16} /> Companion Gallery GDrive</h2><p>Alamat dan PIN akses ini digunakan untuk mengunggah media ke Google Drive Super Admin.</p></div>
          <div className="tools-media-settings-fields">
            <label>Alamat companion PC<input value={pcUrl} onChange={(event) => setPcUrl(event.target.value)} placeholder="http://192.168.1.10:8765" autoComplete="url" /></label>
            <label>PIN akses companion<input value={pcPin} onChange={(event) => setPcPin(event.target.value)} placeholder="PIN akses yang disetel di PC" autoComplete="off" /></label>
            <button className="button button-primary" disabled={busy} onClick={() => void saveSharedSettings()}>{busy ? "Menyimpan…" : "Simpan pengaturan workspace"}</button>
          </div>
          <div className="tools-media-settings-drive">
            <div><h2><Icon name="cloud" size={16} /> Google Drive Super Admin</h2><p>Hubungkan sekali dari komputer yang menjalankan companion. Unggahan seluruh anggota menggunakan akun Drive yang tersambung di PC tersebut.</p></div>
            <div className={`tools-drive-state ${driveAgentConnected ? "connected" : ""}`}><span className="tools-state-dot" />{driveAgentConnected ? "Drive terhubung" : "Drive belum terhubung"}</div>
            <label>PIN kompresi Super Admin<input value={adminPin} onChange={(event) => { setAdminPin(event.target.value); sessionStorage.setItem(ADMIN_PIN_KEY, event.target.value); }} type="password" placeholder="PIN khusus untuk tindakan admin di PC ini" autoComplete="current-password" /></label>
            <button className="button button-soft" disabled={busy || !pcPin || !baseUrl} onClick={() => void connectDriveToCompanion()}>{driveAgentConnected ? "Periksa / hubungkan ulang Drive" : "Hubungkan Drive melalui companion"}</button>
          </div>
        </section>}
      </> : <>
        <div className="tools-media-intro card"><div className="tools-media-intro-icon"><Icon name="cloud" size={20} /></div><div><strong>Google Drive Super Admin</strong><p>Semua unggahan tim tersimpan memakai akun Google Drive yang terhubung pada companion.</p></div><div className="tools-media-stat"><b>{sourceAssets.length}</b><span>media</span></div></div>
        {!driveAgentConnected && <div className="tools-media-note"><Icon name="info" size={15} /> Google Drive belum terhubung pada companion PC. Hubungi Super Admin untuk menyelesaikan pengaturan.</div>}
        <section className="card tools-media-upload"><div><h2>Tambah media</h2><p>Pilih album, lalu unggah foto, video, atau audio.</p></div><div className="tools-media-upload-fields"><label>Album / folder<input value={folderInput} onChange={(event) => setFolderInput(event.target.value)} placeholder="Contoh: Campaign / Opening RUMA / Reels" /></label><div className={`tools-media-dropzone ${dragActive ? "active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); acceptFiles(event.dataTransfer.files); }}><Icon name="upload" size={18} /><strong>Tarik foto atau video ke sini</strong><span>atau pilih file · Disimpan ke Google Drive Super Admin</span><button type="button" className="button button-primary" disabled={busy || (!driveAgentConnected)} onClick={() => inputRef.current?.click()}>{busy ? "Mengunggah…" : "Pilih file"}</button><input ref={inputRef} type="file" hidden multiple accept="image/*,video/*,audio/*" onChange={() => { if (inputRef.current?.files?.length) acceptFiles(inputRef.current.files); }} /></div></div></section>
        {error && <div className="tools-media-note tools-media-error" role="alert"><Icon name="alert" size={15} />{error}</div>}
        <section id="tools-media-gallery" className="card tools-media-gallery"><div className="tools-media-gallery-head"><div><h2>Album media</h2><p>Konten yang tersimpan di Google Drive Super Admin.</p></div><div className="tools-media-filters"><select value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Filter album"><option value="all">Semua album</option>{albums.map((album) => <option key={album} value={album}>{album}</option>)}</select></div></div>
          {visibleAssets.length ? <div className="tools-media-cards">{visibleAssets.map((asset) => <MediaCard key={asset.id} asset={asset} pcUrl={baseUrl} pcPin={pcPin} onOpen={() => void openPreview(asset)} onDelete={() => void removeAsset(asset)} onCompress={() => void compress(asset)} onDownload={() => void downloadVersion(asset, false)} onDownloadCompressed={() => void downloadVersion(asset, true)} isSuperAdmin={Boolean(isSuperAdmin)} canCompress={driveAgentConnected} busy={busy} />)}</div> : <div className="tools-media-empty"><div><Icon name="cloud" size={20} /></div><strong>Belum ada media</strong><span>Unggah foto, video, atau audio untuk membuat album di Gallery GDrive.</span></div>}
        </section>
        {mode === "drive" && <section className={`tools-compression-callout ${needsCompression ? "has-pending" : ""}`}><div><Icon name={needsCompression ? "alert" : "sparkles"} size={17} /><strong>{needsCompression ? `${needsCompression} media belum dikompres` : "Kompresi manual Google Drive"}</strong></div><p>{isSuperAdmin ? "Kompresi hanya berlaku untuk media di Google Drive. Companion Windows memprosesnya di background; preview beralih otomatis saat selesai dan file asli tetap dapat diunduh." : "Media Drive menunggu kompresi manual oleh Super Admin. Sebelum hasil tersedia, preview tetap memakai file asli."}</p>{needsCompression > 0 && <button className="button button-soft button-sm" onClick={() => document.getElementById("tools-media-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Buka galeri media</button>}</section>}
      </>}
    </section>
    {error && mode === "settings" && <div className="tools-media-note tools-media-error" role="alert"><Icon name="alert" size={15} />{error}</div>}
    {preview && <div className="media-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="media-preview-dialog" role="dialog" aria-modal="true" aria-label={preview.asset.fileName} onClick={(event) => event.stopPropagation()}><button className="icon-button" aria-label="Tutup preview" onClick={() => setPreview(null)}><Icon name="close" /></button>{preview.asset.mimeType.startsWith("video/") ? <video src={preview.url} controls autoPlay crossOrigin="anonymous" /> : preview.asset.mimeType.startsWith("audio/") ? <audio src={preview.url} controls autoPlay crossOrigin="anonymous" /> : <img src={preview.url} alt={preview.asset.fileName} crossOrigin="anonymous" />}</div></div>}
  </>;
}

function MediaCard({ asset, pcUrl, pcPin, onOpen, onDelete, onCompress, onDownload, onDownloadCompressed, isSuperAdmin, canCompress, busy }: {
  asset: MediaAsset; pcUrl: string; pcPin: string; onOpen: () => void; onDelete: () => void; onCompress: () => void;
  onDownload: () => void; onDownloadCompressed: () => void; isSuperAdmin: boolean; canCompress: boolean; busy: boolean;
}) {
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    if (!asset.originalFileId || !(asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/")) || !pcPin || !pcUrl) return;
    let objectUrl = "";
    const fileId = asset.source === "drive" && asset.compressionStatus === "compressed" && asset.compressedFileId ? asset.compressedFileId : asset.originalFileId;
    const route = `/api/drive/thumbnail/${encodeURIComponent(fileId)}`;
    void fetch(`${pcUrl}${route}`, { headers: { "X-Oper-PIN": pcPin } }).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob()); setThumbnail(objectUrl);
    }).catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, asset.mimeType, asset.originalFileId, asset.compressedFileId, asset.compressionStatus, pcPin, pcUrl, asset.source]);
  const hasCompressedVersion = asset.source === "drive" && asset.compressionStatus === "compressed";
  const size = (hasCompressedVersion ? asset.compressedByteSize : asset.byteSize) || 0;
  return <article className="tools-media-card"><button className="tools-media-thumb" onClick={onOpen} aria-label={`Buka ${asset.fileName}`}>{thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="tools-media-type"><Icon name={asset.mimeType.startsWith("video/") ? "film" : asset.source === "drive" ? "cloud" : "image"} size={25} /><small>{asset.mimeType.startsWith("video/") ? "VIDEO" : asset.source === "drive" ? "DRIVE" : "MEDIA"}</small></span>}</button><div className="tools-media-card-info"><strong title={asset.fileName}>{asset.fileName}</strong><span>{asset.folderPath || "Tanpa album"}</span><div><span>{hasCompressedVersion ? "Versi ringan" : "Asli"}</span><span>{formatBytes(size)}</span></div><div className="tools-media-card-actions"><button className="button button-soft button-sm" onClick={onOpen}><Icon name="eye" size={13} />Preview</button>{isSuperAdmin && canCompress && asset.compressionStatus !== "compressed" && <button className="button button-soft button-sm" disabled={busy} onClick={onCompress}><Icon name="sparkles" size={13} />{asset.compressionStatus === "queued" ? "Kompresi berjalan" : "Kompres"}</button>}{hasCompressedVersion && <button className="button button-soft button-sm" onClick={onDownloadCompressed}><Icon name="download" size={13} />Ringan</button>}<button className="button button-soft button-sm" onClick={onDownload}><Icon name="download" size={13} />Asli</button><button className="icon-button media-delete" title="Hapus dari katalog" onClick={onDelete}><Icon name="trash" size={14} /></button></div></div></article>;
}

function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`; }

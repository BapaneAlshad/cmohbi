"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLanStorageUrl } from "@/lib/gallery-lan";
import { Icon, PageHeading } from "./ui";

type LaunchPermit = { token: string; expiresAt: number };
type Permit = LaunchPermit & { url: string };
type FileRecord = { id: string; name: string; folder: string; size: number; mime: string };
type TrashRecord = Omit<FileRecord, "mime"> & { expiresAt: number };

async function result<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Operasi Storage LAN gagal.");
  return body;
}

async function requestPermit<T>(purpose: "access" | "start" | "setup" | "check", url?: string) {
  return result<T>(await fetch("/api/gallery/lan/permit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, url }),
    cache: "no-store",
  }));
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Operasi Storage LAN gagal.";
}

function sizeLabel(size: number) {
  const unit = size >= 1024 ** 3 ? 3 : size >= 1024 ** 2 ? 2 : size >= 1024 ? 1 : 0;
  return `${(size / 1024 ** unit).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${["B", "KB", "MB", "GB"][unit]}`;
}

function canPreview(mime: string) {
  return mime.startsWith("video/") || mime.startsWith("audio/") ||
    ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"].includes(mime);
}

export function GalleryLan({ liveMode, isOwner, canWrite, notify }: {
  liveMode: boolean; isOwner: boolean; canWrite: boolean; notify: (message: string) => void;
}) {
  const permit = useRef<Permit | null>(null);
  const sequence = useRef(0);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [trash, setTrash] = useState<TrashRecord[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [status, setStatus] = useState<"checking" | "online" | "offline" | "setup">("checking");
  const [connectionError, setConnectionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [launch, setLaunch] = useState<LaunchPermit | null>(null);
  const [preview, setPreview] = useState<{ file: FileRecord; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const getPermit = useCallback(async () => {
    if (permit.current && permit.current.expiresAt > Date.now() + 15000) return permit.current;
    const next = await requestPermit<Permit>("access");
    permit.current = next;
    return next;
  }, []);

  const send = useCallback(async <T,>(path: string, init: RequestInit = {}, timeout = 10000) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const access = await getPermit();
      let response: Response;
      try {
        response = await fetch(access.url + path, {
          ...init,
          headers: { Authorization: `Bearer ${access.token}`, ...init.headers },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
        });
      } catch {
        throw new Error("PC storage tidak terjangkau. Periksa Wi-Fi kantor, HTTPS, dan izin jaringan lokal browser.");
      }
      if (response.status !== 401 || attempt === 1) return { data: await result<T>(response), url: access.url };
      permit.current = null;
    }
    throw new Error("Izin Storage LAN sudah berakhir.");
  }, [getPermit]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const request = ++sequence.current;
    if (!liveMode) { setStatus("setup"); return; }
    try {
      await getPermit();
    } catch (error) {
      if (request !== sequence.current || signal?.aborted) return;
      setStatus("setup");
      setConnectionError(message(error));
      return;
    }
    try {
      const { data } = await send<{ files: FileRecord[] }>("/files");
      const trashResult = showTrash && isOwner ? await send<{ files: TrashRecord[] }>("/trash") : null;
      if (request !== sequence.current || signal?.aborted) return;
      setFiles(data.files);
      if (trashResult) setTrash(trashResult.data.files);
      setStatus("online");
      setConnectionError("");
      setLaunch(null);
    } catch (error) {
      if (request !== sequence.current || signal?.aborted) return;
      setStatus("offline");
      setConnectionError(message(error));
    }
  }, [getPermit, isOwner, liveMode, send, showTrash]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (preview && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [preview]);

  useEffect(() => {
    if (!launch) return;
    const timer = window.setTimeout(() => setLaunch(null), Math.max(0, launch.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [launch]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try { await action(); }
    catch (error) { setActionError(message(error)); }
    finally { setBusy(false); }
  }

  function launchUrl(access: LaunchPermit) {
    // Keep the authority form for compatibility with launchers installed
    // before the parser accepted the canonical no-authority form.
    return `ngapaya-storage://start?permit=${encodeURIComponent(access.token)}`;
  }

  async function start() {
    const access = await requestPermit<LaunchPermit>("start");
    setLaunch(access);
    window.location.href = launchUrl(access);
  }

  async function upload(selected: File[]) {
    let uploaded = 0;
    try {
      for (const file of selected) {
        const params = new URLSearchParams({ folder: folder.trim(), name: file.name });
        await send(`/files?${params}`, {
          method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" },
        }, 2 * 60 * 60 * 1000);
        uploaded++;
      }
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
      if (uploaded) notify(`${uploaded} file tersimpan di PC storage.`);
    }
  }

  async function openFile(file: FileRecord, download: boolean) {
    const { data, url } = await send<{ path: string }>(`/files/${file.id}/ticket${download ? "?download=1" : ""}`, { method: "POST" });
    const target = url + data.path;
    if (download) {
      const link = document.createElement("a");
      link.href = target;
      link.download = file.name;
      link.rel = "noreferrer";
      link.click();
    } else setPreview({ file, url: target });
  }

  const imagePreviewUrl = useCallback(async (id: string) => {
    const { data, url } = await send<{ path: string }>(`/files/${id}/ticket`, { method: "POST" });
    return url + data.path;
  }, [send]);

  const folders = [...new Set(files.map((file) => file.folder))].sort();
  const visible = files.filter((file) => filter === null || file.folder === filter);
  return <>
    <PageHeading title="Gallery LAN" description="File bersama di PC storage kantor." />
    <section className="tools-media-page">
      <div className="card tools-media-intro">
        <div className="tools-media-intro-icon"><Icon name="hard-drive" size={20} /></div>
        <div><strong>Storage LAN</strong><p role="status">{({ checking: "Memeriksa koneksi…", online: "Aktif", offline: "Offline", setup: "Perlu pengaturan" })[status]}</p></div>
        <div className="lan-actions">
          {isOwner && liveMode && status !== "online" && <button type="button" className="button button-primary" disabled={busy} onClick={() => void run(start)}>Jalankan Storage LAN</button>}
          <button type="button" className="button button-soft" onClick={() => void refresh()}>Segarkan</button>
          {isOwner && status === "online" && <button type="button" className="button button-soft" onClick={() => setShowTrash(!showTrash)}>{showTrash ? "Lihat galeri" : "Sampah"}</button>}
        </div>
      </div>
      {launch && status !== "online" && <p className="tools-media-note">Jika launcher belum terbuka, <a href={launchUrl(launch)}>buka program Windows</a> di PC storage.</p>}
      {!liveMode && <p className="tools-media-note">Login ke workspace Supabase untuk memakai Storage LAN.</p>}
      {connectionError && connectionError !== actionError && <p className="tools-media-note" role="status">{connectionError}</p>}
      {actionError && <p className="tools-media-note tools-media-error" role="alert">{actionError}</p>}
      {status === "online" && <>
        {!showTrash && canWrite && <div className="card tools-media-upload">
          <div><h2>Unggah file</h2><p>Folder boleh dikosongkan untuk menyimpan di folder utama.</p></div>
          <div className="tools-media-upload-fields">
            <label>Folder<input value={folder} placeholder="Contoh: Campaign/Footage" onChange={(event) => setFolder(event.target.value)} /></label>
            <div className="tools-media-dropzone" onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const selected = Array.from(event.dataTransfer.files);
                if (!busy && selected.length) void run(() => upload(selected));
              }}>
              <button type="button" className="button button-primary" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? "Memproses…" : "Pilih file"}</button>
              <input ref={fileInput} type="file" hidden multiple onChange={(event) => {
                const selected = Array.from(event.currentTarget.files || []);
                if (selected.length) void run(() => upload(selected));
              }} />
              <span>atau tarik file ke sini</span>
            </div>
          </div>
        </div>}
        <section className="card tools-media-gallery">
          <div className="tools-media-gallery-head"><h2>{showTrash ? "Sampah · 30 hari" : "File bersama"}</h2>
            {!showTrash && <div className="tools-media-filters"><select aria-label="Filter folder" value={filter === null ? "all" : `folder:${filter}`} onChange={(event) => setFilter(event.target.value === "all" ? null : event.target.value.slice(7))}>
              <option value="all">Semua folder</option>
              {folders.map((name) => <option key={name} value={`folder:${name}`}>{name || "Folder utama"}</option>)}
            </select></div>}
          </div>
          {showTrash ? (trash.length ? <ul className="lan-file-list">{trash.map((file) => <li key={file.id}>
            <div><strong>{file.name}</strong><small>{file.folder || "Folder utama"} · hingga {new Date(file.expiresAt * 1000).toLocaleDateString("id-ID")}</small></div>
            <button type="button" className="button button-soft" disabled={busy} onClick={() => void run(async () => {
              await send(`/trash/${file.id}/restore`, { method: "POST" });
              await refresh();
              notify("File dipulihkan.");
            })}>Pulihkan</button>
          </li>)}</ul> : <p>Sampah kosong.</p>) : (visible.length ? <div className="tools-media-cards">{visible.map((file) => <article key={file.id} className="tools-media-card">
            <LanFileCover file={file} getUrl={imagePreviewUrl} onOpen={() => void run(() => openFile(file, !canPreview(file.mime)))} disabled={busy} />
            <div className="tools-media-card-info">
              <strong title={file.name}>{file.name}</strong>
              <span>{file.folder || "Folder utama"} · {sizeLabel(file.size)}</span>
              <div className="tools-media-card-actions">
              {canPreview(file.mime) && <button type="button" className="button button-soft" disabled={busy} onClick={() => void run(() => openFile(file, false))}>Preview</button>}
              <button type="button" className="button button-soft" disabled={busy} onClick={() => void run(() => openFile(file, true))}>Unduh</button>
              {canWrite && <button type="button" className="button button-soft" disabled={busy} onClick={() => {
                if (!window.confirm(`Pindahkan “${file.name}” ke Sampah selama 30 hari?`)) return;
                void run(async () => { await send(`/files/${file.id}`, { method: "DELETE" }); await refresh(); notify("File dipindahkan ke Sampah."); });
              }}>Hapus</button>}
              </div>
            </div>
          </article>)}</div> : <p>Belum ada file di folder ini.</p>)}
        </section>
      </>}
    </section>
    {preview && <dialog ref={dialog} className="lan-preview" aria-label={preview.file.name} onClose={() => setPreview(null)}>
      <button type="button" className="button button-soft" onClick={() => dialog.current?.close()}>Tutup</button>
      {preview.file.mime.startsWith("video/") ? <video controls crossOrigin="anonymous" src={preview.url} />
        : preview.file.mime.startsWith("audio/") ? <audio controls crossOrigin="anonymous" src={preview.url} />
          : <img crossOrigin="anonymous" src={preview.url} alt={preview.file.name} />}
    </dialog>}
  </>;
}

function LanFileCover({ file, getUrl, onOpen, disabled }: {
  file: FileRecord; getUrl: (id: string) => Promise<string>; onOpen: () => void; disabled: boolean;
}) {
  const cover = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState("");
  const showImage = file.mime.startsWith("image/") && canPreview(file.mime) && file.size <= 5 * 1024 ** 2;
  useEffect(() => {
    const node = cover.current;
    if (!showImage || !node) return;
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void getUrl(file.id).then((src) => { if (active) setUrl(src); }).catch(() => {});
    });
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, [file.id, getUrl, showImage]);
  return <button ref={cover} type="button" className="tools-media-thumb" disabled={disabled}
    aria-label={`${canPreview(file.mime) ? "Preview" : "Unduh"} ${file.name}`} onClick={onOpen}>
    {url ? <img src={url} crossOrigin="anonymous" alt="" onError={() => setUrl("")} /> :
      <span className="tools-media-type"><Icon name={file.mime.startsWith("video/") ? "film" : file.mime.startsWith("image/") ? "image" : "paperclip"} size={25} /></span>}
  </button>;
}

export function GalleryLanSettings({ workspaceId, userId, client, notify }: {
  workspaceId?: string; userId?: string; client: SupabaseClient | null; notify: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [verifiedUrl, setVerifiedUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!workspaceId || !client) return;
    let active = true;
    void client.from("workspace_media_settings").select("lan_storage_url").eq("workspace_id", workspaceId)
      .maybeSingle().then(({ data, error }) => {
        if (!active) return;
        if (error) setError("Migrasi pengaturan Storage LAN belum tersedia.");
        else { setUrl(data?.lan_storage_url || ""); setReady(true); }
      });
    return () => { active = false; };
  }, [workspaceId, client]);

  async function save() {
    const normalized = normalizeLanStorageUrl(url);
    if (normalized === null) throw new Error("Gunakan alamat HTTPS subdomain dengan port antara 1024 dan 65535.");
    if (!client || !workspaceId || !userId) return;
    setVerifiedUrl("");
    if (normalized) {
      const permit = await requestPermit<Permit>("check", normalized);
      let response: Response;
      try {
        response = await fetch(permit.url + "/connection", {
          headers: { Authorization: `Bearer ${permit.token}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new Error("PC storage tidak terjangkau. Pastikan terminal aktif, alamat sesuai, dan browser mengizinkan akses jaringan lokal.");
      }
      const check = await result<{ ok: boolean }>(response);
      if (!check?.ok) throw new Error("PC belum terhubung ke workspace ini. Periksa file pemasangan.");
    }
    const response = await client.from("workspace_media_settings").upsert({
      workspace_id: workspaceId, lan_storage_url: normalized, updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id", defaultToNull: false });
    if (response.error) throw new Error("Alamat Storage LAN gagal disimpan.");
    setUrl(normalized);
    setVerifiedUrl(normalized);
    notify(normalized ? "Storage LAN aktif dan alamat tersimpan." : "Alamat Storage LAN dikosongkan.");
  }

  async function download() {
    const config = await requestPermit<object>("setup");
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ngapaya-storage.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  return <section className="card tools-media-settings">
    <div><h2><Icon name="hard-drive" size={16} /> Storage LAN</h2><p>Unduh file pemasangan untuk launcher Windows. Setelah terminal terbuka, salin alamat HTTPS dan port dari terminal ke kolom di bawah.</p></div>
    <div className="tools-media-settings-fields">
      <label>Alamat HTTPS Storage LAN<input value={url} disabled={!ready || busy} onChange={(event) => setUrl(event.target.value)} placeholder="https://storage.example.com:8766" /></label>
      <button type="button" className="button button-primary" disabled={!ready || busy} onClick={() => void run(save)}>Simpan dan cek koneksi</button>
      <button type="button" className="button button-soft" disabled={!ready || busy} onClick={() => void run(download)}>Unduh file pemasangan</button>
    </div>
    {verifiedUrl && verifiedUrl === url && <p role="status">Aktif · Alamat tersimpan.</p>}
    {error && <p className="tools-media-note tools-media-error" role="alert">{error}</p>}
  </section>;
}

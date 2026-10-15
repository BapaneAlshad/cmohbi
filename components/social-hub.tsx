"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AppData, SocialInboxKind, SocialPlatform } from "@/lib/types";
import { Icon, PageHeading, StatusPill } from "./ui";

const platforms: Array<{ id: SocialPlatform; label: string; short: string }> = [
  { id: "instagram", label: "Instagram", short: "IG" },
  { id: "facebook", label: "Facebook", short: "FB" },
  { id: "threads", label: "Threads", short: "TH" },
  { id: "tiktok", label: "TikTok", short: "TT" },
];

const platformLabel = (platform: SocialPlatform) => platforms.find((item) => item.id === platform)?.label ?? platform;

export function SocialHubView({ data, setData, notify, getAccessToken, uploadMedia, workspaceId, liveMode }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string) => void; getAccessToken?: () => Promise<string | null>; uploadMedia?: (file: File) => Promise<string>; workspaceId?: string; liveMode?: boolean }) {
  const [tab, setTab] = useState<"compose" | "calendar" | "inbox" | "accounts">("compose");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["instagram", "facebook", "threads", "tiktok"]);
  const [inboxFilter, setInboxFilter] = useState<"all" | SocialInboxKind>("all");

  const scheduled = useMemo(() => [...data.content].sort((a, b) => a.date - b.date), [data.content]);
  const filteredInbox = data.socialInbox.filter((item) => inboxFilter === "all" || item.kind === inboxFilter);
  const togglePlatform = (platform: SocialPlatform) => setSelectedPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);

  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlatforms.length) { notify("Pilih minimal satu platform."); return; }
    const form = new FormData(event.currentTarget);
    const dateValue = String(form.get("date") || "2026-10-20");
    const mediaType = String(form.get("mediaType") || "feed") as "feed" | "reel" | "video";
    const title = String(form.get("title") || "Konten baru");
    const mediaFile = form.get("mediaFile");
    let mediaUrl = String(form.get("mediaUrl") || "").trim();
    if (mediaFile instanceof File && mediaFile.size > 0) {
      if (!uploadMedia) { notify("Upload media memerlukan koneksi Supabase aktif."); return; }
      try { mediaUrl = await uploadMedia(mediaFile); } catch (error) { notify(error instanceof Error ? error.message : "Upload media gagal."); return; }
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value || "schedule";
    if (selectedPlatforms.includes("tiktok") && mediaType === "feed") { notify("TikTok membutuhkan format video/reels."); return; }
    if (mediaType !== "feed" && !mediaUrl) { notify("Format video/reels membutuhkan media publik atau file upload."); return; }
    let targetPlatforms = selectedPlatforms;
    if (mode === "publish") {
      const token = await getAccessToken?.();
      const response = await fetch("/api/social/publish", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ workspaceId, platforms: selectedPlatforms, caption: String(form.get("caption") || ""), mediaUrl: mediaUrl || undefined, mediaType }) });
      const result = await response.json() as { results?: Array<{ platform: SocialPlatform; ok: boolean; message: string }> };
      const successful = result.results?.filter((item) => item.ok) ?? [];
      if (!successful.length) { notify(result.results?.map((item) => `${item.platform}: ${item.message}`).join(" | ") || "Publikasi gagal."); return; }
      targetPlatforms = successful.map((item) => item.platform);
      notify(`${successful.length} platform berhasil menerima konten.`);
    }
    const nextItems: AppData["content"] = targetPlatforms.map((platform, index) => ({
      id: globalThis.crypto.randomUUID(),
      title,
      date: Number(dateValue.slice(-2)),
      status: mode === "publish" ? "Tayang" : "Terjadwal",
      brand: String(form.get("brand") || "HBI"),
      platform: (platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : platform === "threads" ? "Threads" : "TikTok") as "Instagram" | "Facebook" | "Threads" | "TikTok",
      caption: String(form.get("caption") || ""),
      mediaUrl,
      mediaType,
      scheduledAt: `${dateValue}T${String(form.get("time") || "19:00")}:00+07:00`,
    }));
    setData((current) => ({ ...current, content: [...nextItems, ...current.content] }));
    event.currentTarget.reset();
    if (mode !== "publish") notify(`Konten disimpan ke kalender untuk ${targetPlatforms.length} platform.`);
    setTab("calendar");
  };

  const resolveInbox = (id: string) => {
    setData((current) => ({ ...current, socialInbox: current.socialInbox.map((item) => item.id === id ? { ...item, status: "resolved" } : item) }));
    notify("Percakapan ditandai selesai.");
  };

  return <>
    <PageHeading kicker="Operasional / Social Hub" title="Kelola sosial media" description="Buat, jadwalkan, pantau komentar, dan tangani pesan dari satu workspace." action={<span className="goal-label goal-ok">4 platform</span>} />
    <div className="view-tabs social-hub-tabs">
      <button className={`view-tab ${tab === "compose" ? "active" : ""}`} onClick={() => setTab("compose")}>Buat konten</button>
      <button className={`view-tab ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}>Kalender tayang</button>
      <button className={`view-tab ${tab === "inbox" ? "active" : ""}`} onClick={() => setTab("inbox")}>Inbox <span className="nav-count">{data.socialInbox.filter((item) => item.status === "unread").length}</span></button>
      <button className={`view-tab ${tab === "accounts" ? "active" : ""}`} onClick={() => setTab("accounts")}>Akun & koneksi</button>
    </div>
    {tab === "compose" && <ComposePanel selectedPlatforms={selectedPlatforms} togglePlatform={togglePlatform} onSubmit={savePost} liveMode={liveMode} />}
    {tab === "calendar" && <CalendarPanel scheduled={scheduled} />}
    {tab === "inbox" && <InboxPanel items={filteredInbox} filter={inboxFilter} setFilter={setInboxFilter} resolve={resolveInbox} notify={notify} />}
    {tab === "accounts" && <AccountsPanel accounts={data.socialAccounts} notify={notify} />}
  </>;
}

function ComposePanel({ selectedPlatforms, togglePlatform, onSubmit, liveMode }: { selectedPlatforms: SocialPlatform[]; togglePlatform: (platform: SocialPlatform) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; liveMode?: boolean }) {
  return <div className="social-hub-compose card"><div className="card-header"><div><h2 className="card-title">Composer lintas platform</h2><p className="card-subtitle">Satu brief, caption dan format tayang untuk kanal yang dipilih.</p></div><span className="goal-label goal-ok">Content Creator</span></div>
    <form className="social-compose-form" onSubmit={onSubmit}>
      <div className="form-field"><label>Platform tujuan</label><div className="platform-check-grid">{platforms.map((platform) => <label className={`platform-check ${selectedPlatforms.includes(platform.id) ? "selected" : ""}`} key={platform.id}><input type="checkbox" checked={selectedPlatforms.includes(platform.id)} onChange={() => togglePlatform(platform.id)} /><span className={`platform-logo ${platform.id}`}>{platform.short}</span><strong>{platform.label}</strong></label>)}</div></div>
      <div className="two-fields"><div className="form-field"><label>Judul konten</label><input className="input" name="title" required placeholder="Contoh: Promo akhir pekan" /></div><div className="form-field"><label>Brand</label><select className="select" name="brand"><option>HBI</option><option>HokBen</option></select></div></div>
      <div className="form-field"><label>Caption / naskah</label><textarea className="textarea" name="caption" required placeholder="Tulis caption, CTA, dan hashtag..." /></div>
      <div className="two-fields"><div className="form-field"><label>Format</label><select className="select" name="mediaType"><option value="feed">Feed / foto</option><option value="reel">Reels / short video</option><option value="video">Video TikTok</option></select></div><div className="form-field"><label>Upload media</label><input className="input" name="mediaFile" type="file" accept="image/*,video/*" /></div></div>
      <div className="form-field"><label>Atau URL media publik</label><input className="input" name="mediaUrl" type="url" placeholder="https://..." /></div>
      <div className="two-fields"><div className="form-field"><label>Tanggal tayang</label><input className="input" name="date" type="date" defaultValue="2026-10-20" required /></div><div className="form-field"><label>Jam tayang WIB</label><input className="input" name="time" type="time" defaultValue="19:00" required /></div></div>
      <div className="social-compose-footer"><span className="muted-cell">{liveMode ? "Jadwal disimpan ke Supabase dan diproses oleh cron provider." : "Mode demo menyimpan lokal. Publish langsung memerlukan token provider resmi di server."}</span><div className="heading-actions"><button className="button button-soft" type="submit" name="mode" value="schedule"><Icon name="calendar" size={15} />Simpan & jadwalkan</button><button className="button button-primary" type="submit" name="mode" value="publish"><Icon name="send" size={15} />Tayangkan sekarang</button></div></div>
    </form>
  </div>;
}

function CalendarPanel({ scheduled }: { scheduled: AppData["content"] }) {
  const firstScheduled = scheduled.find((item) => item.scheduledAt)?.scheduledAt;
  const initialDate = firstScheduled ? new Date(firstScheduled) : new Date(2026, 9, 1);
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => index - firstWeekday + 1);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(month);
  const itemDate = (item: AppData["content"][number]) => item.scheduledAt ? new Date(item.scheduledAt) : new Date(2026, 9, item.date);
  const monthItems = scheduled.filter((item) => { const date = itemDate(item); return date.getFullYear() === year && date.getMonth() === monthIndex; });
  const shiftMonth = (offset: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  return <div className="social-calendar-layout"><div className="card calendar-card"><div className="calendar-header"><div className="month-title">{monthLabel}<span>{monthItems.length} konten di bulan ini</span></div><div className="month-actions"><button className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya"><Icon name="chevron-left" /></button><button className="icon-button" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya"><Icon name="chevron-right" /></button><span className="goal-label goal-ok">Date view</span></div></div><div className="calendar-week">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { const valid = day > 0 && day <= daysInMonth; const items = valid ? monthItems.filter((entry) => itemDate(entry).getDate() === day) : []; const today = new Date(); const isToday = valid && today.getFullYear() === year && today.getMonth() === monthIndex && today.getDate() === day; return <div className={`calendar-cell ${!valid ? "muted" : ""} ${isToday ? "today" : ""}`} key={index}><span className="day-number">{valid ? day : day < 1 ? new Date(year, monthIndex, day).getDate() : new Date(year, monthIndex, day).getDate()}</span>{items.slice(0, 3).map((item) => <span className={`calendar-event ${item.platform === "TikTok" ? "orange" : item.platform === "Facebook" ? "green" : item.platform === "Threads" ? "blue" : ""}`} key={String(item.id)}>{item.title}</span>)}</div>; })}</div></div><div className="card"><div className="card-header"><div><h2 className="card-title">Antrian tayang</h2><p className="card-subtitle">Urut berdasarkan jadwal berikutnya</p></div></div><div className="social-queue">{scheduled.slice(0, 8).map((item) => <div className="social-queue-item" key={String(item.id)}><div className={`platform-logo ${item.platform.toLowerCase()}`}>{item.platform.slice(0, 2).toUpperCase()}</div><div><strong>{item.title}</strong><span>{item.platform} · {item.scheduledAt?.replace("T", " ").slice(0, 16) || `Oktober ${item.date}`}</span></div><StatusPill status={item.status} /></div>)}</div></div></div>;
}

function InboxPanel({ items, filter, setFilter, resolve, notify }: { items: AppData["socialInbox"]; filter: "all" | SocialInboxKind; setFilter: (filter: "all" | SocialInboxKind) => void; resolve: (id: string) => void; notify: (message: string) => void }) {
  return <div className="social-inbox-layout"><div className="card"><div className="card-header"><div><h2 className="card-title">Unified inbox</h2><p className="card-subtitle">Komentar dan pesan yang perlu ditangani tim konten.</p></div><div className="toolbar-left"><button className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Semua</button><button className={`filter-chip ${filter === "comment" ? "active" : ""}`} onClick={() => setFilter("comment")}>Komentar</button><button className={`filter-chip ${filter === "message" ? "active" : ""}`} onClick={() => setFilter("message")}>Pesan</button></div></div><div className="social-inbox-list">{items.map((item) => <article className={`social-inbox-item ${item.status === "unread" ? "unread" : ""}`} key={item.id}><div className={`platform-logo ${item.platform}`}>{item.platform.slice(0, 2).toUpperCase()}</div><div className="social-inbox-copy"><div className="social-inbox-head"><strong>{item.author}</strong><span>{platformLabel(item.platform)} · {item.kind === "comment" ? "Komentar" : "Pesan"} · {item.occurredAt}</span></div><p>{item.body}</p>{item.postTitle && <small>Di postingan: {item.postTitle}</small>}<div className="social-inbox-actions">{item.canReply ? <span className="muted-cell">Balasan API belum diaktifkan</span> : <span className="muted-cell">API platform belum menyediakan balasan</span>}{item.status !== "resolved" && <button className="button button-ghost button-sm" onClick={() => resolve(item.id)}>Tandai selesai</button>}</div></div><StatusPill status={item.status === "resolved" ? "Selesai" : item.status === "unread" ? "Baru" : "Terbuka"} /></article>)}</div></div><div className="card inbox-capability-card"><div className="card-header"><div><h2 className="card-title">Batasan API</h2><p className="card-subtitle">Kapabilitas mengikuti izin resmi tiap platform.</p></div></div><p>Instagram, Facebook, dan Threads dapat menyediakan komentar/reply melalui API resmi. TikTok mendukung publishing, tetapi inbox komentar/DM bergantung pada produk dan approval API yang tersedia untuk akun.</p></div></div>;
}

function AccountsPanel({ accounts, notify }: { accounts: AppData["socialAccounts"]; notify: (message: string) => void }) {
  const [connectors, setConnectors] = useState<Array<{ platform: SocialPlatform; configured: boolean; message: string }>>([]);
  useEffect(() => {
    let active = true;
    void fetch("/api/social/status", { cache: "no-store" }).then((response) => response.json()).then((result: { connectors?: Array<{ platform: SocialPlatform; configured: boolean; message: string }> }) => {
      if (active) setConnectors(result.connectors ?? []);
    }).catch(() => { /* Status is advisory; account data remains usable if unavailable. */ });
    return () => { active = false; };
  }, []);
  return <><div className="social-connector-status-grid">{connectors.map((connector) => <div className="card social-connector-status" key={connector.platform}><div><span className={`platform-logo ${connector.platform}`}>{connector.platform.slice(0, 2).toUpperCase()}</span><strong>{platformLabel(connector.platform)}</strong></div><StatusPill status={connector.configured ? "Credential terdeteksi" : "Belum siap"} /><small>{connector.message}</small></div>)}</div><div className="social-account-grid social-account-grid-four">{accounts.map((account) => <article className="card social-account-card" key={account.id}><div className={`platform-logo large ${account.platform}`}>{account.platform.slice(0, 2).toUpperCase()}</div><div className="social-account-copy"><strong>{account.name}</strong><span>{account.handle}</span><small>Sinkron: {account.lastSync ?? "Belum pernah"}</small></div><div className="social-account-status"><StatusPill status={account.status === "connected" ? "Terhubung" : "Perlu perhatian"} /><strong>{new Intl.NumberFormat("id-ID").format(account.followers)}</strong><span>followers</span><button className="link-button" onClick={() => notify(`Koneksi ${platformLabel(account.platform)} dikelola melalui credential server dan permission provider.`)}>Petunjuk koneksi ↗</button></div></article>)}</div></>;
}

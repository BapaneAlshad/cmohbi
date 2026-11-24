"use client";
import { useState } from "react";

import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, Cloud, HardDrive,
  Check, CheckSquare2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleDollarSign, Clock3,
  Download, Edit3, ExternalLink, Eye, Film, Filter, Handshake, Home, Image as ImageIcon,
  Archive, ChartNoAxesGantt, Info, Instagram, Layers3, LayoutGrid, LayoutPanelLeft, Link2, LockKeyhole, LogOut, Menu, MessageSquare,
  Megaphone, Moon, MoreHorizontal, Paperclip, Pin, PinOff, Plus, Reply, Search, Send, Share2,
  Repeat2, RotateCcw, Settings, Sparkles, Star, Sun, Target, Trash2, Upload, Users, X, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  alert: AlertTriangle, archive: Archive, "arrow-left": ArrowLeft, "arrow-right": ArrowRight,
  bell: Bell, book: BookOpen, calendar: CalendarDays, campaign: Megaphone, cloud: Cloud, "hard-drive": HardDrive,
  check: Check, "check-square": CheckSquare2, "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight, "chevron-up": ChevronUp, "chevron-down": ChevronDown, chart: BarChart3, circle: Circle, close: X,
  download: Download, edit: Edit3, external: ExternalLink, eye: Eye, film: Film,
  filter: Filter, handshake: Handshake, home: Home, image: ImageIcon, info: Info,
  instagram: Instagram, layers: Layers3, link: Link2, "log-out": LogOut, menu: Menu,
  message: MessageSquare, moon: Moon, "more-horizontal": MoreHorizontal,
  panel: LayoutPanelLeft, paperclip: Paperclip, pin: Pin, "pin-off": PinOff, plus: Plus, reply: Reply,
  search: Search, send: Send, share: Share2, settings: Settings, sparkles: Sparkles, sun: Sun, upload: Upload,
  repeat: Repeat2, restore: RotateCcw, target: Target, trash: Trash2, users: Users, wallet: CircleDollarSign, clock: Clock3,
  grid: LayoutGrid, timeline: ChartNoAxesGantt, lock: LockKeyhole,
};

export function TaskPriorityStar({ active }: { active: boolean }) {
  return active ? <span className="task-priority-star" role="img" aria-label="Prioritas" title="Prioritas"><Star size={14} fill="currentColor" strokeWidth={1.6} /></span> : null;
}

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Glyph = icons[name] ?? Sparkles;
  return <Glyph aria-hidden="true" className={className} size={size} strokeWidth={1.8} />;
}

export function Avatar({ name, tone = "purple", src }: { name: string; tone?: string; src?: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`avatar avatar-${tone}`} aria-label={name}>{src && failedSrc !== src ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} /> : initials}</span>;
}

export function SocialBrandIcon({ platform, size = 15 }: { platform: "Instagram" | "TikTok" | "WhatsApp"; size?: number }) {
  if (platform === "Instagram") {
    return <svg aria-hidden="true" className="social-brand-icon" width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" /></svg>;
  }
  if (platform === "TikTok") {
    return <svg aria-hidden="true" className="social-brand-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M15 3v10.3a4.7 4.7 0 1 1-3.6-4.57v3.35a1.95 1.95 0 1 0 1.6 1.92V3H15c.34 1.3 1.2 2.3 2.8 2.8v2.16A5.9 5.9 0 0 1 15 7V3Z" /></svg>;
  }
  return <svg aria-hidden="true" className="social-brand-icon" width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2.5a9.5 9.5 0 0 0-8.18 14.33L2.5 21.5l4.84-1.27A9.5 9.5 0 1 0 12 2.5Z" fill="currentColor" /><path d="M8.3 7.5c.25-.28.54-.3.8-.12l1.3 1.05c.25.2.3.48.15.75l-.48.83c.48.94 1.13 1.57 2.1 2.04l.8-.5c.25-.16.55-.12.76.1l1.08 1.22c.2.24.17.6-.08.82-.45.4-1.02.62-1.63.62-2.4 0-5.15-2.5-5.95-5.1-.18-.6.06-1.25.55-1.71l.6-.55Z" fill="var(--surface, #fff)" /></svg>;
}

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const statusClass: Record<string, string> = {
    Berjalan: "status-active", Selesai: "status-done", Rencana: "status-plan",
    "Hampir selesai": "status-progress", "In Progress": "status-progress", Review: "status-review",
    Revisi: "status-revise", Done: "status-done", "To Do": "status-plan", Backlog: "status-review",
    Baru: "status-review", Diproses: "status-progress", Disetujui: "status-done", Draf: "status-review",
    Tayang: "status-active", Aktif: "status-active", "Belum Dibayar": "status-revise",
    "Menunggu konfirmasi": "status-review", Terjadwal: "status-plan", "Sudah visit": "status-progress", Dibatalkan: "status-trashed",
    "Belum dibayar": "status-revise", "DP dibayar": "status-progress", Lunas: "status-done", "Sudah Dibayar": "status-done", Terhubung: "status-done", "Perlu perhatian": "status-revise", "Butuh perhatian": "status-revise",
    Diarsipkan: "status-archived", Dihapus: "status-trashed",
  };
  return <span className={`status-pill ${statusClass[status] ?? "status-review"} ${className}`.trim()}>{status}</span>;
}

export function PriorityPill({ priority }: { priority: string }) {
  const priorityClass: Record<string, string> = {
    tinggi: "priority-high", high: "priority-high",
    sedang: "priority-medium", medium: "priority-medium",
    rendah: "priority-low", low: "priority-low",
  };
  const normalized = priority.trim().toLowerCase();
  return <span className={`priority-pill ${priorityClass[normalized] ?? "priority-medium"}`}>{priority}</span>;
}

export function PageHeading({ title, description, action }: { kicker?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-actions">{action}</div>}</div>;
}

export const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace("IDR", "Rp");
export const compact = (value: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value);

"use client";

import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, CalendarDays,
  Check, CheckSquare2, ChevronLeft, ChevronRight, Circle, CircleDollarSign, Clock3,
  Download, Edit3, ExternalLink, Eye, Film, Filter, Handshake, Home, Image as ImageIcon,
  Archive, Info, Instagram, Layers3, LayoutPanelLeft, Link2, LogOut, Menu, MessageSquare,
  Megaphone, Moon, MoreHorizontal, Paperclip, Pin, Plus, Reply, Search, Send, Share2,
  RotateCcw, Sparkles, Sun, Target, Trash2, Users, X, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  alert: AlertTriangle, archive: Archive, "arrow-left": ArrowLeft, "arrow-right": ArrowRight,
  bell: Bell, book: BookOpen, calendar: CalendarDays, campaign: Megaphone,
  check: Check, "check-square": CheckSquare2, "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight, chart: BarChart3, circle: Circle, close: X,
  download: Download, edit: Edit3, external: ExternalLink, eye: Eye, film: Film,
  filter: Filter, handshake: Handshake, home: Home, image: ImageIcon, info: Info,
  instagram: Instagram, layers: Layers3, link: Link2, "log-out": LogOut, menu: Menu,
  message: MessageSquare, moon: Moon, "more-horizontal": MoreHorizontal,
  panel: LayoutPanelLeft, paperclip: Paperclip, pin: Pin, plus: Plus, reply: Reply,
  search: Search, send: Send, share: Share2, sparkles: Sparkles, sun: Sun,
  restore: RotateCcw, target: Target, trash: Trash2, users: Users, wallet: CircleDollarSign, clock: Clock3,
};

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Glyph = icons[name] ?? Sparkles;
  return <Glyph aria-hidden="true" className={className} size={size} strokeWidth={1.8} />;
}

export function Avatar({ name, tone = "purple" }: { name: string; tone?: string }) {
  const initials = name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`avatar avatar-${tone}`}>{initials}</span>;
}

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const statusClass: Record<string, string> = {
    Berjalan: "status-active", Selesai: "status-done", Rencana: "status-plan",
    "Hampir selesai": "status-progress", "In Progress": "status-progress", Review: "status-review",
    Revisi: "status-revise", Done: "status-done", "To Do": "status-plan", Backlog: "status-review",
    Baru: "status-review", Diproses: "status-progress", Disetujui: "status-done", Draf: "status-review",
    Tayang: "status-active", Aktif: "status-active", "Belum Dibayar": "status-revise",
    "Sudah Dibayar": "status-done", Terhubung: "status-done", "Perlu perhatian": "status-revise", "Butuh perhatian": "status-revise",
    Diarsipkan: "status-archived", Dihapus: "status-trashed",
  };
  return <span className={`status-pill ${statusClass[status] ?? "status-review"} ${className}`.trim()}>{status}</span>;
}

export function PriorityPill({ priority }: { priority: string }) {
  return <span className={`priority-pill priority-${priority.toLowerCase()}`}>{priority}</span>;
}

export function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}

export const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace("IDR", "Rp");
export const compact = (value: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value);

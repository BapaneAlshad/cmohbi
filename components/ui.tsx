"use client";

import {
  AlertTriangle, BarChart3, Bell, CalendarDays, Check, CheckSquare2, ChevronLeft,
  ChevronRight, CircleDollarSign, Clock3, Download, Eye, Filter, Handshake,
  Home, Instagram, LayoutPanelLeft, LogOut, Menu, Megaphone, Moon, MoreHorizontal,
  Plus, Search, Send, Sparkles, Sun, Target, Users, X, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  alert: AlertTriangle, bell: Bell, calendar: CalendarDays, campaign: Megaphone,
  check: Check, "check-square": CheckSquare2, "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight, chart: BarChart3, close: X, download: Download,
  eye: Eye, filter: Filter, handshake: Handshake, home: Home, instagram: Instagram,
  "log-out": LogOut, menu: Menu, moon: Moon, "more-horizontal": MoreHorizontal,
  panel: LayoutPanelLeft, plus: Plus, search: Search, send: Send, sparkles: Sparkles,
  sun: Sun, target: Target, users: Users, wallet: CircleDollarSign, clock: Clock3,
};

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Glyph = icons[name] ?? Sparkles;
  return <Glyph aria-hidden="true" className={className} size={size} strokeWidth={1.8} />;
}

export function Avatar({ name, tone = "purple" }: { name: string; tone?: string }) {
  const initials = name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`avatar avatar-${tone}`}>{initials}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const statusClass: Record<string, string> = {
    Berjalan: "status-active", Selesai: "status-done", Rencana: "status-plan",
    "Hampir selesai": "status-progress", "In Progress": "status-progress", Review: "status-review",
    Revisi: "status-revise", Done: "status-done", "To Do": "status-plan", Backlog: "status-review",
    Baru: "status-review", Diproses: "status-progress", Disetujui: "status-done", Draf: "status-review",
    Tayang: "status-active", Aktif: "status-active", "Belum Dibayar": "status-revise",
    "Sudah Dibayar": "status-done", Terhubung: "status-done", "Perlu perhatian": "status-revise",
  };
  return <span className={`status-pill ${statusClass[status] ?? "status-review"}`}>{status}</span>;
}

export function PriorityPill({ priority }: { priority: string }) {
  return <span className={`priority-pill priority-${priority.toLowerCase()}`}>{priority}</span>;
}

export function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}

export const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace("IDR", "Rp");
export const compact = (value: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value);

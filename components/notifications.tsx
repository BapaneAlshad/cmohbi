"use client";

import type { NotificationItem } from "@/lib/types";
import { Icon } from "./ui";
import { formatDisplayDateTime } from "@/lib/date-format";

function notificationDate(value: string) {
  return formatDisplayDateTime(value);
}

export function NotificationPanel({ notifications, onOpen, onMarkAll }: { notifications: NotificationItem[]; onOpen: (notification: NotificationItem) => void; onMarkAll: () => void }) {
  const unread = notifications.filter((notification) => !notification.readAt).length;
  return <section className="notification-panel" role="dialog" aria-label="Notifikasi"><div className="notification-panel-head"><div><strong>Notifikasi</strong><span>{unread ? `${unread} belum dibaca` : "Semua sudah dibaca"}</span></div>{unread > 0 && <button type="button" className="link-button" onClick={onMarkAll}>Tandai semua dibaca</button>}</div>{notifications.length ? <div className="notification-list">{notifications.slice(0, 20).map((notification) => <button type="button" className={`notification-item ${notification.readAt ? "read" : "unread"}`} key={notification.id} onClick={() => onOpen(notification)}><span className={`notification-icon ${notification.kind}`}><Icon name={notification.kind === "campaign_changed" ? "campaign" : "check-square"} size={14} /></span><span className="notification-copy"><strong>{notification.title}</strong><span>{notification.body}</span><small>{notificationDate(notification.createdAt)}</small></span>{!notification.readAt && <i className="notification-unread-dot" aria-label="Belum dibaca" />}</button>)}</div> : <div className="notification-empty"><Icon name="bell" size={19} /><strong>Belum ada notifikasi</strong><span>Perubahan tugas yang melibatkan Anda akan muncul di sini.</span></div>}</section>;
}

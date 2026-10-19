import type { AppData } from "./types";
import { demoAccount } from "./demo-account";

export const demoData: AppData = {
  campaigns: [
    { id: 1, name: "Meriahkan Kemerdekaan", brand: "HBI", objective: "Meningkatkan awareness momentum kemerdekaan.", startDate: "2026-08-01", endDate: "2026-08-31", period: "01 Agu — 31 Agu 2026", status: "Berjalan", progress: 78, budget: 12500000, spent: 9800000, kpi: "Reach 1,2 jt", tasks: 12, content: 8, lifecycleStatus: "active" },
    { id: 2, name: "Grand Opening BSD", brand: "HokBen", objective: "Mendukung pembukaan outlet baru BSD.", startDate: "2026-08-10", endDate: "2026-09-15", period: "10 Agu — 15 Sep 2026", status: "Berjalan", progress: 52, budget: 8000000, spent: 4200000, kpi: "Leads 300", tasks: 8, content: 5, lifecycleStatus: "active" },
    { id: 3, name: "Weekend Treats", brand: "HokBen", objective: "Mendorong transaksi pada akhir pekan.", startDate: "2026-08-15", endDate: "2026-09-30", period: "15 Agu — 30 Sep 2026", status: "Rencana", progress: 19, budget: 5000000, spent: 850000, kpi: "Sales 15%", tasks: 5, content: 3, lifecycleStatus: "active" },
    { id: 4, name: "Loyalty Member Push", brand: "HBI", objective: "Meningkatkan aktivasi member loyalti.", startDate: "2026-07-01", endDate: "2026-08-31", period: "01 Jul — 31 Agu 2026", status: "Hampir selesai", progress: 91, budget: 6500000, spent: 6100000, kpi: "Members 2k", tasks: 14, content: 10, lifecycleStatus: "active" },
  ],
  tasks: [
    { id: 1, title: "Finalisasi key visual Kemerdekaan", brand: "HBI", pic: "Rani Putri", due: "Hari ini", priority: "Tinggi", status: "Review", campaign: 1 },
    { id: 2, title: "Draft caption promo BSD", brand: "HokBen", pic: "Dimas Arya", due: "Besok", priority: "Sedang", status: "In Progress", campaign: 2 },
    { id: 3, title: "Follow up vendor backdrop", brand: "HBI", pic: "Andi Saputra", due: "12 Agu", priority: "Tinggi", status: "To Do", campaign: 1 },
    { id: 4, title: "Upload assets ke drive campaign", brand: "HBI", pic: "Sinta Dewi", due: "13 Agu", priority: "Rendah", status: "Backlog", campaign: 1 },
    { id: 5, title: "Revisi proposal KOL", brand: "HokBen", pic: "Rani Putri", due: "14 Agu", priority: "Sedang", status: "Revisi", campaign: 2 },
    { id: 6, title: "Publish story weekend", brand: "HokBen", pic: "Dimas Arya", due: "15 Agu", priority: "Tinggi", status: "Done", campaign: 3 },
    { id: 7, title: "Review budget ads", brand: "HBI", pic: "Andi Saputra", due: "16 Agu", priority: "Sedang", status: "Backlog", campaign: 4 },
    { id: 8, title: "Brief micro influencer", brand: "HokBen", pic: "Sinta Dewi", due: "17 Agu", priority: "Rendah", status: "To Do", campaign: 3 },
    { id: 9, title: "Check insight minggu ini", brand: "HBI", pic: "Andi Saputra", due: "18 Agu", priority: "Sedang", status: "In Progress", campaign: 4 },
    { id: 10, title: "Approval konten carousel", brand: "HBI", pic: "Rani Putri", due: "19 Agu", priority: "Tinggi", status: "Review", campaign: 1 },
  ],
  content: [
    { id: 1, title: "Carousel: Rayakan Merdeka", date: 12, status: "Review", brand: "HBI", platform: "Instagram" },
    { id: 2, title: "Video: Weekend Treats", date: 14, status: "Disetujui", brand: "HokBen", platform: "TikTok" },
    { id: 3, title: "Grand Opening BSD", date: 18, status: "Draf", brand: "HokBen", platform: "Facebook" },
    { id: 4, title: "Promo member HBI", date: 21, status: "Review", brand: "HBI", platform: "Instagram" },
    { id: 5, title: "Testimoni outlet BSD", date: 25, status: "Tayang", brand: "HokBen", platform: "TikTok" },
  ],
  requests: [
    { id: 1, title: "Buat promo khusus ulang tahun member", sender: "Maya — CRM", date: "08 Agu 2026", brand: "HBI", priority: "Tinggi", status: "Baru", pic: "Belum ada", icon: "✦" },
    { id: 2, title: "Ide kolaborasi dengan komunitas lari", sender: "Bimo — Owner", date: "07 Agu 2026", brand: "HokBen", priority: "Sedang", status: "Diproses", pic: "Rani Putri", icon: "◌" },
    { id: 3, title: "Permintaan materi display outlet", sender: "Tono — Franchise", date: "05 Agu 2026", brand: "HokBen", priority: "Rendah", status: "Selesai", pic: "Dimas Arya", icon: "▣" },
  ],
  influencers: [
    { name: "Nadia Kuliner", platform: "Instagram", niche: "Food & Lifestyle", rate: 8500000, followers: "312K", engagement: "4.8%", status: "Aktif" },
    { name: "Arief Makan", platform: "TikTok", niche: "Food Review", rate: 5500000, followers: "189K", engagement: "6.2%", status: "Aktif" },
    { name: "Jalan-Jalan Yuk", platform: "Facebook", niche: "Travel & Family", rate: 12000000, followers: "520K", engagement: "3.9%", status: "Review" },
  ],
  influencerSchedules: [
    { id: "kol-1", influencer: "Nadia Kuliner", platform: "Instagram", campaign: "Meriahkan Kemerdekaan", content: "Reels menu spesial kemerdekaan", date: "2026-10-12", time: "19:00", status: "Terjadwal", rate: 8500000, spent: 4250000, paymentStatus: "DP dibayar", notes: "Final brief sudah dikirim" },
    { id: "kol-2", influencer: "Arief Makan", platform: "TikTok", campaign: "Weekend Treats", content: "Review paket weekend", date: "2026-10-14", time: "16:00", status: "Selesai", rate: 5500000, spent: 5500000, paymentStatus: "Lunas", notes: "Insight menunggu upload" },
    { id: "kol-3", influencer: "Jalan-Jalan Yuk", platform: "Facebook", campaign: "Grand Opening BSD", content: "Video kunjungan outlet BSD", date: "2026-10-18", time: "12:00", status: "Draft", rate: 12000000, spent: 0, paymentStatus: "Belum dibayar", notes: "Menunggu konfirmasi jadwal" },
  ],
  transactions: [
    { category: "KOL & Influencer", vendor: "Nadia Kuliner", date: "08 Agu 2026", amount: 8500000, type: "Realisasi", status: "Sudah Dibayar", brand: "HBI" },
    { category: "Digital Ads", vendor: "Meta Ads", date: "07 Agu 2026", amount: 4200000, type: "Realisasi", status: "Sudah Dibayar", brand: "HokBen" },
    { category: "Produksi Konten", vendor: "Studio Kuning", date: "05 Agu 2026", amount: 3000000, type: "Rencana", status: "Belum Dibayar", brand: "HBI" },
  ],
  users: [
    { ...demoAccount, status: "Aktif" },
    { name: "Rani Putri", username: "rani.putri", email: "rani@hbi.co.id", whatsapp: "+6281312345678", role: "Creative Designer", status: "Aktif" },
    { name: "Dimas Arya", username: "dimas.arya", email: "dimas@hbi.co.id", whatsapp: "+6281412345678", role: "Support Marketing", status: "Aktif" },
    { name: "Sinta Dewi", username: "sinta.dewi", email: "sinta@hbi.co.id", whatsapp: "+6281512345678", role: "Tim Konten", status: "Aktif" },
  ],
  socialAccounts: [
    { id: "ig-hbi", platform: "instagram", name: "HBI Indonesia", handle: "@hbi.indonesia", status: "connected", lastSync: "10 Okt 2026, 13:30", followers: 128400 },
    { id: "fb-hbi", platform: "facebook", name: "HBI Indonesia", handle: "HBI Indonesia", status: "connected", lastSync: "10 Okt 2026, 13:30", followers: 84200 },
    { id: "th-hbi", platform: "threads", name: "HBI Indonesia", handle: "@hbi.indonesia", status: "connected", lastSync: "10 Okt 2026, 13:30", followers: 36400 },
    { id: "tt-hbi", platform: "tiktok", name: "HBI Official", handle: "@hbiofficial", status: "needs_attention", lastSync: "09 Okt 2026, 20:15", followers: 96700 },
  ],
  socialSnapshots: [
    { platform: "instagram", date: "05 Okt", followers: 126900, reach: 184000, impressions: 261000, engagementRate: 4.4, views: 312000 },
    { platform: "facebook", date: "05 Okt", followers: 83700, reach: 92000, impressions: 148000, engagementRate: 2.8, views: 104000 },
    { platform: "tiktok", date: "05 Okt", followers: 94100, reach: 238000, impressions: 286000, engagementRate: 6.2, views: 402000 },
    { platform: "instagram", date: "07 Okt", followers: 127600, reach: 213000, impressions: 302000, engagementRate: 4.7, views: 356000 },
    { platform: "facebook", date: "07 Okt", followers: 83900, reach: 97000, impressions: 155000, engagementRate: 2.9, views: 111000 },
    { platform: "tiktok", date: "07 Okt", followers: 95300, reach: 274000, impressions: 331000, engagementRate: 6.5, views: 449000 },
    { platform: "instagram", date: "10 Okt", followers: 128400, reach: 246000, impressions: 348000, engagementRate: 5.1, views: 401000 },
    { platform: "facebook", date: "10 Okt", followers: 84200, reach: 106000, impressions: 169000, engagementRate: 3.1, views: 120000 },
    { platform: "tiktok", date: "10 Okt", followers: 96700, reach: 319000, impressions: 387000, engagementRate: 6.8, views: 521000 },
    { platform: "threads", date: "10 Okt", followers: 36400, reach: 88000, impressions: 124000, engagementRate: 4.2, views: 0 },
  ],
  socialPosts: [
    { id: "p1", platform: "tiktok", title: "Behind the Scene Outlet BSD", publishedAt: "09 Okt 2026", reach: 187000, engagementRate: 8.4, status: "published" },
    { id: "p2", platform: "instagram", title: "Carousel Menu Baru HBI", publishedAt: "08 Okt 2026", reach: 142000, engagementRate: 6.1, status: "published" },
    { id: "p3", platform: "facebook", title: "Promo Keluarga Akhir Pekan", publishedAt: "07 Okt 2026", reach: 68000, engagementRate: 4.2, status: "published" },
    { id: "p4", platform: "threads", title: "Cerita di balik campaign HBI", publishedAt: "06 Okt 2026", reach: 42000, engagementRate: 3.7, status: "published" },
  ],
  socialInbox: [
    { id: "inbox-1", platform: "instagram", kind: "comment", author: "@kulineranaja", body: "Menunya bisa dipesan untuk delivery?", postTitle: "Carousel Menu Baru HBI", occurredAt: "10 Okt 2026, 14:22", status: "unread", canReply: true },
    { id: "inbox-2", platform: "facebook", kind: "message", author: "Dewi Pratiwi", body: "Halo, boleh minta rate card kerja sama campaign?", occurredAt: "10 Okt 2026, 13:05", status: "open", canReply: true },
    { id: "inbox-3", platform: "threads", kind: "comment", author: "@brandwatch.id", body: "Konsep visualnya menarik, ditunggu lanjutannya!", postTitle: "Cerita di balik campaign HBI", occurredAt: "10 Okt 2026, 11:40", status: "resolved", canReply: true },
    { id: "inbox-4", platform: "tiktok", kind: "comment", author: "@foodiejakarta", body: "Lokasi outlet BSD di mana ya?", postTitle: "Behind the Scene Outlet BSD", occurredAt: "09 Okt 2026, 20:12", status: "unread", canReply: false },
  ],
};

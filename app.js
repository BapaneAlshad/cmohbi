const state = {
  view: 'dashboard',
  partnerTab: 'influencers',
  taskFilter: { brand: 'Semua', pic: 'Semua', priority: 'Semua' },
  theme: localStorage.getItem('ngapaya-theme') || 'light',
  data: {
    campaigns: [
      { id: 1, name: 'Meriahkan Kemerdekaan', brand: 'HBI', pic: 'Andi Saputra', period: '01 Agu — 31 Agu 2026', status: 'Berjalan', progress: 78, budget: 12500000, spent: 9800000, kpi: 'Reach 1,2 jt', tasks: 12, content: 8 },
      { id: 2, name: 'Grand Opening BSD', brand: 'HokBen', pic: 'Rani Putri', period: '10 Agu — 15 Sep 2026', status: 'Berjalan', progress: 52, budget: 8000000, spent: 4200000, kpi: 'Leads 300', tasks: 8, content: 5 },
      { id: 3, name: 'Weekend Treats', brand: 'HokBen', pic: 'Dimas Arya', period: '15 Agu — 30 Sep 2026', status: 'Rencana', progress: 19, budget: 5000000, spent: 850000, kpi: 'Sales 15%', tasks: 5, content: 3 },
      { id: 4, name: 'Loyalty Member Push', brand: 'HBI', pic: 'Sinta Dewi', period: '01 Jul — 31 Agu 2026', status: 'Hampir selesai', progress: 91, budget: 6500000, spent: 6100000, kpi: 'Members 2k', tasks: 14, content: 10 }
    ],
    tasks: [
      { id: 1, title: 'Finalisasi key visual Kemerdekaan', brand: 'HBI', pic: 'Rani Putri', due: 'Hari ini', priority: 'Tinggi', status: 'Review', campaign: 1 },
      { id: 2, title: 'Draft caption promo BSD', brand: 'HokBen', pic: 'Dimas Arya', due: 'Besok', priority: 'Sedang', status: 'In Progress', campaign: 2 },
      { id: 3, title: 'Follow up vendor backdrop', brand: 'HBI', pic: 'Andi Saputra', due: '12 Agu', priority: 'Tinggi', status: 'To Do', campaign: 1 },
      { id: 4, title: 'Upload assets ke drive campaign', brand: 'HBI', pic: 'Sinta Dewi', due: '13 Agu', priority: 'Rendah', status: 'Backlog', campaign: 1 },
      { id: 5, title: 'Revisi proposal KOL', brand: 'HokBen', pic: 'Rani Putri', due: '14 Agu', priority: 'Sedang', status: 'Revisi', campaign: 2 },
      { id: 6, title: 'Publish story weekend', brand: 'HokBen', pic: 'Dimas Arya', due: '15 Agu', priority: 'Tinggi', status: 'Done', campaign: 3 },
      { id: 7, title: 'Review budget ads', brand: 'HBI', pic: 'Andi Saputra', due: '16 Agu', priority: 'Sedang', status: 'Backlog', campaign: 4 },
      { id: 8, title: 'Brief micro influencer', brand: 'HokBen', pic: 'Sinta Dewi', due: '17 Agu', priority: 'Rendah', status: 'To Do', campaign: 3 },
      { id: 9, title: 'Check insight minggu ini', brand: 'HBI', pic: 'Andi Saputra', due: '18 Agu', priority: 'Sedang', status: 'In Progress', campaign: 4 },
      { id: 10, title: 'Approval konten carousel', brand: 'HBI', pic: 'Rani Putri', due: '19 Agu', priority: 'Tinggi', status: 'Review', campaign: 1 }
    ],
    content: [
      { id: 1, title: 'Carousel: Rayakan Merdeka', date: 12, status: 'Review', brand: 'HBI' },
      { id: 2, title: 'Story: Weekend Treats', date: 14, status: 'Disetujui', brand: 'HokBen' },
      { id: 3, title: 'Reels Grand Opening', date: 18, status: 'Draf', brand: 'HokBen' },
      { id: 4, title: 'Promo member HBI', date: 21, status: 'Review', brand: 'HBI' },
      { id: 5, title: 'Testimoni outlet BSD', date: 25, status: 'Tayang', brand: 'HokBen' }
    ],
    requests: [
      { id: 1, title: 'Buat promo khusus ulang tahun member', sender: 'Maya — CRM', date: '08 Agu 2026', brand: 'HBI', priority: 'Tinggi', status: 'Baru', pic: 'Belum ada', icon: '✦' },
      { id: 2, title: 'Ide kolaborasi dengan komunitas lari', sender: 'Bimo — Owner', date: '07 Agu 2026', brand: 'HokBen', priority: 'Sedang', status: 'Diproses', pic: 'Rani Putri', icon: '◌' },
      { id: 3, title: 'Permintaan materi display outlet', sender: 'Tono — Franchise', date: '05 Agu 2026', brand: 'HokBen', priority: 'Rendah', status: 'Selesai', pic: 'Dimas Arya', icon: '▣' },
      { id: 4, title: 'Evaluasi jam posting konten malam', sender: 'Andi — CMO', date: '03 Agu 2026', brand: 'HBI', priority: 'Sedang', status: 'Diproses', pic: 'Sinta Dewi', icon: '⌁' }
    ],
    influencers: [
      { name: 'Nadia Kuliner', platform: 'Instagram', niche: 'Food & Lifestyle', rate: 8500000, followers: '312K', engagement: '4.8%', status: 'Aktif' },
      { name: 'Arief Makan', platform: 'TikTok', niche: 'Food Review', rate: 5500000, followers: '189K', engagement: '6.2%', status: 'Aktif' },
      { name: 'Jalan-Jalan Yuk', platform: 'Instagram', niche: 'Travel & Family', rate: 12000000, followers: '520K', engagement: '3.9%', status: 'Review' },
      { name: 'Sasa Daily', platform: 'YouTube', niche: 'Lifestyle', rate: 15000000, followers: '1.1M', engagement: '5.1%', status: 'Aktif' }
    ],
    transactions: [
      { category: 'KOL & Influencer', vendor: 'Nadia Kuliner', date: '08 Agu 2026', amount: 8500000, type: 'Realisasi', status: 'Sudah Dibayar', brand: 'HBI' },
      { category: 'Digital Ads', vendor: 'Meta Ads', date: '07 Agu 2026', amount: 4200000, type: 'Realisasi', status: 'Sudah Dibayar', brand: 'HokBen' },
      { category: 'Produksi Konten', vendor: 'Studio Kuning', date: '05 Agu 2026', amount: 3000000, type: 'Rencana', status: 'Belum Dibayar', brand: 'HBI' },
      { category: 'Event & Aktivasi', vendor: 'Ruang Kreasi', date: '03 Agu 2026', amount: 12000000, type: 'Rencana', status: 'Belum Dibayar', brand: 'HokBen' }
    ],
    metrics: {
      followers: ['128.4K', '121.8K', '130K', '+5.4%', true],
      reach: ['1.24M', '1.61M', '1.5M', '-22.9%', false],
      impressions: ['2.8M', '2.5M', '2.6M', '+12%', true],
      engagement: ['4.2%', '4.6%', '5%', '-8.7%', false],
      leads: ['438', '390', '400', '+12.3%', true]
    },
    users: [
      { name: 'Andi Saputra', email: 'andi@hbi.co.id', role: 'CMO', status: 'Aktif' },
      { name: 'Rani Putri', email: 'rani@hbi.co.id', role: 'Creative Designer', status: 'Aktif' },
      { name: 'Dimas Arya', email: 'dimas@hbi.co.id', role: 'Support Marketing', status: 'Aktif' },
      { name: 'Sinta Dewi', email: 'sinta@hbi.co.id', role: 'Tim Konten', status: 'Aktif' }
    ]
  }
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n).replace('IDR', 'Rp');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const initials = (name) => name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const avatar = (name, tone = 'purple') => '<span class="avatar avatar-' + tone + '">' + esc(initials(name)) + '</span>';
const iconPaths = {
  home: '<path d="M3 10.8 12 3l9 7.8"></path><path d="M5.5 9.5v10h13v-10"></path><path d="M9.5 19.5v-5h5v5"></path>',
  campaign: '<path d="M4 6.5h16"></path><path d="M4 12h10"></path><path d="M4 17.5h16"></path><circle cx="17" cy="12" r="2.4"></circle>',
  'check-square': '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="m8 12 2.5 2.5L16.5 9"></path>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17"></path><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"></path>',
  sparkles: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"></path><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"></path>',
  handshake: '<path d="m4 12 3.5-3.5a2 2 0 0 1 2.8 0l1.2 1.2 1.2-1.2a2 2 0 0 1 2.8 0L20 12"></path><path d="m3 13 3.5 3.5a2 2 0 0 0 2.8 0l.7-.7"></path><path d="m21 13-3.5 3.5a2 2 0 0 1-2.8 0L10 11.8"></path><path d="m8.5 14.5 1.2 1.2M12 13.5l1.2 1.2M15.5 12.5l1.2 1.2"></path>',
  chart: '<path d="M4 19.5V5"></path><path d="M4 19.5h16"></path><path d="m7 15 3-3 2.5 2 5-6"></path><path d="M15.5 8H18v2.5"></path>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m16 16 4.5 4.5"></path>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
  moon: '<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  'arrow-up-right': '<path d="M5 19 19 5"></path><path d="M9 5h10v10"></path>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.2 2"></path>',
  alert: '<path d="M12 4 3.5 19h17L12 4Z"></path><path d="M12 9v4M12 16h.01"></path>',
  wallet: '<path d="M4 6.5h14a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h13"></path><path d="M16 12h4M16 12a1.5 1.5 0 1 0 0 3h4"></path>',
  check: '<path d="m5 12 4 4L19 6"></path>',
  user: '<circle cx="12" cy="8" r="3.5"></circle><path d="M4.5 20a7.5 7.5 0 0 1 15 0"></path>',
  close: '<path d="m6 6 12 12M18 6 6 18"></path>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"></path>'
};
const iconSvg = (name, size = 16) => '<svg class="ui-icon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[name] || iconPaths.sparkles) + '</svg>';
function hydrateIcons() { $$('[data-icon]').forEach((el) => { const name = el.dataset.icon; el.innerHTML = iconSvg(name, el.classList.contains('nav-icon') ? 17 : 16); }); }
function applyTheme() { const dark = state.theme === 'dark'; document.body.classList.toggle('dark-mode', dark); const themeIcon = $('[data-action="toggle-theme"] [data-icon]'); if (themeIcon) { themeIcon.dataset.icon = dark ? 'sun' : 'moon'; themeIcon.innerHTML = iconSvg(themeIcon.dataset.icon, 17); } }
const statusClass = (s) => ({ 'Berjalan': 'status-active', 'Selesai': 'status-done', 'Rencana': 'status-plan', 'Hampir selesai': 'status-progress', 'In Progress': 'status-progress', 'Review': 'status-review', 'Revisi': 'status-revise', 'Done': 'status-done', 'To Do': 'status-plan', 'Backlog': 'status-review', 'Baru': 'status-review', 'Diproses': 'status-progress', 'Disetujui': 'status-done', 'Draf': 'status-review', 'Tayang': 'status-active', 'Aktif': 'status-active', 'Belum Dibayar': 'status-revise', 'Sudah Dibayar': 'status-done' }[s] || 'status-review');
const pill = (s) => '<span class="status-pill ' + statusClass(s) + '">' + esc(s) + '</span>';
const priority = (s) => '<span class="priority-pill priority-' + s.toLowerCase() + '">' + esc(s) + '</span>';
const button = (label, action, cls) => '<button class="button ' + (cls || 'button-soft') + '" data-action="' + action + '">' + label + '</button>';

function save() { localStorage.setItem('ngapaya-data', JSON.stringify(state.data)); }
function load() { try { const x = JSON.parse(localStorage.getItem('ngapaya-data')); if (x) state.data = Object.assign(state.data, x); } catch (_) {} }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 2500); }
function heading(kicker, title, desc, action) { return '<div class="page-heading"><div><div class="eyebrow">' + kicker + '</div><h1>' + title + '</h1><p>' + desc + '</p></div>' + (action ? '<div class="heading-actions">' + action + '</div>' : '') + '</div>'; }

function dashboard() {
  const active = state.data.campaigns.filter((x) => x.status === 'Berjalan').length;
  const pending = state.data.tasks.filter((x) => x.status !== 'Done').length;
  return heading('Selamat pagi, Andi 👋', 'Mari wujudkan ide hari ini.', 'Berikut ringkasan aktivitas marketing HBI untuk kamu.', '<span class="date-chip">' + iconSvg('calendar', 14) + '11 Agustus 2026</span>') +
  '<section class="hero-panel"><div class="hero-copy"><div class="eyebrow">Ringkasan hari ini</div><h2>Tim kamu punya ' + pending + ' tugas yang perlu perhatian.</h2><p>3 deadline terdekat menunggu diselesaikan minggu ini.</p></div><div class="hero-illustration"><div class="hero-orb"></div><div class="hero-person"></div><div class="hero-board"><i></i><i></i><i></i></div></div></section>' +
  '<section class="stats-grid">' +
    statCard('Campaign aktif', active + '<small> / ' + state.data.campaigns.length + '</small>', '◈', '↗ &nbsp; 12% dari bulan lalu', '68%', '') +
    statCard('Tugas tertunda', pending + '<small> tugas</small>', '✓', '↘ &nbsp; 4 perlu perhatian', '42%', 'orange') +
    statCard('Deadline terdekat', '2<small> hari</small>', '◷', 'Finalisasi key visual', '29%', 'coral') +
    statCard('Butuh approval', '3<small> item</small>', '!', '↗ &nbsp; 2 item baru hari ini', '56%', 'blue') +
  '</section>' +
  '<section class="dashboard-grid">' +
    '<div class="card social-card"><div class="card-header"><div><h2 class="card-title">KPI Sosial Media</h2><p class="card-subtitle">Performa bulan ini dibandingkan target</p></div><button class="link-button" data-view="analytics">Lihat analitik ↗</button></div>' +
      metricRow('Followers', state.data.metrics.followers, 'purple') + metricRow('Reach', state.data.metrics.reach, 'green') + metricRow('Engagement', state.data.metrics.engagement, 'orange') +
    '</div>' +
    '<div class="card alert-card"><div class="card-header"><div><h2 class="card-title">Peringatan & Persetujuan <span class="goal-label goal-low">3 baru</span></h2><p class="card-subtitle">Item yang perlu ditindaklanjuti</p></div><button class="link-button" data-view="requests">Lihat semua</button></div><div class="alert-list">' +
      alertItem('orange', 'Rp', 'Pengeluaran menunggu approval', 'Studio Kuning · ' + rupiah(3000000), '10 mnt') +
      alertItem('coral', '✦', 'Request baru dari Maya', 'Promo ulang tahun member · Tinggi', '1 jam') +
      alertItem('blue', '✓', 'Konten menunggu review', 'Carousel: Rayakan Merdeka', '2 jam') +
    '</div></div>' +
  '</section>' +
  '<section class="dashboard-bottom"><div class="card"><div class="card-header"><div><h2 class="card-title">Progres Campaign</h2><p class="card-subtitle">Campaign yang sedang berjalan</p></div><button class="link-button" data-view="campaigns">Kelola campaign ↗</button></div>' +
    state.data.campaigns.slice(0, 3).map(campaignRow).join('') +
  '</div><div class="card"><div class="card-header"><div><h2 class="card-title">Agenda terdekat</h2><p class="card-subtitle">Jangan lewatkan momen penting</p></div><button class="link-button" data-view="calendar">Kalender ↗</button></div>' +
    '<div class="schedule-list">' + schedule('12', 'Agu', 'Review konten Kemerdekaan', 'Dengan CMO · 10:00 WIB', '') + schedule('14', 'Agu', 'Posting Weekend Treats', 'Instagram · 16:00 WIB', 'orange') + schedule('17', 'Agu', 'Brief influencer BSD', 'Ruang Meeting 2 · 13:00 WIB', '') + '</div></div></section>';
}
function statCard(label, value, icon, note, width, tone) { const names = { '◈': 'campaign', '✓': 'check-square', '◷': 'clock', '!': 'alert' }; return '<div class="stat-card"><div class="stat-top"><span>' + label + '</span><span class="stat-icon ' + tone + '">' + iconSvg(names[icon] || 'chart', 15) + '</span></div><div class="stat-value">' + value + '</div><div class="stat-note ' + (tone === 'orange' || tone === 'coral' ? 'trend-down' : 'trend-up') + '">' + note + '</div><div class="stat-progress"><span style="width:' + width + '"></span></div></div>'; }
function metricRow(label, metric, color) { return '<div class="metric-row"><div class="metric-label"><i class="metric-dot ' + color + '"></i>' + label + '</div><div class="metric-value">' + metric[0] + ' <small>/ ' + metric[2] + '</small></div><div class="metric-bar"><span style="width:' + (metric[4] ? '89%' : '69%') + '"></span></div><div class="metric-change ' + (metric[4] ? 'trend-up' : 'trend-down') + '">' + (metric[4] ? '↗ ' : '↘ ') + metric[3] + '<em class="goal-label ' + (metric[4] ? 'goal-ok">On track' : 'goal-low">Di bawah') + '</em></div></div>'; }
function alertItem(color, icon, title, sub, time) { const names = { Rp: 'wallet', '✦': 'sparkles', '✓': 'check' }; return '<div class="alert-item"><div class="alert-icon ' + color + '">' + iconSvg(names[icon] || 'alert', 15) + '</div><div class="alert-copy"><strong>' + title + '</strong><span>' + sub + '</span></div><span class="alert-time">' + time + '</span></div>'; }
function campaignRow(c) { return '<div class="campaign-row"><div class="campaign-brand">' + (c.brand === 'HBI' ? 'H' : 'HB') + '</div><div class="campaign-copy"><strong>' + c.name + '</strong><span>' + c.brand + ' · ' + c.status + '</span></div><div class="campaign-progress-wrap"><div class="progress-track"><span style="width:' + c.progress + '%"></span></div><div class="progress-meta"><span>' + c.progress + '% selesai</span><span>' + c.kpi + '</span></div></div><div class="campaign-budget"><strong>' + rupiah(c.budget - c.spent) + '</strong><span class="' + (c.budget - c.spent < 1000000 ? 'budget-warning' : '') + '">sisa budget</span></div></div>'; }
function schedule(day, month, title, meta, tone) { return '<div class="schedule-item"><div class="schedule-date"><strong>' + day + '</strong><span>' + month + '</span></div><div class="schedule-copy"><strong>' + title + '</strong><span>' + meta + '</span></div><i class="schedule-status ' + tone + '"></i></div>'; }

function campaigns() {
  return heading('Workspace / Campaign', 'Kelola campaign', 'Pantau strategi, budget, dan progres semua campaign HBI.', '<button class="button button-primary" data-modal="campaign">＋ Buat campaign</button>') +
  '<div class="toolbar"><div class="toolbar-left"><span class="result-count">' + state.data.campaigns.length + ' campaign ditemukan</span><button class="filter-chip">Semua status <span>⌄</span></button><button class="filter-chip">Semua brand <span>⌄</span></button></div><div class="toolbar-right"><button class="button button-soft button-sm">⇅ Urutkan</button></div></div><div class="campaign-grid">' +
  state.data.campaigns.map((c) => '<article class="card campaign-card"><div class="campaign-card-top"><div class="campaign-card-brand"><div class="campaign-brand">' + (c.brand === 'HBI' ? 'H' : 'HB') + '</div><div><h3>' + c.name + '</h3><div class="meta">' + c.brand + ' · ' + c.pic + '</div></div></div>' + pill(c.status) + '</div><div class="campaign-card-body"><div class="progress-meta"><span>Progres campaign</span><strong>' + c.progress + '%</strong></div><div class="progress-track"><span style="width:' + c.progress + '%"></span></div><div class="campaign-kpis"><div class="mini-kpi"><strong>' + c.kpi + '</strong><span>Target KPI</span></div><div class="mini-kpi"><strong>' + c.tasks + '</strong><span>Tugas</span></div><div class="mini-kpi"><strong>' + c.content + '</strong><span>Konten</span></div><div class="mini-kpi"><strong>' + rupiah(c.spent) + '</strong><span>Realisasi</span></div></div></div><div class="campaign-card-footer"><span class="due-label">' + c.period + '</span><button class="button button-soft button-sm" data-action="campaign-detail" data-id="' + c.id + '">Lihat detail ↗</button></div></article>').join('') + '</div>';
}

const taskStatuses = ['Backlog', 'To Do', 'In Progress', 'Review', 'Revisi', 'Done'];
function todo() {
  const filters = state.taskFilter;
  const visibleTasks = state.data.tasks.filter((x) => (filters.brand === 'Semua' || x.brand === filters.brand) && (filters.pic === 'Semua' || x.pic === filters.pic) && (filters.priority === 'Semua' || x.priority === filters.priority));
  return heading('Workspace / To-Do', 'Papan kerja tim', 'Semua tugas tersusun rapi, setiap progres terlihat jelas.', '<button class="button button-primary" data-modal="task">＋ Tambah tugas</button>') +
  '<div class="toolbar"><div class="toolbar-left"><span class="result-count">' + visibleTasks.length + ' tugas ditemukan</span><label class="filter-chip">Brand <select class="select-clean" data-task-filter="brand"><option>Semua</option><option ' + (filters.brand === 'HBI' ? 'selected' : '') + '>HBI</option><option ' + (filters.brand === 'HokBen' ? 'selected' : '') + '>HokBen</option></select></label><label class="filter-chip">PIC <select class="select-clean" data-task-filter="pic"><option>Semua</option>' + ['Andi Saputra', 'Rani Putri', 'Dimas Arya', 'Sinta Dewi'].map((x) => '<option ' + (filters.pic === x ? 'selected' : '') + '>' + x + '</option>').join('') + '</select></label><label class="filter-chip">Prioritas <select class="select-clean" data-task-filter="priority"><option>Semua</option>' + ['Tinggi', 'Sedang', 'Rendah'].map((x) => '<option ' + (filters.priority === x ? 'selected' : '') + '>' + x + '</option>').join('') + '</select></label></div><div class="toolbar-right"><button class="button button-soft button-sm" data-action="reset-task-filters">↺ Reset filter</button></div></div><div class="todo-board">' +
  taskStatuses.map((status) => '<section class="todo-column"><div class="todo-column-head"><h3>' + status + '</h3><span>' + visibleTasks.filter((x) => x.status === status).length + '</span></div><div class="todo-stack">' + (visibleTasks.filter((x) => x.status === status).map((t) => '<article class="task-card"><div class="task-card-top"><h4>' + t.title + '</h4><button class="task-more" data-action="task-menu">⋮</button></div><div class="task-brand">' + t.brand + ' · Campaign terkait</div><div class="task-meta"><span class="task-due">◷ ' + t.due + '</span><span class="task-assignee">' + avatar(t.pic) + '</span></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px">' + priority(t.priority) + '<select class="select-clean" style="font-size:8px;color:var(--muted);background:transparent" data-task-status="' + t.id + '">' + taskStatuses.map((s) => '<option ' + (s === t.status ? 'selected' : '') + '>' + s + '</option>').join('') + '</select></div></article>').join('') || '<div class="empty-column">Belum ada tugas di tahap ini</div>') + '</div></section>').join('') + '</div>';
}

function calendar() {
  const days = [27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6];
  return heading('Operasional / Kalender Konten', 'Kalender konten', 'Rencanakan konten dan manfaatkan momen penting dengan lebih terarah.', '<button class="button button-primary" data-modal="content">＋ Jadwalkan konten</button>') +
  '<div class="calendar-layout"><div class="card calendar-card"><div class="calendar-header"><div class="month-title">Agustus 2026<span>5 konten terjadwal · 8 momen relevan</span></div><div class="month-actions"><button class="icon-button">‹</button><button class="icon-button">›</button></div></div><div class="calendar-week">' + ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((x) => '<span>' + x + '</span>').join('') + '</div><div class="calendar-grid">' + days.map((day, i) => { const c = state.data.content.find((x) => x.date === day); return '<div class="calendar-cell ' + (i < 5 || i > 35 ? 'muted' : '') + (day === 11 && i > 5 ? ' today' : '') + '"><span class="day-number">' + day + '</span>' + (c ? '<span class="calendar-event">' + c.title + '</span>' : '') + (day === 17 && i > 5 ? '<span class="calendar-event orange">Hari Kemerdekaan</span>' : '') + '</div>'; }).join('') + '</div></div>' +
  '<div class="card"><div class="card-header"><div><h2 class="card-title">Jelajahi momen</h2><p class="card-subtitle">Momen yang bisa dimanfaatkan</p></div><button class="link-button">Filter</button></div><div class="view-tabs" style="margin-bottom:14px"><button class="view-tab active">Semua (8)</button><button class="view-tab">Relevan (5)</button></div><div class="moment-list">' + [
    ['17', 'Hari Kemerdekaan RI', 'Nasional · Sangat relevan untuk HBI', 'Relevan', 'status-active'],
    ['12', 'Hari UMKM Nasional', 'Nasional · Relevan untuk brand lokal', 'Relevan', 'status-active'],
    ['21', 'Hari Anak Sedunia', 'Internasional · Potensi konten keluarga', 'Ide', 'status-plan'],
    ['30', 'National Burger Day', 'Populer · Relevan untuk HokBen', 'Relevan', 'status-active']
  ].map((m) => '<div class="moment-item"><div class="moment-date">' + m[0] + '</div><div class="moment-copy"><strong>' + m[1] + '</strong><span>' + m[2] + '</span></div><span class="status-pill ' + m[4] + '">' + m[3] + '</span></div>').join('') + '</div></div></div>';
}

function requests() {
  return heading('Operasional / Request & Ide', 'Request & ide', 'Tangkap setiap masukan dan ubah ide baik menjadi pekerjaan nyata.', '<button class="button button-primary" data-modal="request">＋ Buat request</button>') +
  '<div class="request-layout"><div class="card"><div class="card-header"><div><h2 class="card-title">Semua request <span class="goal-label goal-low">3 perlu ditindaklanjuti</span></h2><p class="card-subtitle">Request dari divisi, owner, mitra, dan tim</p></div><button class="button button-soft button-sm">☷ Filter</button></div><div class="request-list">' +
  state.data.requests.map((r) => '<article class="request-item"><div class="request-symbol">' + r.icon + '</div><div class="request-copy"><strong>' + r.title + '</strong><span>' + r.sender + ' · ' + r.date + ' · ' + r.brand + '</span></div><div class="request-end">' + priority(r.priority) + pill(r.status) + '<button class="task-more" data-action="request-detail">⋮</button></div></article>').join('') +
  '</div></div><div class="card suggestion-card"><div class="card-header"><div><h2 class="card-title">Kotak saran marketing</h2><p class="card-subtitle">Punya ide, saran, atau kritik?</p></div></div><div class="suggestion-hero"><span class="suggestion-hero-icon">✦</span><div><strong>Suara kamu penting.</strong><span>Ide terbaik bisa jadi campaign baru untuk HBI.</span></div></div><form id="suggestion-form" class="form-stack"><div class="form-field"><label>Kategori</label><select class="input"><option>Ide</option><option>Saran</option><option>Kritik</option></select></div><div class="form-field"><label>Isi saran</label><textarea class="textarea" required placeholder="Ceritakan ide kamu..."></textarea></div><button class="button button-primary" type="submit">Kirim saran ↗</button></form></div></div>';
}

function partners() { return heading('Operasional / Mitra & Keuangan', 'Mitra & keuangan', 'Kelola relasi KOL dan kontrol pengeluaran marketing di satu tempat.', '<button class="button button-primary" data-modal="' + (state.partnerTab === 'influencers' ? 'influencer' : 'transaction') + '">＋ ' + (state.partnerTab === 'influencers' ? 'Tambah influencer' : 'Catat transaksi') + '</button>') + '<div class="view-tabs partner-tabs"><button class="view-tab ' + (state.partnerTab === 'influencers' ? 'active' : '') + '" data-partner-tab="influencers">Daftar influencer</button><button class="view-tab ' + (state.partnerTab === 'finance' ? 'active' : '') + '" data-partner-tab="finance">Keuangan & rekap</button></div>' + (state.partnerTab === 'influencers' ? influencers() : finance()); }
function influencers() { return '<div class="toolbar"><div class="toolbar-left"><span class="result-count">' + state.data.influencers.length + ' influencer tersimpan</span><label class="search-box" style="width:180px"><span>⌕</span><input placeholder="Cari influencer..." /></label><button class="filter-chip">Platform: Semua <span>⌄</span></button></div></div><div class="card table-card"><div class="card-header"><div><h2 class="card-title">Daftar influencer / KOL</h2><p class="card-subtitle">Partner yang pernah dan sedang bekerja sama dengan HBI</p></div><button class="link-button">Export data ↓</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Influencer</th><th>Platform</th><th>Niche</th><th>Followers</th><th>Engagement</th><th>Rate card</th><th>Status</th></tr></thead><tbody>' + state.data.influencers.map((i, n) => '<tr><td><div class="table-person">' + avatar(i.name, n % 2 ? 'orange' : 'purple') + '<span>' + i.name + '</span></div></td><td>' + i.platform + '</td><td>' + i.niche + '</td><td>' + i.followers + '</td><td class="trend-up">' + i.engagement + '</td><td>' + rupiah(i.rate) + '</td><td>' + pill(i.status) + '</td></tr>').join('') + '</tbody></table></div></div>'; }
function finance() { const total = state.data.transactions.reduce((a, b) => a + b.amount, 0); return '<section class="partner-summary"><div class="card summary-mini"><span>Total pengeluaran Agustus</span><strong>' + rupiah(total) + '</strong><p>↗ 8.4% dari bulan lalu</p></div><div class="card summary-mini"><span>Sudah dibayar</span><strong>' + rupiah(12700000) + '</strong><p style="color:var(--purple)">64% dari total</p></div><div class="card summary-mini"><span>Belum dibayar</span><strong>' + rupiah(15000000) + '</strong><p class="trend-down">3 transaksi perlu diproses</p></div></section><div class="finance-layout"><div class="card"><div class="card-header"><div><h2 class="card-title">Rekap pengeluaran</h2><p class="card-subtitle">Agustus 2026 · Semua brand</p></div><button class="button button-soft button-sm">▣ Bulan</button></div><div class="donut-wrap"><div style="position:relative"><div class="donut"></div><div class="donut-center"><strong>Rp27.7jt</strong><span>total aktual</span></div></div><div class="legend"><div class="legend-row"><i class="legend-dot"></i>Digital Ads <strong>48%</strong></div><div class="legend-row"><i class="legend-dot green"></i>KOL & Influencer <strong>31%</strong></div><div class="legend-row"><i class="legend-dot orange"></i>Produksi <strong>12%</strong></div></div></div></div><div class="card table-card"><div class="card-header"><div><h2 class="card-title">Transaksi terbaru</h2><p class="card-subtitle">Rencana dan realisasi biaya</p></div><button class="link-button" data-modal="transaction">＋ Tambah</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Vendor</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th><th>Tipe</th><th>Status</th></tr></thead><tbody>' + state.data.transactions.map((t) => '<tr><td>' + t.vendor + '<small style="display:block;color:var(--muted);margin-top:3px">' + t.brand + '</small></td><td>' + t.category + '</td><td>' + t.date + '</td><td>' + rupiah(t.amount) + '</td><td>' + t.type + '</td><td>' + pill(t.status) + '</td></tr>').join('') + '</tbody></table></div></div></div>'; }

function analytics() {
  const keys = [['followers', 'Followers', '◉'], ['reach', 'Reach', '◌'], ['impressions', 'Impressions', '◒'], ['engagement', 'Engagement', '♧'], ['leads', 'Leads', '⌁']];
  return heading('Operasional / Analitik Sosmed', 'Analitik sosmed', 'Baca performa konten, temukan masalah, dan ambil tindakan lebih cepat.', '<button class="button button-soft" data-modal="metrics">＋ Isi data bulanan</button>') +
  '<div class="analytics-filter"><span class="result-count">Tampilkan data:</span><label class="filter-chip">Bulan <select class="select-clean"><option>Agustus 2026</option><option>Juli 2026</option></select></label><label class="filter-chip">Brand <select class="select-clean"><option>Semua brand</option><option>HBI</option><option>HokBen</option></select></label></div><div class="analytics-metrics">' +
  keys.map((k) => analyticsMetric(k)).join('') + '</div><div class="analytics-grid"><div class="card"><div class="card-header"><div><h2 class="card-title">Perbandingan metrik</h2><p class="card-subtitle">Agustus 2026 · Semua brand</p></div><button class="link-button">Atur target</button></div><table class="metric-table"><thead><tr><th>Metrik</th><th>Bulan ini</th><th>Bulan lalu</th><th>Target</th><th>Status</th></tr></thead><tbody>' +
  keys.map((k) => { const m = state.data.metrics[k[0]]; return '<tr><td>' + k[1] + '</td><td>' + m[0] + '</td><td>' + m[1] + '</td><td>' + m[2] + '</td><td class="' + (m[4] ? 'trend-up' : 'trend-down') + '">' + (m[4] ? '↗ On track' : '↘ Di bawah target') + '</td></tr>'; }).join('') +
  '</tbody></table></div><div class="card"><div class="card-header"><div><h2 class="card-title">Rekomendasi tindakan</h2><p class="card-subtitle">Trigger otomatis dari data kamu</p></div><span class="goal-label goal-low">2 alert</span></div><div class="recommendation-list">' +
  recommendation('Reach turun 22.9%', 'Evaluasi jam posting dan coba repost konten terbaik dari dua minggu terakhir.', 'Evaluasi jam posting dan repost konten terbaik') +
  recommendation('Engagement di bawah target', 'Tambahkan CTA dan format interaktif seperti polling untuk konten minggu depan.', 'Optimasi CTA dan format interaktif konten') +
  '</div></div></div><div class="card" style="margin-top:20px"><div class="card-header"><div><h2 class="card-title">Konten terbaik & terendah</h2><p class="card-subtitle">Berdasarkan reach Agustus 2026</p></div></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px"><div><div class="eyebrow" style="color:var(--green)">KONTEN TERBAIK</div>' +
  rank('01', 'Reels: Behind the Scene BSD', 'Reach 280K · Engagement 8.4%', true) + rank('02', 'Carousel: Menu Baru HokBen', 'Reach 214K · Engagement 6.1%', true) +
  '</div><div><div class="eyebrow" style="color:var(--coral)">KONTEN TERENDAH</div>' + rank('01', 'Static: Promo Lunch Weekday', 'Reach 32K · Engagement 1.2%', false) + rank('02', 'Story: Reminder Membership', 'Reach 41K · Engagement 1.8%', false) + '</div></div></div>';
}
function analyticsMetric(k) { const m = state.data.metrics[k[0]]; return '<div class="card analytics-metric"><div class="analytics-metric-top"><span>' + k[1] + '</span><span>' + k[2] + '</span></div><strong>' + m[0] + '</strong><p class="' + (m[4] ? 'trend-up' : 'trend-down') + '">' + (m[4] ? '↗' : '↘') + ' ' + m[3] + ' vs bulan lalu</p><div class="target">Target KPI: ' + m[2] + '</div></div>'; }
function recommendation(title, text, task) { return '<div class="recommendation"><div class="recommendation-top"><strong>' + title + '</strong><span class="priority-pill priority-high">Perhatian</span></div><p>' + text + '</p><button class="button button-soft button-sm" data-action="make-task" data-title="' + task + '">Jadikan tugas ↗</button></div>'; }
function rank(num, title, text, good) { return '<div class="content-rank"><strong class="rank-number ' + (good ? '' : 'trend-down') + '">' + num + '</strong><div class="rank-copy"><strong>' + title + '</strong><span>' + text + '</span></div><span class="' + (good ? 'trend-up' : 'trend-down') + '">' + (good ? '↗' : '↘') + '</span></div>'; }

function account() { return heading('Akun / Keamanan', 'Akun & keamanan', 'Kelola profil, tim, dan akses fitur Ngapaya.', '<button class="button button-danger" data-action="logout">↪ Keluar</button>') + '<div class="account-grid"><div class="card profile-card"><div class="profile-avatar">AS</div><h2>Andi Saputra</h2><div class="role">CMO · Full access</div><div class="profile-mail">andi@hbi.co.id</div><button class="button button-soft button-sm" data-modal="profile">Edit profil</button><div class="profile-stat"><div><strong>24</strong><span>Campaign</span></div><div><strong>86</strong><span>Task selesai</span></div></div><div class="profile-actions"><button class="button button-ghost button-sm" data-modal="password">Ganti sandi</button></div></div><div class="card"><div class="card-header"><div><h2 class="card-title">Kelola pengguna</h2><p class="card-subtitle">Atur peran dan akses anggota tim secara spesifik.</p></div><button class="button button-primary button-sm" data-modal="user">＋ Tambah user</button></div>' + state.data.users.map((u, i) => '<div class="permission-row"><div style="display:flex;align-items:center;gap:10px">' + avatar(u.name, i === 0 ? 'purple' : i === 1 ? 'green' : 'blue') + '<div class="permission-copy"><strong>' + u.name + '</strong><span>' + u.email + ' · ' + u.role + '</span></div></div><div style="display:flex;align-items:center;gap:13px"><span class="status-pill status-active">' + u.status + '</span><button class="task-more">⋮</button></div></div>').join('') + '</div><div class="card"><div class="card-header"><div><h2 class="card-title">Akses fitur saya</h2><p class="card-subtitle">Hak akses aktif untuk akun CMO</p></div></div>' + ['Dashboard & laporan', 'Campaign & To-Do', 'Kalender Konten', 'Request & Ide', 'Mitra & Keuangan', 'Analitik Sosmed'].map((x) => '<div class="permission-row"><div class="permission-copy"><strong>' + x + '</strong><span>CMO dapat melihat dan mengubah data</span></div><div class="switch on"></div></div>').join('') + '</div></div>'; }

function render() {
  const titles = { dashboard: 'Dashboard', campaigns: 'Campaign', todo: 'To-Do', calendar: 'Kalender Konten', requests: 'Request & Ide', partners: 'Mitra & Keuangan', analytics: 'Analitik Sosmed', account: 'Akun & Keamanan' };
  const views = { dashboard, campaigns, todo, calendar, requests, partners, analytics, account };
  $('#page-title').textContent = titles[state.view];
  $$('.nav-item').forEach((x) => x.classList.toggle('active', x.dataset.view === state.view));
  $('#page-content').innerHTML = views[state.view]();
  hydrateIcons();
  applyTheme();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const modalBody = {
  task: ['Tambah tugas baru', 'Buat tugas dan pastikan PIC serta deadline-nya jelas.', '<div class="form-stack"><div class="form-field"><label>Judul tugas *</label><input class="modal-input" name="title" required placeholder="Contoh: Finalisasi key visual"></div><div class="two-fields"><div class="form-field"><label>PIC *</label><select class="modal-input" name="pic"><option>Andi Saputra</option><option>Rani Putri</option><option>Dimas Arya</option><option>Sinta Dewi</option></select></div><div class="form-field"><label>Brand</label><select class="modal-input" name="brand"><option>HBI</option><option>HokBen</option></select></div></div><div class="two-fields"><div class="form-field"><label>Deadline *</label><input class="modal-input" type="date" name="due" required value="2026-08-18"></div><div class="form-field"><label>Prioritas</label><select class="modal-input" name="priority"><option>Tinggi</option><option selected>Sedang</option><option>Rendah</option></select></div></div></div>'],
  campaign: ['Buat campaign baru', 'Isi target terukur agar progres campaign mudah dipantau.', '<div class="form-stack"><div class="form-field"><label>Nama campaign *</label><input class="modal-input" name="name" required placeholder="Contoh: Promo Akhir Tahun"></div><div class="two-fields"><div class="form-field"><label>Brand *</label><select class="modal-input" name="brand"><option>HBI</option><option>HokBen</option></select></div><div class="form-field"><label>PIC *</label><select class="modal-input" name="pic"><option>Andi Saputra</option><option>Rani Putri</option><option>Dimas Arya</option><option>Sinta Dewi</option></select></div></div><div class="form-field"><label>Tujuan campaign *</label><input class="modal-input" name="objective" required placeholder="Apa yang ingin dicapai?"></div><div class="two-fields"><div class="form-field"><label>Target / KPI *</label><input class="modal-input" name="kpi" required placeholder="Contoh: Reach 1 juta"></div><div class="form-field"><label>Budget rencana</label><input class="modal-input" name="budget" type="number" placeholder="5000000"></div></div></div>'],
  content: ['Jadwalkan konten', 'Konten baru akan masuk kalender dengan status Draf.', '<div class="form-stack"><div class="form-field"><label>Judul konten *</label><input class="modal-input" name="title" required placeholder="Contoh: Reels promo weekend"></div><div class="two-fields"><div class="form-field"><label>Brand</label><select class="modal-input" name="brand"><option>HBI</option><option>HokBen</option></select></div><div class="form-field"><label>Platform</label><select class="modal-input" name="platform"><option>Instagram</option><option>TikTok</option><option>Facebook</option></select></div></div><div class="form-field"><label>Tanggal tayang *</label><input class="modal-input" type="date" name="date" required value="2026-08-20"></div><div class="form-field"><label>Caption / brief</label><textarea class="modal-input" name="caption" placeholder="Tulis caption atau brief singkat..."></textarea></div></div>'],
  request: ['Buat request / ide', 'Catat masukan agar bisa ditindaklanjuti dengan jelas.', '<div class="form-stack"><div class="form-field"><label>Nama pengirim *</label><input class="modal-input" name="sender" required placeholder="Nama lengkap"></div><div class="form-field"><label>Isi request / ide *</label><textarea class="modal-input" name="title" required placeholder="Ceritakan kebutuhan atau ide..."></textarea></div><div class="two-fields"><div class="form-field"><label>Brand</label><select class="modal-input" name="brand"><option>HBI</option><option>HokBen</option></select></div><div class="form-field"><label>Prioritas</label><select class="modal-input" name="priority"><option>Tinggi</option><option selected>Sedang</option><option>Rendah</option></select></div></div></div>'],
  influencer: ['Tambah influencer', 'Simpan profil KOL untuk memudahkan kolaborasi berikutnya.', '<div class="form-stack"><div class="form-field"><label>Nama influencer *</label><input class="modal-input" name="name" required placeholder="Nama / handle"></div><div class="two-fields"><div class="form-field"><label>Platform</label><select class="modal-input" name="platform"><option>Instagram</option><option>TikTok</option><option>YouTube</option></select></div><div class="form-field"><label>Niche</label><input class="modal-input" name="niche" placeholder="Food & Lifestyle"></div></div><div class="two-fields"><div class="form-field"><label>Rate card</label><input class="modal-input" name="rate" type="number" placeholder="5000000"></div><div class="form-field"><label>Followers</label><input class="modal-input" name="followers" placeholder="100K"></div></div></div>'],
  transaction: ['Catat transaksi', 'Dokumentasikan rencana dan realisasi pengeluaran marketing.', '<div class="form-stack"><div class="form-field"><label>Vendor *</label><input class="modal-input" name="vendor" required placeholder="Nama vendor"></div><div class="two-fields"><div class="form-field"><label>Kategori</label><select class="modal-input" name="category"><option>Digital Ads</option><option>KOL & Influencer</option><option>Produksi Konten</option><option>Event & Aktivasi</option></select></div><div class="form-field"><label>Jumlah *</label><input class="modal-input" name="amount" type="number" required placeholder="2500000"></div></div><div class="two-fields"><div class="form-field"><label>Tipe</label><select class="modal-input" name="type"><option>Realisasi</option><option>Rencana</option></select></div><div class="form-field"><label>Brand</label><select class="modal-input" name="brand"><option>HBI</option><option>HokBen</option></select></div></div></div>'],
  profile: ['Edit profil saya', 'Peran CMO hanya dapat diubah oleh admin.', '<div class="form-stack"><div class="form-field"><label>Nama lengkap</label><input class="modal-input" name="name" value="Andi Saputra"></div><div class="form-field"><label>Email</label><input class="modal-input" value="andi@hbi.co.id" disabled></div><div class="form-field"><label>Posisi</label><input class="modal-input" value="Chief Marketing Officer"></div></div>'],
  password: ['Ganti kata sandi', 'Gunakan kata sandi yang kuat dan mudah diingat.', '<div class="form-stack"><div class="form-field"><label>Kata sandi lama</label><input class="modal-input" type="password" required></div><div class="form-field"><label>Kata sandi baru</label><input class="modal-input" type="password" required></div></div>'],
  user: ['Tambah pengguna', 'Berikan akses sesuai peran dan tanggung jawab anggota tim.', '<div class="form-stack"><div class="form-field"><label>Nama lengkap *</label><input class="modal-input" name="name" required></div><div class="form-field"><label>Email *</label><input class="modal-input" name="email" type="email" required></div><div class="form-field"><label>Peran</label><select class="modal-input" name="role"><option>Creative Designer</option><option>Support Marketing</option><option>Tim Konten</option><option>Guest</option></select></div></div>'],
  metrics: ['Isi data bulanan', 'Perbarui metrik utama untuk analisis performa.', '<div class="form-stack"><div class="two-fields"><div class="form-field"><label>Followers</label><input class="modal-input" placeholder="128400"></div><div class="form-field"><label>Reach</label><input class="modal-input" placeholder="1240000"></div></div><div class="two-fields"><div class="form-field"><label>Impressions</label><input class="modal-input" placeholder="2800000"></div><div class="form-field"><label>Engagement (%)</label><input class="modal-input" placeholder="4.2"></div></div><div class="form-field"><label>Leads</label><input class="modal-input" placeholder="438"></div></div>']
};

function openModal(type) {
  const config = modalBody[type]; if (!config) return;
  $('#modal-root').innerHTML = '<div class="modal-backdrop" data-action="close-modal"><section class="modal"><div class="modal-head"><div><h2>' + config[0] + '</h2><p>' + config[1] + '</p></div><button class="icon-button modal-close" data-action="close-modal" aria-label="Tutup"><span data-icon="close"></span></button></div><form id="modal-form" data-modal-type="' + type + '">' + config[2] + '<div class="modal-actions"><button type="button" class="button button-ghost" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">Simpan perubahan</button></div></form></section></div>';
  hydrateIcons();
  applyTheme();
  $('.modal').addEventListener('click', (e) => { if (!e.target.closest('[data-action]')) e.stopPropagation(); });
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function submitModal(form) {
  const type = form.dataset.modalType; const values = Object.fromEntries(new FormData(form).entries());
  if (type === 'task') { if (!values.title || !values.due) return toast('Judul dan deadline wajib diisi.'); state.data.tasks.push({ id: Date.now(), title: values.title, brand: values.brand, pic: values.pic, due: values.due, priority: values.priority, status: 'Backlog', campaign: 1 }); toast('Tugas baru berhasil ditambahkan.'); }
  if (type === 'campaign') { if (!values.name || !values.objective || !values.kpi) return toast('Nama, tujuan, dan target KPI wajib diisi.'); state.data.campaigns.unshift({ id: Date.now(), name: values.name, brand: values.brand, pic: values.pic, period: '20 Agu — 30 Sep 2026', status: 'Rencana', progress: 0, budget: Number(values.budget) || 0, spent: 0, kpi: values.kpi, tasks: 0, content: 0 }); toast('Campaign baru dibuat sebagai Rencana.'); }
  if (type === 'content') { if (!values.title || !values.date) return toast('Judul dan tanggal tayang wajib diisi.'); state.data.content.push({ id: Date.now(), title: values.title, date: Number(values.date.slice(-2)), status: 'Draf', brand: values.brand }); toast('Konten masuk ke kalender sebagai Draf.'); }
  if (type === 'request') { if (!values.sender || !values.title) return toast('Pengirim dan isi request wajib diisi.'); state.data.requests.unshift({ id: Date.now(), title: values.title, sender: values.sender, date: '11 Agu 2026', brand: values.brand, priority: values.priority, status: 'Baru', icon: '✦' }); toast('Request baru berhasil dicatat.'); }
  if (type === 'influencer') { if (!values.name) return toast('Nama influencer wajib diisi.'); state.data.influencers.push({ name: values.name, platform: values.platform, niche: values.niche || 'Belum diisi', rate: Number(values.rate) || 0, followers: values.followers || '—', engagement: '—', status: 'Review' }); toast('Influencer berhasil ditambahkan.'); }
  if (type === 'transaction') { if (!values.vendor || !values.amount) return toast('Vendor dan jumlah wajib diisi.'); state.data.transactions.unshift({ category: values.category, vendor: values.vendor, date: '11 Agu 2026', amount: Number(values.amount), type: values.type, status: 'Belum Dibayar', brand: values.brand }); toast('Transaksi berhasil dicatat.'); }
  if (type === 'user') { if (!values.name || !values.email) return toast('Nama dan email wajib diisi.'); state.data.users.push({ name: values.name, email: values.email, role: values.role, status: 'Aktif' }); toast('Pengguna baru berhasil ditambahkan.'); }
  if (type === 'password') toast('Kata sandi berhasil diganti.');
  if (type === 'profile') toast('Profil berhasil diperbarui.');
  if (type === 'metrics') toast('Data performa bulanan berhasil disimpan.');
  save(); closeModal(); render();
}

function loginScreen() {
  $('#app-shell').classList.add('hidden'); const screen = $('#login-screen'); screen.classList.remove('hidden'); screen.style.display = 'grid';
  screen.innerHTML = '<div class="card login-card"><div class="brand-mark">N</div><h1>Selamat datang di Ngapaya</h1><p>Satu ruang kerja untuk semua kegiatan marketing HBI.<br>Masuk untuk melanjutkan pekerjaanmu.</p><form id="login-form" class="form-stack"><div class="form-field"><label>Email</label><input class="input" type="email" required value="andi@hbi.co.id"></div><div class="form-field"><label>Kata sandi</label><input class="input" type="password" required value="ngapaya123"></div><button class="button button-primary" type="submit">Masuk ke workspace ↗</button></form><div class="demo-hint">Mode demo · gunakan email dan kata sandi apa saja untuk masuk</div></div>';
  $('#login-form').addEventListener('submit', (e) => { e.preventDefault(); screen.classList.add('hidden'); $('#app-shell').classList.remove('hidden'); render(); toast('Selamat datang kembali, Andi.'); });
}

document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]'); if (view) { state.view = view.dataset.view; $('#sidebar').classList.remove('open'); render(); return; }
  const modal = e.target.closest('[data-modal]'); if (modal) { openModal(modal.dataset.modal); return; }
  const tab = e.target.closest('[data-partner-tab]'); if (tab) { state.partnerTab = tab.dataset.partnerTab; render(); return; }
  const action = e.target.closest('[data-action]'); if (!action) return;
  if (action.dataset.action === 'open-sidebar') $('#sidebar').classList.add('open');
  if (action.dataset.action === 'close-sidebar') $('#sidebar').classList.remove('open');
  if (action.dataset.action === 'close-modal') closeModal();
  if (action.dataset.action === 'notifications') toast('Ada 3 item yang perlu perhatian.');
  if (action.dataset.action === 'toggle-theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('ngapaya-theme', state.theme); applyTheme(); toast(state.theme === 'dark' ? 'Mode gelap aktif.' : 'Mode terang aktif.'); }
  if (action.dataset.action === 'logout') loginScreen();
  if (action.dataset.action === 'campaign-detail') toast('Detail campaign siap dibuka — mock data aktif.');
  if (action.dataset.action === 'request-detail') toast('Detail request dan riwayat tindak lanjut siap dibuka.');
  if (action.dataset.action === 'task-menu') toast('Gunakan dropdown status untuk memindahkan tugas.');
  if (action.dataset.action === 'reset-task-filters') { state.taskFilter = { brand: 'Semua', pic: 'Semua', priority: 'Semua' }; render(); }
  if (action.dataset.action === 'make-task') { state.data.tasks.push({ id: Date.now(), title: action.dataset.title, brand: 'HBI', pic: 'Andi Saputra', due: '20 Agu', priority: 'Sedang', status: 'To Do', campaign: null }); save(); toast('Rekomendasi berhasil diubah menjadi tugas.'); render(); }
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-task-filter]')) { state.taskFilter[e.target.dataset.taskFilter] = e.target.value; render(); } if (e.target.matches('[data-task-status]')) { const task = state.data.tasks.find((x) => x.id === Number(e.target.dataset.taskStatus)); if (task) { task.status = e.target.value; save(); render(); toast('Status tugas dipindahkan ke ' + task.status + '.'); } } });
document.addEventListener('submit', (e) => { if (e.target.id === 'suggestion-form') { e.preventDefault(); e.target.reset(); toast('Terima kasih, saran kamu sudah dikirim.'); } if (e.target.id === 'modal-form') { e.preventDefault(); submitModal(e.target); } });

load();
render();

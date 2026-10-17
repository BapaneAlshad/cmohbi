# Audit Dashboard Super Admin / CMO — Ngapaya Marketing OS

Tanggal audit: 17 Oktober 2026  
Lingkungan: Production (`https://marketinghbi.vercel.app`)  
Mode data: Supabase  
Repo: `cmohbi` / `marketinghbi`

## Ringkasan eksekutif

Ngapaya Marketing OS sudah memiliki fondasi antarmuka yang baik dan cakupan modul yang relevan untuk tim marketing: campaign, task, kalender konten, request, influencer, keuangan, analitik sosial, Social Hub, serta pengelolaan pengguna.

Namun, aplikasi belum siap dijadikan sumber data operasional utama bagi CMO. Risiko terbesar bukan pada tampilan, melainkan pada integritas penyimpanan data, pembatasan akses, dan informasi dashboard yang masih statis. Sejumlah tindakan terlihat berhasil pada UI tetapi belum tersimpan permanen ke Supabase. Selain itu, user biasa berpotensi memperoleh kewenangan yang terlalu luas, termasuk mengelola data dan menjalankan publikasi sosial.

Prioritas utama adalah membenahi persistence, assignment, RBAC/RLS, dan keamanan proses publish sebelum menambah fitur baru.

## Ruang lingkup audit

Audit dilakukan melalui:

- Penelusuran langsung seluruh halaman production sebagai Demo Super Admin.
- Pemeriksaan pengalaman pengguna pada Dashboard, Campaign, To-Do, Kalender Konten, Request & Ide, Mitra & Keuangan, Jadwal Influencer, Analitik Sosmed, Social Hub, serta Akun & Keamanan.
- Pemeriksaan source code frontend, API routes, integrasi Supabase, migrasi database, dan konektor sosial.
- TypeScript typecheck dan production build.

Audit tidak mengubah data production, konfigurasi, atau source code aplikasi.

## Kondisi yang sudah baik

- Navigasi dan visual aplikasi konsisten serta mudah dipahami.
- Modul utama sudah mencerminkan alur kerja tim marketing.
- Login username + PIN sudah terhubung ke Supabase Auth.
- Workspace dan akun Demo Super Admin berhasil dimuat dari Supabase.
- Campaign, task, influencer schedule, dan Social Hub sudah mempunyai struktur awal untuk data live.
- Credential provider sosial disimpan di server, bukan ditampilkan ke browser.
- TypeScript typecheck berhasil.
- Production build Next.js berhasil tanpa error.

## Temuan prioritas

| Prioritas | Temuan | Dampak bisnis |
| --- | --- | --- |
| P0 | Persistence sejumlah modul belum lengkap | Data request, master influencer, dan transaksi dapat hilang setelah refresh atau login ulang. |
| P0 | Owner dan assignee dapat tertimpa | Penanggung jawab campaign/task dapat berubah menjadi user yang terakhir melakukan penyimpanan. |
| P0 | Hak akses terlalu luas | Anggota biasa dapat memperoleh kemampuan mengubah data yang seharusnya dibatasi. |
| P0 | Publish sosial hanya memeriksa membership | User anggota workspace berpotensi memublikasikan konten tanpa role approval yang tepat. |
| P0 | Dashboard memuat informasi hard-coded | CMO berisiko mengambil keputusan berdasarkan tanggal, alert, approval, atau tren yang tidak berasal dari data aktual. |
| P1 | Konektor sosial belum dikonfigurasi | Analitik, sinkronisasi, inbox, dan publishing belum memberikan manfaat live. |
| P1 | Sejumlah tombol hanya kosmetik | Search, notification, export, dan bantuan belum menjalankan fungsi yang dijanjikan. |
| P1 | Dashboard CMO dan Super Admin belum dibedakan | Masing-masing peran tidak memperoleh informasi dan kontrol sesuai tanggung jawabnya. |

## Temuan teknis kritis

### 1. Data belum sepenuhnya persisten

Modul berikut masih terutama bekerja pada state frontend dan belum memiliki penyimpanan Supabase lengkap:

- Request & Ide.
- Master influencer/KOL.
- Transaksi keuangan.
- Konten yang dibuat dari modal Kalender Konten tertentu.

Akibatnya, toast “berhasil disimpan” belum selalu berarti data sudah tersimpan permanen. Setelah reload atau login ulang, data dapat kembali ke fallback/demo data.

Lokasi terkait:

- `components/app-shell.tsx`, fungsi `applyModal`.
- `lib/supabase/workspace-data.ts`, fungsi `saveWorkspaceData`.

### 2. Risiko perubahan owner dan PIC

Pada proses penyimpanan workspace:

- `campaigns.owner_id` diisi dengan ID user yang sedang login.
- `tasks.assignee_id` diisi dengan ID user yang sedang login.
- `tasks.created_by` juga diisi dengan ID user yang sedang login.

Dengan pola ini, perubahan kecil seperti memindahkan status task dapat menyebabkan ownership dan assignment record lain ikut tertimpa. PIC yang dipilih melalui form belum dipetakan dengan benar ke user ID Supabase.

Lokasi terkait:

- `lib/supabase/workspace-data.ts`, mulai dari fungsi `saveWorkspaceData`.

### 3. RBAC belum diterapkan end-to-end

Semua role masih mendapatkan struktur navigasi yang sama. Halaman profil juga menampilkan “Full access” tanpa menghitung membership role atau job title.

Pada tingkat database, sejumlah RLS policy menggunakan aturan “anggota workspace dapat mengelola” untuk seluruh operasi. Ini terlalu luas untuk aplikasi yang membedakan Super Admin, CMO, Content Creator, Designer, Finance, dan Guest.

Area terdampak:

- Campaign.
- Task.
- Influencer booking.
- Social post.
- Social inbox.
- Publishing sosial.

Lokasi terkait:

- `components/app-shell.tsx`, definisi navigasi.
- `components/views.tsx`, `AccountView`.
- `supabase/migrations/001_initial_schema.sql`.
- `supabase/migrations/002_influencer_bookings.sql`.
- `supabase/migrations/004_social_hub.sql`.
- `app/api/social/publish/route.ts`.

### 4. Informasi dashboard masih statis

Saat audit pada 17 Oktober 2026 ditemukan:

- Dashboard masih menampilkan 10 Oktober 2026.
- Agenda tanggal 12 dan 14 Oktober masih disebut agenda terdekat.
- Task dengan deadline Agustus 2026 tidak ditandai overdue.
- Jadwal influencer tanggal 11, 12, dan 16 Oktober masih menghasilkan label “jadwal mendatang” berdasarkan status, bukan tanggal.
- Dashboard menunjukkan 0 akun sosial tetapi tetap menampilkan “2 tersinkron hari ini”.
- “Butuh approval: 3 item” tidak berasal dari approval table.
- Analytics tetap memberi rekomendasi “Facebook tertinggal” meskipun semua metrik bernilai nol.
- Alert TikTok ditampilkan meskipun status credential sebenarnya belum dikonfigurasi.

Lokasi terkait:

- `components/views.tsx`, terutama `DashboardView`, `CalendarView`, `InfluencerScheduleView`, dan `AnalyticsView`.

### 5. Fungsi pencarian, notifikasi, bantuan, dan export belum nyata

- Search hanya menampilkan toast bahwa pencarian “siap digunakan”.
- Tombol notifikasi selalu menampilkan “Tidak ada notifikasi baru”.
- Export data influencer tidak mempunyai handler.
- Kartu bantuan belum membuka pusat bantuan atau dokumentasi.
- Angka badge sidebar bersifat statis, bukan dihitung dari data.

Lokasi terkait:

- `components/app-shell.tsx`.
- `components/views.tsx`.

### 6. Social Hub membutuhkan guardrail tambahan

Composer memilih Instagram, Facebook, Threads, dan TikTok secara default. Format default adalah feed/foto, sedangkan TikTok membutuhkan video. Konflik baru diketahui setelah form dikirim.

Perlu ditambahkan:

- Pemilihan platform yang mengikuti kompatibilitas format.
- Preview konten per platform.
- Caption, hashtag, dan CTA per platform.
- Workflow Draft → Review → Approved → Scheduled → Published/Failed.
- Pembatasan tombol publish berdasarkan role.
- Retry dan error history dari provider.
- Empty state serta petunjuk koneksi yang dapat ditindaklanjuti.
- Pencegahan rekomendasi otomatis saat data belum tersedia.

Lokasi terkait:

- `components/social-hub.tsx`.
- `app/api/social/publish/route.ts`.
- `app/api/social/sync/route.ts`.

## Evaluasi per modul

### Dashboard

Kondisi sekarang:

- Menampilkan ringkasan campaign, task, sosial media, approval, agenda, dan progres.
- Sebagian angka dan alert belum berasal dari data aktual.

Kebutuhan CMO:

- Filter periode dan brand.
- KPI target vs actual.
- Budget, realisasi, sisa, dan burn rate.
- Campaign off-track.
- Approval queue.
- Task overdue dan workload tim.
- Jadwal tujuh hari berikutnya.
- Top content dan channel performance.
- Daftar keputusan yang harus dilakukan hari ini.

### Campaign

Kondisi sekarang:

- Menampilkan kartu campaign, budget, spent, task, progres, dan KPI teks.
- Belum ada halaman detail atau histori.
- Jumlah konten belum terhubung ke campaign.

Perbaikan:

- Detail campaign end-to-end.
- Owner dan anggota campaign.
- Objective, KPI target, KPI actual, channel, deliverables, dan milestone.
- Budget per kategori dan transaksi terkait.
- Konten, task, influencer, dan report terhubung ke campaign.
- Post-campaign report serta lesson learned.

### To-Do

Kondisi sekarang:

- Kanban enam status tersedia.
- Filter brand, PIC, dan prioritas tersedia.
- Status dapat diubah.

Perbaikan:

- Assignment berdasarkan user ID yang benar.
- Label overdue, due soon, blocked, dan dependency.
- Detail task, komentar, attachment, checklist, dan activity history.
- WIP limit dan workload per anggota.
- Notifikasi deadline dan mention.
- Drag-and-drop yang benar-benar tersimpan.

### Kalender Konten

Kondisi sekarang:

- Kalender terpisah dari Kalender Tayang pada Social Hub.
- Bulan/tanggal sebagian masih statis.

Perbaikan:

- Satukan kalender perencanaan dan kalender publishing.
- Gunakan tanggal aktual serta navigasi bulan yang nyata.
- Filter brand, campaign, platform, owner, dan status approval.
- Tampilkan konflik jadwal dan gap frekuensi posting.
- Hubungkan event kalender dengan detail konten.

### Request & Ide

Kondisi sekarang:

- Dapat menampilkan dan membuat request pada frontend.
- Belum ada detail, assignment, diskusi, atau persistence lengkap.

Perbaikan:

- Simpan ke database.
- Requester, approver, PIC, due date, status, dan SLA.
- Lampiran dan komentar.
- Konversi request menjadi campaign, task, atau content brief.
- Approval/rejection dengan alasan.

### Mitra & Keuangan

Kondisi sekarang:

- Daftar KOL dan ringkasan transaksi tersedia.
- Data master dan transaksi belum persisten penuh.

Perbaikan:

- Master vendor/KOL permanen.
- Kontrak, invoice, bukti pembayaran, pajak, dan payment due date.
- Budget vs actual per campaign dan kategori.
- Approval pengeluaran.
- ROI influencer dan cost per result.
- Export CSV/XLSX yang benar-benar bekerja.

### Jadwal Influencer

Kondisi sekarang:

- Rate, spent, status kerja sama, pembayaran, dan campaign sudah ditampilkan.
- “Jadwal mendatang” dihitung berdasarkan status, bukan tanggal.

Perbaikan:

- Upcoming/overdue berdasarkan timestamp.
- Deliverable checklist dan link hasil posting.
- Reminder H-3/H-1.
- Insight hasil konten dan ROI.
- Status kontrak serta pembayaran yang terhubung ke Finance.

### Analitik Sosial Media

Kondisi sekarang:

- Mendukung Instagram, Facebook, Threads, dan TikTok.
- Kartu metrik dan grafik tersedia.
- Data live masih nol karena credential belum tersedia.
- Rekomendasi masih statis.

Perbaikan:

- Date range dan perbandingan periode.
- Filter platform, akun, campaign, dan format.
- Growth follower, reach, impressions, engagement, views, CTR, dan conversion jika tersedia.
- Top/bottom content berdasarkan metrik pilihan.
- Rekomendasi hanya jika sample data mencukupi.
- Tampilkan freshness data dan sync error secara jelas.

### Social Hub

Kondisi sekarang:

- Composer, kalender tayang, inbox, dan status koneksi tersedia.
- Seluruh konektor masih “Belum siap”.
- Inbox dan calendar belum memiliki data live.

Perbaikan:

- Selesaikan credential Instagram, Facebook, Threads, dan TikTok.
- Tambahkan approval sebelum publish.
- Platform-specific validation dan preview.
- Retry, error log, provider post ID, dan link ke post live.
- Sinkronisasi berkala yang dapat dipantau.
- Unified inbox dengan assignment, SLA, reply, dan template respons.

### Akun & Keamanan

Kondisi sekarang:

- Profil, tambah user, reset PIN, dan ganti PIN tersedia.
- Hanya satu Demo Super Admin terdaftar saat audit.
- Semua role masih mendapat presentasi “Full access”.

Perbaikan:

- Pisahkan membership role dan job title.
- Role capability matrix.
- Invite/activate/deactivate user.
- Session management dan forced logout bila diperlukan.
- Audit log keamanan.
- Jangan tampilkan tombol admin kepada role yang tidak berhak.

## Role yang direkomendasikan

| Role | Hak utama |
| --- | --- |
| Super Admin | Konfigurasi workspace, user, role, credential, dan seluruh data. |
| CMO | Dashboard eksekutif, budget, approval, laporan, dan final publish approval. |
| Content Creator | Membuat draft, kalender, dan menangani inbox; tidak publish tanpa approval. |
| Creative Designer | Melihat brief, mengelola aset, task, dan revisi yang ditugaskan. |
| Support Marketing | Operasional campaign dan task sesuai assignment. |
| Finance | Transaksi, invoice, pembayaran, budget, dan laporan biaya. |
| Guest | Read-only untuk data yang secara eksplisit dibagikan. |

Hak akses harus diterapkan konsisten pada empat lapisan:

1. Navigasi dan tombol UI.
2. API route.
3. Supabase RLS/RPC.
4. Audit log.

## Roadmap implementasi

### Fase 1 — Integritas dan keamanan data

- Buat tabel requests, influencers, transactions, approvals, comments, attachments, dan audit logs.
- Ganti auto-save seluruh state menjadi CRUD per-record.
- Perbaiki mapping owner/PIC/assignee ke user ID.
- Terapkan role capability matrix.
- Perketat RLS dan endpoint publish.
- Buat migration dan regression test untuk setiap rule.

### Fase 2 — Command center CMO

- Hilangkan seluruh nilai hard-coded dari dashboard.
- Buat period/brand filter.
- Tampilkan KPI, budget burn, overdue, approval queue, dan workload.
- Implementasikan notifikasi dan global search.
- Buat approval workflow campaign, content, dan expense.

### Fase 3 — Social Hub production-ready

- Tambahkan credential provider resmi.
- Simpan status koneksi, expiry, last sync, dan error.
- Implementasikan draft/review/approve/schedule/publish lifecycle.
- Tambahkan preview, validation, retry, dan provider result tracking.
- Aktifkan inbox dan analytics live.

### Fase 4 — Reporting dan adopsi tim

- Campaign report serta ROI influencer.
- Finance reporting dan export.
- Dashboard personal per anggota.
- Mobile usability dan empty state.
- Onboarding, dokumentasi, serta pusat bantuan.

## Definition of Done yang disarankan

Fase pertama dianggap selesai jika:

- Data yang dibuat tetap ada setelah refresh dan login ulang.
- PIC/owner tidak berubah ketika user lain memperbarui record.
- Guest tidak dapat mengubah atau publish apa pun.
- Content Creator tidak dapat publish tanpa approval CMO.
- Finance tidak dapat mengubah credential sosial.
- Semua informasi dashboard berasal dari query aktual.
- Tidak ada alert atau rekomendasi yang muncul ketika data tidak tersedia.
- Setiap perubahan penting tercatat pada audit log.
- Typecheck, build, RLS test, dan integration test lulus.

## Hasil verifikasi teknis

Pada saat audit:

```text
pnpm typecheck  -> berhasil
pnpm build      -> berhasil
git status      -> bersih
```

Build menggunakan Next.js 16.4.0 dan menghasilkan route aplikasi serta seluruh API route tanpa error kompilasi.

## Rekomendasi keputusan

Jangan menambah banyak fitur baru sebelum Fase 1 selesai. Nilai terbesar bagi CMO dalam jangka pendek bukan penambahan layar, tetapi memastikan bahwa:

- data tidak hilang,
- ownership tidak berubah secara tidak sengaja,
- hanya role berwenang yang dapat mengubah atau publish,
- dan dashboard benar-benar merepresentasikan kondisi marketing saat ini.

Setelah empat fondasi tersebut stabil, aplikasi dapat dikembangkan menjadi command center CMO yang berguna untuk mengambil keputusan harian dan mengoordinasikan tim marketing.

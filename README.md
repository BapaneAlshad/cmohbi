# Ngapaya — Marketing OS

Ngapaya adalah dashboard manajemen tim marketing dan analitik sosial media untuk HBI. Aplikasi menggunakan Modern Minimalist SaaS UI dengan subtle Soft UI, mobile drawer, dark mode, dan komponen yang modular.

## Stack

- Next.js 16 App Router, React 19, dan TypeScript strict.
- Lucide React untuk sistem ikon yang konsisten.
- Recharts untuk visualisasi analytics.
- dnd-kit tersedia sebagai fondasi interaksi Kanban lanjutan.
- Supabase Auth/PostgreSQL/Realtime/RLS sebagai backend produksi.
- Repository demo berbasis localStorage sebagai fallback ketika Supabase belum dikonfigurasi.

## Modul

- Dashboard ringkasan campaign, pekerjaan tim, approval, dan KPI sosial.
- Campaign dan Kanban To-Do dengan filter dan perubahan status.
- Kalender konten Instagram, Facebook, dan TikTok.
- Request & Ide, influencer/KOL, dan keuangan.
- Jadwal kerja sama influencer/selebgram dengan rate, spent/realisasi, status kerja sama, dan pembayaran.
- Analitik lintas platform, perbandingan reach, konten terbaik, rekomendasi tindakan, input manual, dan tombol sinkronisasi.
- Akun, pengguna, dark mode, responsive sidebar/drawer, dan Supabase Auth.

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:4173`. Server memakai `0.0.0.0`, sehingga dapat dibuka dari HP pada jaringan yang sama menggunakan alamat IPv4 komputer, misalnya `http://192.168.0.108:4173`.

Pemeriksaan produksi:

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

## Mode data

Tanpa environment variable, aplikasi berjalan dalam **mode demo lokal**. Data perubahan tersimpan di browser dan bisa di-reset melalui modal input data sosial.

Untuk mode produksi, salin `.env.example` menjadi `.env.local`, isi kredensial Supabase, kemudian jalankan migrasi:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_influencer_bookings.sql
```

Skema menyediakan profiles, workspaces, membership/roles, campaigns, tasks, social accounts, metric snapshots, dan social posts. Row Level Security aktif pada seluruh tabel utama.

Di production, buka halaman **Buat akun** untuk mendaftarkan pengguna pertama. Setelah email dikonfirmasi (jika konfirmasi email aktif di Supabase), login akan otomatis membuat workspace HBI, profil pemilik, serta data campaign/task awal. Perubahan campaign, task, dan jadwal influencer berikutnya tersinkron ke Supabase; modul lain masih memakai data demo sampai tabelnya diaktifkan pada fase berikutnya.

## Konektor sosial

Fokus platform saat ini:

- Instagram melalui Meta Graph API.
- Facebook Page melalui Meta Graph API.
- TikTok melalui TikTok Business API.

Credential hanya dibaca oleh server melalui environment Vercel. Browser tidak menerima access token. `GET /api/social/status` memeriksa kesiapan konektor dan `POST /api/social/sync` menjadi pintu masuk antrean sinkronisasi. Pada mode demo endpoint tersebut tetap dapat digunakan tanpa credential.

Worker/cron produksi dapat mengambil data dari provider, menyimpan snapshot ke Supabase, lalu memperbarui `last_sync_at`. Kolom `token_reference` pada database hanya menyimpan referensi secret—bukan raw access token.

## Deployment Vercel

Repository terdeteksi sebagai Next.js melalui `vercel.json`. Tambahkan environment variable dari `.env.example` pada Project Settings Vercel sebelum mengaktifkan konektor live.

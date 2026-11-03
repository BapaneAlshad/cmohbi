# Ngapaya — Marketing OS

Ngapaya adalah dashboard manajemen tim marketing dan analitik sosial media untuk HBI. Aplikasi menggunakan Modern Minimalist SaaS UI dengan subtle Soft UI, mobile drawer, dark mode, dan komponen yang modular.

## Stack

- Next.js 16 App Router, React 19, dan TypeScript strict.
- Lucide React untuk sistem ikon yang konsisten.
- Recharts untuk visualisasi analytics.
- dnd-kit tersedia sebagai fondasi interaksi Kanban lanjutan.
- Supabase Auth/PostgreSQL/Realtime/RLS sebagai backend produksi.
- Mode demo berbasis localStorage hanya untuk development tanpa konfigurasi Supabase.

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
npm test
npm run build
npm audit --omit=dev
```

## Mode data

Pada development tanpa environment Supabase, aplikasi menyediakan **mode demo lokal**. Production tidak mengaktifkan demo dan akan menampilkan konfigurasi belum siap jika environment tidak lengkap.

Akun demo lokal memiliki akses penuh ke seluruh modul: username `demo.superadmin` dan PIN `123456`. Kredensial ini hanya identitas demo di browser; tidak dipakai untuk membuat akun Supabase atau mengakses provider sosial.

Untuk mode live, salin `.env.example` menjadi `.env.local`, isi URL serta key dari project Supabase yang sama, lalu terapkan **seluruh migrasi** dalam `supabase/migrations` sesuai urutan nama setelah review dan persetujuan production. Jangan menjalankan hanya lima migrasi awal: Campaign/To-Do terbaru memerlukan schema lanjutan.

Jalankan `npm run supabase:check` untuk memeriksa Auth API, schema dan akun awal tanpa menampilkan key. Panduan lengkap cookie/session SSR, endpoint `/api/auth/session`, target database dan provisioning tersedia di [integrasi Supabase](docs/supabase-integration.md).

Skema menyediakan profiles, workspaces, membership/roles, campaigns, tasks, social accounts, metric snapshots, dan social posts. Row Level Security aktif pada seluruh tabel utama.

Production menggunakan profil dan membership yang sudah terdaftar. Bootstrap tidak membuat data contoh atau workspace secara otomatis; pendaftaran mandiri dinonaktifkan. Super Admin membuat anggota melalui Manajemen User. Ikuti [persiapan production](docs/production-readiness.md) untuk migrasi penyimpanan Campaign, konfigurasi sesi dan pemeriksaan sebelum rilis.

### Login username & PIN

Login aplikasi menggunakan **username dan PIN 6 angka**. Email dan nomor WhatsApp tetap disimpan sebagai informasi kontak pada profil, bukan sebagai identifier login. PIN dikelola oleh Supabase Auth dan tidak disimpan di tabel `profiles`.

Jalankan migration `supabase/migrations/003_username_pin_auth.sql` setelah dua migration sebelumnya. Jika pengguna lupa PIN, Super Admin atau CMO dapat meresetnya dari halaman **Akun & keamanan**; tidak ada alur reset PIN mandiri melalui email.
Owner/admin dapat menambahkan anggota live dari halaman **Akun & keamanan** dengan role `Content Creator` atau `Tim Konten`; anggota dibuat sebagai workspace member dan dapat memakai Social Hub.

## Konektor sosial

Platform yang didukung:

- Instagram melalui Meta Graph API.
- Facebook Page melalui Meta Graph API.
- Threads melalui Threads API.
- TikTok melalui TikTok Business API.

Credential hanya dibaca oleh server melalui environment Vercel. Browser tidak menerima access token. `GET /api/social/status` memeriksa kesiapan konektor dan `POST /api/social/sync` menjadi pintu masuk antrean sinkronisasi. Pada mode demo endpoint tersebut tetap dapat digunakan tanpa credential.

Worker/cron produksi dapat mengambil data dari provider, menyimpan snapshot ke Supabase, mengambil halaman berikutnya untuk komentar/postingan, mengambil percakapan Meta, lalu memperbarui `last_sync_at`. Endpoint sync dan publish live memerlukan sesi Supabase; cron publish memakai `CRON_SECRET`. Kolom `token_reference` pada database hanya menyimpan referensi secret—bukan raw access token.

## Deployment Vercel

Repository terdeteksi sebagai Next.js melalui `vercel.json`. Tambahkan environment variable dari `.env.example` pada Project Settings Vercel sebelum mengaktifkan konektor live.

## Social Hub

Social Hub menyediakan composer lintas platform, upload media ke Supabase Storage, kalender date view yang dapat berpindah bulan, unified inbox komentar/pesan, sinkronisasi analytics provider, dan halaman koneksi untuk Instagram, Facebook, Threads, dan TikTok. Mode demo memakai `lib/demo-data.ts`; mode live memakai tabel pada `supabase/migrations/004_social_hub.sql` dan bucket pada `supabase/migrations/005_social_media_storage.sql`.

Riset repositori open-source menemukan BrightBean Studio sebagai referensi paling dekat karena mencakup composer, kalender, inbox, RBAC, dan analytics. Postmill juga mencakup publishing lintas platform dan kalender. Keduanya berlisensi AGPL, sehingga kode AGPL tidak disalin ke project ini; Social Hub memakai implementasi native Next.js/Supabase dan API resmi provider.

Untuk publishing live, isi credential server pada `.env.example`. Instagram/Facebook menggunakan Meta Graph API, Threads menggunakan Threads API, dan TikTok menggunakan Content Posting API. TikTok dapat memakai token terpisah melalui `TIKTOK_PUBLISH_ACCESS_TOKEN` dan `TIKTOK_BUSINESS_ACCESS_TOKEN`; jika tidak diisi, keduanya fallback ke `TIKTOK_ACCESS_TOKEN`. TikTok Direct Post mensyaratkan approval scope provider dan URL media publik yang sudah diverifikasi; aplikasi TikTok yang belum diaudit dapat membatasi posting menjadi private. Komentar/DM juga mengikuti kapabilitas dan permission resmi tiap platform.

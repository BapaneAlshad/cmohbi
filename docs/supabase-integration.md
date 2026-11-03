# Integrasi Database dan Auth Session

Target yang dipilih: project **cmohbi**, `htoregsddeiabfeefnhy`, diperiksa 3 November 2026. Project aktif dan koneksi Auth dapat dijangkau. Pemeriksaan awal database menunjukkan 0 tabel public dan 0 akun Auth. `.env.local` memuat publishable key dan secret server dari project yang sama, disimpan lokal dan diabaikan Git. Jangan menyalin nilai key ke dokumentasi, chat atau repository.

## Alur sesi

- Login username/PIN existing tetap memakai Supabase Auth melalui `@supabase/ssr`. Cookie dipakai bersama oleh browser dan server, memakai SameSite Lax dan Secure pada HTTPS.
- `proxy.ts` memperbarui cookie di request dan response sebelum halaman `/` dirender. Client Supabase baru dibuat setiap request, tidak dibagi antar pengguna. Static asset, cron dan webhook tidak menjalankan refresh ini.
- `/api/auth/session` memverifikasi akun melalui Auth `getUser()`, lalu membaca profil, membership dan kesiapan schema menggunakan token pengguna dan RLS. Response tidak memuat access token, refresh token atau secret. Semua response, termasuk error, memakai `private, no-store`.
- `/api/bootstrap` mempertahankan kontrak POST/Bearer lama dan juga mendukung cookie. Login tidak memerlukan service-role/secret. Operasi Manajemen User tetap membutuhkan secret hanya di server.
- Tidak ada signup publik, pembuatan workspace otomatis, peningkatan role dari metadata, maupun fallback demo saat koneksi live gagal.
- Halaman utama memakai rendering dinamis; cookie/session tidak masuk cache bersama pengguna lain. Browser tetap menangani auth events, refresh token dan logout yang sudah ada.

## Database kosong

Seluruh file `supabase/migrations/*.sql` diperlukan dalam urutan nama sebelum aplikasi dapat dipakai. Tidak ada seed data bisnis. Migrasi `011_brands.sql` diperbaiki agar backfill Brand tugas tidak merujuk alias target UPDATE dari JOIN yang tidak valid; perbaikannya diperlukan saat memasang schema dari kosong dan tidak menjalankan ulang migrasi yang sudah tercatat.

Migrasi ke main production memerlukan persetujuan terpisah sesuai instruksi project sebelumnya. Sebelum eksekusi, review daftar migrasi, konfirmasi project ref, periksa kondisi kosong/backup dan jalankan dry-run. Jangan gunakan `db reset` atau menambahkan seed untuk memperbaiki koneksi. Sesudahnya, provisikan profil + workspace + membership owner bagi satu Super Admin melalui jalur administratif terkontrol. Jangan memakai kredensial demo atau membuat akun otomatis dari halaman login.

Script satu kali `scripts/provision-super-admin.mjs` memerlukan `--apply --project-ref=<ref>` dan menolak target yang sudah mempunyai akun/profil/workspace. Username/nama dapat diisi lewat `--username` dan `--name`; PIN acak disimpan ke `.ngapaya-super-admin.local.json` yang diabaikan Git. Script tidak menghapus akun existing atau dijalankan otomatis. Jika provisioning parsial, periksa hasil sebelum melanjutkan; jangan membuat akun duplikat.

## Verifikasi

`npm run supabase:check` memeriksa URL/key, Auth API, kolom/schema/RPC yang diperlukan serta keberadaan Super Admin. Perintah hanya membaca dan tidak mencetak key atau data pribadi. Jika schema belum terpasang, proses keluar dengan error yang menjelaskan bagian yang belum siap.

`npm test` mencakup seluruh migrasi pada database PGlite terisolasi, RLS, cookie refresh dengan SDK Supabase asli melawan API simulasi, penolakan sesi yang dicabut, Bearer token terpisah antar request dan penolakan public key bertipe secret. Pengujian lokal tidak menggantikan uji login nyata setelah schema dan akun tersedia.

Verifikasi kode: 73 tes, typecheck dan build lulus; audit dependency production 0 kerentanan. Endpoint Next.js menolak sesi kosong/invalid dengan HTTP 401 dan header no-store. Bundle browser production diperiksa dan tidak mengandung secret server. Dry-run mengonfirmasi 30 migrasi tanpa seed. Pengguna telah menyetujui penerapan 30 migrasi tersebut pada 3 November 2026.

Hasil setelah penerapan: 30 migrasi tercatat di project target, seluruh tabel public mengaktifkan RLS, Campaign/tugas/booking tetap 0 dan belum ada akun Auth sebelum provisioning. Pemeriksa koneksi menyatakan Auth dan schema siap. Advisor security masih memberi 2 peringatan untuk helper `is_workspace_member` dan `is_workspace_manager` yang memang dipanggil RLS sebagai SECURITY DEFINER. Kedua fungsi hanya membaca membership pengguna `auth.uid()`, tidak menerima ID pelaku bebas dan mengembalikan boolean. Role authenticated tidak memiliki izin CREATE di schema public. Temuan ditinjau dan fungsi tidak diubah sembarangan agar kebijakan RLS tetap bekerja; referensi [advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Provisioning akhir: nama **Anggit**, username **anggit**, satu akun Auth dan satu membership owner/Super Admin. PIN acak disimpan hanya di file lokal yang diabaikan Git. Campaign, tugas, brand, booking influencer dan transaksi tetap kosong. `npm run supabase:check` lulus untuk Auth, schema dan Super Admin.

Uji browser terhadap Supabase nyata lulus: login memakai username/PIN, endpoint cookie mengembalikan identitas dan workspace yang benar melalui RLS, sesi bertahan setelah reload, cookie kedaluwarsa diperbarui server, serta logout menghasilkan HTTP 401 langsung dan tetap keluar setelah reload. Pengujian ini menemukan race pada logout; aplikasi kini menunggu penghapusan cookie Supabase sebelum menampilkan form login. Typecheck dan 73 tes tetap lulus sesudah perbaikan.

Vercel CLI saat pemeriksaan login sebagai `anggit311-2071`. Tautan `.vercel/project.json` existing tidak dapat diakses oleh akun tersebut. Jangan mengganti tautan atau menulis environment deployment sebelum project Vercel target dikonfirmasi. Perubahan integrasi ini tidak melakukan push atau deploy.

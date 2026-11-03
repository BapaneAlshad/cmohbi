# Campaign dan To-Do: persiapan production

## Stack

Next.js 16.4.4, React, TypeScript, Supabase Auth/Postgres/RLS dan RPC dipertahankan. Browser memakai publishable key; operasi administratif memverifikasi token melalui `getUser()` di server. Kredensial secret/service-role tetap hanya di server. Pengujian database menggunakan PGlite; smoke test browser memakai Playwright tanpa dependency production tambahan.

## Migrasi dan koneksi

Migrasi baru: `supabase/migrations/20261103043508_campaign_production_persistence.sql`. Memerlukan seluruh migrasi Campaign/To-Do, termasuk timeline, brands dan `20261031150000_campaign_dashboard_notes.sql`. Jangan menjalankan file ini sendirian pada database kosong. Setelah persetujuan terpisah pengguna, seluruh 30 migrasi diterapkan tanpa seed pada project `cmohbi` (`htoregsddeiabfeefnhy`); lihat status terbaru di [integrasi Supabase](supabase-integration.md).

Migrasi menambah `campaigns.row_version`, `content_config`, trigger versi, RPC `save_campaign_record` dan penanda kesiapan `campaign_schema_version()`. Tidak menghapus data historis, kolom PIC, atau relasi existing. RPC memverifikasi Super Admin dari membership, mengunci record, memeriksa versi, menyimpan info/Brief/Promo/anggota secara atomik, dan menjaga pemetaan tugas ke fase. Campaign arsip/trashed tidak dapat diedit. Perubahan brand ditolak jika sudah memiliki tugas.

Isi `NEXT_PUBLIC_SUPABASE_URL`, publishable/anon key, serta `SUPABASE_SECRET_KEY` atau service-role key pada environment server. Jika `SUPABASE_URL` juga diisi, URL tersebut harus menunjuk project yang sama dengan URL publik. Jangan menaruh secret dalam variabel `NEXT_PUBLIC_*`.

Bootstrap login sekarang **hanya membaca**: verifikasi token, profil, membership dan versi schema. Tidak membuat workspace, user, Campaign, tugas atau booking. Super Admin awal dan membership-nya harus sudah disiapkan melalui proses provisioning terkontrol. Anggota berikutnya dibuat dari Manajemen User; endpoint pendaftaran mandiri mengembalikan 403.

Pada audit awal environment lokal belum memiliki kredensial Supabase. Pembaruan integrasi berikutnya memakai project `cmohbi` (`htoregsddeiabfeefnhy`) yang dipilih pengguna; koneksi Auth sudah diverifikasi dan `.env.local` diisi secara aman. Lihat [status integrasi Supabase](supabase-integration.md) untuk hasil terbaru dan kesiapan provisioning.

Pemeriksaan Vercel production pada 3 November 2026 menemukan keempat nama variabel Supabase sudah terdaftar. Namun `NEXT_PUBLIC_SUPABASE_URL` menunjuk `https://mvexisjdurseopbdtbeh.supabase.co`, yang gagal resolve (`ENOTFOUND`); DNS publik Google juga mengembalikan NXDOMAIN (status 3). Domain Supabase lain berhasil resolve dari komputer yang sama. Konektor Supabase saat ini tidak memuat project tersebut. URL project Ngapaya yang aktif perlu dikonfirmasi sebelum memperbarui konfigurasi; jangan mengalihkan aplikasi ke project lain hanya karena project itu tersedia. Kedua secret Vercel terlindungi dan tidak dapat ditarik, sehingga kecocokan server/public environment belum dapat diuji. Tidak ada nilai environment production yang diubah. File environment sementara untuk pemeriksaan dihapus setelah digunakan.

## Penyimpanan dan sesi

Create/edit Campaign menunggu hasil RPC sebelum menyatakan berhasil. Draft tidak dibuang jika penyimpanan gagal. Konflik versi memuat record terbaru dan meminta pengguna menutup lalu membuka kembali form; perubahan lama tidak ditimpa otomatis. Autosave workspace tidak lagi menulis Campaign atau tugas. Brief/Promo masuk `content_config`, bukan state presentasi sementara.

Cookie/session browser Supabase tetap dipakai untuk pemulihan sesi dan refresh token. Logout membersihkan state, modal, antrean lokal dan notifikasi serta sign-out sesi perangkat saat ini. Respons lama ditolak dengan generation guard. Fokus window, koneksi kembali, dan refresh token memeriksa sesi/membership lagi. Gangguan koneksi menampilkan error; tidak beralih ke demo.

Login demo hanya tersedia pada development tanpa konfigurasi Supabase. Production tanpa environment menampilkan konfigurasi belum siap, bukan akun demo. Data modul yang gagal dimuat tidak diganti data contoh. Tidak ada penghapusan otomatis data contoh yang sudah telanjur tersimpan; audit dan pembersihan production memerlukan target yang terverifikasi.

## Filter PIC dan penerimaan

Super Admin dapat memfilter semua user memakai ID, termasuk tugas multi-PIC. Member/Viewer tetap hanya memiliki pilihan Semua dan Hanya saya. Filter tidak mengubah izin membaca Backlog atau izin mutasi tugas.

Jalankan typecheck, seluruh tes, build dan npm audit. PGlite menguji RPC/isolasi workspace/konflik/rollback/Brief/Promo; tes kontrak menguji bootstrap tanpa seed, schema hilang, membership kosong, konfigurasi salah dan filter PIC. Smoke test browser mencakup create tanpa tanggal, Brief/Promo setelah reload, pergantian akun, filter dan mobile. Sebelum rilis: uji akun Supabase asli pada dua perangkat, edit bersamaan, refresh token, logout, penolakan akses dan koneksi terputus; lalu backup database dan review migrasi.

Hasil verifikasi development 3 November 2026: typecheck, 70 tes dan build lulus; audit dependency production melaporkan 0 kerentanan. Browser memverifikasi mode lokal serta jalur Supabase SDK dengan API simulasi: pemulihan cookie, refresh token kedaluwarsa, bootstrap gagal, kegagalan simpan yang mempertahankan form, retry dan logout. Build production tanpa konfigurasi menolak login/demo dan pendaftaran mandiri. Pengujian simulasi ini tidak membuktikan konfigurasi akun, RLS dan koneksi project Supabase production yang sesungguhnya.

# Ngapaya — Marketing OS

Prototype frontend berdasarkan PRD HBI Marketing Dashboard dengan visual Modern Minimalist SaaS Dashboard dan subtle Soft UI.

## Design system

- Inter sebagai tipografi utama dengan hierarchy yang ringkas dan mudah dibaca.
- Surface putih, background netral, border tipis, radius 8–12px, dan shadow berlapis yang sangat halus.
- Tombol utama hitam, outline icon konsisten, badge status pastel, serta dark mode dengan depth yang rendah.
- Sidebar dapat diciutkan di desktop dan berubah menjadi drawer dengan backdrop di perangkat mobile.
- Grid, kartu, kalender, kanban, tabel, modal, dan form responsif di berbagai ukuran layar.

## Menjalankan

Buka index.html di browser, atau jalankan server tanpa dependency dengan perintah node preview-server.js. Untuk membuka dari HP satu jaringan, gunakan URL LAN yang dicetak server, misalnya http://192.168.0.108:4173.

## Cakupan prototype

- Dashboard: ringkasan hari ini, KPI sosial media, alert approval, progres campaign, dan agenda.
- Campaign: daftar campaign dan modal pembuatan campaign dengan target/KPI.
- To-Do: kanban 6 tahap, tambah task, filter gabungan brand/PIC/prioritas, dan update status.
- Kalender Konten: kalender jadwal konten, momen relevan, serta modal penjadwalan.
- Request & Ide: daftar request, modal request, dan Kotak Saran Marketing.
- Mitra & Keuangan: influencer/KOL, transaksi, rekap biaya, dan ringkasan bulanan.
- Analitik Sosmed: perbandingan metrik vs target, rekomendasi otomatis, dan konversi rekomendasi menjadi task.
- Akun & Keamanan: profil, user list, akses fitur, ganti sandi mock, dan logout/login demo.
- Toggle mode terang/gelap tersedia di topbar dan preferensinya tersimpan di browser.

Data demo disimpan di localStorage agar perubahan state tetap terlihat setelah reload. Integrasi Supabase, Auth, Storage, API route, dan migrasi database belum diaktifkan pada prototype ini.

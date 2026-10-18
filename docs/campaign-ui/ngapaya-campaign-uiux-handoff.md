# Ngapaya Marketing OS — Campaign Detail / Tab Workspace

## Tujuan
Satu Campaign Command Center untuk tim marketing HBI (Javacafe, RUMA, Machiro). Brief yang mudah dipahami oleh anggota tim, tugas dan fase terorganisasi, KPI dapat dipantau, pengeluaran terhubung ke keuangan, dan masukan terdokumentasi.

## Referensi visual
Lihat `ngapaya-campaign-tab-workspace.html` (prototipe interaktif) dan enam PNG per tab. Ikuti identitas visual Ngapaya yang sudah ada: sidebar putih, header putih, background #F7F8FA, kartu putih ber-border halus, tombol utama hitam, tipografi modern, whitespace terukur. Prototipe memakai konten campaign Reopening Machiro sebagai ilustrasi, bukan data produksi.

## Struktur halaman
Breadcrumb > Campaign title + brand + periode + owner + status > action utama > tab navigation:
1. Ringkasan: Big Message, KPI/progres, phase aktif, promo utama, tugas penting, anggota, aktivitas & konfirmasi baca.
2. Brief & Promo: tagline, big message, intro, langkah pengerjaan, referensi gambar/link, instruksi penting, aturan terstruktur untuk promo/voucher/challenge.
3. Timeline & Tugas: opsi campaign `phase_mode` (on/off). Dengan fase: setiap fase punya nama/periode/tujuan dan task. Tanpa fase: task langsung memiliki PIC dan deadline. Task sync ke To-Do.
4. Konten & Influencer: tema, platform/format, PIC/influencer, tujuan, poin wajib, CTA, jadwal upload, status, URL hasil; sync ke Kalender Konten/Jadwal Influencer.
5. Keuangan: pagu, realisasi, sisa, percent-used; sumber data pengeluaran dari modul Keuangan via campaign_id. Hindari tabel transaksi duplikat.
6. Diskusi: pesan append-only dengan author, timestamp, reply, pinned messages, mention, lampiran, acknowledgment brief, dan activity log.

## UX rules
- Prioritas informasi: "Apa pesan campaign?", "Apa tugas saya?", "Apa promo yang berlaku?", "Apa yang berubah?".
- Tampilkan hanya ringkasan pada tab Overview; detail di tab masing-masing.
- Untuk campaign kecil, fase tidak wajib; struktur task yang sama mendukung keduanya.
- Progress Task, KPI attainment, dan Budget usage harus terpisah dan jelas.
- Tugas/PIC, konten dan transaksi punya single source of truth, jangan input ganda.
- Miliki peran/izin: owner/admin edit brief, KPI, budget; semua anggota yang tergabung boleh komentar; perubahan promo penting terekam, ditandai dan bisa di-acknowledge.
- Status jangan hanya dibedakan lewat warna: gunakan teks & ikon.
- Gunakan empty/loading/error states, validasi form, autosave draft, akses keyboard, mobile tab horizontal, responsive cards.

## Acceptance checklist
- 6 tab berjalan baik pada desktop dan HP (360–430px).
- Task dapat dibuat, ditandai selesai dan dilihat per fase maupun semua tugas.
- Mode tanpa fase tersedia di konfigurasi campaign (bukan wajib di semua campaign).
- KPI custom menerima target/realisasi dan unit yang tepat, termasuk Rp, angka, persen.
- Promo terstruktur memuat periode, nominal, kuota, eligibility, mekanisme, syarat, status persetujuan.
- Konten/influencer memuat brief & CTA yang bisa dipahami tanpa chat manual.
- Budget progress dari catatan finansial yang berkaitan, bukan angka contoh atau duplikat.
- Chat mencatat author, timestamp, thread/reply, pin, activity log; access control diterapkan di server.
- Tidak menghapus fungsi atau data existing; migrasi skema backward compatible.

## Catatan implementasi
Prototipe HTML ini front-end demonstratif dengan data dummy dalam memori browser; tidak menyimpan data ke database. Lakukan audit codebase, routing, design system, komponen dan schema aplikasi existing sebelum mengimplementasikan. Pisahkan perubahan UI dari integrasi backend agar review lebih aman.

# Kartu Campaign dan tanggal fase

Kartu Campaign memakai warna utama brand sebanyak 8% dengan surface tema aktif. Warna dapat dipilih atau dikosongkan melalui Edit Brand. Tidak ada warna brand yang ditebak dari logo.

## Progres dan waktu

- Progres dihitung dari record tugas Campaign, bukan angka progres lama: Done / tugas non-Backlog. Status yang masih diajukan tidak dihitung sebelum disetujui.
- Pada mode fase, tiap segmen sama lebar dan terisi independen. Tugas tanpa fase tetap masuk total tanpa catatan tambahan di kartu. Nama fase diikuti jumlah selesai/total, misalnya `Peluncuran (1/4)`. Fase tanpa tugas menampilkan `(0/0)` dan track kosong.
- Warna fase disimpan bersama ID fase, sehingga tidak berubah saat tanggal diurutkan ulang. Tiga warna pertama hijau, biru, dan oranye.
- Penanda waktu memakai hari kalender Asia/Jakarta dan berada di tengah segmen fase yang sedang berlangsung, termasuk tanggal mulai/akhir. Sebelum periode dimulai penanda berada di tengah fase pertama; sesudah periode berakhir di tengah fase terakhir. Jeda memakai batas antarfase.
- Fase lama mempertahankan teks periode. Tanggal tidak ditebak; tombol Atur tanggal fase membuka Timeline & Tugas. Penanda muncul ketika semua tanggal lengkap.

## Penyimpanan dan validasi

Tab Timeline & Tugas memakai filter `Tugas saya` (default) dan `Semua`. Pada mode fase, keduanya selalu mengikuti fase yang dipilih; `Tugas saya` mencocokkan akun login dengan seluruh PIC tugas (termasuk multi-PIC dan identitas lama). Pada mode tanpa fase, filter berlaku untuk seluruh tugas Campaign. Tugas Done tetap dapat dilihat di Timeline. Judul pengantar, deskripsi header, label FASE TERPILIH, serta pemberitahuan mode fase dan tugas belum dikelompokkan tidak ditampilkan.

Migrasi tambahan: `supabase/migrations/20261030140000_brand_colors_and_phase_dates.sql`, setelah migrasi timeline dan overview sebelumnya. Migrasi belum dijalankan ke production.

- Menambahkan `brands.primary_color` nullable dengan validasi HEX enam digit.
- Menyimpan `startDate`, `endDate`, dan `color` pada JSON fase existing.
- Trigger memvalidasi tanggal inklusif, overlap, ID unik, warna dan batas Campaign. Mengubah periode Campaign juga melewati validasi ini.
- RPC `save_campaign_timeline` membatasi pengaturan fase ke owner/admin dan Campaign aktif. Perubahan fase mempertahankan `taskPhase` terbaru di database dan state aplikasi.
- Autosave umum tidak lagi menulis ulang konfigurasi fase existing. Edit fase disimpan secara eksplisit, menunggu hasil backend dan menampilkan kegagalan di modal.
- Fase tanpa tanggal yang sudah ada tetap dapat disimpan; fase baru membutuhkan dua tanggal. Tidak ada kolom/data historis yang dihapus.

## Verifikasi

`npm run typecheck`, `npm test`, `npm run build`. Tes database memakai PostgreSQL lokal dalam memori (PGlite), tanpa koneksi production. Tidak tersedia script lint pada project.

Tes meliputi isian independen, Backlog/pengajuan/unassigned, fase kosong, pergantian hari WIB, marker awal/akhir/jeda/satu hari, tanggal invalid/overlap/batas, warna stabil, periode legacy, izin owner/admin/member/viewer, dan relasi tugas yang tetap tersimpan.

Uji browser pada preview lokal terpisah mengonfirmasi create/edit fase, penolakan overlap dan batas Campaign, progres 50% lalu 100% secara independen, fase kosong, reload, warna brand, serta mobile 390px dan mode gelap. Timeline dapat digeser dengan keyboard atau gesture tanpa scrollbar visual dan tanpa overflow halaman. Menu desktop memakai sidebar 236px dengan tinggi item 36px; drawer mobile mempertahankan target sentuh 44px.

File implementasi terkait: `lib/types.ts`, `lib/campaign-timeline.ts`, `components/use-jakarta-today.ts`, `components/campaign/campaign-card-progress.tsx`, `components/campaign/campaign-primitives.tsx`, `components/campaign/campaign-workspace.tsx`, `components/views.tsx`, `components/app-shell.tsx`, `app/globals.css`, dan `lib/supabase/workspace-data.ts`. Pengujian tambahan di `tests/campaign-timeline.test.mts` dan `tests/campaign-timeline-db.test.mts`.

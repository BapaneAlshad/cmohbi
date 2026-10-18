# Campaign Tab Workspace — Masalah dan Implementasi yang Belum Selesai

Tanggal audit: 19 Oktober 2026  
Status: **UI siap direview di staging, belum siap untuk deployment produksi**

Dokumen ini mencatat pekerjaan yang belum selesai setelah redesign Campaign Tab Workspace dan pengujian manual/otomatis yang tersedia di project.

## Ringkasan status

| Area | Status | Keterangan |
| --- | --- | --- |
| UI enam tab | Selesai | Ringkasan, Brief & Promo, Timeline & Tugas, Konten & Influencer, Keuangan, dan Diskusi tersedia. |
| Responsive desktop/mobile | Selesai | Diuji pada viewport 360px, 390px, 430px, dan desktop. |
| Relasi Campaign–To-Do | Selesai sebagian | Menggunakan `tasks.campaign_id`; daftar tugas sudah tersambung. |
| Relasi Campaign–Kalender | Belum selesai | Deadline tugas belum ditampilkan pada Kalender Konten. |
| KPI aktual | Belum selesai | Target masih berasal dari field campaign dan belum ada agregasi metrik aktual. |
| Budget aktual | Belum selesai | Nilai terpakai masih membaca `campaigns.spent`, bukan transaksi terhubung. |
| Diskusi persisten | Belum selesai | Catatan masih state presentasi/local dan belum tersimpan di Supabase. |
| Permission backend | Risiko tinggi | Guard viewer sudah ada di UI, tetapi policy RLS masih terlalu permisif. |
| Migration database | Belum dibuat | Sengaja ditunda karena perubahan schema dan permission memerlukan persetujuan. |
| Automated test suite | Belum tersedia | Typecheck/build tersedia; lint, unit test, dan E2E runner belum tersedia di project. |

## P0 — wajib sebelum produksi

### 1. Perbaiki RLS berdasarkan role

Policy existing untuk campaign dan task masih memberikan hak mutation kepada anggota workspace secara umum. Pembatasan di frontend tidak cukup untuk keamanan karena request dapat dipanggil langsung ke API.

Yang perlu dilakukan:

- Pisahkan hak `owner/admin`, `member`, dan `viewer`.
- Pastikan viewer hanya dapat `SELECT`.
- Batasi pembuatan/perubahan campaign dan task berdasarkan role workspace.
- Uji policy dengan user pada setiap role, bukan hanya dengan akun super admin.
- Review kembali akses tabel `profiles` agar tidak membuka data profile lintas workspace.
- Jalankan Supabase security advisor setelah akses project tersedia.

Perubahan ini merupakan perubahan keamanan database dan tidak boleh dilakukan sebagai patch UI saja.

### 2. Simpan data Campaign Workspace ke backend

Informasi berikut masih bersifat presentasi/local atau belum memiliki sumber data tersendiri:

- detail brief dan tagline;
- KPI target dan aktual;
- promo;
- fase campaign;
- referensi kreatif;
- catatan/diskusi;
- acknowledgement/konfirmasi pembacaan brief;
- status pin pada catatan.

Data tersebut perlu memiliki owner campaign/workspace, `created_by`, timestamp server, dan policy RLS yang sesuai.

### 3. Hubungkan budget dengan transaksi aktual

Perhitungan UI saat ini benar secara aritmatika berdasarkan nilai `campaigns.spent`, tetapi belum dapat dianggap sebagai laporan keuangan aktual.

Yang perlu dilakukan:

- Tambahkan relasi `marketing_transactions.campaign_id`, atau gunakan relasi existing jika sudah tersedia di database production.
- Tentukan transaksi yang dihitung berdasarkan status, tanggal, dan jenis transaksi.
- Hitung total terpakai dari transaksi terhubung.
- Tampilkan kondisi ketika budget belum tersedia atau transaksi belum tersinkron.
- Jangan menyajikan fallback presentasi sebagai angka aktual.

### 4. Hubungkan KPI dengan metrik sosial aktual

Field `campaign.kpi` saat ini berupa teks dan belum cukup untuk perhitungan target, pencapaian, atau tren.

Yang perlu dilakukan:

- Tentukan metrik resmi: reach, impressions, engagement, clicks, conversion, atau metrik lain.
- Hubungkan konten/social post dengan campaign melalui `campaign_id`.
- Simpan atau ambil snapshot metrik berdasarkan periode.
- Tampilkan sumber data dan waktu sinkronisasi.
- Bedakan secara visual antara target, aktual, dan data yang belum tersinkron.

## P1 — wajib sebelum menyatakan modul lengkap

### 5. Hubungkan Timeline dengan Kalender Konten

Saat ini tugas campaign muncul pada Timeline dan To-Do, sedangkan Kalender Konten berfokus pada konten. Belum ada keputusan implementasi untuk deadline tugas.

Pilihan yang perlu ditetapkan:

1. Kalender menampilkan tugas campaign sebagai item berbeda dari konten; atau
2. Kalender tetap khusus konten dan Timeline menampilkan tautan yang jelas ke Kalender Konten.

Jika pilihan pertama digunakan, item perlu memiliki tipe, warna, filter, dan permission yang jelas agar tidak tercampur dengan jadwal publikasi konten.

### 6. Persistensi Diskusi dan Realtime

Diskusi harus dipindahkan dari state presentasi ke tabel backend dengan minimal field:

- `campaign_id`;
- `workspace_id`;
- `body`;
- `created_by`;
- `created_at` dari server;
- `updated_at`;
- `pinned_at` atau status pin;
- status acknowledgement bila diperlukan.

Tambahkan validasi panjang, sanitasi output, permission edit/hapus, pagination, serta realtime atau refresh terkontrol.

### 7. Dukungan fase secara penuh

UI sudah mendukung campaign dengan fase dan tanpa fase. Agar data tidak hanya hidup di state presentasi, perlu:

- tabel atau struktur fase yang terhubung ke campaign;
- `tasks.phase_id` nullable;
- urutan fase;
- tanggal mulai/selesai fase;
- aturan ketika fase dihapus atau dinonaktifkan;
- filter tugas berdasarkan fase dari data backend.

### 8. Referensi kreatif dan attachment

Kontrol attachment saat ini belum mengunggah file ke storage. Implementasi lanjutan memerlukan:

- Supabase Storage bucket;
- pembatasan tipe dan ukuran file;
- nama file aman;
- policy upload/download berdasarkan workspace/campaign;
- penghapusan file yatim;
- loading dan error state upload.

## P2 — peningkatan kualitas

### 9. Automated test

Project belum memiliki lint script, unit test, atau E2E test runner. Tambahkan secara bertahap:

- unit test untuk formatter, KPI, budget, filter, dan permission helper;
- component test untuk tab, modal, fase, empty state, dan error state;
- E2E test untuk alur membuka campaign, mengubah tab, membuat task, dan mengirim diskusi;
- test matrix role owner/admin/member/viewer;
- viewport test 360px, 390px, 430px, dan desktop.

### 10. Loading dan error per data source

Tambahkan state terpisah untuk brief, tasks, content, finance, influencer, dan discussion agar kegagalan salah satu sumber tidak menghilangkan seluruh halaman.

Setiap state perlu menyediakan:

- skeleton saat loading;
- empty state ketika data memang kosong;
- error state dengan tombol retry;
- penanda bahwa data belum tersinkron;
- pencegahan double submit.

### 11. Audit trail

Untuk kebutuhan CMO dan keamanan, pertimbangkan activity log untuk perubahan penting:

- perubahan status campaign;
- perubahan budget;
- perubahan KPI;
- perubahan fase dan deadline;
- approval/rejection;
- perubahan catatan dan acknowledgement.

## Rencana implementasi yang disarankan

1. Finalisasi keputusan sumber data untuk KPI, budget, kalender, dan diskusi.
2. Audit schema production dan policy RLS melalui akses Supabase yang memiliki permission.
3. Buat migration additive dan idempotent, tanpa menggandakan tabel tugas, konten, atau transaksi existing.
4. Tambahkan API/query adapter dengan fallback aman untuk campaign lama.
5. Implementasikan persistence diskusi, fase, brief, promo, dan referensi.
6. Hubungkan budget dan KPI dengan data aktual.
7. Perbaiki RLS dan uji semua role.
8. Tambahkan test otomatis dan regression test modul terkait.
9. Uji staging dengan data campaign lama dan campaign baru.
10. Baru setelah hasil security dan regression test lulus, pertimbangkan deployment produksi.

## Kriteria selesai

Modul dapat dianggap siap produksi apabila:

- tidak ada angka KPI/budget presentasi yang tampil sebagai angka aktual;
- semua perubahan penting tersimpan dan dapat dimuat ulang setelah refresh;
- viewer tidak dapat melakukan mutation melalui API langsung;
- diskusi memiliki timestamp server dan permission yang benar;
- campaign lama tetap dapat dibuka tanpa migration data manual;
- tugas, konten, transaksi, dan influencer tidak memiliki sumber data duplikat;
- error pada satu sumber data tidak merusak tab lain;
- test role dan responsive selesai;
- typecheck, lint, build, unit test, dan E2E test lulus;
- security review Supabase tidak menemukan policy berisiko tinggi.

## Catatan audit

Typecheck, production build, dan `git diff --check` berhasil. Smoke test manual untuk modul utama juga berhasil. Audit schema live belum dapat diverifikasi karena koneksi Supabase yang tersedia tidak memberikan permission untuk membaca tabel, migration, dan advisor project.

Migration, perubahan RLS, deployment, commit, dan push belum dilakukan.

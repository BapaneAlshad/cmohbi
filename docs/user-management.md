# Manajemen User

Menu **Manajemen User** hanya tersedia untuk **Super Admin**. Form tambah user berisi empat isian: nama, username, PIN 6 angka, dan jabatan. Email dan WhatsApp tidak diwajibkan; data kontak lama tetap dipertahankan. Username akun existing tidak dapat diubah agar identitas login dan relasi tugas tetap sama.

Level akses yang ditampilkan hanya **Super Admin**, **Anggota tim**, dan **Viewer**. Nilai database lama `admin` dibaca sebagai Super Admin untuk kompatibilitas, dan migrasi menyatukannya ke `owner` tanpa menghapus user. Enum lama tetap dipertahankan. Jabatan CMO/Admin lama dinormalisasi ke label Super Admin; izin akun live selalu berdasarkan keanggotaan database, bukan jabatan atau metadata login.

Saat membuat user, jabatan Super Admin memberi akses Super Admin, Guest memberi akses Viewer, dan jabatan tim lain memberi akses Anggota tim. Level akses dapat disesuaikan setelahnya melalui Edit user. Akun Super Admin utama dan akun actor sendiri tidak dapat diturunkan.

Super Admin mengubah nama, jabatan, level akses, dan foto melalui **Edit user**, termasuk profilnya sendiri. Form foto menerima PNG/JPEG/WebP maksimal 2 MB, menyediakan pratinjau dan hapus foto, serta menyimpan URL bersama perubahan profil setelah tombol Simpan ditekan. Avatar muncul di daftar user, akun, top navigation, dan PIC tugas/campaign. Foto yang gagal dimuat menggunakan inisial.

Halaman **Akun & Keamanan** menampilkan profil tanpa tombol Edit profil; anggota tidak dapat mengubah profil sendiri. Ganti PIN tetap tersedia sebagai pengaturan keamanan kredensial. Blok mini profil pada bagian bawah sidebar dihapus; akses akun tetap melalui menu Akun dan profil top navigation.

## Akun lokal

Hanya akun bawaan `demo.superadmin` yang tersisa, dengan PIN awal `123456`. Enam akun demo level lain dihapus dari konfigurasi login. User contoh lama dibersihkan saat data lokal dimuat; akun custom, campaign, tugas, dan histori tetap dipertahankan. PIC historis tidak dialihkan secara otomatis.

User yang dibuat melalui menu pada mode lokal dapat login di browser yang sama. PIN lokal disimpan terpisah dari data workspace, memakai salt acak dan PBKDF2 SHA-256; PIN tidak disimpan sebagai teks asli dalam AppData. Akun lokal merupakan mode pengujian browser, bukan akun Supabase atau akun lintas perangkat. Data lokal dan PIN lokal tidak dikirim ke Supabase.

## Supabase

- Tambah akun dan reset PIN dilakukan lewat Route Handler dengan kredensial server. Backend memverifikasi token dan keanggotaan Super Admin (`owner`, atau `admin` lama) pada workspace yang diminta. Peran pekerjaan atau metadata user tidak digunakan untuk memberi izin.
- Endpoint edit: `PATCH /api/auth/users/[id]`. Perubahan profil dan role disimpan atomik melalui RPC khusus server.
- Migration dasar: `supabase/migrations/20261030022141_workspace_user_management.sql`. Migration lanjutan: `supabase/migrations/20261030032247_unified_super_admin_profiles.sql`. Keduanya disiapkan untuk review dan **belum dijalankan ke production**.
- Migrasi lanjutan menghapus policy update profil sendiri dan mencabut UPDATE profil dari `authenticated`/`anon`. Profil hanya ditulis melalui RPC server yang memeriksa actor dan workspace. Bootstrap login tidak memperbarui profil existing dari metadata yang dapat diedit pengguna.
- Upload: `POST /api/auth/users/[id]/avatar`. Server memverifikasi Super Admin dan membership target, ukuran, MIME dan signature file. Bucket khusus `user-avatars` memiliki batas 2 MB dan hanya menerima PNG/JPEG/WebP. File dibaca publik untuk avatar; penulisan dilakukan server, tanpa policy upload/update dari client. Endpoint edit memverifikasi origin Supabase dan path workspace/user untuk URL foto baru. URL foto historis yang tidak diubah dipertahankan.
- RPC `manage_workspace_user` hanya dapat dieksekusi `service_role`, memakai SECURITY INVOKER dan search_path kosong. Workspace dikunci sebelum verifikasi actor dan perubahan role. User tidak dapat ditulis melalui workspace lain.
- Akses Super Admin utama serta akses akun actor sendiri tidak dapat diturunkan. Proteksi berlaku di UI dan database.
- Reset PIN memeriksa bahwa target adalah anggota workspace yang sama. Username tidak bisa diganti melalui edit profil user.
- Tidak ada penghapusan akun Supabase existing dalam implementasi ini; akun demo bawaan adalah konfigurasi lokal.

## Pengujian

`npm run typecheck`, `npm test`, dan `npm run build`. Tes baru mencakup pembersihan user demo, akun custom yang dipertahankan, level akses, validasi input, hash PIN, login user lokal baru, reset PIN, pembatasan RPC ke server, isolasi workspace, serta perlindungan Super Admin. Tes database memakai PGlite tanpa perubahan database production.

Tes mencakup form minimal tanpa kontak, penyatuan akses admin lama, validasi foto dan lokasinya, persistensi foto pada login lokal, larangan perubahan profil langsung menggunakan kredensial client, upload storage client yang ditolak, dan pembaruan/hapus foto lewat RPC server. Tes database memakai PGlite tanpa mengubah database production.

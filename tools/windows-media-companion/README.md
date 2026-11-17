# Gallery Ngapaya

## Gallery LAN di PC storage

1. Terapkan migrasi `20261113060540_gallery_lan_storage_url.sql` lalu `20261113071018_gallery_lan_storage_pairing.sql` setelah migrasi pengaturan media. Buat secret acak minimal 32 karakter untuk `NGAPAYA_LAN_SIGNING_SECRET` di environment server Ngapaya. Ubah secret hanya bila akan memasangkan ulang PC.
2. Siapkan IP tetap atau reservasi DHCP untuk PC. Di DNS kantor, arahkan subdomain sendiri ke IP tersebut. Gunakan sertifikat publik yang diterbitkan melalui DNS-01. Simpan full chain dan private key PEM di luar folder yang akan dibagikan. Atur pembaruan sertifikat pada klien ACME, pertahankan path file, lalu restart Storage LAN setelah sertifikat diperbarui. [Dokumentasi DNS-01](https://letsencrypt.org/docs/challenge-types/)
3. Di website Ngapaya yang dipakai tim, login sebagai Super Admin. Buka **Tools → Setting → Storage LAN** lalu klik **Unduh file pemasangan**. Kolom alamat boleh kosong. File JSON memasangkan PC dengan workspace dan origin website. Simpan kredensial ini di luar folder bersama.
4. Di PC Windows, pasang Python 3.10+ dan jalankan **Pasang Storage LAN.bat**. Pilih JSON pemasangan, folder bersama, sertifikat full chain, dan private key. Masukkan subdomain yang tercantum pada sertifikat dan port HTTPS, dengan default `8766`. Pilih folder media sebelumnya untuk mempertahankan file dan nama dari indeks lama.
5. Di PC yang sama, buka **Tools → Gallery LAN** dan klik **Jalankan Storage LAN**. Izinkan browser membuka launcher Windows jika diminta. Terminal menampilkan IP lokal, port, dan alamat HTTPS. Izinkan Python menerima koneksi TCP pada port yang dipilih dari subnet kantor melalui profil firewall Private.
6. Salin alamat HTTPS lengkap dari terminal ke **Tools → Setting → Storage LAN**, misalnya `https://storage.example.com:8766`. Klik **Simpan dan cek koneksi**. Setelah tampil status **Aktif**, perangkat tim pada jaringan kantor bisa membuka **Gallery LAN** dari website Ngapaya. Izinkan akses jaringan lokal saat browser memintanya. Upload dan download berjalan langsung antara perangkat dan PC.

Jika launcher lama sudah terpasang, hentikan storage dan unduh file pemasangan baru untuk memperbarui launcher. Untuk mengganti port, hentikan storage, jalankan installer lagi dengan file pemasangan yang sama dan port baru, lalu simpan alamat baru yang ditampilkan terminal. Sesuaikan aturan firewall dengan port tersebut.

Folder disk menjadi sumber daftar file, termasuk file yang disalin dari File Explorer. Anggota aktif dapat mengunggah dan memindahkan file ke Sampah. Viewer hanya dapat melihat dan mengunduh. Super Admin dapat memulihkan file selama 30 hari. File kedaluwarsa dibersihkan saat storage mulai dan setiap hari selama aktif.

Tekan **Ctrl+C** di terminal atau gunakan shortcut desktop **Hentikan Storage LAN** untuk menghentikan proses. Biarkan terminal terbuka selama storage dipakai. Menutup tab browser tetap membiarkan storage aktif. Jalankan ulang storage setelah PC mati atau reboot.

## Gallery GDrive

Gallery GDrive utama terhubung langsung melalui **Tools → Setting → Google Drive workspace**. Upload, album, sinkronisasi, preview, download, dan hapus tidak memerlukan PC companion. Konfigurasi OAuth Web aplikasi dijelaskan di `docs/gallery-gdrive.md`.

Companion Windows hanya dibutuhkan ketika Super Admin ingin menjalankan **kompresi manual** dengan FFmpeg. Untuk kompatibilitas dengan alur kompresi saat ini:

1. Pastikan Python 3.10+, FFmpeg, sertifikat HTTPS, dan private key tersedia.
2. Jalankan **Jalankan Ngapaya Media.bat**, lalu isi alamat dan PIN pada bagian **Companion kompresi (opsional)**.
3. Hubungkan akun Drive yang sama pada companion, kemudian gunakan tombol **Kompres** pada kartu media.

Jangan membuka port companion ke internet. Matikan companion dengan **Ctrl+C** saat kompresi tidak digunakan.

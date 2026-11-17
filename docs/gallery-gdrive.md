# Gallery GDrive Ngapaya

Gallery GDrive memakai akun Google Drive Super Admin sebagai storage bersama. Browser mengunggah file langsung ke sesi resumable Google Drive, sedangkan Ngapaya mengelola login workspace, izin, katalog, dan streaming privat.

## Konfigurasi Google Cloud

1. Buat atau pilih Google Cloud project dan aktifkan **Google Drive API**.
2. Konfigurasikan OAuth consent screen. Tambahkan scope `openid`, `email`, `profile`, dan `https://www.googleapis.com/auth/drive.file`.
3. Buat OAuth Client ID bertipe **Web application**.
4. Tambahkan authorized JavaScript origin `https://ngapaya.my.id`.
5. Tambahkan authorized redirect URI `https://ngapaya.my.id/api/gallery/drive/oauth/callback`.
6. Untuk development lokal, tambahkan origin `http://localhost:4173` dan redirect URI `http://localhost:4173/api/gallery/drive/oauth/callback`.

Simpan Client ID dan Client Secret hanya sebagai environment server. Jangan menaruh secret di variabel `NEXT_PUBLIC_*`.

## Environment

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REDIRECT_URI=https://ngapaya.my.id/api/gallery/drive/oauth/callback
NGAPAYA_GOOGLE_MASTER_KEY=
```

Buat master key dengan `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Nilai yang sama harus dipertahankan selama masih ada koneksi Drive; menggantinya membuat refresh token lama tidak dapat didekripsi dan akun perlu dihubungkan ulang.

## Izin

- Super Admin: hubungkan/putuskan akun, upload, sinkronisasi, preview, download, hapus, dan kompresi opsional.
- Anggota: upload, sinkronisasi, preview, download, dan hapus.
- Viewer: lihat, preview, dan download.

Refresh token terenkripsi disimpan di `workspace_google_drive_connections` dan tidak dapat dibaca melalui API Supabase publik. Isi file tetap berada di Google Drive; Supabase hanya menyimpan katalog pada `media_assets`.

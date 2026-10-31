# Akses Influencer & Brief Campaign

Super Admin dan anggota tim dapat menambah/mengedit tema serta menambah jadwal, memilih tema, mengubah tanggal visit/upload dan menautkan jadwal lama ke Campaign aktif. Viewer, akun tanpa peran, dan Campaign arsip/dihapus tetap baca saja. Izin edit informasi Campaign, tugas, fase, KPI, dan nilai finansial tidak diperluas.

Penyimpanan menggunakan RPC `save_campaign_influencer_theme` dan `save_campaign_influencer_booking` dengan SECURITY INVOKER dan RLS sesuai workspace. Kedua fungsi memvalidasi Campaign aktif dan peran dari workspace_members. Tema harus berasal dari Campaign booking; influencer baru harus berasal dari master di workspace yang sama. Upload tidak boleh sebelum visit. Kode tema dibuat berurutan di database dengan kunci transaksi per Campaign.

Edit jadwal memakai patch field yang berubah, menjaga rate, spent, status kerja sama, pembayaran, ID, waktu jadwal dan created_by lama. Mengubah judul tema memperbarui judul konten booking terkait. Tanggal upload kosong tidak menjadi event publikasi di kalender.

Tema dan seluruh booking dikeluarkan dari autosave umum supaya snapshot lama tidak menimpa perubahan anggota lain. Operasi simpan menunggu sukses sebelum memperbarui state; kegagalan menampilkan pesan dan mempertahankan nilai tersimpan sebelumnya. Mode demo tetap tersimpan di browser. Penautan booking tanpa Campaign memakai operasi simpan yang sama dan ID lama.

Migrasi tambahan: `supabase/migrations/20261030081856_campaign_influencer_team_editing.sql`. Migrasi production belum dijalankan. Tidak menghapus data atau kolom; perubahan hanya kebijakan, trigger perlindungan dan fungsi penyimpanan.

Verifikasi database lokal (PGlite): akses anggota/Viewer/arsip, isolasi workspace dan tema Campaign, penautan histori tanpa duplikasi, tanggal invalid, patch parsial, audit aktor, perlindungan finansial terhadap update langsung dan payload RPC, serta hak edit Campaign yang tetap khusus Super Admin.

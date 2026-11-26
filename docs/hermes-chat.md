# Hermes AI di Ngapaya

Chat terapung hanya tersedia setelah sesi Supabase login dan memakai workspace aktif. Browser hanya memanggil `/api/hermes/chat`; provider dipanggil server-side sehingga API key tidak dikirim ke browser.

## Sumber konteks

- Data Ngapaya dibaca memakai sesi pengguna dan RLS workspace. Informasi nominal keuangan hanya masuk konteks untuk role Owner/Admin.
- Saat ini belum ada catatan Obsidian yang disetujui sebagai sumber brand perusahaan. Dua brief Sukho Ramen sudah dikeluarkan dari konteks dan dihapus dari tabel Supabase; file aslinya di vault tidak dihapus.
- Sinkronisasi Obsidian dinonaktifkan sampai catatan yang benar-benar terkait brand perusahaan dipilih dan disetujui. Data workspace Ngapaya tetap menjadi sumber konteks.

## Konfigurasi provider

Isi di Vercel untuk environment yang akan diuji:

```text
HERMES_API_URL=https://<inference-host>/v1/chat/completions
HERMES_API_KEY=<server-only>
HERMES_MODEL=<model-id>
```

Endpoint harus HTTPS, OpenAI-compatible, dan mendukung streaming. Untuk inference-only, gunakan model completion endpoint. Jangan arahkan ke root Hermes Agent API biasa: API Server menjalankan agent dengan toolset, dan payload `tools`/`tool_choice` tidak bisa dijadikan pembatas keamanan. Profil khusus `ngapayareadonly` sudah dibuat; `hermes tools list --platform api_server` menunjukkan semua toolset nonaktif. Jika memakai Hermes Agent API, aktifkan endpoint khusus profil dengan URL prefix `/p/ngapayareadonly/v1/chat/completions`, kunci API terpisah, dan sebelum expose verifikasi `GET /p/ngapayareadonly/v1/toolsets` kosong. Jangan expose route root/default agent.

## Batasan obrolan

- Route menolak permintaan tanpa kata/topik marketing, termasuk permintaan di luar domain; follow-up singkat hanya diteruskan jika percakapan sebelumnya masih terkait marketing.
- Permintaan data keuangan dari role selain Owner/Admin ditolak sebelum konteks/provider dipanggil.
- Request provider tidak menyertakan tool/function definitions (`tools: []`, `tool_choice: none`). Ini tambahan defense-in-depth, bukan pengganti inference-only endpoint.
- Pesan dibatasi 2.000 karakter, percakapan maksimal 12 pesan, dan rate limit best-effort per instance.
- Aplikasi tidak menyimpan riwayat chat di Supabase atau localStorage. Namun Hermes Agent API dapat menyimpan session/run/response di server Hermes; provider/model juga menerima prompt dan mungkin menerapkan logging/retensi. Untuk syarat tanpa riwayat yang ketat, gunakan inference-only endpoint dengan retensi yang sudah ditinjau, bukan mengasumsikan Agent API stateless.

Tidak ada memori Obsidian yang saat ini dimasukkan ke konteks. `HERMES_API_URL` harus dapat dijangkau dari server Vercel; alamat localhost tidak dapat dipanggil Vercel.

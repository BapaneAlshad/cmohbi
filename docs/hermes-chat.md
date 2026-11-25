# Hermes AI di Ngapaya

Chat terapung hanya tersedia setelah sesi Supabase login dan memakai workspace aktif. Browser hanya memanggil `/api/hermes/chat`; provider dipanggil server-side sehingga API key tidak dikirim ke browser.

## Sumber konteks

- Data Ngapaya dibaca memakai sesi pengguna dan RLS workspace. Informasi nominal keuangan hanya masuk konteks untuk role Owner/Admin.
- Memori Obsidian disinkronkan ke tabel `hermes_marketing_memory`. **Hanya dua catatan yang diizinkan**: `Business/Brief-Konten-Opening-Sukho.md` dan `Business/Brief_Konten_Influencer_Sukho_Ramen.md`. File vault lain tidak ikut dibaca atau dikirim.
- Jalankan migration `supabase/migrations/20261125000000_hermes_marketing_memory.sql` pada project Supabase, lalu dari worktree repo jalankan sync dari mesin yang memiliki vault dan `.env.local` berisi service-role key:

```bash
node --env-file=/home/ubuntu/workspace/cmohbi/.env.local scripts/sync-hermes-marketing-memory.mjs
```

Script hanya upsert dua path allowlist ke workspace slug `ngapaya-hbi`. Ulangi setelah salah satu catatan berubah. Service-role key hanya dipakai lokal untuk sync; jangan tambahkan ke Vercel. Pengguna aplikasi hanya mendapat akses baca melalui RLS, tanpa hak tulis.

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

Migration Supabase dan sync Obsidian harus selesai sebelum fitur dapat menjawab. `HERMES_API_URL` harus dapat dijangkau dari server Vercel; alamat localhost tidak dapat dipanggil Vercel.

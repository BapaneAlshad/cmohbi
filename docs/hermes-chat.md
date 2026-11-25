# Hermes AI di Ngapaya

Ngapaya menyediakan panel chat read-only untuk anggota workspace yang sudah login. Browser hanya memanggil `/api/hermes/chat`; koneksi ke Hermes dilakukan server-side sehingga API key tidak pernah dikirim ke browser.

## Environment Vercel

Isi variable berikut pada Development, Preview, dan Production sesuai kebutuhan:

```text
HERMES_API_URL=https://alamat-hermes.example/v1/chat/completions
HERMES_API_KEY=secret-server-only
HERMES_MODEL=hermes
HERMES_MEMORY_SCOPE=marketing
```

`HERMES_API_URL` harus berupa URL lengkap endpoint Chat Completions yang menerima format OpenAI-compatible dan mendukung `stream: true`. Jangan menambahkan prefix `NEXT_PUBLIC_` pada API key.

## Batasan

- Konteks dibatasi pada workspace aktif dan sumber marketing yang diizinkan.
- Keuangan dan biaya hanya dikirim untuk owner/admin.
- Token, PIN, kredensial, data autentikasi, dan data workspace lain tidak dikirim.
- Hermes tidak menerima tool/function calling dari pengguna dan tidak dapat mengubah data Ngapaya.
- Riwayat chat tidak disimpan di Supabase atau localStorage; percakapan hilang saat halaman dimuat ulang.
- Pesan dibatasi 2.000 karakter dan percakapan maksimal 12 pesan.

Jika endpoint Hermes berada di komputer lokal atau hanya HTTP, Vercel tidak dapat memanggilnya. Gunakan endpoint HTTPS yang dapat dijangkau server Vercel dan batasi aksesnya dengan API key atau jaringan privat yang sesuai.


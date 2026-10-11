# Proyek Kinetic Typography

- Semua animasi deterministik: `renderFrame(ctx, t, cfg, opts)` di `src/scene.js`.
- Edit teks/timing/warna HANYA di `src/config.js`. Jangan ubah ejaan teks.
- Urutan kerja: `npm install` → `npm run setup:font` → `npm test` → `npm run render` → `npm run verify` → `npm run build:preview`.
- Setelah `npm test`, periksa gambar di `out/stills/*.png` untuk memastikan teks terbaca.
- Jika ffmpeg tidak ditemukan: set `FFMPEG_PATH` atau install ffmpeg sistem.

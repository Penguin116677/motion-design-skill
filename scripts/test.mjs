// Uji: validasi konfigurasi, determinisme, keterbacaan teks, smoke test semua frame.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config.js';
import { STYLES } from '../src/scene.js';
import { ROOT, registerFont, makeRenderer, inkFraction } from './lib.mjs';

let fails = 0;
const ok = (c, msg) => {
  console.log(`${c ? 'OK   ' : 'GAGAL'} ${msg}`);
  if (!c) fails++;
};

const EXPECTED = [
  'KEBEBASAN',
  'Fleksibilitas',
  'ADAPTASI',
  'MANFAATKAN',
  'AKAN',
  'orang-orang',
  'dan bagaimana mereka',
  'yang tak mampu',
];
const C = CONFIG;
ok(C.scenes.map((s) => s.text).join('|') === EXPECTED.join('|'), 'ejaan teks sesuai naskah');
ok(C.width === 1920 && C.height === 1080 && C.fps === 30 && C.duration === 23, 'format 1920x1080, 30 fps, 23 dtk');
ok(C.scenes.every((s) => typeof STYLES[s.style] === 'function'), 'semua gaya adegan tersedia');
ok(C.scenes.every((s) => s.start < s.end), 'start < end untuk tiap adegan');
ok(C.scenes.every((s, i) => i === 0 || s.start >= C.scenes[i - 1].end - 1e-9), 'adegan berurutan tanpa tumpang tindih');
ok(C.scenes[C.scenes.length - 1].end <= C.duration + 1e-9, 'adegan terakhir selesai dalam durasi');
ok(C.beats.every((b) => b >= 0 && b <= C.duration), 'beat berada dalam durasi');

if (registerFont(C)) console.log(`OK    font ${C.font.family} terdaftar`);
else console.warn(`PERINGATAN font ${C.font.file} tidak ada — memakai fallback (jalankan npm run setup:font)`);

// Determinisme
{
  const a = makeRenderer(C, { scale: 0.5 });
  const b = makeRenderer(C, { scale: 0.5 });
  let same = true;
  for (const t of [1.7, 10.3, 21.25]) {
    a.draw(t);
    b.draw(t);
    if (!a.pixels().equals(b.pixels())) same = false;
  }
  ok(same, 'render deterministik (frame identik untuk t yang sama)');
}

// Stills + keterbacaan
const stillsDir = path.join(ROOT, 'out/stills');
fs.mkdirSync(stillsDir, { recursive: true });
const full = makeRenderer(C);
for (const sc of C.scenes) {
  const t = sc.start + (sc.end - sc.start) * 0.5;
  full.draw(t);
  const f = inkFraction(full.pixels(), full.w, full.h);
  fs.writeFileSync(path.join(stillsDir, `${sc.id}-${sc.style}.png`), await full.canvas.encode('png'));
  ok(f > 0.01, `${sc.id} "${sc.text}" terbaca di t=${t.toFixed(2)} (tinta ${(f * 100).toFixed(1)}%)`);
}
for (const t of [0.3, 22.95]) {
  full.draw(t);
  fs.writeFileSync(path.join(stillsDir, `t${t.toFixed(2)}.png`), await full.canvas.encode('png'));
}

// Smoke test seluruh timeline
{
  const r = makeRenderer(C, { scale: 0.25, lite: true });
  const total = Math.round(C.duration * C.fps);
  let err = null;
  for (let f = 0; f < total; f += 3) {
    try {
      r.draw(f / C.fps);
    } catch (e) {
      err = `frame ${f}: ${e.message}`;
      break;
    }
  }
  ok(!err, `smoke test ${total} frame${err ? ' — ' + err : ''}`);
}

console.log(fails ? `\n${fails} uji gagal.` : `\nSemua uji lulus. Periksa out/stills/*.png.`);
process.exit(fails ? 1 : 0);

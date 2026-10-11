// Mengunduh font Anton (SIL OFL) ke assets/fonts/. Mencoba fetch lalu curl (untuk proxy).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG } from '../src/config.js';
import { ROOT } from './lib.mjs';

const URLS = [
  'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf',
  'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf',
];
const dest = path.join(ROOT, CONFIG.font.file);

function isFont(buf) {
  if (!buf || buf.length < 1000) return false;
  const m = buf.readUInt32BE(0);
  return m === 0x00010000 || m === 0x4f54544f || m === 0x74727565;
}

if (fs.existsSync(dest) && isFont(fs.readFileSync(dest))) {
  console.log(`Font sudah ada: ${CONFIG.font.file}`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });

for (const url of URLS) {
  let buf = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.ok) buf = Buffer.from(await res.arrayBuffer());
  } catch {}
  if (!isFont(buf)) {
    const tmp = dest + '.part';
    const r = spawnSync('curl', ['-fsSL', '--max-time', '60', '-o', tmp, url], { stdio: 'ignore' });
    if (r.status === 0 && fs.existsSync(tmp)) buf = fs.readFileSync(tmp);
    fs.rmSync(tmp, { force: true });
  }
  if (isFont(buf)) {
    fs.writeFileSync(dest, buf);
    console.log(`Font tersimpan: ${CONFIG.font.file} (${buf.length} byte) dari ${url}`);
    process.exit(0);
  }
}
console.error('Gagal mengunduh font Anton. Letakkan file secara manual di ' + CONFIG.font.file);
process.exit(1);

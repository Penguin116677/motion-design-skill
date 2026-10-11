// Render semua frame → ffmpeg (rawvideo RGBA via stdin) → MP4 H.264 yuv420p.
// Opsi: --draft (960x540, efek ringan), --out <path>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CONFIG } from '../src/config.js';
import { ROOT, registerFont, makeRenderer, ffmpegPath } from './lib.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const oi = args.indexOf('--out');
const out = path.resolve(ROOT, oi >= 0 && args[oi + 1] ? args[oi + 1] : 'out/motion-typography.mp4');
const cfg = draft ? { ...CONFIG, effects: { ...CONFIG.effects, motionBlurSamples: 2 } } : CONFIG;

if (!registerFont(cfg)) console.warn('PERINGATAN: font tidak ditemukan, memakai fallback.');
const r = makeRenderer(cfg, { scale: draft ? 0.5 : 1, lite: draft });
const ff = await ffmpegPath();
const total = Math.round(cfg.duration * cfg.fps);
fs.mkdirSync(path.dirname(out), { recursive: true });

const a = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${r.w}x${r.h}`, '-r', String(cfg.fps), '-i', 'pipe:0'];
const audio = cfg.audio && cfg.audio.src ? path.resolve(ROOT, cfg.audio.src) : null;
const hasAudio = audio && fs.existsSync(audio);
if (cfg.audio && cfg.audio.src && !hasAudio) console.warn(`PERINGATAN: audio ${cfg.audio.src} tidak ditemukan, render tanpa audio.`);
if (hasAudio) a.push('-ss', String(cfg.audio.offset || 0), '-i', audio);
a.push('-map', '0:v');
if (hasAudio) a.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-af', `volume=${cfg.audio.volume ?? 1}`);
a.push(
  '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '23' : '18',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(cfg.fps),
  '-t', String(cfg.duration), '-movflags', '+faststart', out,
);

const proc = spawn(ff, a, { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => {
  proc.on('error', rej);
  proc.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg keluar dengan kode ${code}`))));
});
proc.stdin.on('error', () => {});

const t0 = Date.now();
for (let f = 0; f < total; f++) {
  r.draw(f / cfg.fps);
  if (!proc.stdin.write(r.pixels())) await once(proc.stdin, 'drain');
  if (f % 30 === 29 || f === total - 1) {
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\rframe ${f + 1}/${total}  ${((f + 1) / el).toFixed(1)} fps  ${el.toFixed(0)} dtk   `);
  }
}
proc.stdin.end();
await done;
console.log(`\nSelesai: ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);

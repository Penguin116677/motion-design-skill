// Verifikasi MP4: codec H.264, yuv420p, resolusi, fps, jumlah frame, durasi, teks terlihat.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG } from '../src/config.js';
import { ROOT, ffmpegPath, ffprobePath, inkFraction } from './lib.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const file = path.resolve(ROOT, args.find((x) => !x.startsWith('--')) || 'out/motion-typography.mp4');
const W = draft ? CONFIG.width / 2 : CONFIG.width;
const H = draft ? CONFIG.height / 2 : CONFIG.height;
const frames = Math.round(CONFIG.duration * CONFIG.fps);

let fails = 0;
const ok = (c, msg) => {
  console.log(`${c ? 'OK   ' : 'GAGAL'} ${msg}`);
  if (!c) fails++;
};

if (!fs.existsSync(file)) {
  console.error(`File tidak ada: ${file}`);
  process.exit(1);
}
const ff = await ffmpegPath();
const probe = ffprobePath(ff);
if (!probe) {
  console.error('ffprobe tidak ditemukan. Set FFPROBE_PATH.');
  process.exit(1);
}
const pr = spawnSync(probe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' });
const info = JSON.parse(pr.stdout);
const v = info.streams.find((s) => s.codec_type === 'video');
const [rn, rd] = v.r_frame_rate.split('/').map(Number);
const dur = Number(info.format.duration);

ok(v.codec_name === 'h264', `codec ${v.codec_name} (${v.profile})`);
ok(v.pix_fmt === 'yuv420p', `pix_fmt ${v.pix_fmt}`);
ok(v.width === W && v.height === H, `resolusi ${v.width}x${v.height}`);
ok(Math.abs(rn / rd - CONFIG.fps) < 1e-6, `fps ${rn}/${rd}`);
ok(Number(v.nb_frames) === frames, `jumlah frame ${v.nb_frames} (harap ${frames})`);
ok(Math.abs(dur - CONFIG.duration) < 0.1, `durasi ${dur.toFixed(3)} dtk`);

for (const sc of CONFIG.scenes) {
  const t = sc.start + (sc.end - sc.start) * 0.5;
  const r = spawnSync(ff, ['-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '480x270', 'pipe:1'], { maxBuffer: 1 << 24 });
  const f = r.stdout && r.stdout.length === 480 * 270 * 3 ? inkFraction(r.stdout, 480, 270, 3) : 0;
  ok(f > 0.01, `${sc.id} "${sc.text}" terlihat di video t=${t.toFixed(2)} (tinta ${(f * 100).toFixed(1)}%)`);
}

console.log(fails ? `\n${fails} pemeriksaan gagal.` : `\nVideo valid: ${path.relative(ROOT, file)}`);
process.exit(fails ? 1 : 0);

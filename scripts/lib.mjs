// Utilitas bersama untuk skrip Node (font, kanvas, ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { renderFrame } from '../src/scene.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function registerFont(cfg) {
  const f = path.join(ROOT, cfg.font.file);
  if (!fs.existsSync(f)) return false;
  return !!GlobalFonts.registerFromPath(f, cfg.font.family);
}

export function makeRenderer(cfg, { scale = 1, lite = false } = {}) {
  const w = Math.round(cfg.width * scale);
  const h = Math.round(cfg.height * scale);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const opts = { scale, quality: scale, lite, createCanvas: (a, b) => createCanvas(a, b) };
  return {
    canvas,
    ctx,
    w,
    h,
    draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      renderFrame(ctx, t, cfg, opts);
    },
    pixels() {
      const img = ctx.getImageData(0, 0, w, h);
      return Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    },
  };
}

// Proporsi piksel "bertinta" (kanal maks > ambang) di wilayah tengah.
export function inkFraction(buf, w, h, channels = 4, thr = 170) {
  let ink = 0;
  let tot = 0;
  for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 2) {
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += 2) {
      const p = (y * w + x) * channels;
      if (Math.max(buf[p], buf[p + 1], buf[p + 2]) > thr) ink++;
      tot++;
    }
  }
  return ink / tot;
}

function works(bin) {
  try {
    return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

export async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (works('ffmpeg')) return 'ffmpeg';
  try {
    const m = await import('ffmpeg-static');
    if (m.default && works(m.default)) return m.default;
  } catch {}
  throw new Error('ffmpeg tidak ditemukan. Set FFMPEG_PATH atau install ffmpeg sistem.');
}

export function ffprobePath(ff) {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  if (works('ffprobe')) return 'ffprobe';
  if (ff && ff.includes(path.sep)) {
    const p = path.join(path.dirname(ff), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (works(p)) return p;
  }
  return null;
}

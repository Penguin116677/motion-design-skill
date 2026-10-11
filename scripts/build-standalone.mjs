// Membangun dist/preview.html: satu file mandiri (config + scene + font tertanam) dengan pemutar.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/config.js';
import { ROOT } from './lib.mjs';

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac' };

export function buildPreview() {
  const strip = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^export\s+/gm, '');
  const cfgSrc = strip('src/config.js');
  const sceneSrc = strip('src/scene.js');
  const fontPath = path.join(ROOT, CONFIG.font.file);
  const fontCss = fs.existsSync(fontPath)
    ? `@font-face{font-family:'${CONFIG.font.family}';src:url(data:font/ttf;base64,${fs.readFileSync(fontPath).toString('base64')}) format('truetype');font-display:block}`
    : '';
  let audioUrl = '';
  if (CONFIG.audio.src) {
    const ap = path.join(ROOT, CONFIG.audio.src);
    if (fs.existsSync(ap) && fs.statSync(ap).size < 20e6) {
      audioUrl = `data:${MIME[path.extname(ap).toLowerCase()] || 'audio/mpeg'};base64,${fs.readFileSync(ap).toString('base64')}`;
    }
  }

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kinetic Typography Preview</title>
<style>
${fontCss}
:root{--bg:#06060a;--panel:#111119;--line:#2a2a36;--text:#f5f2ea;--muted:#9a97a6;--accent:#ff3d2e}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px}
h1{font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;color:var(--muted)}
.stage{position:relative;width:100%;aspect-ratio:16/9;background:#000;border:1px solid var(--line);border-radius:6px;overflow:hidden}
canvas{width:100%;height:100%;display:block}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:6px}
button,select{background:#1b1b26;color:var(--text);border:1px solid var(--line);border-radius:4px;padding:6px 12px;font:inherit;cursor:pointer}
button:hover,select:hover{border-color:#44445a}
input[type=range]{flex:1 1 240px;accent-color:var(--accent)}
.tc{font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;color:var(--muted);min-width:170px}
.hint{color:var(--muted);font-size:12px;margin-top:8px}
</style>
</head>
<body>
<main>
<h1>Kinetic Typography · 23 dtk · 1920×1080 · 30 fps</h1>
<div class="stage"><canvas id="cv" width="1920" height="1080"></canvas></div>
<div class="bar">
  <button id="play">Putar</button>
  <button id="restart">⟲</button>
  <input id="scrub" type="range" min="0" max="${CONFIG.duration}" step="${1 / CONFIG.fps}" value="0">
  <span class="tc" id="tc">00.00 / ${CONFIG.duration.toFixed(2)} · f0</span>
  <select id="q"><option value="1">Penuh 1920×1080</option><option value="0.5" selected>Ringan 960×540</option></select>
  <label><input id="loop" type="checkbox" checked> Ulang</label>
</div>
<div class="hint">Spasi: putar/jeda · ←/→: mundur/maju 1 frame</div>
</main>
${audioUrl ? `<audio id="au" src="${audioUrl}" preload="auto"></audio>` : ''}
<script>
(async () => {
${cfgSrc}
${sceneSrc}
const uiCfg = CONFIG;
const uiCv = document.getElementById('cv');
const uiCtx = uiCv.getContext('2d');
const uiPlay = document.getElementById('play');
const uiScrub = document.getElementById('scrub');
const uiTc = document.getElementById('tc');
const uiQ = document.getElementById('q');
const uiLoop = document.getElementById('loop');
const uiAu = document.getElementById('au');
let uiScale = Number(uiQ.value);
let uiT = 0, uiPlaying = false, uiLast = 0;

function uiResize() {
  uiCv.width = Math.round(uiCfg.width * uiScale);
  uiCv.height = Math.round(uiCfg.height * uiScale);
}
function uiDraw() {
  const f = Math.min(Math.round(uiCfg.duration * uiCfg.fps) - 1, Math.floor(uiT * uiCfg.fps + 1e-6));
  renderFrame(uiCtx, f / uiCfg.fps, uiCfg, { scale: uiScale, quality: uiScale, lite: uiScale < 1 });
  uiScrub.value = uiT;
  const sc = activeScene(uiCfg, f / uiCfg.fps);
  uiTc.textContent = uiT.toFixed(2).padStart(5, '0') + ' / ' + uiCfg.duration.toFixed(2) + ' · f' + f + (sc ? ' · ' + sc.id : '');
}
function uiSeek(t) {
  uiT = Math.max(0, Math.min(uiCfg.duration, t));
  if (uiAu) uiAu.currentTime = uiT + (uiCfg.audio.offset || 0);
  uiDraw();
}
function uiSetPlaying(p) {
  uiPlaying = p;
  uiPlay.textContent = p ? 'Jeda' : 'Putar';
  if (uiAu) { if (p) { uiAu.currentTime = uiT + (uiCfg.audio.offset || 0); uiAu.volume = uiCfg.audio.volume; uiAu.play().catch(() => {}); } else uiAu.pause(); }
  uiLast = performance.now();
}
function uiTick(now) {
  if (uiPlaying) {
    uiT += (now - uiLast) / 1000;
    uiLast = now;
    if (uiT >= uiCfg.duration) {
      if (uiLoop.checked) uiSeek(0), uiPlaying && uiAu && uiAu.play().catch(() => {});
      else { uiT = uiCfg.duration; uiSetPlaying(false); }
    }
    uiDraw();
  }
  requestAnimationFrame(uiTick);
}

uiPlay.onclick = () => { if (!uiPlaying && uiT >= uiCfg.duration) uiSeek(0); uiSetPlaying(!uiPlaying); };
document.getElementById('restart').onclick = () => uiSeek(0);
uiScrub.oninput = () => uiSeek(Number(uiScrub.value));
uiQ.onchange = () => { uiScale = Number(uiQ.value); uiResize(); uiDraw(); };
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); uiPlay.click(); }
  if (e.code === 'ArrowRight') { uiSetPlaying(false); uiSeek(uiT + 1 / uiCfg.fps); }
  if (e.code === 'ArrowLeft') { uiSetPlaying(false); uiSeek(uiT - 1 / uiCfg.fps); }
});

try { await document.fonts.load('100px "' + uiCfg.font.family + '"'); } catch (e) {}
uiResize();
uiSeek(2.0);
requestAnimationFrame(uiTick);
})();
</script>
</body>
</html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.join(ROOT, 'dist/preview.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const html = buildPreview();
  fs.writeFileSync(out, html);
  console.log(`Selesai: dist/preview.html (${(html.length / 1024).toFixed(0)} KB)`);
}

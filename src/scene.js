// ============================================================
// scene.js — Mesin render deterministik: setiap frame = f(waktu).
// Dipakai bersama oleh preview browser dan renderer Node (MP4).
// Koordinat gaya adegan: origin (0,0) = tengah layar.
// ============================================================

export const Ease = {
  linear: (t) => t,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export function clamp(v, a = 0, b = 1) {
  return Math.min(b, Math.max(a, v));
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
function seg(t, start, dur) {
  if (dur <= 0) return t >= start ? 1 : 0;
  return clamp((t - start) / dur);
}
function pulse(t, center, width) {
  return clamp(1 - Math.abs(t - center) / width);
}
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function hashS(n) {
  return hash(n) * 2 - 1;
}
function frac(x) {
  return x - Math.floor(x);
}

export function hexA(c, a) {
  if (typeof c !== 'string' || c[0] !== '#' || (c.length !== 7 && c.length !== 4)) return c;
  let h = c.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function col(cfg, key) {
  return (cfg.colors && cfg.colors[key]) || key;
}
function fontStr(cfg, size) {
  return `${Math.max(1, size).toFixed(1)}px ${cfg.font.stack}`;
}

// ---------- Deteksi dukungan ctx.filter (blur) ----------
const filterCache = new WeakMap();
function supportsFilter(ctx) {
  if (filterCache.has(ctx)) return filterCache.get(ctx);
  let ok = false;
  try {
    const prev = ctx.filter;
    ctx.filter = 'blur(2px)';
    ok = ctx.filter === 'blur(2px)';
    ctx.filter = prev === undefined ? 'none' : prev;
  } catch (e) {
    ok = false;
  }
  filterCache.set(ctx, ok);
  return ok;
}
function setBlur(ctx, env, px) {
  if (!env.filter) return;
  ctx.filter = px > 0.4 ? `blur(${(px * env.q).toFixed(1)}px)` : 'none';
}

// ---------- Layout huruf ----------
function layout(ctx, cfg, text, size, tracking = 0) {
  ctx.font = fontStr(cfg, size);
  const chars = Array.from(text);
  const ws = chars.map((c) => ctx.measureText(c).width);
  const gap = size * tracking;
  const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
  let x = -total / 2;
  const letters = chars.map((ch, i) => {
    const cx = x + ws[i] / 2;
    x += ws[i] + gap;
    return { ch, cx, w: ws[i] };
  });
  return { letters, total, size };
}
function fit(ctx, cfg, text, size, maxW, tracking = 0) {
  const l = layout(ctx, cfg, text, size, tracking);
  return l.total > maxW ? Math.floor((size * maxW) / l.total) : size;
}

// ---------- Gambar huruf dengan motion blur ----------
function drawLetter(ctx, env, L, st, color, opts = {}) {
  const a = st.alpha === undefined ? 1 : clamp(st.alpha);
  if (a <= 0.003) return;
  const sx = st.sx !== undefined ? st.sx : st.s !== undefined ? st.s : 1;
  const sy = st.sy !== undefined ? st.sy : st.s !== undefined ? st.s : 1;
  if (Math.abs(sx) < 0.001 || Math.abs(sy) < 0.001) return;
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * a;
  ctx.translate(L.cx + (st.x || 0), st.y || 0);
  if (st.rot) ctx.rotate(st.rot);
  ctx.scale(sx, sy);
  setBlur(ctx, env, st.blur || 0);
  if (opts.stroke) {
    ctx.lineWidth = opts.stroke;
    ctx.strokeStyle = color;
    ctx.strokeText(L.ch, 0, 0);
  } else {
    ctx.fillStyle = color;
    ctx.fillText(L.ch, 0, 0);
  }
  ctx.restore();
}

function drawLetters(ctx, env, lay, stateFn, lt, color, opts = {}) {
  const S = opts.mb === false ? 1 : Math.max(1, env.cfg.effects.motionBlurSamples | 0);
  const shutter = env.cfg.effects.shutter;
  ctx.font = fontStr(env.cfg, lay.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lay.letters.length;
  lay.letters.forEach((L, i) => {
    const st = stateFn(i, n, lt);
    if (S > 1) {
      for (let j = S - 1; j >= 1; j--) {
        const pst = stateFn(i, n, lt - (shutter * j) / (S - 1));
        const sNow = st.s !== undefined ? st.s : 1;
        const sPrev = pst.s !== undefined ? pst.s : 1;
        const moved =
          Math.abs((pst.x || 0) - (st.x || 0)) +
          Math.abs((pst.y || 0) - (st.y || 0)) +
          Math.abs((sPrev - sNow) * lay.size) +
          Math.abs(((pst.rot || 0) - (st.rot || 0)) * lay.size);
        if (moved < 2) continue;
        const pa = pst.alpha === undefined ? 1 : pst.alpha;
        drawLetter(ctx, env, L, { ...pst, alpha: (pa * 0.5) / (j + 0.5) }, color, opts);
      }
    }
    drawLetter(ctx, env, L, st, color, opts);
  });
}

// ---------- Glitch: irisan horizontal + pemisahan RGB ----------
function glitchDraw(ctx, env, seed, amount, drawFn) {
  amount = clamp(amount);
  if (!env.cfg.effects.glitch || amount < 0.02) {
    drawFn(null);
    return;
  }
  const { W, H } = env;
  const k = Math.floor(env.t * 20);
  const N = 14;
  const span = H * 0.9;
  const slot = span / N;
  const bands = [];
  for (let i = 0; i < N; i++) {
    if (hash(seed * 7.3 + k * 1.91 + i * 3.7) < amount * 0.55) {
      const h = slot * (0.25 + 0.65 * hash(seed + k * 0.77 + i * 5.1));
      const y = -span / 2 + slot * i + (slot - h) * 0.5;
      const dx = hashS(seed * 3.1 + k * 2.3 + i * 1.3) * (30 + 140 * amount);
      bands.push({ y, h, dx });
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(-W * 2, -H * 2, W * 4, H * 4);
  for (const b of bands) ctx.rect(-W * 2, b.y, W * 4, b.h);
  ctx.clip('evenodd');
  drawFn(null);
  ctx.restore();
  for (const b of bands) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-W * 2, b.y, W * 4, b.h);
    ctx.clip();
    ctx.translate(b.dx, 0);
    drawFn(null);
    ctx.restore();
  }
  const off = 6 + 22 * amount;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ctx.globalAlpha * 0.55 * amount;
  ctx.save();
  ctx.translate(-off, 0);
  drawFn('#ff1f3d');
  ctx.restore();
  ctx.save();
  ctx.translate(off, 0);
  drawFn('#1fe0ff');
  ctx.restore();
  ctx.restore();
}

function beatEnv(env, decay) {
  let last = -1e9;
  for (const b of env.cfg.beats) if (b <= env.t && b > last) last = b;
  const d = env.t - last;
  if (d < 0 || d > decay * 4) return 0;
  return Math.exp((-d * 3) / decay);
}

// ============================================================
// GAYA ADEGAN — fn(ctx, env, scene, lt = waktu lokal, d = durasi)
// ============================================================
export const STYLES = {
  // 1. KEBEBASAN — huruf jatuh berurutan, tracking melebar, keluar meledak + glitch
  dropSplit(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const outS = d - 0.6;
    const track = lerp(0.02, 0.16, Ease.inOutCubic(seg(lt, 0.5, d - 1.0)));
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.86, 0.16);
    const lay = layout(ctx, cfg, sc.text, size, track);
    const n = lay.letters.length;
    const st = (i, _n, tt) => {
      const c = i - (n - 1) / 2;
      const t0 = 0.05 + i * 0.06;
      const pin = Ease.outExpo(seg(tt, t0, 0.9));
      const pout = Ease.inExpo(seg(tt, outS + Math.abs(c) * 0.025, 0.5));
      return {
        x: c * pout * 260,
        y: lerp(-size * 1.5 - hash(i + 3) * 240, 0, pin) + pout * hashS(i + 9) * 220,
        s: lerp(1.8, 1, pin) * (1 + pout * 0.7),
        rot: hashS(i + 1) * 0.6 * (1 - pin) + hashS(i + 5) * 0.8 * pout,
        alpha: seg(tt, t0, 0.2) * (1 - pout),
        blur: 18 * (1 - pin) + 24 * pout,
      };
    };
    const lineP = Ease.outExpo(seg(lt, 1.0, 0.9)) * (1 - Ease.inExpo(seg(lt, outS, 0.45)));
    if (lineP > 0.001) {
      ctx.save();
      ctx.fillStyle = acc;
      ctx.shadowColor = acc;
      ctx.shadowBlur = env.lite ? 0 : 24;
      ctx.fillRect((-lay.total / 2) * lineP, size * 0.64, lay.total * lineP, 8);
      ctx.restore();
    }
    const g = Math.max(pulse(lt, 1.3, 0.12) * 0.7, seg(lt, outS, 0.3));
    glitchDraw(ctx, env, 11, g, (over) => drawLetters(ctx, env, lay, st, lt, over || color));
  },

  // 2. Fleksibilitas — huruf flip masuk lalu bergelombang, pita sinus
  wave(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const outS = d - 0.65;
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.84, 0.04);
    const lay = layout(ctx, cfg, sc.text, size, 0.04);
    const st = (i, _n, tt) => {
      const t0 = i * 0.045;
      const pinA = seg(tt, t0, 0.3);
      const pin = Ease.outBack(seg(tt, t0, 0.75));
      const pout = Ease.inCubic(seg(tt, outS + i * 0.03, 0.5));
      const amp = lerp(80, 24, Ease.outCubic(seg(tt, 0, 1.5))) + pout * 140;
      const ph = tt * 4.2 - i * 0.55;
      return {
        x: pout * 60 * Math.sin(i),
        y: Math.sin(ph) * amp * pinA + (1 - Math.min(pin, 1)) * 160 - pout * 300,
        sx: 1 + Math.sin(ph + 1.2) * 0.07,
        sy: Math.max(0.02, pin) * (1 - pout * 0.5),
        rot: Math.cos(ph) * 0.14 * pinA + pout * hashS(i + 2) * 0.5,
        alpha: pinA * (1 - pout),
        blur: (1 - pinA) * 12 + pout * 16,
      };
    };
    const rA = seg(lt, 0.2, 0.6) * (1 - seg(lt, outS, 0.5));
    if (rA > 0.01) {
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * rA * 0.9;
      ctx.strokeStyle = acc;
      ctx.lineWidth = 5;
      ctx.shadowColor = acc;
      ctx.shadowBlur = env.lite ? 0 : 22;
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        let first = true;
        for (let x = -W * 0.62; x <= W * 0.62; x += 14) {
          const y = size * 0.78 + r * 22 + Math.sin(lt * 4.2 - x * 0.0065 - r * 0.6) * (34 - r * 8);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = ctx.globalAlpha * 0.7;
        ctx.stroke();
      }
      ctx.restore();
    }
    drawLetters(ctx, env, lay, st, lt, color);
  },

  // 3. ADAPTASI — mask wipe dengan bar cahaya, kata terbelah atas/bawah
  maskSplit(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.84, 0.06);
    const lay = layout(ctx, cfg, sc.text, size, 0.06);
    const half = lay.total / 2 + 60;
    const rin = Ease.inOutExpo(seg(lt, 0.05, 0.75));
    const rout = Ease.inOutExpo(seg(lt, d - 0.7, 0.6));
    const a = -half + 2 * half * rout;
    const b = -half + 2 * half * rin;
    const sp = Ease.inOutCubic(seg(lt, 1.0, 0.45)) - Ease.inOutCubic(seg(lt, 1.85, 0.4));
    const s = lerp(1.1, 1, Ease.outCubic(seg(lt, 0, d)));
    const st = () => ({ s });

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.14 * rin * (1 - rout);
    ctx.scale(1.22, 1.22);
    drawLetters(ctx, env, lay, st, lt, acc, { mb: false, stroke: 2 });
    ctx.restore();

    const drawHalf = (over, y0, y1, dx) => {
      if (b - a <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a, y0, b - a, y1 - y0);
      ctx.clip();
      ctx.translate(dx, 0);
      drawLetters(ctx, env, lay, st, lt, over || color, { mb: false });
      ctx.restore();
    };
    const drawAll = (over) => {
      drawHalf(over, -size * 1.2, 0, -sp * 120);
      drawHalf(over, 0, size * 1.2, sp * 120);
    };
    glitchDraw(ctx, env, 23, pulse(lt, 1.0, 0.1) + pulse(lt, 1.85, 0.1), drawAll);

    if (sp > 0.01 && b > a) {
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * sp;
      ctx.fillStyle = acc;
      ctx.fillRect(a, -4, b - a, 8);
      ctx.restore();
    }
    const bar = (x) => {
      ctx.save();
      ctx.fillStyle = acc;
      ctx.shadowColor = acc;
      ctx.shadowBlur = env.lite ? 0 : 30;
      ctx.fillRect(x - 7, -size * 0.75, 14, size * 1.5);
      ctx.restore();
    };
    if (rin > 0 && rin < 1) bar(b);
    if (rout > 0 && rout < 1) bar(a);
  },

  // 4. MANFAATKAN — kamera terbang menembus kata, speed lines, bracket
  zoomThrough(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.84, 0.05);
    const lay = layout(ctx, cfg, sc.text, size, 0.05);
    const n = lay.letters.length;
    const outS = d - 0.6;
    const st = (i, _n, tt) => {
      const c = i - (n - 1) / 2;
      const t0 = Math.abs(c) * 0.035;
      const pin = Ease.outExpo(seg(tt, t0, 1.0));
      const pout = Ease.inExpo(seg(tt, outS, 0.55));
      const s = lerp(5.5, 1, pin) * lerp(1, 8, pout);
      const L = lay.letters[i];
      return {
        x: L.cx * (s - 1),
        y: 0,
        s,
        alpha: seg(tt, t0, 0.3) * (1 - seg(tt, d - 0.3, 0.28)),
        blur: (1 - pin) * 18 + pout * 22,
      };
    };
    const pinG = Ease.outExpo(seg(lt, 0, 1.0));
    const poutG = Ease.inExpo(seg(lt, outS, 0.55));
    const speed = clamp(1 - pinG + poutG);
    if (speed > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const ang = hash(i * 3.3 + 1) * Math.PI * 2;
        const r0 = ((hash(i + 7) * W + lt * 2600) % (W * 0.9)) + 80;
        const len = 60 + hash(i + 13) * 260 * speed;
        ctx.globalAlpha = speed * (0.15 + 0.4 * hash(i + 21));
        ctx.lineWidth = 1 + hash(i + 31) * 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * (r0 + len), Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.rotate(lerp(-0.18, 0, pinG) + poutG * 0.12);
    drawLetters(ctx, env, lay, st, lt, color);
    ctx.restore();

    const bk = Ease.outExpo(seg(lt, 0.8, 0.6)) * (1 - seg(lt, outS, 0.25));
    if (bk > 0.01) {
      const bx = lay.total / 2 + 50 + (1 - bk) * 80;
      const by = size * 0.62 + (1 - bk) * 40;
      const arm = 46;
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * bk;
      ctx.strokeStyle = acc;
      ctx.lineWidth = 6;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * bx, sy * (by - arm));
        ctx.lineTo(sx * bx, sy * by);
        ctx.lineTo(sx * (bx - arm), sy * by);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  // 5. AKAN — kata raksasa memantul, gema outline mengembang, keluar dipipihkan
  echo(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.7, 0.08);
    const lay = layout(ctx, cfg, sc.text, size, 0.08);
    const outS = d - 0.35;
    const sqz = Ease.inExpo(seg(lt, outS, 0.33));
    const bump = (tt) => Math.exp(-Math.max(0, tt) * 5) * Math.sin(Math.max(0, tt) * 18);
    const kick = (tt) => 1 + 0.14 * bump(tt - 0.55) + 0.1 * bump(tt - 1.3);
    const n = lay.letters.length;
    const pitch = lay.total / Math.max(1, n);
    const st = (i, _n, tt) => {
      const c = i - (n - 1) / 2;
      const t0 = 0.04 + i * 0.07;
      const p = seg(tt, t0, 0.5);
      const e = Ease.outBack(p);
      const sq = Ease.inExpo(seg(tt, outS, 0.33));
      const k = kick(tt);
      return {
        x: c * pitch * sq * 1.6,
        y: (1 - Ease.outCubic(p)) * -size * 0.7,
        sx: Math.max(0.02, e) * k * (1 + sq * 1.6),
        sy: Math.max(0.02, e) * k * (1 - sq * 0.97),
        alpha: seg(tt, t0, 0.12),
        blur: (1 - seg(tt, t0, 0.3)) * 14 + sq * 10,
      };
    };

    // Gema outline yang mengembang
    for (let k = 0; k < 4; k++) {
      const p = seg(lt, 0.45 + k * 0.32, 1.0);
      if (p <= 0 || p >= 1) continue;
      const s = 1 + Ease.outCubic(p) * (0.9 + k * 0.15);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * (1 - Ease.outCubic(p)) * 0.55 * (1 - sqz);
      ctx.scale(s, s);
      drawLetters(ctx, env, lay, () => ({}), lt, k % 2 ? color : acc, { mb: false, stroke: 3 / s });
      ctx.restore();
    }

    // Garis cahaya saat kata dipipihkan
    if (sqz > 0.001) {
      const w = lay.total * (1 + sqz * 0.8);
      const h = Math.max(4, size * 0.9 * (1 - sqz));
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * sqz;
      ctx.fillStyle = acc;
      ctx.shadowColor = acc;
      ctx.shadowBlur = env.lite ? 0 : 30;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    const g = pulse(lt, 0.55, 0.08) * 0.8 + seg(lt, outS, 0.3) * 0.6;
    glitchDraw(ctx, env, 37, g, (over) => drawLetters(ctx, env, lay, st, lt, over || color));
  },

  // 6. orang-orang — kerumunan salinan kecil melintas, huruf utama berkumpul dari segala arah
  crowd(ctx, env, sc, lt, d) {
    const { cfg, W, H } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const outS = d - 0.6;
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.8, 0.03);
    const lay = layout(ctx, cfg, sc.text, size, 0.03);
    const fadeOut = 1 - seg(lt, outS, 0.5);

    // Kerumunan
    const base = ctx.globalAlpha;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const span = W * 1.4;
    for (let i = 0; i < 46; i++) {
      const a = seg(lt, hash(i * 1.7 + 4) * 0.9, 0.4) * fadeOut;
      if (a <= 0.01) continue;
      const fs = 34 + hash(i * 2.9 + 1) * 70;
      const dir = hash(i + 77) < 0.5 ? -1 : 1;
      const speed = 40 + hash(i * 5.3) * 140;
      const x = frac(hash(i * 3.1 + 2) + (dir * speed * lt) / span) * span - span / 2;
      const y = hashS(i * 4.7 + 9) * H * 0.46;
      let alpha = a * (0.12 + 0.28 * hash(i + 31));
      if (Math.abs(y) < size * 0.95) alpha *= 0.2;
      ctx.globalAlpha = base * alpha;
      ctx.fillStyle = hash(i + 51) < 0.18 ? acc : color;
      ctx.font = fontStr(cfg, fs);
      ctx.fillText(sc.text, x, y);
    }
    ctx.restore();

    // Pelat gelap agar kata utama terbaca
    const plate = seg(lt, 0.2, 0.6) * fadeOut;
    if (plate > 0.01) {
      ctx.save();
      ctx.globalAlpha = base * plate * 0.85;
      ctx.scale(lay.total * 0.62, size * 0.75);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, hexA(col(cfg, 'bg'), 0.95));
      gr.addColorStop(1, hexA(col(cfg, 'bg'), 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const st = (i, _n, tt) => {
      const t0 = 0.15 + hash(i * 6.1 + 3) * 0.35;
      const pin = Ease.outExpo(seg(tt, t0, 0.9));
      const pout = Ease.inExpo(seg(tt, outS + hash(i + 8) * 0.15, 0.45));
      const x0 = hashS(i * 2.3 + 5) * W * 0.45;
      const y0 = hashS(i * 3.9 + 1) * H * 0.4;
      return {
        x: lerp(x0, 0, pin) + pout * hashS(i + 40) * W * 0.5,
        y: lerp(y0, 0, pin) + pout * hashS(i + 60) * H * 0.4,
        s: lerp(0.35, 1, pin) * (1 - pout * 0.6),
        rot: hashS(i + 12) * 1.2 * (1 - pin) + pout * hashS(i + 15),
        alpha: seg(tt, t0, 0.25) * (1 - pout),
        blur: (1 - pin) * 16 + pout * 18,
      };
    };
    drawLetters(ctx, env, lay, st, lt, color);

    // Titik aksen di bawah kata
    const dots = Ease.outExpo(seg(lt, 1.0, 0.6)) * fadeOut;
    if (dots > 0.01) {
      ctx.save();
      ctx.globalAlpha = base * dots;
      ctx.fillStyle = acc;
      const nd = 11;
      for (let i = 0; i < nd; i++) {
        const x = lerp(-lay.total / 2, lay.total / 2, i / (nd - 1)) * dots;
        ctx.fillRect(x - 5, size * 0.66, 10, 10);
      }
      ctx.restore();
    }
  },

  // 7. dan bagaimana mereka — kata muncul satu per satu dari balik mask, kotak sorot berpindah
  wordByWord(ctx, env, sc, lt, d) {
    const { cfg, W } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const bg = col(cfg, 'bg');
    const tr = 0.02;
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.86, tr);
    const lay = layout(ctx, cfg, sc.text, size, tr);
    const words = [];
    const wordOf = lay.letters.map(() => -1);
    let cur = null;
    lay.letters.forEach((L, i) => {
      if (L.ch === ' ') {
        cur = null;
        return;
      }
      if (!cur) {
        cur = { i0: i, i1: i };
        words.push(cur);
      }
      cur.i1 = i;
      wordOf[i] = words.length - 1;
    });
    words.forEach((w) => {
      const a = lay.letters[w.i0];
      const b = lay.letters[w.i1];
      w.x0 = a.cx - a.w / 2 - 16;
      w.x1 = b.cx + b.w / 2 + 16;
    });
    const outS = d - 0.55;
    const T = (k) => 0.1 + k * 0.5;
    const box = (k, tt) => {
      const on = Ease.outExpo(seg(tt, T(k) + 0.12, 0.35));
      const next = k + 1 < words.length ? T(k + 1) + 0.12 : outS;
      const off = Ease.inExpo(seg(tt, next, 0.25));
      return { on, off };
    };

    // Kotak sorot (huruf yang tertutup kotak digambar dengan warna latar)
    const spans = words.map((w, k) => {
      const { on, off } = box(k, lt);
      return { l: lerp(w.x0, w.x1, off), r: lerp(w.x0, w.x1, on) };
    });
    ctx.save();
    ctx.fillStyle = acc;
    spans.forEach((s) => {
      if (s.r - s.l > 0.5) ctx.fillRect(s.l, -size * 0.5, s.r - s.l, size * 1.0);
    });
    ctx.restore();

    const inv = lay.letters.map((L, i) => {
      const s = spans[wordOf[i]];
      return !!s && L.cx >= s.l && L.cx <= s.r;
    });
    const st = (i, _n, tt) => {
      const k = wordOf[i];
      if (k < 0) return { alpha: 0 };
      const t0 = T(k) + (i - words[k].i0) * 0.025;
      const p = Ease.outExpo(seg(tt, t0, 0.6));
      const pout = Ease.inExpo(seg(tt, outS + k * 0.06, 0.4));
      return {
        y: (1 - p) * size * 1.0 - pout * size * 1.1,
        alpha: seg(tt, t0, 0.1) * (1 - pout),
        blur: pout * 14,
      };
    };
    const pick = (flag) => (i, n, tt) => (inv[i] === flag ? st(i, n, tt) : { alpha: 0 });

    ctx.save();
    ctx.beginPath();
    ctx.rect(-W, -size * 0.7, W * 2, size * 1.4);
    ctx.clip();
    drawLetters(ctx, env, lay, pick(false), lt, color);
    drawLetters(ctx, env, lay, pick(true), lt, bg);
    ctx.restore();
  },

  // 8. yang tak mampu — glitch berat: huruf berkedip, irisan, blok warna, padam di akhir
  heavyGlitch(ctx, env, sc, lt, d) {
    const { cfg, W, H } = env;
    const color = col(cfg, sc.color);
    const acc = col(cfg, sc.accent);
    const size = fit(ctx, cfg, sc.text, sc.size, W * 0.86, 0.03);
    const lay = layout(ctx, cfg, sc.text, size, 0.03);
    const k = Math.floor(env.t * 20);
    const endS = d - 0.7;
    const gIn = 1 - seg(lt, 0, 0.8);
    const gEnd = seg(lt, endS, 0.5);
    const g = clamp(0.12 + gIn * 0.9 + pulse(lt, 1.2, 0.1) * 0.8 + pulse(lt, 1.55, 0.06) * 0.6 + gEnd);
    const fade = 1 - seg(lt, d - 0.25, 0.2);

    const st = (i, _n, tt) => {
      const kk = Math.floor((env.t + (tt - lt)) * 20);
      const settle = seg(tt, 0.05 + i * 0.03, 0.7);
      const on = hash(i * 9.1 + kk * 1.3) < 0.25 + settle * 0.85;
      const jit = 1 - settle + gEnd;
      const drop = gEnd > 0 && hash(i + kk * 7.7) > 1 - gEnd * 0.8;
      return {
        x: hashS(i * 2.1 + kk * 0.7) * 40 * jit,
        y: hashS(i * 5.5 + kk * 1.1) * 18 * jit,
        sx: 1 + hashS(i + kk * 3.3) * 0.4 * jit,
        sy: 1,
        alpha: (on ? 1 : 0.12) * fade * (drop ? 0 : 1),
      };
    };

    // Garis aksen
    const ul = Ease.outExpo(seg(lt, 0.6, 0.8)) * (1 - gEnd);
    if (ul > 0.01) {
      ctx.save();
      ctx.fillStyle = acc;
      ctx.fillRect(-lay.total / 2, size * 0.62, lay.total * ul, 10);
      ctx.restore();
    }

    glitchDraw(ctx, env, 51, g, (over) => drawLetters(ctx, env, lay, st, lt, over || color, { mb: false }));

    // Blok warna + garis pindai
    if (g > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 8; j++) {
        if (hash(k * 1.7 + j * 3.1) > g * 0.6) continue;
        ctx.globalAlpha = 0.35 + 0.35 * hash(k + j * 9.9);
        ctx.fillStyle = j % 3 === 0 ? col(cfg, 'accent2') : acc;
        const w = 40 + hash(k * 2.2 + j) * 320;
        const h = 6 + hash(k * 3.3 + j * 1.7) * 40;
        ctx.fillRect(hashS(k * 4.4 + j * 2.9) * W * 0.45 - w / 2, hashS(k * 5.1 + j * 6.3) * H * 0.35, w, h);
      }
      ctx.globalAlpha = 0.25 * g;
      ctx.fillStyle = '#ffffff';
      for (let j = 0; j < 5; j++) {
        ctx.fillRect(-W / 2, hashS(k * 6.7 + j * 4.1) * H * 0.5, W, 2);
      }
      ctx.restore();
    }
  },
};

// ============================================================
// LATAR, PARTIKEL, OVERLAY
// ============================================================
function defaultCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawBackground(ctx, env) {
  const { cfg, W, H, t } = env;
  const fx = cfg.effects;
  const bE = beatEnv(env, 0.25);
  ctx.fillStyle = col(cfg, 'bg');
  ctx.fillRect(0, 0, W, H);

  const r = W * (0.62 + 0.04 * Math.sin(t * 0.8) + 0.05 * bE);
  const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
  gr.addColorStop(0, col(cfg, 'bgGlow'));
  gr.addColorStop(1, hexA(col(cfg, 'bgGlow'), 0));
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);

  if (fx.lightLeaks) {
    const leaks = ['accent', 'accent2', 'gold'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    leaks.forEach((k, i) => {
      const x = W * (0.5 + 0.48 * Math.sin(t * 0.23 + i * 2.1));
      const y = H * (0.5 + 0.42 * Math.cos(t * 0.17 + i * 1.3));
      const rr = W * (0.3 + 0.08 * i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, hexA(col(cfg, k), 0.09 + 0.06 * bE));
      g.addColorStop(1, hexA(col(cfg, k), 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    ctx.restore();
  }

  if (fx.particles) {
    const N = fx.particleCount | 0;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const z = 0.3 + 0.7 * hash(i * 1.31 + 7);
      const vx = hashS(i * 2.17 + 1) * 0.012;
      const vy = -0.008 - 0.02 * hash(i * 3.71 + 2);
      let x = frac(hash(i * 4.13 + 3) + vx * t * z) * W;
      let y = frac(hash(i * 5.79 + 4) + vy * t * z) * H;
      const dx = x - W / 2;
      const dy = y - H / 2;
      const push = 1 + bE * 0.12 * z;
      x = W / 2 + dx * push;
      y = H / 2 + dy * push;
      const tw = 0.6 + 0.4 * Math.sin(t * (1 + hash(i) * 3) + i);
      ctx.globalAlpha = (0.12 + 0.5 * z) * tw;
      ctx.fillStyle = hash(i * 9.1) < 0.15 ? col(cfg, 'accent2') : col(cfg, 'text');
      const s = 1 + z * 2.6;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

const grainCache = new Map();
function grainTiles(make, amount) {
  if (grainCache.has(make)) return grainCache.get(make);
  const S = 256;
  const tiles = [];
  for (let n = 0; n < 4; n++) {
    const c = make(S, S);
    if (!c) {
      grainCache.set(make, null);
      return null;
    }
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let p = 0; p < S * S; p++) {
      const v = Math.floor(hash(p * 0.731 + n * 917.3) * 255);
      img.data[p * 4] = v;
      img.data[p * 4 + 1] = v;
      img.data[p * 4 + 2] = v;
      img.data[p * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
  grainCache.set(make, tiles);
  return tiles;
}

function drawOverlays(ctx, env, sc) {
  const { cfg, W, H, t } = env;
  const fx = cfg.effects;
  const frame = Math.floor(t * cfg.fps + 1e-6);

  if (fx.grain && env.makeCanvas) {
    const tiles = grainTiles(env.makeCanvas, fx.grainAmount);
    if (tiles) {
      const tile = tiles[frame % tiles.length];
      const ox = Math.floor(hash(frame * 1.7) * 256);
      const oy = Math.floor(hash(frame * 2.9) * 256);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = clamp(fx.grainAmount * 2.5);
      for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctx.drawImage(tile, x, y);
      ctx.restore();
    }
  }

  if (fx.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const flash = fx.beatFlash * beatEnv(env, 0.08);
  if (flash > 0.003) {
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (fx.hud) {
    const m = 54;
    const arm = 34;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = col(cfg, 'text');
    ctx.lineWidth = 2;
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * arm);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * arm, cy);
      ctx.stroke();
    }
    ctx.font = '600 20px "DejaVu Sans Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = col(cfg, 'text');
    ctx.textBaseline = 'middle';
    const s = Math.floor(t);
    const ff = String(frame % cfg.fps).padStart(2, '0');
    const tc = `00:00:${String(s).padStart(2, '0')}:${ff}`;
    ctx.textAlign = 'left';
    ctx.fillText('KINETIC / TYPE', m + 18, m + 22);
    ctx.fillText(tc, m + 18, H - m - 22);
    ctx.textAlign = 'right';
    ctx.fillText(`${cfg.width}x${cfg.height} · ${cfg.fps}FPS`, W - m - 18, m + 22);
    const idx = sc ? cfg.scenes.indexOf(sc) + 1 : 0;
    ctx.fillText(`${String(idx).padStart(2, '0')} / ${String(cfg.scenes.length).padStart(2, '0')}`, W - m - 18, H - m - 22);
    ctx.globalAlpha = Math.floor(t * 2) % 2 ? 0.9 : 0.3;
    ctx.fillStyle = col(cfg, 'accent');
    ctx.beginPath();
    ctx.arc(W - m - 300, m + 22, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = col(cfg, 'text');
    ctx.fillRect(m + 300, H - m - 23, W - 2 * m - 560, 2);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = col(cfg, 'accent');
    ctx.fillRect(m + 300, H - m - 24, (W - 2 * m - 560) * clamp(t / cfg.duration), 4);
    ctx.restore();
  }
}

export function activeScene(cfg, t) {
  for (const sc of cfg.scenes) if (t >= sc.start && t < sc.end) return sc;
  return null;
}

// ============================================================
// renderFrame(ctx, t, cfg, opts)
// opts.scale   : skala kanvas fisik vs. ukuran logis (mis. 0.5 untuk draft)
// opts.quality : pengali radius blur (default = scale)
// opts.lite    : matikan shadowBlur mahal
// opts.createCanvas(w, h): pembuat kanvas (wajib di Node untuk grain)
// ============================================================
export function renderFrame(ctx, t, cfg, opts = {}) {
  const W = cfg.width;
  const H = cfg.height;
  const scale = opts.scale || 1;
  const env = {
    cfg,
    W,
    H,
    t,
    lite: !!opts.lite,
    q: opts.quality || scale,
    filter: supportsFilter(ctx),
    makeCanvas: opts.createCanvas || defaultCanvas,
  };
  const fx = cfg.effects;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (env.filter) ctx.filter = 'none';

  drawBackground(ctx, env);

  const sc = activeScene(cfg, t);
  const bE = beatEnv(env, 0.18);
  const frame = Math.floor(t * cfg.fps + 1e-6);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.translate(hashS(frame * 1.3) * fx.beatShake * bE, hashS(frame * 2.7 + 5) * fx.beatShake * bE);
  let z = 1 + 0.025 * bE;
  if (sc) z += fx.cameraZoom * Ease.inOutCubic(seg(t, sc.start, sc.end - sc.start));
  ctx.scale(z, z);
  if (sc && STYLES[sc.style]) STYLES[sc.style](ctx, env, sc, t - sc.start, sc.end - sc.start);
  ctx.restore();
  if (env.filter) ctx.filter = 'none';

  drawOverlays(ctx, env, sc);
  ctx.restore();
}

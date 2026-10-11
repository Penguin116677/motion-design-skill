// ============================================================
// KONFIGURASI — semua yang perlu diedit ada di file ini.
// Timing di bawah adalah RANCANGAN (belum disinkronkan ke audio).
// Jika Anda punya audio, ubah `start`/`end` tiap adegan dan `beats`.
// ============================================================

export const CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 23,

  font: {
    family: 'Anton',
    file: 'assets/fonts/Anton-Regular.ttf',
    stack: '"Anton", "Bebas Neue", Impact, "Arial Black", "DejaVu Sans", sans-serif',
  },

  colors: {
    bg: '#06060a',
    bgGlow: '#1a1033',
    text: '#f5f2ea',
    accent: '#ff3d2e',
    accent2: '#2ee6ff',
    gold: '#ffb84d',
    dim: 'rgba(245,242,234,0.22)',
  },

  // src: path relatif dari root proyek, mis. 'assets/audio/musik.mp3'.
  // offset: detik di file audio yang sejajar dengan t = 0 animasi.
  audio: { src: '', offset: 0, volume: 1 },

  // Detik terjadinya beat (flash, shake, partikel meledak).
  beats: [0.6, 4.0, 6.8, 9.6, 12.4, 14.6, 17.4, 20.2],

  effects: {
    particles: true,
    particleCount: 160,
    lightLeaks: true,
    grain: true,
    grainAmount: 0.06,
    vignette: true,
    hud: true,
    beatFlash: 0.22,
    beatShake: 10,
    glitch: true,
    motionBlurSamples: 5,
    shutter: 0.05,
    cameraZoom: 0.06,
  },

  // style: dropSplit, wave, maskSplit, zoomThrough, echo, crowd, wordByWord, heavyGlitch
  // color/accent: nama kunci di `colors` atau warna CSS langsung.
  scenes: [
    { id: 's1', text: 'KEBEBASAN', style: 'dropSplit', start: 0.6, end: 4.0, size: 290, color: 'text', accent: 'accent' },
    { id: 's2', text: 'Fleksibilitas', style: 'wave', start: 4.0, end: 6.8, size: 230, color: 'text', accent: 'accent2' },
    { id: 's3', text: 'ADAPTASI', style: 'maskSplit', start: 6.8, end: 9.6, size: 300, color: 'text', accent: 'gold' },
    { id: 's4', text: 'MANFAATKAN', style: 'zoomThrough', start: 9.6, end: 12.4, size: 260, color: 'text', accent: 'accent' },
    { id: 's5', text: 'AKAN', style: 'echo', start: 12.4, end: 14.6, size: 420, color: 'accent', accent: 'text' },
    { id: 's6', text: 'orang-orang', style: 'crowd', start: 14.6, end: 17.4, size: 200, color: 'text', accent: 'accent2' },
    { id: 's7', text: 'dan bagaimana mereka', style: 'wordByWord', start: 17.4, end: 20.2, size: 190, color: 'text', accent: 'gold' },
    { id: 's8', text: 'yang tak mampu', style: 'heavyGlitch', start: 20.2, end: 23.0, size: 300, color: 'text', accent: 'accent' },
  ],
};

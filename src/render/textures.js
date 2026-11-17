// Procedural canvas textures (no image assets).
import * as THREE from 'three';

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function speckle(ctx, w, h, n, colors, rmin, rmax, r) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = rmin + r() * (rmax - rmin);
    ctx.globalAlpha = 0.25 + r() * 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// Road surface: u across (0..1), v along (tiles every ~8m)
export function roadTexture(theme) {
  return cached('road-' + theme, () => {
    const [c, ctx] = canvas(512, 512);
    const r = rng(11);
    const base = { meadow: '#5b5f66', desert: '#7a6253', snow: '#4d5560', neon: '#16121f' }[theme];
    ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
    const sp = theme === 'neon' ? ['#241d33', '#0c0a12', '#2d2440'] : ['#6e737b', '#4a4d53', '#7c8189', '#3f4246'];
    speckle(ctx, 512, 512, 9000, theme === 'desert' ? ['#8a7060', '#6a5244', '#94796a'] : sp, 1, 3, r);
    // subtle tire tracks
    ctx.globalAlpha = theme === 'neon' ? 0.15 : 0.08;
    ctx.fillStyle = '#000';
    for (const x of [150, 190, 322, 362]) ctx.fillRect(x, 0, 18, 512);
    ctx.globalAlpha = 1;
    // edge lines
    if (theme === 'neon') {
      ctx.fillStyle = '#2a2140';
      for (let x = 0; x <= 512; x += 64) ctx.fillRect(x - 1, 0, 2, 512);
      for (let y = 0; y <= 512; y += 64) ctx.fillRect(0, y - 1, 512, 2);
    }
    ctx.fillStyle = theme === 'neon' ? '#ff4fd8' : '#f4f4f0';
    ctx.fillRect(14, 0, 8, 512); ctx.fillRect(490, 0, 8, 512);
    // center dashes
    ctx.fillStyle = theme === 'neon' ? '#4ff3ff' : '#f6d64a';
    ctx.fillRect(252, 0, 8, 200); ctx.fillRect(252, 256, 8, 200);
    return tex(c);
  });
}

export function curbTexture(theme) {
  return cached('curb-' + theme, () => {
    const [c, ctx] = canvas(64, 256);
    const cols = { meadow: ['#e8333a', '#fafafa'], desert: ['#e2762b', '#fff4dc'], snow: ['#2f7fe0', '#fafafa'], neon: ['#ff2fd0', '#22e9ff'] }[theme];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i % 2]; ctx.fillRect(0, i * 64, 64, 64); }
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, 6, 256);
    return tex(c);
  });
}

export function groundTexture(theme) {
  return cached('ground-' + theme, () => {
    const [c, ctx] = canvas(512, 512);
    const r = rng(23);
    const conf = {
      meadow: ['#5fb043', ['#6cc04c', '#4f9a37', '#7ccf58', '#57a83d', '#8fd866']],
      desert: ['#e6b874', ['#efc584', '#d9a862', '#f3cf96', '#c99a58']],
      snow: ['#eef4fb', ['#ffffff', '#dfe8f3', '#e7eef8', '#cfdcec']],
      neon: ['#120f1d', ['#1a1528', '#0d0b15', '#1f1930']],
    }[theme];
    ctx.fillStyle = conf[0]; ctx.fillRect(0, 0, 512, 512);
    // large blotches
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = conf[1][Math.floor(r() * conf[1].length)];
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(r() * 512, r() * 512, 20 + r() * 60, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, 512, 512, 14000, conf[1], 1, 3, r);
    if (theme === 'meadow') {
      // grass blades
      for (let i = 0; i < 2500; i++) {
        ctx.strokeStyle = r() > 0.5 ? '#3f8a2b' : '#86d75e';
        ctx.globalAlpha = 0.5;
        const x = r() * 512, y = r() * 512;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (theme === 'neon') {
      ctx.strokeStyle = 'rgba(120,80,255,0.35)'; ctx.lineWidth = 2;
      for (let x = 0; x <= 512; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
      for (let y = 0; y <= 512; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    }
    return tex(c);
  });
}

export function shoulderTexture(theme) {
  return cached('shoulder-' + theme, () => {
    const g = groundTexture(theme);
    return g; // same material, different UV scale is enough
  });
}

export function checkerTexture() {
  return cached('checker', () => {
    const [c, ctx] = canvas(256, 64);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    return tex(c);
  });
}

export function boostPadTexture() {
  return cached('boost', () => {
    const [c, ctx] = canvas(128, 256);
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#ff9a00'); grd.addColorStop(1, '#ffe14a');
    ctx.fillStyle = '#2a1600'; ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = grd;
    for (let i = 0; i < 2; i++) {
      const y = i * 128;
      ctx.beginPath(); ctx.moveTo(14, y + 104); ctx.lineTo(64, y + 34); ctx.lineTo(114, y + 104); ctx.lineTo(114, y + 124); ctx.lineTo(64, y + 62); ctx.lineTo(14, y + 124); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 6; ctx.strokeRect(3, -10, 122, 280);
    return tex(c);
  });
}

export function rampTexture() {
  return cached('ramp', () => {
    const [c, ctx] = canvas(256, 64);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#1d4fd8' : '#f8f8f8'; ctx.fillRect(i * 32, 0, 32, 64); }
    return tex(c);
  });
}

export function windowTexture(seed = 1, hue = 280) {
  return cached('win-' + seed + '-' + hue, () => {
    const [c, ctx] = canvas(128, 256);
    const r = rng(seed * 97 + 5);
    ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 256; y += 14) for (let x = 6; x < 128; x += 14) {
      if (r() < 0.42) {
        const h = hue + (r() - 0.5) * 60;
        ctx.fillStyle = r() < 0.6 ? `hsl(${h},90%,${55 + r() * 25}%)` : `hsl(45,90%,${60 + r() * 20}%)`;
        ctx.fillRect(x, y, 8, 9);
      }
    }
    return tex(c);
  });
}

export function signTexture(text, c1 = '#ff3fd8', c2 = '#28e7ff') {
  return cached('sign-' + text + c1, () => {
    const [c, ctx] = canvas(512, 160);
    ctx.fillStyle = '#0a0612'; ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = c2; ctx.lineWidth = 8; ctx.shadowColor = c2; ctx.shadowBlur = 18; ctx.strokeRect(10, 10, 492, 140);
    ctx.font = 'bold 92px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = c1; ctx.shadowBlur = 24; ctx.fillStyle = c1;
    ctx.fillText(text, 256, 84);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.fillText(text, 256, 84);
    return tex(c, { repeat: false });
  });
}

export function bannerTexture(text, bg = '#e8333a', fg = '#fff') {
  return cached('banner-' + text + bg, () => {
    const [c, ctx] = canvas(1024, 128);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let x = -128; x < 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 128); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 96, 0); ctx.lineTo(x + 32, 128); ctx.fill(); }
    ctx.font = 'bold 84px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeText(text, 512, 68);
    ctx.fillStyle = fg; ctx.fillText(text, 512, 68);
    return tex(c, { repeat: false });
  });
}

export function crystalTexture() {
  return cached('crystal', () => {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffe9ff'); g.addColorStop(1, '#a0e9ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    // star
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b86b00'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 20 : 44;
      ctx.lineTo(64 + Math.cos(a) * rr, 66 + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    return tex(c, { repeat: false });
  });
}

export function particleTexture() {
  return cached('particle', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return tex(c, { repeat: false, srgb: false });
  });
}

export function cloudTexture() {
  return cached('cloud', () => {
    const [c, ctx] = canvas(256, 128);
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = 40 + r() * 176, y = 50 + r() * 40, rad = 18 + r() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    return tex(c, { repeat: false });
  });
}

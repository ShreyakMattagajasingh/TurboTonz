// DOM HUD: one panel per split-screen viewport + shared minimap + center messages.
import { ITEM_ICONS } from '../pad/icons.js';
import { ROTATION } from '../game/items.js';

// Hooky, the rescue drone, carrying the start lights (drawn once, reused per panel)
const LIGHTS_SVG = `<svg viewBox="0 0 200 150" aria-hidden="true">
  <g class="rotor"><rect x="18" y="8" width="64" height="7" rx="3.5" fill="#d8e3f5"/><rect x="118" y="8" width="64" height="7" rx="3.5" fill="#d8e3f5"/></g>
  <rect x="46" y="14" width="8" height="14" fill="#5a6378"/><rect x="146" y="14" width="8" height="14" fill="#5a6378"/>
  <rect x="40" y="24" width="120" height="36" rx="18" fill="#ffd23f" stroke="#1a0f2e" stroke-width="5"/>
  <circle cx="84" cy="42" r="9" fill="#fff" stroke="#1a0f2e" stroke-width="3"/><circle cx="116" cy="42" r="9" fill="#fff" stroke="#1a0f2e" stroke-width="3"/>
  <circle cx="86" cy="43" r="4.5" fill="#1a0f2e"/><circle cx="118" cy="43" r="4.5" fill="#1a0f2e"/>
  <path d="M100 60 L100 74" stroke="#1a0f2e" stroke-width="4"/>
  <rect x="34" y="72" width="132" height="58" rx="16" fill="#1d1830" stroke="#1a0f2e" stroke-width="5"/>
  <circle class="lamp l1" cx="66" cy="101" r="17"/><circle class="lamp l2" cx="100" cy="101" r="17"/><circle class="lamp l3" cx="134" cy="101" r="17"/>
</svg>`;
const REEL_LEN = 16;

const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const PLACE_COLORS = ['#ffd23f', '#d9e3ee', '#ff9a52', '#7fd6ff', '#9be37a', '#c69bff', '#ff8fb1', '#ffffff'];

export function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.panels = new Map();
    this.mini = document.createElement('canvas');
    this.mini.className = 'minimap';
    root.appendChild(this.mini);
    this.flash = document.createElement('div'); this.flash.className = 'zap-flash'; root.appendChild(this.flash);
    this.trackCanvas = null;
  }

  clear() { this.panels.forEach(p => p.el.remove()); this.panels.clear(); this.mini.style.display = 'none'; }

  setRace(race) {
    this.clear();
    this.race = race;
    this.mini.style.display = 'block';
    // pre-render the track outline
    const g = race.geo;
    const pad = 24;
    const w = g.maxX - g.minX, h = g.maxZ - g.minZ;
    this.mapScale = 220 / Math.max(w, h);
    const cw = Math.ceil(w * this.mapScale + pad * 2), ch = Math.ceil(h * this.mapScale + pad * 2);
    this.mapPad = pad; this.mapW = cw; this.mapH = ch;
    const c = document.createElement('canvas'); c.width = cw * 2; c.height = ch * 2;
    const ctx = c.getContext('2d'); ctx.scale(2, 2);
    const P = (i) => [(g.x[i] - g.minX) * this.mapScale + pad, (g.z[i] - g.minZ) * this.mapScale + pad];
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [lw, col] of [[14, 'rgba(0,0,0,0.55)'], [9, '#ffffff'], [6, '#4a4f5c']]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
      for (let i = 0; i <= g.N; i++) { const [x, y] = P(i % g.N); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // start line
    const [sx, sy] = P(0);
    ctx.fillStyle = '#fff'; ctx.fillRect(sx - 5, sy - 5, 10, 10);
    ctx.fillStyle = '#111'; ctx.fillRect(sx - 5, sy - 5, 5, 5); ctx.fillRect(sx, sy, 5, 5);
    this.trackCanvas = c;
    this.mini.width = cw * 2; this.mini.height = ch * 2;
    this.mini.style.width = cw + 'px'; this.mini.style.height = ch + 'px';
  }

  panel(kartId) {
    let p = this.panels.get(kartId);
    if (p) return p;
    const el = document.createElement('div');
    el.className = 'hud-panel';
    el.innerHTML = `
      <div class="hud-speedlines"></div>
      <div class="hud-top">
        <div class="hud-item"><div class="hud-item-icon"></div><div class="hud-item-count"></div></div>
        <div class="hud-lap"><span class="lbl">LAP</span> <b class="cur">1</b><span class="tot">/3</span></div>
        <div class="hud-name"></div>
      </div>
      <div class="hud-time"></div>
      <div class="hud-center"></div>
      <div class="hud-banner"></div>
      <div class="hud-wrong">WRONG WAY!</div>
      <div class="hud-lights">${LIGHTS_SVG}</div>
      <div class="hud-grid"></div>
      <div class="hud-place"><b>1</b><sup>st</sup></div>`;
    this.root.appendChild(el);
    p = {
      el, icon: el.querySelector('.hud-item-icon'), count: el.querySelector('.hud-item-count'), item: el.querySelector('.hud-item'),
      lap: el.querySelector('.hud-lap .cur'), tot: el.querySelector('.hud-lap .tot'), name: el.querySelector('.hud-name'),
      time: el.querySelector('.hud-time'), center: el.querySelector('.hud-center'), banner: el.querySelector('.hud-banner'),
      wrong: el.querySelector('.hud-wrong'), place: el.querySelector('.hud-place'), lines: el.querySelector('.hud-speedlines'),
      lights: el.querySelector('.hud-lights'), grid: el.querySelector('.hud-grid'),
      last: {}, rolling: false,
    };
    this.panels.set(kartId, p);
    return p;
  }

  banner(kartId, text, cls = '') {
    const p = this.panels.get(kartId);
    if (!p) return;
    p.banner.textContent = text;
    p.banner.className = 'hud-banner show ' + cls;
    clearTimeout(p.bannerTimer);
    p.bannerTimer = setTimeout(() => { p.banner.className = 'hud-banner'; }, cls === 'falls' ? 2400 : 1800);
  }

  // Slot-machine reel in the item box: a strip of icons that spins down and lands on `item`.
  roll(kartId, item, dur = 1.3) {
    const p = this.panels.get(kartId);
    if (!p) return;
    const ids = [];
    for (let i = 0; i < REEL_LEN - 1; i++) ids.push(ROTATION[(i * 3 + Math.floor(Math.random() * 5)) % ROTATION.length]);
    ids.push(item);
    p.icon.innerHTML = `<div class="reel">${ids.map(id => `<div class="cell">${ITEM_ICONS[id] || ''}</div>`).join('')}</div>`;
    const reel = p.icon.firstChild;
    p.item.classList.add('rolling'); p.item.classList.remove('has', 'pop');
    p.rolling = true; p.last.icon = 'roll';
    reel.style.transform = 'translateY(0)';
    void reel.offsetWidth;
    reel.style.transition = `transform ${dur}s cubic-bezier(.12,.72,.22,1.04)`;
    reel.style.transform = `translateY(-${(REEL_LEN - 1) * 100}%)`;
    clearTimeout(p.rollTimer);
    p.rollTimer = setTimeout(() => { p.rolling = false; p.last.icon = null; }, dur * 1000 + 30);
  }

  update(viewports, dt, zapFlash = 0) {
    const race = this.race;
    if (!race) return;
    const ids = new Set(viewports.map(v => v.kartId));
    for (const [id, p] of this.panels) if (!ids.has(id)) { p.el.remove(); this.panels.delete(id); }
    const small = viewports.length > 2;
    for (const vp of viewports) {
      const k = race.karts[vp.kartId];
      const p = this.panel(vp.kartId);
      const s = p.el.style;
      s.left = vp.x + 'px'; s.top = vp.y + 'px'; s.width = vp.w + 'px'; s.height = vp.h + 'px';
      const scale = Math.max(0.55, Math.min(1.25, Math.min(vp.h / 720, vp.w / 900) * (small ? 1.35 : 1.15)));
      s.setProperty('--s', scale.toFixed(3));
      s.setProperty('--pc', k.color);
      // name
      if (p.last.name !== k.name) { p.name.textContent = k.name; p.last.name = k.name; }
      // lap
      const lap = Math.min(race.laps, Math.max(1, k.lap + 1));
      if (p.last.lap !== lap) { p.lap.textContent = lap; p.tot.textContent = '/' + race.laps; p.last.lap = lap; }
      // place
      if (p.last.place !== k.place) {
        p.place.innerHTML = `<b>${k.place}</b><sup>${ORD(k.place).replace(/\d+/, '')}</sup>`;
        p.place.style.setProperty('--plc', PLACE_COLORS[k.place - 1] || '#fff');
        p.place.classList.remove('bump'); void p.place.offsetWidth; p.place.classList.add('bump');
        p.last.place = k.place;
      }
      // time
      const tt = k.finished ? k.finishTime : race.time;
      p.time.textContent = viewports.length <= 2 ? fmtTime(tt) : '';
      // item slot (the reel animates itself while rolling)
      const iconKey = k.item || '';
      if (!p.rolling && p.last.icon !== iconKey) {
        p.icon.innerHTML = iconKey ? ITEM_ICONS[iconKey] || '' : '';
        p.item.classList.remove('rolling');
        p.item.classList.toggle('has', !!k.item);
        if (k.item && p.last.icon === null) { p.item.classList.remove('pop'); void p.item.offsetWidth; p.item.classList.add('pop'); }
        p.last.icon = iconKey;
      }
      const cnt = k.item && k.itemCharges > 1 ? '×' + k.itemCharges : '';
      if (p.last.cnt !== cnt) { p.count.textContent = cnt; p.last.cnt = cnt; }
      // center: countdown / finish
      let center = '';
      let ccls = '';
      if (race.phase === 'countdown') {
        const n = Math.ceil(race.countdown);
        if (n >= 1 && n <= 3) { center = String(n); ccls = 'count c' + n; }
      } else if (race.time < 1.0 && race.phase === 'race' && !race.attract) { center = 'GO!'; ccls = 'go'; }
      // the drone with the start lights hangs in each screen during the countdown
      const lit = race.phase === 'countdown' ? Math.max(0, Math.min(3, 4 - Math.ceil(race.countdown))) : 4;
      const lightsOn = race.phase === 'countdown' || race.time < 1.2;
      if (p.last.lit !== lit || p.last.lightsOn !== lightsOn) {
        p.lights.className = 'hud-lights' + (lightsOn ? ' show' : '') + ' lit' + lit;
        p.last.lit = lit; p.last.lightsOn = lightsOn;
      }
      const gridTxt = race.phase === 'countdown' && race.countdown > 1 ? `${k.name} · GRID ${k.gridPos ?? k.place}` : '';
      if (p.last.grid !== gridTxt) { p.grid.textContent = gridTxt; p.grid.classList.toggle('show', !!gridTxt); p.last.grid = gridTxt; }
      if (k.finished) { center = k.place <= 3 ? 'FINISH!' : 'FINISH'; ccls = 'finish'; }
      if (p.last.center !== center) {
        p.center.textContent = center; p.center.className = 'hud-center ' + ccls;
        if (center) { p.center.classList.remove('anim'); void p.center.offsetWidth; p.center.classList.add('anim'); }
        p.last.center = center;
      }
      // wrong way (the sim counts it; past ~1.8 s the drone turns you around)
      p.wrong.classList.toggle('show', k.wrongT > 0.5 && k.rescueT <= 0);
      // speed lines
      const boosting = k.boostT > 0 || k.megaT > 0;
      p.lines.style.opacity = boosting ? '1' : String(Math.max(0, (k.v - 30) / 10) * 0.4);
      p.el.classList.toggle('mega', k.megaT > 0);
      p.el.classList.toggle('drift1', k.driftLevel === 1);
      p.el.classList.toggle('drift2', k.driftLevel === 2);
      p.el.classList.toggle('drift3', k.driftLevel === 3);
    }
    this.flash.style.opacity = String(Math.min(0.7, zapFlash * 0.7));
    this.drawMini(viewports);
  }

  drawMini(viewports) {
    const race = this.race, ctx = this.mini.getContext('2d');
    if (!this.trackCanvas) return;
    const W = this.root.clientWidth, H = this.root.clientHeight;
    const n = viewports.length;
    const ms = this.mini.style;
    let scale = Math.min(1.1, Math.max(0.55, H / 900));
    if (n <= 1) { ms.left = '18px'; ms.top = (H - this.mapH * scale - 18) + 'px'; ms.transform = `scale(${scale})`; ms.transformOrigin = '0 0'; }
    else {
      scale *= n > 4 ? 0.62 : 0.72;
      ms.transformOrigin = '0 0'; ms.transform = `scale(${scale})`;
      ms.left = (W / 2 - this.mapW * scale / 2) + 'px'; ms.top = (H / 2 - this.mapH * scale / 2) + 'px';
      if (n === 2) ms.top = (H * 0.5 - this.mapH * scale * 0.5) + 'px';
      if (n === 3) { ms.left = (W * 0.75 - this.mapW * scale / 2) + 'px'; ms.top = (H * 0.75 - this.mapH * scale / 2) + 'px'; }
    }
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, this.mapW, this.mapH);
    ctx.drawImage(this.trackCanvas, 0, 0, this.mapW, this.mapH);
    const g = race.geo;
    const P = (x, z) => [(x - g.minX) * this.mapScale + this.mapPad, (z - g.minZ) * this.mapScale + this.mapPad];
    // items
    for (const pr of race.projectiles) { const [x, y] = P(pr.x, pr.z); ctx.fillStyle = pr.type === 'rocket' ? '#ff3b3b' : '#3ddc5a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    const sorted = [...race.karts].sort((a, b) => (a.human - b.human) || (b.place - a.place));
    for (const k of sorted) {
      const [x, y] = P(k.x, k.z);
      const r = k.human ? 7 : 4.5;
      ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = k.color; ctx.fill();
      if (k.human) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k.slot + 1), x, y + 0.5); }
    }
  }
}

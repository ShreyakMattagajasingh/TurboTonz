// Race controller: floating analog thumbstick (or tilt) on the left, Joy-Con style 4-button diamond on the right.
//   UP = hop (u) · LEFT = boost / honk (l) · DOWN = drift (d) · RIGHT = item (i)
// Every control tracks its own pointerId(s) so stick + drift + item work simultaneously.
import { $, store, haptic, clamp, ordinal } from './common.js';
import { ITEM_ICONS, ITEM_IDS, ITEM_LABELS } from './icons.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const MAX_TILT = 32;     // degrees for full lock
const TILT_DEAD = 2.5;   // degrees
const STICK_DEAD = 0.06; // radial deadzone (fraction of radius)
const STICK_CURVE = 1.25;
const KEYS = ['u', 'l', 'i', 'd'];
// reel filler: the "main" items first; falls back to whatever icons exist
const REEL_POOL = ['nitro', 'bouncer', 'rocket', 'oil', 'mega', 'shield', 'zap'].filter((id) => ITEM_ICONS[id]);

export function createRace(ctx) {
  const zone = $('#stickZone');
  const stickEl = $('#stick');
  const knob = $('#knob');
  const padZone = $('#padZone');
  const diamond = $('#diamond');
  const btnEls = {};
  diamond.querySelectorAll('.dbtn').forEach((el) => { btnEls[el.dataset.k] = el; });

  const storedMode = store.get('pk_steer');
  const S = {
    mode: storedMode === 'tilt' ? 'tilt' : 'stick',
    offset: 0, rollRaw: 0, roll: 0, tiltSeen: false,
    tiltPermission: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function' ? 'unknown' : 'n/a',
    stick: 0,             // processed stick steer -1..1
    stickId: null, ox: 0, oy: 0, kx: 0, ky: 0,
    held: { u: 0, l: 0, i: 0, d: 0 },
    ptr: new Map(),       // pointerId -> key (diamond)
    active: false, phase: 'lobby', seq: 0,
    timer: 0, raf: 0, lastSend: 0,
    item: null, rolling: false, reelAnim: null,
    wl: null, flashT: 0, countT: 0,
  };
  try { S.offset = parseFloat(sessionStorage.getItem('pk_tilt_off')) || 0; } catch {}

  /* ================= tilt ================= */
  function screenAngle() {
    let a = 0;
    try {
      if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
      else if (typeof window.orientation === 'number') a = window.orientation;
    } catch {}
    return ((a % 360) + 360) % 360;
  }
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!S.tiltSeen) { S.tiltSeen = true; refreshTiltUI(); }
    const b = e.beta * D2R, g = e.gamma * D2R;
    const ux = -Math.cos(b) * Math.sin(g);
    const uy = Math.sin(b);
    let sx, sy;
    switch (screenAngle()) {
      case 90: sx = -uy; sy = ux; break;
      case 270: sx = uy; sy = -ux; break;
      case 180: sx = -ux; sy = -uy; break;
      default: sx = ux; sy = uy;
    }
    if (Math.hypot(sx, sy) < 0.2) return;
    S.rollRaw = Math.atan2(-sx, sy) * R2D;
    S.roll += (S.rollRaw - S.roll) * 0.5;
  }
  window.addEventListener('deviceorientation', onOrient, true);

  function tiltSteer() {
    const d = S.roll - S.offset, a = Math.abs(d);
    if (a < TILT_DEAD) return 0;
    const x = clamp((a - TILT_DEAD) / (MAX_TILT - TILT_DEAD), 0, 1);
    return Math.sign(d) * Math.pow(x, 1.15);
  }
  function calibrate() {
    S.offset = S.rollRaw; S.roll = S.rollRaw;
    try { sessionStorage.setItem('pk_tilt_off', String(S.offset)); } catch {}
    haptic(20); flashTilt('CENTERED');
  }
  async function enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        S.tiltPermission = await DeviceOrientationEvent.requestPermission();
      }
    } catch { S.tiltPermission = 'denied'; }
    refreshTiltUI();
  }
  function flashTilt(t) {
    $('#tiltMsg').textContent = t;
    clearTimeout(flashTilt.t);
    flashTilt.t = setTimeout(refreshTiltUI, 900);
  }
  function refreshTiltUI() {
    const el = $('#tiltMsg'), btn = $('#enableTilt');
    const needPerm = S.tiltPermission === 'unknown' || S.tiltPermission === 'denied';
    if (S.mode !== 'tilt') { btn.hidden = true; return; }
    if (S.tiltSeen) { el.textContent = 'TILT TO STEER'; el.classList.remove('warn'); btn.hidden = true; }
    else if (needPerm) { el.textContent = S.tiltPermission === 'denied' ? 'TILT BLOCKED' : 'TILT NEEDS OK'; el.classList.add('warn'); btn.hidden = false; }
    else { el.textContent = 'NO TILT SENSOR — USE STICK'; el.classList.add('warn'); btn.hidden = true; }
  }

  function setMode(m, persist = true) {
    S.mode = m === 'tilt' ? 'tilt' : 'stick';
    if (persist) store.set('pk_steer', S.mode);
    zone.dataset.mode = S.mode;
    $('#modeToggle').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === S.mode));
    if (S.mode === 'tilt') { releaseStick(); if (S.tiltPermission === 'unknown') enableTilt(); }
    refreshTiltUI();
  }
  $('#modeToggle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.m === S.mode) return;
    haptic(15); setMode(b.dataset.m); sendIn(true);
  });
  $('#calBtn').addEventListener('click', calibrate);
  $('#enableTilt').addEventListener('click', enableTilt);

  /* ================= floating thumbstick ================= */
  function stickRadius() { return Math.max(40, stickEl.offsetWidth * 0.36); }

  function restPos() {
    const r = zone.getBoundingClientRect();
    return { x: r.width * 0.5, y: r.height * 0.56 };
  }
  function placeBase(x, y) {
    stickEl.style.left = x + 'px';
    stickEl.style.top = y + 'px';
  }
  function setKnob(dx, dy) {
    knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }
  function processStick(dx, dy) {
    const R = stickRadius();
    let nx = dx / R, ny = dy / R;
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    const L = Math.min(1, len);
    if (L < STICK_DEAD) return 0;
    const mag = (L - STICK_DEAD) / (1 - STICK_DEAD);
    const x = (nx / (L || 1)) * mag;  // horizontal component after radial deadzone rescale
    return Math.sign(x) * Math.pow(Math.min(1, Math.abs(x)), STICK_CURVE);
  }
  function stickMove(e) {
    const r = zone.getBoundingClientRect();
    const R = stickRadius();
    let dx = (e.clientX - r.left) - S.ox, dy = (e.clientY - r.top) - S.oy;
    const len = Math.hypot(dx, dy);
    // floating: if the thumb drags far past the rim, let the base follow a little (keeps full lock reachable)
    if (len > R * 1.6) {
      const pull = (len - R * 1.6) / len;
      S.ox += dx * pull; S.oy += dy * pull;
      placeBase(S.ox, S.oy);
      dx = (e.clientX - r.left) - S.ox; dy = (e.clientY - r.top) - S.oy;
    }
    const l2 = Math.hypot(dx, dy);
    const k = l2 > R ? R / l2 : 1;
    S.kx = dx * k; S.ky = dy * k;
    setKnob(S.kx, S.ky);
    const prev = S.stick;
    S.stick = processStick(dx, dy);
    if (prev !== S.stick) sendIn(false);
  }
  zone.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'stick' || S.stickId !== null || e.target.closest('button')) return;
    e.preventDefault();
    S.stickId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch {}
    const r = zone.getBoundingClientRect();
    const R = stickRadius();
    // recentre under the thumb, but keep the ring on screen
    S.ox = clamp(e.clientX - r.left, R * 0.9, r.width - R * 0.9);
    S.oy = clamp(e.clientY - r.top, R * 0.9, r.height - R * 0.9);
    stickEl.classList.add('live', 'no-anim');
    placeBase(S.ox, S.oy);
    stickMove(e);
    haptic(8);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== S.stickId) return;
    e.preventDefault();
    // coalesced events give the smoothest path on high-rate touchscreens
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    stickMove(list && list.length ? list[list.length - 1] : e);
  });
  function releaseStick() {
    S.stickId = null; S.stick = 0; S.kx = S.ky = 0;
    setKnob(0, 0);
    stickEl.classList.remove('live', 'no-anim');
    const p = restPos(); placeBase(p.x, p.y);
  }
  const endStick = (e) => { if (e.pointerId === S.stickId) { releaseStick(); sendIn(true); } };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);
  zone.addEventListener('lostpointercapture', endStick);
  window.addEventListener('resize', () => { if (S.stickId === null) { const p = restPos(); placeBase(p.x, p.y); } });

  /* ================= diamond buttons ================= */
  function centers() {
    const out = {};
    for (const k of KEYS) {
      const r = btnEls[k].getBoundingClientRect();
      out[k] = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    }
    return out;
  }
  let C = null;
  function nearest(x, y, cur) {
    let best = null, bd = Infinity;
    for (const k of KEYS) {
      const c = C[k], d = Math.hypot(x - c.x, y - c.y) / c.r;
      if (d < bd) { bd = d; best = k; }
    }
    if (cur) {
      const c = C[cur], dc = Math.hypot(x - c.x, y - c.y) / c.r;
      // hysteresis: DRIFT is sticky (thumb wobble must not drop a drift); others switch once clearly over a neighbour
      const keep = cur === 'd' ? 1.45 : 1.0;
      if (dc <= keep || best === cur) return cur;
      return bd <= 1.1 ? best : cur;
    }
    return bd <= 1.9 ? best : null;
  }
  function applyHeld() {
    const next = { u: 0, l: 0, i: 0, d: 0 };
    for (const k of S.ptr.values()) if (k) next[k] = 1;
    let changed = false;
    for (const k of KEYS) {
      if (next[k] !== S.held[k]) {
        changed = true;
        btnEls[k].classList.toggle('press', !!next[k]);
        if (next[k]) haptic(k === 'd' ? 16 : k === 'i' ? 22 : 10);
      }
    }
    S.held = next;
    if (changed) sendIn(true);
  }
  padZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    C = centers();
    const k = nearest(e.clientX, e.clientY, null);
    if (!k) return;
    try { padZone.setPointerCapture(e.pointerId); } catch {}
    S.ptr.set(e.pointerId, k);
    applyHeld();
  });
  padZone.addEventListener('pointermove', (e) => {
    if (!S.ptr.has(e.pointerId)) return;
    e.preventDefault();
    const cur = S.ptr.get(e.pointerId);
    const k = nearest(e.clientX, e.clientY, cur);
    if (k !== cur) { S.ptr.set(e.pointerId, k); applyHeld(); }
  });
  const upBtn = (e) => { if (S.ptr.delete(e.pointerId)) applyHeld(); };
  padZone.addEventListener('pointerup', upBtn);
  padZone.addEventListener('pointercancel', upBtn);
  padZone.addEventListener('lostpointercapture', upBtn);
  padZone.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ================= input stream ================= */
  function steerValue() { return S.mode === 'tilt' ? tiltSteer() : S.stick; }
  function buildIn() {
    return {
      t: 'in',
      s: Math.round(clamp(steerValue(), -1, 1) * 1000) / 1000,
      d: S.held.d, i: S.held.i, l: S.held.l, u: S.held.u,
      seq: ++S.seq,
    };
  }
  // force = button change (send now); otherwise steer change, throttled to ~60 Hz
  function sendIn(force = true) {
    if (!S.active) return;
    const now = performance.now();
    if (!force && now - S.lastSend < 16) return;
    S.lastSend = now;
    ctx.send(buildIn());
  }

  /* ================= item reel ================= */
  const reel = $('#reel');
  const itemBtn = btnEls.i;
  const itemLab = $('#itemLab');
  const chargesEl = $('#charges');
  const icon = (id) => `<div class="cell">${ITEM_ICONS[id] || ''}</div>`;

  function showItem(item, charges) {
    if (S.reelAnim) return;
    item = item && ITEM_ICONS[item] ? item : null;
    if (item !== S.item) {
      reel.style.transform = 'translateY(0)';
      reel.innerHTML = item ? icon(item) : '<div class="cell q">?</div>';
      if (item && !S.rolling) pop();
    }
    S.item = item;
    itemBtn.classList.toggle('has', !!item);
    itemBtn.classList.toggle('empty', !item && !S.rolling);
    itemLab.textContent = item ? (ITEM_LABELS[item] || item).toUpperCase() : 'ITEM';
    chargesEl.textContent = item && charges > 1 ? '×' + charges : '';
  }
  function pop() { itemBtn.classList.remove('got'); void itemBtn.offsetWidth; itemBtn.classList.add('got'); haptic([30, 40, 30]); }

  function rollReel(item, dur = 1.3) {
    if (!ITEM_ICONS[item]) item = REEL_POOL[0];
    cancelReel();
    const n = 16 + Math.floor(Math.random() * 4);
    const ids = [];
    let prev = null;
    for (let k = 0; k < n; k++) {
      let id;
      do { id = REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)]; } while (id === prev || (k === n - 1 && id === item));
      ids.push(id); prev = id;
    }
    ids.push(item);
    reel.innerHTML = ids.map(icon).join('');
    itemBtn.classList.remove('has', 'empty', 'got');
    itemBtn.classList.add('roll');
    itemLab.textContent = '…';
    chargesEl.textContent = '';
    S.rolling = true;
    const steps = ids.length - 1;
    const t0 = performance.now(), D = Math.max(0.4, dur) * 1000;
    let lastCell = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / D);
      const e = 1 - Math.pow(1 - t, 3.2); // fast spin, long ease-out
      const pos = e * steps;
      const h = reel.firstElementChild ? reel.firstElementChild.offsetHeight : 0;
      reel.style.transform = `translateY(${(-pos * h).toFixed(1)}px)`;
      const cell = Math.floor(pos + 0.5);
      if (cell !== lastCell) { lastCell = cell; haptic(t > 0.7 ? 9 : 4); }
      if (t < 1) { S.reelAnim = requestAnimationFrame(tick); return; }
      S.reelAnim = null; S.rolling = false;
      itemBtn.classList.remove('roll');
      reel.innerHTML = icon(item); reel.style.transform = 'translateY(0)';
      S.item = null; // force showItem to refresh labels
      showItem(item, S.pendingCharges || 1);
      pop();
    };
    S.reelAnim = requestAnimationFrame(tick);
  }
  function cancelReel() {
    if (S.reelAnim) cancelAnimationFrame(S.reelAnim);
    S.reelAnim = null; S.rolling = false;
    itemBtn.classList.remove('roll');
  }

  /* ================= HUD / host messages ================= */
  function hud(m) {
    if (m.place != null) {
      $('#hudPlace').textContent = m.place;
      $('#hudPlaceSuf').textContent = ordinal(m.place);
    }
    if (m.total != null) $('#hudTotal').textContent = '/' + m.total;
    if (m.lap != null) $('#hudLap').textContent = Math.max(1, m.lap);
    if (m.laps != null) $('#hudLaps').textContent = '/' + m.laps;
    S.pendingCharges = m.charges;
    if (m.rolling) {
      // roll in progress but we missed the itemRoll message (e.g. reconnect): show a wobble
      if (!S.reelAnim && !S.rolling) { itemBtn.classList.add('roll'); itemBtn.classList.remove('empty', 'has'); }
    } else if (!S.reelAnim) {
      itemBtn.classList.remove('roll');
      showItem(m.item, m.charges);
    }
    $('#finishBanner').hidden = !m.finished;
  }

  function count(n) {
    const ov = $('#countOv'), num = $('#countNum');
    ov.hidden = false;
    num.textContent = n > 0 ? String(n) : 'GO!';
    num.className = n > 0 ? 'c' + n : 'go';
    void num.offsetWidth; num.classList.add('anim');
    haptic(n > 0 ? (n === 2 ? 40 : 20) : [40, 30, 80]);
    btnEls.l.classList.toggle('cue', n === 2);
    clearTimeout(S.countT);
    if (n <= 0) {
      setCountdownUI(false);
      S.countT = setTimeout(() => { ov.hidden = true; }, 800);
    } else setCountdownUI(true);
  }
  function setCountdownUI(on) {
    $('#boostHint').hidden = !on;
    btnEls.l.classList.toggle('pulse', on);
    if (!on) btnEls.l.classList.remove('cue');
    $('#leftLab').textContent = on ? 'BOOST' : 'HONK';
  }

  function flash(text, kind = 'info') {
    const el = $('#flash');
    $('#countOv').hidden = true;
    el.textContent = String(text || '').slice(0, 28);
    el.className = 'flash ' + (['good', 'bad', 'info'].includes(kind) ? kind : 'info');
    el.hidden = false;
    void el.offsetWidth; el.classList.add('show');
    if (kind === 'bad') haptic([60, 40, 60]); else if (kind === 'good') haptic([20, 30, 40]);
    clearTimeout(S.flashT);
    S.flashT = setTimeout(() => { el.hidden = true; el.classList.remove('show'); }, 1250);
  }

  /* ================= visuals loop ================= */
  function frame() {
    S.raf = requestAnimationFrame(frame);
    if (S.mode === 'tilt') {
      const s = tiltSteer();
      $('#wheel').style.transform = `rotate(${(s * 85).toFixed(1)}deg)`;
    }
  }

  /* ================= wake lock ================= */
  async function acquireWake() {
    try {
      if (!('wakeLock' in navigator) || S.wl) return;
      S.wl = await navigator.wakeLock.request('screen');
      S.wl.addEventListener('release', () => { S.wl = null; });
    } catch { S.wl = null; }
  }
  function releaseWake() { try { S.wl && S.wl.release(); } catch {} S.wl = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.active) acquireWake();
    if (document.visibilityState === 'hidden' && S.active) { S.ptr.clear(); applyHeld(); releaseStick(); sendIn(true); }
  });

  /* ================= lifecycle ================= */
  function start(phase) {
    S.phase = phase;
    if (S.active) { if (phase === 'race') setCountdownUI(false); return; }
    S.active = true;
    cancelReel(); S.item = undefined; showItem(null, 0);
    $('#finishBanner').hidden = true;
    $('#countOv').hidden = true;
    $('#flash').hidden = true;
    setMode(S.mode, false);
    setCountdownUI(phase === 'countdown');
    requestAnimationFrame(() => releaseStick());
    clearInterval(S.timer);
    S.timer = setInterval(() => sendIn(true), 1000 / 30);
    cancelAnimationFrame(S.raf); frame();
    acquireWake();
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch {}
    sendIn(true);
  }

  function stop() {
    if (!S.active) return;
    S.ptr.clear();
    for (const k of KEYS) btnEls[k].classList.remove('press');
    S.held = { u: 0, l: 0, i: 0, d: 0 };
    releaseStick();
    ctx.send({ t: 'in', s: 0, d: 0, i: 0, l: 0, u: 0, seq: ++S.seq });
    S.active = false;
    clearInterval(S.timer); cancelAnimationFrame(S.raf);
    cancelReel();
    setCountdownUI(false);
    releaseWake();
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch {}
    $('#countOv').hidden = true;
    $('#flash').hidden = true;
  }

  setMode(S.mode, false);

  return {
    start, stop, hud, count, flash, rollReel, enableTilt,
    state: S, buildIn,
    get active() { return S.active; },
  };
}

export { ITEM_IDS };

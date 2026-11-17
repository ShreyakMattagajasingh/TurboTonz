// Race controller: tilt / touch steering, hold buttons (gas, brake, drift, item), 30 Hz input stream.
// Every control tracks its own pointerId(s) so steering + drift + item work simultaneously.
import { $, store, haptic, clamp, ordinal } from './common.js';
import { ITEM_ICONS, ITEM_IDS, ITEM_LABELS } from './icons.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const MAX_TILT = 35;   // degrees for full lock
const DEADZONE = 2.5;  // degrees

export function createRace(ctx) {
  const root = $('#race');
  const zone = $('#steerZone');
  const track = $('#slideTrack');
  const thumb = $('#slideThumb');

  const S = {
    mode: store.get('pk_steer') === 'touch' ? 'touch' : 'tilt',
    auto: store.get('pk_auto') !== '0',
    offset: 0,          // calibration (deg)
    rollRaw: 0,         // last raw roll (deg, + = right)
    roll: 0,            // smoothed roll
    tiltSeen: false,
    tiltPermission: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function' ? 'unknown' : 'n/a',
    touchSteer: 0,
    steerId: null,
    gas: false, brake: false, drift: false, item: false,
    active: false, phase: 'lobby',
    seq: 0,
    timer: 0, raf: 0, tiltWatch: 0,
    lastItem: null, spinning: false, spinTimer: 0,
    wl: null,
  };
  try { S.offset = parseFloat(sessionStorage.getItem('pk_tilt_off')) || 0; } catch {}

  /* ---------------- steering: tilt ---------------- */
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
    // "up" (anti-gravity) vector in device coordinates
    const ux = -Math.cos(b) * Math.sin(g);
    const uy = Math.sin(b);
    // rotate into screen coordinates (x right, y up as seen by the player)
    let sx, sy;
    switch (screenAngle()) {
      case 90: sx = -uy; sy = ux; break;
      case 270: sx = uy; sy = -ux; break;
      case 180: sx = -ux; sy = -uy; break;
      default: sx = ux; sy = uy;
    }
    if (Math.hypot(sx, sy) < 0.2) return; // phone lying flat; roll undefined
    S.rollRaw = Math.atan2(-sx, sy) * R2D; // + = steering right
    S.roll += (S.rollRaw - S.roll) * 0.6;
  }
  window.addEventListener('deviceorientation', onOrient, true);

  function tiltSteer() {
    const d = S.roll - S.offset;
    const a = Math.abs(d);
    if (a < DEADZONE) return 0;
    return Math.sign(d) * clamp((a - DEADZONE) / (MAX_TILT - DEADZONE), 0, 1);
  }

  function calibrate() {
    S.offset = S.rollRaw;
    S.roll = S.rollRaw;
    try { sessionStorage.setItem('pk_tilt_off', String(S.offset)); } catch {}
    haptic(20);
    flashMsg('CENTERED');
  }

  async function enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        S.tiltPermission = r;
      }
    } catch (e) { S.tiltPermission = 'denied'; }
    refreshTiltUI();
  }

  function flashMsg(t) {
    const el = $('#tiltMsg');
    el.textContent = t;
    clearTimeout(flashMsg.t);
    flashMsg.t = setTimeout(refreshTiltUI, 900);
  }

  function refreshTiltUI() {
    const el = $('#tiltMsg');
    const btn = $('#enableTilt');
    const needPerm = S.tiltPermission === 'unknown' || S.tiltPermission === 'denied';
    if (S.mode !== 'tilt') { btn.hidden = true; return; }
    if (S.tiltSeen) { el.textContent = 'TILT TO STEER'; el.classList.remove('warn'); btn.hidden = true; }
    else if (needPerm) { el.textContent = S.tiltPermission === 'denied' ? 'TILT BLOCKED — TAP BELOW' : 'TILT NEEDS PERMISSION'; el.classList.add('warn'); btn.hidden = false; }
    else { el.textContent = 'LOOKING FOR TILT SENSOR…'; el.classList.add('warn'); btn.hidden = true; }
  }

  function setMode(m, persist = true) {
    S.mode = m;
    if (persist) store.set('pk_steer', m);
    zone.dataset.mode = m;
    $('#modeBtn').textContent = m === 'tilt' ? 'TOUCH' : 'TILT';
    $('#calBtn').hidden = m !== 'tilt';
    $('#hudMode').textContent = m === 'tilt' ? 'TILT' : 'TOUCH';
    refreshTiltUI();
  }

  /* ---------------- steering: touch slider ---------------- */
  function slideTo(e) {
    const r = track.getBoundingClientRect();
    const half = (r.width / 2) * 0.78;
    const v = clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1);
    S.touchSteer = Math.abs(v) < 0.04 ? 0 : v;
  }
  zone.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'touch' || e.target.closest('.chip,button') || S.steerId !== null) return;
    e.preventDefault();
    S.steerId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch {}
    thumb.classList.add('drag');
    slideTo(e);
    haptic(8);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === S.steerId) { e.preventDefault(); slideTo(e); } });
  const endSteer = (e) => {
    if (e.pointerId !== S.steerId) return;
    S.steerId = null; S.touchSteer = 0; thumb.classList.remove('drag');
  };
  zone.addEventListener('pointerup', endSteer);
  zone.addEventListener('pointercancel', endSteer);
  zone.addEventListener('lostpointercapture', endSteer);

  $('#calBtn').addEventListener('click', calibrate);
  $('#modeBtn').addEventListener('click', () => { setMode(S.mode === 'tilt' ? 'touch' : 'tilt'); haptic(15); sendIn(); });
  $('#enableTilt').addEventListener('click', enableTilt);

  /* ---------------- hold buttons ---------------- */
  function bindHold(sel, key, buzz) {
    const el = $(sel);
    const ids = new Set();
    const apply = () => {
      const held = ids.size > 0;
      if (S[key] === held) return;
      S[key] = held;
      el.classList.toggle('down', held);
      if (held && buzz) haptic(buzz);
      sendIn();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.chip')) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch {}
      ids.add(e.pointerId);
      apply();
    });
    const up = (e) => { if (ids.delete(e.pointerId)) apply(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return { release() { ids.clear(); apply(); } };
  }
  const holds = [
    bindHold('#gasBtn', 'gas', 8),
    bindHold('#brakeBtn', 'brake', 12),
    bindHold('#driftBtn', 'drift', 18),
    bindHold('#itemBtn', 'item', 25),
  ];

  const autoBtn = $('#autoGas');
  function setAuto(v, persist = true) {
    S.auto = v;
    if (persist) store.set('pk_auto', v ? '1' : '0');
    autoBtn.textContent = v ? 'AUTO ON' : 'AUTO OFF';
    autoBtn.classList.toggle('on', v);
    $('#gasBtn').classList.toggle('auto-on', v);
    $('#gasBtn .lab').textContent = v ? 'GAS' : 'HOLD GAS';
    sendIn();
  }
  autoBtn.addEventListener('click', (e) => { e.stopPropagation(); haptic(15); setAuto(!S.auto); });
  autoBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  /* ---------------- input stream ---------------- */
  function steerValue() {
    return S.mode === 'tilt' ? tiltSteer() : S.touchSteer;
  }
  function buildIn() {
    const g = S.gas || (S.auto && !S.brake) ? 1 : 0;
    return {
      t: 'in',
      s: Math.round(steerValue() * 1000) / 1000,
      g, b: S.brake ? 1 : 0, d: S.drift ? 1 : 0, i: S.item ? 1 : 0,
      seq: ++S.seq,
    };
  }
  function sendIn() {
    if (!S.active) return;
    ctx.send(buildIn());
  }

  /* ---------------- HUD ---------------- */
  const itemBtn = $('#itemBtn');
  const itemIco = $('#itemIco');
  const itemLab = $('#itemLab');

  function setItemUI(item, spin) {
    const spinning = !!spin;
    if (spinning && !S.spinning) {
      S.spinning = true;
      itemBtn.classList.remove('has', 'empty', 'got');
      itemBtn.classList.add('roll');
      itemLab.textContent = '…';
      let i = 0;
      S.spinTimer = setInterval(() => {
        i = (i + 1 + Math.floor(Math.random() * 3)) % ITEM_IDS.length;
        itemIco.innerHTML = ITEM_ICONS[ITEM_IDS[i]];
        haptic(4);
      }, 85);
    } else if (!spinning && S.spinning) {
      S.spinning = false;
      clearInterval(S.spinTimer);
      itemBtn.classList.remove('roll');
    }
    if (spinning) return;
    itemBtn.classList.remove('roll');
    if (item && ITEM_ICONS[item]) {
      if (S.lastItem !== item) {
        itemBtn.classList.remove('got'); void itemBtn.offsetWidth; itemBtn.classList.add('got');
        haptic([30, 40, 30]);
      }
      itemIco.innerHTML = ITEM_ICONS[item];
      itemLab.textContent = (ITEM_LABELS[item] || item).toUpperCase();
      itemBtn.classList.add('has'); itemBtn.classList.remove('empty');
    } else {
      itemIco.innerHTML = '';
      itemLab.textContent = 'ITEM';
      itemBtn.classList.remove('has', 'got'); itemBtn.classList.add('empty');
    }
    S.lastItem = item || null;
  }

  function hud(m) {
    if (m.place != null) {
      $('#hudPlace').textContent = m.place;
      $('#hudPlaceSuf').textContent = ordinal(m.place);
    }
    if (m.total != null) $('#hudTotal').textContent = '/ ' + m.total;
    if (m.lap != null) $('#hudLap').textContent = Math.max(1, m.lap);
    if (m.laps != null) $('#hudLaps').textContent = '/' + m.laps;
    setItemUI(m.item, m.itemSpin);
    $('#finishBanner').hidden = !m.finished;
  }

  function frame() {
    S.raf = requestAnimationFrame(frame);
    const s = steerValue();
    $('#wheel').style.transform = `rotate(${(s * 85).toFixed(1)}deg)`;
    $('#steerNeedle').style.left = (50 + s * 46) + '%';
    if (S.mode === 'touch') {
      const half = (track.clientWidth / 2) * 0.78;
      thumb.style.left = `calc(50% + ${(s * half).toFixed(1)}px)`;
    }
  }

  /* ---------------- wake lock ---------------- */
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
  });

  /* ---------------- lifecycle ---------------- */
  function start(phase) {
    S.phase = phase;
    const ov = $('#raceOverlay');
    ov.hidden = phase !== 'countdown';
    if (S.active) return;
    S.active = true;
    S.lastItem = null;
    setItemUI(null, false);
    $('#finishBanner').hidden = true;
    setMode(S.mode, false);
    setAuto(S.auto, false);
    refreshTiltUI();
    clearInterval(S.timer);
    S.timer = setInterval(sendIn, 1000 / 30);
    cancelAnimationFrame(S.raf); frame();
    acquireWake();
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch {}
    // desktop / no sensor: after a moment fall back to touch steering (without remembering it)
    clearTimeout(S.tiltWatch);
    S.tiltWatch = setTimeout(() => {
      if (S.active && S.mode === 'tilt' && !S.tiltSeen && S.tiltPermission === 'n/a') { setMode('touch', false); }
    }, 2500);
    sendIn();
  }

  function stop() {
    if (!S.active) return;
    // neutral input so the host never keeps a stale pressed state
    holds.forEach((h) => h.release());
    S.touchSteer = 0; S.steerId = null; thumb.classList.remove('drag');
    ctx.send({ t: 'in', s: 0, g: 0, b: 0, d: 0, i: 0, seq: ++S.seq });
    S.active = false;
    clearInterval(S.timer); cancelAnimationFrame(S.raf); clearTimeout(S.tiltWatch);
    clearInterval(S.spinTimer); S.spinning = false;
    releaseWake();
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch {}
    $('#raceOverlay').hidden = true;
  }

  setMode(S.mode, false);
  setAuto(S.auto, false);

  return { start, stop, hud, enableTilt, state: S, get active() { return S.active; } };
}

// Party Karts pad — entry point: join flow, connection (auto-reconnect), screen routing.
import { joinHost, isLocalMode } from '../net/transport.js';
import { $, store, haptic, toast } from './common.js';
import { chars } from './chars.js';
import { createLobby } from './lobby.js';
import { createRace } from './race.js';
import { createResults } from './results.js';

const params = new URLSearchParams(location.search);
const local = isLocalMode();

/* ---------- identity ---------- */
let pid = store.get('pk_pid');
if (!pid) {
  pid = 'pk' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  store.set('pk_pid', pid);
}

const state = {
  pid,
  code: (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
  name: store.get('pk_name') || '',
  slot: null,
  color: null,
  screen: 'join',
  phase: 'lobby',
  rtt: null,
};

/* ---------- block zoom / scroll / long-press ---------- */
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => {
  if (state.screen === 'race') { e.preventDefault(); return; }
  if (e.touches && e.touches.length > 1) e.preventDefault(); // pinch
}, { passive: false });
document.addEventListener('selectstart', (e) => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });

/* ---------- screens ---------- */
function showScreen(name) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === name));
  document.body.dataset.screen = name;
  document.body.classList.toggle('race-on', name === 'race');
  window.__padScreen = name;
}

/* ---------- connection ---------- */
let conn = null;
let connecting = false;
let wantConn = false;
let everWelcomed = false;
let retry = 0;
let retryTimer = 0;
let pingTimer = 0;
let welcomeTimer = 0;

const netEl = $('#net');
function setNet(s) {
  netEl.dataset.state = s;
  if (s !== 'open') $('#netPing').textContent = s === 'connecting' ? '…' : '--';
  const banner = $('#banner');
  const showBanner = wantConn && everWelcomed && s !== 'open';
  banner.hidden = !showBanner;
  if (showBanner) $('#bannerText').textContent = s === 'connecting' ? 'Connecting…' : 'Reconnecting…';
}

function send(obj) { if (conn) conn.send(obj); }

function friendlyError(err) {
  const msg = String((err && (err.message || err.type)) || err || '');
  if (/peer-unavailable|Host not found|Could not connect/i.test(msg)) return 'Room not found — check the code on the TV';
  if (/Timed out/i.test(msg)) return 'Couldn’t reach the TV — check the code and your Wi‑Fi';
  if (/network|server-error|socket/i.test(msg)) return 'Can’t reach the game server — check your connection';
  return 'Couldn’t connect — check the code on the TV and try again';
}

function joinStatus(html, err = false) {
  const el = $('#joinStatus');
  el.className = 'join-status' + (err ? ' err' : '');
  el.innerHTML = html;
}

function failJoin(text) {
  wantConn = false;
  clearTimeout(welcomeTimer);
  setNet('idle');
  $('#joinBtn').classList.remove('busy');
  $('#joinLabel').textContent = 'JOIN';
  joinStatus(text, true);
  haptic([40, 60, 40]);
  if (/code/i.test(text)) { showCodeInput(); }
}

async function openConn(first) {
  if (connecting || !wantConn) return;
  connecting = true;
  setNet('connecting');
  let c;
  try {
    c = await joinHost(state.code, { local });
  } catch (err) {
    connecting = false;
    if (first || !everWelcomed) { failJoin(friendlyError(err)); return; }
    scheduleRetry();
    return;
  }
  connecting = false;
  if (!wantConn) { try { c.close(); } catch {} return; }
  conn = c;
  c.onMessage((m) => onMsg(c, m));
  c.onClose(() => onClosed(c));
  retry = 0;
  setNet('open');
  c.send({ t: 'hello', pid, name: state.name });
  startPing();
  if (!everWelcomed) {
    clearTimeout(welcomeTimer);
    welcomeTimer = setTimeout(() => {
      if (!everWelcomed) { dropConn(); failJoin('The TV didn’t answer — check the room code'); }
    }, 6000);
  }
}

function dropConn() {
  const c = conn; conn = null;
  stopPing();
  if (c) { try { c.close(); } catch {} }
}

function onClosed(c) {
  if (c !== conn) return;
  conn = null;
  stopPing();
  if (!wantConn) return;
  setNet('retry');
  scheduleRetry();
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = Math.min(5000, 400 * Math.pow(1.6, retry++));
  setNet('retry');
  retryTimer = setTimeout(() => openConn(false), delay);
}

function startPing() {
  stopPing();
  const ping = () => send({ t: 'ping', ts: performance.now() });
  ping();
  pingTimer = setInterval(ping, 2000);
}
function stopPing() { clearInterval(pingTimer); }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantConn && !conn && !connecting) {
    clearTimeout(retryTimer); openConn(false);
  }
});
window.addEventListener('online', () => { if (wantConn && !conn && !connecting) { clearTimeout(retryTimer); openConn(false); } });

/* ---------- modules ---------- */
const ctx = { send, state, chars, haptic };
const lobby = createLobby(ctx);
const race = createRace(ctx);
const results = createResults(ctx);

/* ---------- message handling ---------- */
function applyPhase(phase) {
  state.phase = phase;
  if (phase === 'lobby') {
    race.stop(); results.reset(); lobby.reset(); showScreen('lobby');
  } else if (phase === 'countdown' || phase === 'race') {
    race.start(phase); showScreen('race');
  } else if (phase === 'results') {
    race.stop(); showScreen('results');
    $('#resWait').hidden = false;
  }
}

function onMsg(c, m) {
  if (c !== conn || !m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome':
      everWelcomed = true;
      clearTimeout(welcomeTimer);
      state.slot = m.slot;
      state.color = m.color;
      if (m.name) state.name = m.name;
      if (m.color) document.documentElement.style.setProperty('--pc', m.color);
      setNet('open');
      lobby.refresh();
      if (state.screen === 'join') { showScreen('lobby'); haptic(30); }
      break;
    case 'lobby':
      lobby.update(m);
      if (state.screen === 'join') { everWelcomed = true; showScreen('lobby'); }
      break;
    case 'phase': applyPhase(m.phase); break;
    case 'hud': race.hud(m); break;
    case 'buzz': haptic(Math.max(1, Math.min(2000, +m.ms || 60))); break;
    case 'results':
      race.stop(); results.show(m); showScreen('results'); $('#resWait').hidden = false;
      break;
    case 'pong':
      state.rtt = Math.round(performance.now() - m.ts);
      $('#netPing').textContent = state.rtt + 'ms';
      break;
    case 'full':
      dropConn(); everWelcomed = false;
      failJoin('Room is full — wait for a spot to open');
      showScreen('join');
      break;
    default: break;
  }
}

/* ---------- join screen ---------- */
const codeInput = $('#codeInput');
const nameInput = $('#nameInput');

function showCodeInput() {
  $('#codeField').hidden = false;
  $('#roomBadge').hidden = true;
}
function showRoomBadge() {
  $('#codeField').hidden = true;
  $('#roomBadge').hidden = false;
  $('#roomBadgeCode').textContent = state.code;
}

codeInput.value = state.code;
nameInput.value = state.name;
if (state.code.length === 4) showRoomBadge(); else showCodeInput();

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (codeInput.value.length === 4) nameInput.focus();
});
$('#changeRoom').addEventListener('click', () => { showCodeInput(); codeInput.value = ''; codeInput.focus(); });

function bad(fieldEl) {
  fieldEl.classList.remove('bad'); void fieldEl.offsetWidth; fieldEl.classList.add('bad');
  haptic([30, 40, 30]);
}

async function tryFullscreen() {
  try {
    if (matchMedia('(display-mode: standalone)').matches || document.fullscreenElement) return;
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch {}
}

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  if (!$('#codeField').hidden && code.length !== 4) { bad($('#codeField')); joinStatus('Enter the 4-letter code shown on the TV', true); return; }
  if (!$('#codeField').hidden) state.code = code;
  const name = nameInput.value.trim();
  if (!name) { bad($('#nameField')); nameInput.focus(); joinStatus('Pick a name for the scoreboard', true); return; }
  state.name = name;
  store.set('pk_name', name);
  if ($('#roomBadge').hidden) showRoomBadge();

  // These need a user gesture, so do them right on the JOIN tap.
  haptic(20);
  nameInput.blur(); codeInput.blur();
  try { race.enableTilt && DeviceOrientationEvent.requestPermission && race.enableTilt(); } catch {}
  tryFullscreen();

  $('#joinBtn').classList.add('busy');
  $('#joinLabel').textContent = 'CONNECTING…';
  joinStatus('<span class="spin"></span> Looking for the TV…');
  everWelcomed = false;
  wantConn = true; retry = 0;
  openConn(true);
});

$('#leaveBtn').addEventListener('click', () => {
  wantConn = false; everWelcomed = false;
  clearTimeout(retryTimer);
  dropConn();
  race.stop();
  setNet('idle');
  $('#joinBtn').classList.remove('busy');
  $('#joinLabel').textContent = 'JOIN';
  joinStatus('');
  showScreen('join');
});

showScreen('join');
setNet('idle');
window.__pad = { state, send, get conn() { return conn; }, race, lobby, showScreen };

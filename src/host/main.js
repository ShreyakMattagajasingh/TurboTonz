// Host (laptop) app: lobby, room, players, race loop, results.
import QRCode from 'qrcode';
import { createHost, randomCode, isLocalMode } from '../net/transport.js';
import { TRACKS } from '../game/tracks.js';
import { Race } from '../game/race.js';
import { TrackGeo } from '../game/trackgeo.js';
import { GameView } from '../render/view.js';
import { CHARACTERS, getCharacter, renderPortraits } from '../render/characters.js';
import { AudioEngine } from '../audio/audio.js';
import { Hud, fmtTime } from './hud.js';
import { ITEM_ICONS } from '../pad/icons.js';
import './host.css';

const SLOT_COLORS = ['#ff3b5c', '#2f8cff', '#2fd36b', '#ffc21a', '#a35bff', '#ff8a1f', '#1fd6e0', '#ff5fc8'];
const MAX_PLAYERS = 8;
const params = new URLSearchParams(location.search);
const LOCAL = isLocalMode();

const $ = (s) => document.querySelector(s);
const app = {
  phase: 'lobby',
  players: [],           // { slot, pid, name, char, color, ready, kind:'pad'|'kb1'|'kb2'|'gp', conn, input, gp }
  settings: { track: Math.min(TRACKS.length - 1, +params.get('track') || 0), laps: +params.get('laps') || 3, cc: 100, cpu: params.get('cpu') !== '0' },
  code: params.get('room') || randomCode(),
  race: null, attract: null,
  portraits: {},
  lastHud: 0,
  paused: false,
};
window.__app = app; // debug/test hook

const view = new GameView($('#stage'));
const hud = new Hud($('#hud'));
const audio = new AudioEngine();
window.__view = view;

// ---------------- room ----------------
async function openRoom() {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const host = await createHost(app.code, { local: LOCAL });
      app.host = host;
      host.onConnection(onConnection);
      app.online = true;
      renderRoomInfo();
      return;
    } catch (err) {
      console.warn('room open failed', err?.type || err);
      if (err?.type === 'unavailable-id') { app.code = randomCode(); continue; }
      app.online = false;
      renderRoomInfo(String(err?.type || err?.message || err));
      setTimeout(openRoom, 5000);
      return;
    }
  }
}

function padUrl() {
  const base = location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') + '/pad.html';
  return `${base}?room=${app.code}${LOCAL ? '&local=1' : ''}`;
}

async function renderRoomInfo(error) {
  $('#room-code').textContent = app.code;
  const url = padUrl();
  $('#room-url').textContent = url.replace(/^https?:\/\//, '');
  try {
    $('#qr').src = await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#1a1033', light: '#ffffff' } });
  } catch {}
  const st = $('#room-status');
  if (error) { st.textContent = 'Connection server unreachable — retrying… (keyboard & gamepads still work)'; st.className = 'room-status err'; }
  else { st.textContent = LOCAL ? 'Local test mode' : 'Room open — scan to join!'; st.className = 'room-status ok'; }
  const lh = /^(localhost|127\.)/.test(location.hostname);
  $('#lan-warning').style.display = lh && !LOCAL ? 'block' : 'none';
}

function onConnection(conn) {
  let player = null;
  conn.onMessage((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      player = app.players.find(p => p.pid === m.pid && p.kind === 'pad');
      if (player) { player.conn = conn; player.name = cleanName(m.name) || player.name; player.connected = true; }
      else {
        if (app.players.length >= MAX_PLAYERS || app.phase !== 'lobby') {
          if (app.players.length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return; }
        }
        player = addPlayer({ kind: 'pad', pid: m.pid, name: cleanName(m.name), conn });
        if (!player) { conn.send({ t: 'full' }); return; }
      }
      conn.send({ t: 'welcome', slot: player.slot, color: player.color, name: player.name });
      conn.send({ t: 'phase', phase: padPhase() });
      if (app.phase === 'results' && app.lastResults) sendResults(player);
      broadcastLobby();
      audio.sfx('join');
      renderLobby();
    }
    if (!player) return;
    switch (m.t) {
      case 'pick': if (app.phase === 'lobby' && CHARACTERS.some(c => c.id === m.char) && !charTaken(m.char, player)) { player.char = m.char; audio.sfx('select'); broadcastLobby(); renderLobby(); } break;
      case 'ready': player.ready = !!m.ready; broadcastLobby(); renderLobby(); break;
      case 'in': player.input = { s: +m.s || 0, g: m.g ? 1 : 0, b: m.b ? 1 : 0, d: m.d ? 1 : 0, i: m.i ? 1 : 0 }; break;
      case 'menu': if (isLeader(player)) menuAction(m.a); break;
      case 'ping': conn.send({ t: 'pong', ts: m.ts }); break;
    }
  });
  conn.onClose(() => {
    if (!player) return;
    player.connected = false; player.conn = null;
    player.input = { s: 0, g: 0, b: 0, d: 0, i: 0 };
    // in lobby, drop pads that disconnect for > 20s
    const pid = player.pid;
    setTimeout(() => {
      const p = app.players.find(q => q.pid === pid);
      if (p && !p.connected && app.phase === 'lobby') removePlayer(p);
    }, 20000);
    renderLobby();
  });
}

function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _\-!?.]/gu, '').trim().slice(0, 12); }

function padPhase() { return app.phase === 'race' ? (app.race?.phase === 'countdown' ? 'countdown' : 'race') : app.phase; }

function freeSlot() { for (let s = 0; s < MAX_PLAYERS; s++) if (!app.players.some(p => p.slot === s)) return s; return -1; }

function charTaken(id, except) { return app.players.some(p => p !== except && p.char === id); }

function firstFreeChar(pref) {
  if (pref && !charTaken(pref)) return pref;
  return (CHARACTERS.find(c => !charTaken(c.id)) || CHARACTERS[0]).id;
}

function addPlayer({ kind, pid, name, conn, gpIndex }) {
  const slot = freeSlot();
  if (slot < 0) return null;
  const p = {
    slot, pid: pid || kind + slot, kind, conn, gpIndex, connected: true,
    name: name || (kind === 'pad' ? 'Player ' + (slot + 1) : kind === 'gp' ? 'Pad ' + (slot + 1) : 'Keys ' + (slot + 1)),
    color: SLOT_COLORS[slot], char: firstFreeChar(CHARACTERS[slot % CHARACTERS.length].id),
    ready: kind !== 'pad', input: { s: 0, g: 0, b: 0, d: 0, i: 0 }, joinedAt: performance.now(),
  };
  app.players.push(p);
  app.players.sort((a, b) => a.slot - b.slot);
  return p;
}

function removePlayer(p) {
  app.players = app.players.filter(q => q !== p);
  broadcastLobby(); renderLobby();
}

function leader() {
  const pads = app.players.filter(p => p.kind === 'pad' && p.connected);
  return pads.sort((a, b) => a.joinedAt - b.joinedAt)[0] || null;
}
function isLeader(p) { return leader() === p; }

function lobbyMsg(p) {
  return {
    t: 'lobby',
    players: app.players.map(q => ({ slot: q.slot, name: q.name, char: q.char, ready: q.ready, color: q.color })),
    track: TRACKS[app.settings.track].id, trackName: TRACKS[app.settings.track].name,
    laps: app.settings.laps, cpu: app.settings.cpu, cc: app.settings.cc, isLeader: isLeader(p),
    taken: app.players.filter(q => q !== p).map(q => q.char),
  };
}

function broadcastLobby() {
  for (const p of app.players) if (p.conn) p.conn.send(lobbyMsg(p));
}
function broadcast(msg) { for (const p of app.players) if (p.conn) p.conn.send(msg); }

function menuAction(a) {
  if (app.phase === 'results') { if (a === 'start') backToLobby(); return; }
  if (app.phase !== 'lobby') return;
  const S = app.settings;
  if (a === 'left') S.track = (S.track + TRACKS.length - 1) % TRACKS.length;
  if (a === 'right') S.track = (S.track + 1) % TRACKS.length;
  if (a === 'laps') S.laps = S.laps % 5 + 1;
  if (a === 'cpu') S.cpu = !S.cpu;
  if (a === 'cc') S.cc = { 50: 100, 100: 150, 150: 50 }[S.cc] || 100;
  if (a === 'start') { startRace(); return; }
  if (a === 'left' || a === 'right') { audio.sfx('uiMove'); startAttract(); }
  else audio.sfx('uiMove');
  broadcastLobby(); renderLobby();
}

// ---------------- lobby UI ----------------
function renderLobby() {
  const S = app.settings, tr = TRACKS[S.track];
  $('#track-name').textContent = tr.name;
  $('#set-laps').textContent = S.laps;
  $('#set-cc').textContent = S.cc + 'cc';
  $('#set-cpu').textContent = S.cpu ? 'ON' : 'OFF';
  drawTrackPreview($('#track-preview'), tr);
  const grid = $('#players');
  grid.innerHTML = '';
  for (let s = 0; s < MAX_PLAYERS; s++) {
    const p = app.players.find(q => q.slot === s);
    const el = document.createElement('div');
    el.className = 'pcard' + (p ? ' filled' : '') + (p && !p.connected ? ' away' : '');
    el.style.setProperty('--pc', SLOT_COLORS[s]);
    if (p) {
      const ch = getCharacter(p.char);
      const ico = p.kind === 'pad' ? '📱' : p.kind === 'gp' ? '🎮' : '⌨️';
      el.innerHTML = `<div class="pslot">P${s + 1}</div>
        <img class="pport" src="${app.portraits[p.char] || ''}" alt="">
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pchar">${ch.name}</div>
        <div class="pstate">${ico} ${p.connected ? (p.ready ? '<span class="rdy">READY</span>' : '<span class="nrdy">choosing…</span>') : 'reconnecting…'}${isLeader(p) ? ' 👑' : ''}</div>`;
    } else el.innerHTML = `<div class="pslot">P${s + 1}</div><div class="pempty">Join!</div>`;
    grid.appendChild(el);
  }
  const n = app.players.length;
  $('#btn-start').disabled = n === 0;
  $('#btn-start').textContent = n === 0 ? 'Waiting for players…' : `START RACE (${n} player${n > 1 ? 's' : ''})`;
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const geoCache = new Map();
function drawTrackPreview(canvas, def) {
  if (!geoCache.has(def.id)) geoCache.set(def.id, new TrackGeo(def));
  const g = geoCache.get(def.id);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const sc = Math.min((W - 40) / (g.maxX - g.minX), (H - 40) / (g.maxZ - g.minZ));
  const ox = (W - (g.maxX - g.minX) * sc) / 2, oy = (H - (g.maxZ - g.minZ) * sc) / 2;
  const P = (i) => [(g.x[i] - g.minX) * sc + ox, (g.z[i] - g.minZ) * sc + oy];
  ctx.lineCap = ctx.lineJoin = 'round';
  const col = { meadow: '#5fd35a', desert: '#ffb35a', snow: '#9fd8ff', neon: '#ff4fd8' }[def.theme];
  for (const [lw, c] of [[16, 'rgba(0,0,0,.35)'], [11, col], [5, '#ffffff']]) {
    ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.beginPath();
    for (let i = 0; i <= g.N; i++) { const [x, y] = P(i % g.N); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  const [sx, sy] = P(0);
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
}

function showScreen(name) {
  for (const id of ['lobby', 'results', 'pause']) $('#' + id).classList.toggle('show', id === name);
  document.body.dataset.screen = name || 'race';
}

// ---------------- attract (background demo race) ----------------
function cpuRacers(n, exclude = []) {
  const pool = CHARACTERS.filter(c => !exclude.includes(c.id));
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = pool[i % pool.length];
    out.push({ human: false, name: c.name, char: c.id, color: c.color, stats: c.stats, skill: 0.45 + Math.random() * 0.45 });
  }
  return out;
}

function startAttract() {
  const tr = TRACKS[app.settings.track];
  app.race = null;
  app.attract = new Race({ trackDef: tr, racers: cpuRacers(8), laps: 99, attract: true, seed: Date.now() & 0xffff });
  // spread the karts out along the track
  const g = app.attract.geo;
  app.attract.karts.forEach((k, i) => {
    const p = g.pointAt(g.N * i / 8 + 3, ((i % 3) - 1) * 4);
    k.x = p.x; k.z = p.z; k.y = p.y; k.heading = p.heading; k.ti = -1; k.v = 20;
    k.lastU = (g.N * i / 8 + 3) / g.N; k.lap = 0;
  });
  view.setRace(app.attract, 'attract');
  hud.clear();
  audio.playMusic(app.phase === 'lobby' ? 'lobby' : tr.music);
}

// ---------------- race ----------------
function startRace() {
  if (!app.players.length) return;
  audio.unlock();
  audio.sfx('uiConfirm');
  const tr = TRACKS[app.settings.track];
  const humans = app.players.map(p => {
    const c = getCharacter(p.char);
    return { human: true, slot: p.slot, name: p.name, char: c.id, color: p.color, stats: c.stats, pid: p.pid };
  });
  const fill = app.settings.cpu ? Math.max(0, 8 - humans.length) : (humans.length === 1 ? 3 : 0);
  const racers = [...cpuRacers(fill, humans.map(h => h.char)), ...humans];
  // humans start at the back of the grid like a classic GP? Put them mixed: back half
  app.race = new Race({ trackDef: tr, racers, laps: app.settings.laps, cc: app.settings.cc, seed: (Math.random() * 1e9) | 0 });
  app.race.karts.forEach(k => { if (k.human) { k.pid = racers[k.id].pid; if (params.get('bot')) k.ai = app.race.makeAI(0.9); } });
  app.phase = 'race';
  app.attract = null;
  view.setRace(app.race, 'race');
  hud.setRace(app.race);
  showScreen(null);
  broadcast({ t: 'phase', phase: 'countdown' });
  audio.stopMusic();
  app.musicStarted = false;
  app.finalLapMusic = false;
}

function kartFor(p) { return app.race?.karts.find(k => k.human && k.slot === p.slot); }

function onRaceEvents(events) {
  const race = app.race;
  for (const e of events) {
    const k = e.k;
    const human = k?.human;
    const near = (x, z) => {
      let best = Infinity;
      for (const h of race.karts) if (h.human) best = Math.min(best, Math.hypot(h.x - x, h.z - z));
      return Math.max(0, 1 - best / 60);
    };
    const vol = human ? 1 : (k ? near(k.x, k.z) * 0.6 : 1);
    switch (e.type) {
      case 'count': audio.sfx('countdown'); break;
      case 'go': audio.sfx('go'); broadcast({ t: 'phase', phase: 'race' }); break;
      case 'box': if (vol > 0.05) audio.sfx('itemBox', { volume: vol }); break;
      case 'roll': if (human) audio.sfx('roulette', { volume: 0.6 }); break;
      case 'itemGet': if (human) { audio.sfx('itemGet'); buzz(k, 30); } break;
      case 'miniTurbo': if (vol > 0.05) audio.sfx('miniTurbo' + e.level, { volume: vol }); if (human) buzz(k, 20 + e.level * 15); break;
      case 'driftStart': if (human) audio.sfx('driftStart', { volume: 0.7 }); break;
      case 'hop': if (human) audio.sfx('hop', { volume: 0.5 }); break;
      case 'pad': case 'nitro': case 'startBoost': case 'trickBoost': if (vol > 0.05) audio.sfx('boost', { volume: vol }); break;
      case 'trick': if (human) audio.sfx('hop', { pitch: 1.5 }); break;
      case 'hit': if (vol > 0.05) audio.sfx(e.kind === 'explosion' ? 'explosion' : 'spin', { volume: vol }); if (human) buzz(k, e.kind === 'explosion' ? 300 : 160); break;
      case 'shieldBlock': audio.sfx('shieldBlock', { volume: vol }); break;
      case 'throw': if (vol > 0.05) audio.sfx('throw', { volume: vol }); break;
      case 'drop': if (vol > 0.05) audio.sfx('drop', { volume: vol }); break;
      case 'rocketLaunch': audio.sfx('rocketLaunch', { volume: Math.max(0.3, vol) }); break;
      case 'explode': { const v = near(e.x, e.z); if (v > 0.05) audio.sfx(e.kind === 'rocket' ? 'explosion' : 'bump', { volume: v }); break; }
      case 'mega': audio.sfx('mega', { volume: Math.max(0.4, vol) }); break;
      case 'zap': audio.sfx('zap'); for (const o of race.karts) if (o.human && o.place < k.place) buzz(o, 250); break;
      case 'lap': if (human) { audio.sfx('lap'); hud.banner(k.id, 'LAP ' + e.lap); } break;
      case 'finalLap':
        if (human) { audio.sfx('finalLap'); hud.banner(k.id, 'FINAL LAP!', 'final'); }
        if (!app.finalLapMusic) { app.finalLapMusic = true; audio.setMusicTempo(1.12); }
        break;
      case 'finish': if (human) { audio.sfx('finish'); buzz(k, 400); } break;
      case 'bump': if (e.a.human || e.b.human) { audio.sfx('bump', { volume: 0.6 }); if (e.a.human) buzz(e.a, 40); if (e.b.human) buzz(e.b, 40); } break;
      case 'wall': if (human) { audio.sfx('wall', { volume: Math.min(1, e.impact / 15) }); buzz(k, 50); } break;
      case 'raceOver': setTimeout(showResults, 600); break;
    }
  }
  view.handleEvents(events);
}

function buzz(k, ms) {
  const p = app.players.find(q => q.slot === k.slot);
  if (p?.conn) p.conn.send({ t: 'buzz', ms });
}

function sendHud() {
  const race = app.race;
  for (const p of app.players) {
    const k = kartFor(p);
    if (!k || !p.conn) continue;
    p.conn.send({ t: 'hud', place: k.place, total: race.karts.length, lap: Math.min(race.laps, Math.max(1, k.lap + 1)), laps: race.laps,
      item: k.itemRoll > 0 ? null : k.item, itemSpin: k.itemRoll > 0, charges: k.itemCharges, speed: Math.round(Math.max(0, k.v) * 3.6), finished: k.finished });
  }
}

function showResults() {
  const race = app.race;
  if (!race || app.phase !== 'race') return;
  app.phase = 'results';
  const st = race.standings();
  app.lastResults = st;
  const list = $('#results-list');
  list.innerHTML = '';
  st.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rrow' + (r.human ? ' human' : '') + (i < 3 ? ' top' + (i + 1) : '');
    row.style.setProperty('--pc', r.color);
    row.style.animationDelay = (i * 0.08) + 's';
    row.innerHTML = `<div class="rplace">${i + 1}</div><img src="${app.portraits[r.char] || ''}" alt=""><div class="rname">${escapeHtml(r.name)}${r.human ? ` <span class="rtag">P${r.slot + 1}</span>` : ''}</div><div class="rtime">${r.estimated ? '—' : fmtTime(r.time)}</div>`;
    list.appendChild(row);
  });
  const winner = race.order[0];
  $('#results-title').textContent = winner.human ? `${winner.name} WINS!` : 'RACE COMPLETE';
  view.mode = 'results';
  view.focus(winner.id, 'orbit');
  hud.clear();
  showScreen('results');
  audio.stopMusic();
  audio.playMusic('results');
  broadcast({ t: 'phase', phase: 'results' });
  for (const p of app.players) sendResults(p);
}

function sendResults(p) {
  const st = app.lastResults;
  if (!st || !p.conn) return;
  const me = st.find(r => r.human && r.slot === p.slot);
  p.conn.send({ t: 'results', place: me ? me.place : 0, time: me ? me.time : 0, standings: st.map(r => ({ name: r.name, char: r.char, time: r.estimated ? 0 : r.time })) });
}

function backToLobby() {
  app.phase = 'lobby';
  app.race = null;
  for (const p of app.players) { if (p.kind === 'pad') p.ready = false; }
  app.players = app.players.filter(p => p.connected);
  startAttract();
  showScreen('lobby');
  broadcast({ t: 'phase', phase: 'lobby' });
  broadcastLobby();
  renderLobby();
}

function nextTrack() {
  app.settings.track = (app.settings.track + 1) % TRACKS.length;
  startRace();
}

// ---------------- local input: keyboard & gamepads ----------------
const keys = new Set();
const KB = {
  kb1: { left: 'KeyA', right: 'KeyD', gas: 'KeyW', brake: 'KeyS', drift: 'Space', item: 'KeyE', alt: 'ShiftLeft' },
  kb2: { left: 'ArrowLeft', right: 'ArrowRight', gas: 'ArrowUp', brake: 'ArrowDown', drift: 'Slash', item: 'Period', alt: 'ShiftRight' },
};
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  audio.unlock();
  if (app.phase === 'lobby') {
    if (e.code === 'Space' || e.code === 'KeyW') joinKeyboard('kb1');
    if (e.code === 'ArrowUp' || e.code === 'Slash') joinKeyboard('kb2');
    for (const kind of ['kb1', 'kb2']) {
      const p = app.players.find(q => q.kind === kind);
      if (!p) continue;
      if (e.code === KB[kind].left || e.code === KB[kind].right) cycleChar(p, e.code === KB[kind].right ? 1 : -1);
      if (e.code === (kind === 'kb1' ? 'KeyQ' : 'Backspace')) removePlayer(p);
    }
    if (e.code === 'Enter') startRace();
    if (e.code === 'BracketLeft') menuAction('left');
    if (e.code === 'BracketRight') menuAction('right');
  } else if (app.phase === 'race') {
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  } else if (app.phase === 'results') {
    if (e.code === 'Enter') backToLobby();
    if (e.code === 'KeyN') nextTrack();
  }
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); updateMuteBtn(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function joinKeyboard(kind) {
  if (app.players.some(p => p.kind === kind)) return;
  const p = addPlayer({ kind });
  if (p) { audio.sfx('join'); broadcastLobby(); renderLobby(); }
}

function cycleChar(p, dir) {
  let idx = CHARACTERS.findIndex(c => c.id === p.char);
  for (let n = 0; n < CHARACTERS.length; n++) {
    idx = (idx + dir + CHARACTERS.length) % CHARACTERS.length;
    if (!charTaken(CHARACTERS[idx].id, p)) { p.char = CHARACTERS[idx].id; break; }
  }
  audio.sfx('select');
  broadcastLobby(); renderLobby();
}

function pollLocalInputs() {
  for (const p of app.players) {
    if (p.kind === 'kb1' || p.kind === 'kb2') {
      const m = KB[p.kind];
      p.input = {
        s: (keys.has(m.right) ? 1 : 0) - (keys.has(m.left) ? 1 : 0),
        g: keys.has(m.gas) ? 1 : 0, b: keys.has(m.brake) ? 1 : 0,
        d: keys.has(m.drift) || keys.has(m.alt) ? 1 : 0, i: keys.has(m.item) ? 1 : 0,
      };
    }
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    let p = app.players.find(q => q.kind === 'gp' && q.gpIndex === gp.index);
    const btn = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    if (!p) {
      if (app.phase === 'lobby' && (btn(0) || btn(9))) {
        p = addPlayer({ kind: 'gp', gpIndex: gp.index });
        if (p) { audio.unlock(); audio.sfx('join'); broadcastLobby(); renderLobby(); p.prevBtns = gp.buttons.map(b => b.pressed); }
      }
      continue;
    }
    const prev = p.prevBtns || [];
    const pressed = (i) => btn(i) && !prev[i];
    if (app.phase === 'lobby') {
      if (pressed(14) || pressed(15)) cycleChar(p, pressed(15) ? 1 : -1);
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.7 && !p.axHeld) { cycleChar(p, ax > 0 ? 1 : -1); p.axHeld = true; }
      if (Math.abs(ax) < 0.3) p.axHeld = false;
      if (pressed(9)) startRace();
      if (pressed(1)) removePlayer(p);
    } else if (app.phase === 'results') {
      if (pressed(9) || pressed(0)) backToLobby();
    } else if (pressed(9)) togglePause();
    let s = gp.axes[0] || 0;
    if (Math.abs(s) < 0.12) s = 0;
    if (btn(14)) s = -1; if (btn(15)) s = 1;
    p.input = { s, g: btn(0) || btn(7) ? 1 : 0, b: btn(1) || btn(6) ? 1 : 0, d: btn(5) || btn(4) ? 1 : 0, i: btn(2) || btn(3) ? 1 : 0 };
    p.prevBtns = gp.buttons.map(b => b.pressed);
  }
}

function togglePause() {
  app.paused = !app.paused;
  showScreen(app.paused ? 'pause' : null);
  if (app.paused) audio.setMasterVolume(0.3); else audio.setMasterVolume(1);
}

// ---------------- main loop ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollLocalInputs();
  if (app.phase === 'race' || app.phase === 'results') {
    const race = app.race;
    if (race && !app.paused) {
      for (const p of app.players) { const k = kartFor(p); if (k && !k.finished) k.input = p.input; }
      const ev = race.update(dt);
      onRaceEvents(ev);
      if (!app.musicStarted && race.phase === 'race') { app.musicStarted = true; audio.playMusic(race.def.music); }
      const engines = race.karts.filter(k => k.human).map(k => ({ speed01: Math.max(0, Math.min(1, k.v / 36)), boosting: k.boostT > 0, drifting: k.drift !== 0 }));
      audio.setEngines(app.phase === 'race' ? engines : []);
      if (now - app.lastHud > 160) { app.lastHud = now; if (app.phase === 'race') sendHud(); }
    }
    if (app.paused) dt = 0;
  } else if (app.attract) {
    const ev = app.attract.update(dt);
    view.handleEvents(ev);
  }
  view.render(dt);
  if (app.phase === 'race') hud.update(view.viewports(), dt, view.zapFlash);
}

// ---------------- boot ----------------
function updateMuteBtn() { $('#btn-mute').textContent = audio.muted ? '🔇' : '🔊'; }

async function boot() {
  $('#btn-start').addEventListener('click', () => startRace());
  $('#trk-prev').addEventListener('click', () => menuAction('left'));
  $('#trk-next').addEventListener('click', () => menuAction('right'));
  $('#btn-laps').addEventListener('click', () => menuAction('laps'));
  $('#btn-cc').addEventListener('click', () => menuAction('cc'));
  $('#btn-cpu').addEventListener('click', () => menuAction('cpu'));
  $('#btn-lobby').addEventListener('click', () => backToLobby());
  $('#btn-next').addEventListener('click', () => nextTrack());
  $('#btn-resume').addEventListener('click', () => togglePause());
  $('#btn-quit').addEventListener('click', () => { app.paused = false; audio.setMasterVolume(1); backToLobby(); });
  $('#btn-mute').addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); updateMuteBtn(); });
  $('#btn-full').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); });
  addEventListener('pointerdown', () => audio.unlock(), { once: false });
  // icons in the help strip
  $('#help-items').innerHTML = ['nitro', 'oil', 'bouncer', 'rocket', 'shield', 'mega', 'zap'].map(id => `<span class="hi">${ITEM_ICONS[id] || ''}</span>`).join('');
  showScreen('lobby');
  renderLobby();
  startAttract();
  requestAnimationFrame(frame);
  openRoom();
  try { app.portraits = await renderPortraits(160); } catch (e) { console.warn('portraits failed', e); }
  renderLobby();
  // test hook: auto-add keyboard players  (?kb=2)
  const kb = +params.get('kb') || 0;
  if (kb >= 1) joinKeyboard('kb1');
  if (kb >= 2) joinKeyboard('kb2');
  for (let i = 0; i < (+params.get('fake') || 0); i++) addPlayer({ kind: 'fake', name: 'Bot ' + (app.players.length + 1) });
  if (params.get('autostart')) startRace();
}
boot();

// Minimal fake host for testing the pad: /dev/fakehost.html?room=TEST  (pad: /pad.html?room=TEST&local=1)
import { createHost } from '/src/net/transport.js';
import { ITEM_IDS } from '/src/pad/icons.js';

const params = new URLSearchParams(location.search);
const CODE = (params.get('room') || 'TEST').toUpperCase();
const LOCAL = params.get('local') !== '0';
document.getElementById('room').textContent = CODE;

const COLORS = ['#ff4458', '#27a8ff', '#3ddc84', '#ffd23f', '#b45cff', '#ff8a1f', '#ff7eb6', '#27e1ff'];
const CHAR_IDS = ['pip', 'bruno', 'lily', 'miso', 'bao', 'inky', 'rex', 'coco'];
const TRACKS = [['meadow', 'Sunny Meadow'], ['desert', 'Dusty Dunes'], ['snow', 'Frosty Peak'], ['neon', 'Neon Nights']];

const players = new Map(); // pid -> player
const conns = new Map();   // conn.id -> { conn, pid }
let phase = 'lobby';
let trackIdx = 0, laps = 3, cpu = true;
let failNext = false;
const log = [];
const state = { phase, players, log, inputs: {}, msgs: [] };
window.__fake = state;
state.dropAll = () => { conns.forEach(({ conn }) => conn.close()); };

const $ = (s) => document.querySelector(s);
const logEl = $('#log');
function L(s) {
  log.push(s); if (log.length > 200) log.shift();
  logEl.textContent = log.slice(-14).join('\n');
}

ITEM_IDS.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = id; $('#hItem').appendChild(o); });

function lobbyMsg(p) {
  const list = [...players.values()].sort((a, b) => a.slot - b.slot);
  return {
    t: 'lobby',
    players: list.map((q) => ({ slot: q.slot, name: q.name, char: q.char, ready: q.ready, color: q.color })),
    track: TRACKS[trackIdx][0], trackName: TRACKS[trackIdx][1], laps, cpu,
    isLeader: p.slot === list[0].slot,
    taken: list.map((q) => q.char).filter(Boolean),
  };
}
function broadcastLobby() {
  conns.forEach(({ conn, pid }) => { const p = players.get(pid); if (p && !conn.closed) conn.send(lobbyMsg(p)); });
  renderPlayers();
}
function broadcast(m) { conns.forEach(({ conn }) => conn.send(m)); }
function setPhase(ph) {
  phase = ph; state.phase = ph;
  broadcast({ t: 'phase', phase: ph });
  L('phase -> ' + ph);
}

function resultsFor(p, place) {
  const list = [...players.values()].sort((a, b) => a.slot - b.slot);
  const names = list.map((q) => ({ name: q.name, char: q.char || 'pip', time: 62.1 + q.slot * 6.7 }));
  while (names.length < 5) names.push({ name: 'CPU ' + (names.length + 1), char: CHAR_IDS[names.length % 8], time: 75 + names.length * 3.3 });
  names.sort((a, b) => a.time - b.time);
  return { t: 'results', place, time: names[place - 1]?.time ?? 80.123, standings: names };
}

createHost(CODE, { local: LOCAL }).then((host) => {
  $('#status').textContent = '(listening)';
  host.onConnection((conn) => {
    conns.set(conn.id, { conn, pid: null });
    L('conn ' + conn.id);
    if (failNext) { failNext = false; conn.send({ t: 'full' }); return; }
    conn.onClose(() => { L('closed ' + conn.id); conns.delete(conn.id); });
    conn.onMessage((m) => {
      state.msgs.push(m); if (state.msgs.length > 500) state.msgs.shift();
      const rec = conns.get(conn.id);
      if (m.t === 'hello') {
        rec.pid = m.pid;
        let p = players.get(m.pid);
        if (!p) {
          const used = new Set([...players.values()].map((q) => q.slot));
          let slot = 0; while (used.has(slot)) slot++;
          p = { pid: m.pid, slot, name: m.name || 'Player', char: null, ready: false, color: COLORS[slot % 8], inCount: 0, rate: 0, last: null };
          players.set(m.pid, p);
        } else if (m.name) p.name = m.name;
        conn.send({ t: 'welcome', slot: p.slot, color: p.color, name: p.name });
        conn.send({ t: 'phase', phase });
        broadcastLobby();
        L(`hello ${p.name} slot ${p.slot}`);
        return;
      }
      const p = rec && players.get(rec.pid);
      if (!p) return;
      switch (m.t) {
        case 'pick':
          if (![...players.values()].some((q) => q !== p && q.char === m.char)) p.char = m.char;
          broadcastLobby(); L(`pick ${m.char}`); break;
        case 'ready': p.ready = !!m.ready; broadcastLobby(); L('ready ' + m.ready); break;
        case 'menu': {
          L('menu ' + m.a);
          if (m.a === 'left') trackIdx = (trackIdx + TRACKS.length - 1) % TRACKS.length;
          else if (m.a === 'right') trackIdx = (trackIdx + 1) % TRACKS.length;
          else if (m.a === 'laps') laps = laps >= 5 ? 1 : laps + 1;
          else if (m.a === 'cpu') cpu = !cpu;
          else if (m.a === 'start') { setPhase('countdown'); setTimeout(() => setPhase('race'), 1500); }
          broadcastLobby();
          break;
        }
        case 'in':
          p.last = m; p.inCount++;
          state.inputs[p.slot] = m;
          break;
        case 'ping': conn.send({ t: 'pong', ts: m.ts }); break;
        default: break;
      }
    });
  });
}).catch((e) => { $('#status').textContent = 'ERROR ' + e.message; });

// ----- UI -----
document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => setPhase(b.dataset.phase)));
$('#btnFull').addEventListener('click', () => { failNext = true; L('next join gets full'); });
function hudMsg() {
  return {
    t: 'hud', place: +$('#hPlace').value, total: +$('#hTotal').value, lap: +$('#hLap').value, laps: +$('#hLaps').value,
    item: $('#hItem').value || null, itemSpin: $('#hSpin').checked, speed: 20, finished: $('#hFin').checked,
  };
}
$('#btnHud').addEventListener('click', () => broadcast(hudMsg()));
setInterval(() => { if ($('#hAuto').checked) broadcast(hudMsg()); }, 166);
$('#btnBuzz').addEventListener('click', () => broadcast({ t: 'buzz', ms: 200 }));
$('#btnResults').addEventListener('click', () => {
  conns.forEach(({ conn, pid }) => {
    const p = players.get(pid); if (!p) return;
    conn.send(resultsFor(p, Math.min(5, p.slot + 1)));
  });
  setPhase('results');
});

function renderPlayers() {
  const tb = $('#players tbody');
  tb.innerHTML = [...players.values()].sort((a, b) => a.slot - b.slot).map((p) =>
    `<tr id="pl${p.slot}"><td>${p.slot}</td><td>${p.name}</td><td>${p.char || '-'}</td><td>${p.ready ? 'yes' : 'no'}</td>` +
    `<td class="s">-</td><td class="g">-</td><td class="b">-</td><td class="d">-</td><td class="i">-</td><td class="q">-</td><td class="r">0</td></tr>`).join('');
}
let lastCounts = new Map();
setInterval(() => {
  players.forEach((p) => {
    const tr = document.getElementById('pl' + p.slot); if (!tr) return;
    const prev = lastCounts.get(p.pid) || 0;
    p.rate = p.inCount - prev; lastCounts.set(p.pid, p.inCount);
    const m = p.last; if (!m) return;
    tr.querySelector('.s').textContent = (+m.s).toFixed(2);
    ['g', 'b', 'd', 'i'].forEach((k) => { tr.querySelector('.' + k).textContent = m[k]; });
    tr.querySelector('.q').textContent = m.seq;
    tr.querySelector('.r').textContent = p.rate;
  });
}, 1000);

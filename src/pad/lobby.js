// Lobby screen: player banner, character grid, ready toggle, leader controls.
import { $, esc, haptic, toast } from './common.js';
import { chars, faceHTML } from './chars.js';

export function createLobby(ctx) {
  const grid = $('#charGrid');
  const players = $('#players');
  let last = null;      // last lobby message
  let myChar = null;
  let ready = false;

  const slotLabel = (slot) => 'P' + ((slot ?? 0) + 1);

  function buildGrid() {
    grid.innerHTML = chars.list.map((c) => `
      <button class="char" type="button" data-id="${esc(c.id)}" style="--cc:${esc(c.color || '#888')}">
        <div class="ph">${faceHTML(c)}</div>
        <span class="nm">${esc(c.name)}</span>
      </button>`).join('');
    if (last) update(last);
  }

  function me() {
    if (!last || !last.players) return null;
    return last.players.find((p) => p.slot === ctx.state.slot) || null;
  }

  function setReadyUI() {
    const b = $('#readyBtn');
    b.classList.toggle('on', ready);
    $('#readyLabel').textContent = ready ? 'READY!' : 'READY?';
  }

  function renderBanner() {
    const color = (me() && me().color) || ctx.state.color || '#ffd23f';
    document.documentElement.style.setProperty('--pc', color);
    $('#meSlot').textContent = ctx.state.slot != null ? ctx.state.slot + 1 : '?';
    $('#meName').textContent = (me() && me().name) || ctx.state.name || 'Player';
    const c = chars.byId(myChar);
    $('#meSub').textContent = c ? `${c.name} the ${c.species || 'racer'}` : 'Pick your racer';
    $('#meChar').innerHTML = c ? faceHTML(c) : '<span>❓</span>';
  }

  function renderStats() {
    const c = chars.byId(myChar);
    const el = $('#charStats');
    if (!c || !c.stats) { el.innerHTML = ''; return; }
    const rows = [['SPEED', 'speed'], ['ACCEL', 'accel'], ['HANDLE', 'handling'], ['WEIGHT', 'weight']];
    el.innerHTML = rows.map(([l, k]) => {
      const v = Math.max(0, Math.min(1, +c.stats[k] || 0));
      return `<div class="stat"><span>${l}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
    }).join('');
  }

  function renderPlayers(list) {
    const sorted = [...list].sort((a, b) => a.slot - b.slot);
    $('#roomCount').textContent = sorted.length;
    players.innerHTML = sorted.map((p) => {
      const c = chars.byId(p.char);
      const isMe = p.slot === ctx.state.slot;
      return `<li class="${isMe ? 'me' : ''}">
        <div class="pdot" style="--c:${esc(p.color || '#888')}">${c ? faceHTML(c) : `<span>${p.slot + 1}</span>`}</div>
        <span class="pn">${esc(p.name || 'Player')}${isMe ? ' (you)' : ''}</span>
        <span class="ps ${p.ready ? 'rdy' : ''}">${p.ready ? 'READY' : (c ? esc(c.name) : 'picking…')}</span>
      </li>`;
    }).join('');
  }

  function update(m) {
    last = m;
    const list = m.players || [];
    const mine = me();
    if (mine) {
      if (mine.char) myChar = mine.char;
      ready = !!mine.ready;
    }
    // character cards
    const owners = new Map();
    list.forEach((p) => { if (p.char && p.slot !== ctx.state.slot) owners.set(p.char, p); });
    (m.taken || []).forEach((id) => { if (id !== myChar && !owners.has(id)) owners.set(id, { slot: -1, color: '#555' }); });
    grid.querySelectorAll('.char').forEach((el) => {
      const id = el.dataset.id;
      const o = owners.get(id);
      el.classList.toggle('taken', !!o);
      el.classList.toggle('sel', id === myChar);
      if (o) { el.dataset.owner = o.slot >= 0 ? slotLabel(o.slot) : '✖'; el.style.setProperty('--oc', o.color || '#555'); }
      else delete el.dataset.owner;
    });
    renderBanner();
    renderStats();
    renderPlayers(list);
    setReadyUI();

    // leader panel
    const leader = !!m.isLeader;
    $('#leaderPanel').hidden = !leader;
    $('#startBtn').hidden = !leader;
    if (leader) {
      $('#trackName').textContent = m.trackName || m.track || '--';
      $('#lapsVal').textContent = m.laps ?? '-';
      const cpu = m.cpu;
      const cv = $('#cpuVal');
      if (cpu === undefined || cpu === null) cv.textContent = 'TAP';
      else cv.textContent = cpu === true ? 'ON' : cpu === false || cpu === 0 ? 'OFF' : String(cpu);
      $('#cpuBtn').classList.toggle('on', !!cpu);
    }
  }

  // --- interactions ---
  grid.addEventListener('click', (e) => {
    const el = e.target.closest('.char');
    if (!el || el.classList.contains('taken')) return;
    const id = el.dataset.id;
    myChar = id;
    haptic(15);
    ctx.send({ t: 'pick', char: id });
    grid.querySelectorAll('.char').forEach((n) => n.classList.toggle('sel', n.dataset.id === id));
    renderBanner();
    renderStats();
  });

  $('#readyBtn').addEventListener('click', () => {
    if (!myChar && !ready) { toast('Pick a racer first!'); haptic([30, 40, 30]); return; }
    ready = !ready;
    haptic(ready ? [20, 30, 40] : 15);
    ctx.send({ t: 'ready', ready });
    setReadyUI();
  });

  const menu = (a) => () => { haptic(18); ctx.send({ t: 'menu', a }); };
  $('#trackPrev').addEventListener('click', menu('left'));
  $('#trackNext').addEventListener('click', menu('right'));
  $('#lapsBtn').addEventListener('click', menu('laps'));
  $('#cpuBtn').addEventListener('click', menu('cpu'));
  $('#startBtn').addEventListener('click', () => { haptic([30, 30, 60]); ctx.send({ t: 'menu', a: 'start' }); });

  buildGrid();
  chars.ready.then(buildGrid);

  return {
    update,
    refresh: renderBanner,
    reset() { ready = false; setReadyUI(); },
  };
}

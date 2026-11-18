// Lobby screen: your auto-assigned racer (one shuffle), racer-name edit, ready toggle, leader race setup.
import { $, esc, haptic, store } from './common.js';
import { chars, faceHTML } from './chars.js';

export function createLobby(ctx) {
  const players = $('#players');
  let last = null;      // last lobby message
  let myChar = null;
  let ready = false;
  let editing = false;

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
    if (!editing) $('#meName').textContent = (me() && me().name) || ctx.state.name || 'Player';
  }

  function renderRacer() {
    const c = chars.byId(myChar);
    $('#rcFace').innerHTML = c ? faceHTML(c) : '<span>❓</span>';
    $('#rcFace').style.setProperty('--cc', (c && c.color) || '#555');
    $('#rcChar').textContent = c ? c.name : 'Finding your racer…';
    $('#rcTag').textContent = c ? (c.tagline || (c.species ? `The ${c.species}` : '')) : '';
    const chips = [];
    if (c && c.vehicleLabel) chips.push(`<span class="rchip veh">🏎️ ${esc(c.vehicleLabel)}</span>`);
    else if (c && c.vehicle) chips.push(`<span class="rchip veh">🏎️ ${esc(String(c.vehicle).toUpperCase())}</span>`);
    if (c && c.gliderLabel) chips.push(`<span class="rchip gl">🪂 ${esc(c.gliderLabel)}</span>`);
    else if (c && c.glider) chips.push(`<span class="rchip gl">🪂 ${esc(String(c.glider).toUpperCase())}</span>`);
    $('#rcChips').innerHTML = chips.join('');
    const left = last && last.shufflesLeft != null ? +last.shufflesLeft : null;
    const sb = $('#shuffleBtn');
    sb.disabled = left === 0 || ready;
    $('#shuffleLeft').textContent = left == null ? '' : `${left} left`;
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
        <span class="ps ${p.ready ? 'rdy' : ''}">${p.ready ? 'READY' : (c ? esc(c.name) : '…')}</span>
      </li>`;
    }).join('');
  }

  function update(m) {
    last = m;
    const mine = me();
    if (m.myChar) myChar = m.myChar;
    else if (mine && mine.char) myChar = mine.char;
    if (mine) ready = !!mine.ready;
    renderBanner();
    renderRacer();
    renderPlayers(m.players || []);
    setReadyUI();

    const leader = !!m.isLeader;
    $('#leaderPanel').hidden = !leader;
    $('#startBtn').hidden = !leader;
    if (leader) {
      $('#trackName').textContent = m.trackName || m.track || '--';
      $('#lapsVal').textContent = m.laps ?? '-';
      $('#ccVal').textContent = m.cc ? m.cc + 'cc' : '150cc';
      const cpu = m.cpu;
      $('#cpuVal').textContent = cpu === true ? 'ON' : cpu === false || cpu === 0 ? 'OFF' : cpu == null ? '—' : String(cpu);
      $('#cpuBtn').classList.toggle('on', !!cpu);
    }
  }

  /* --- racer name edit --- */
  const form = $('#nameForm'), input = $('#nameEditInput');
  function openEdit() {
    editing = true;
    input.value = (me() && me().name) || ctx.state.name || '';
    $('#nameRow').hidden = true; form.hidden = false;
    input.focus(); input.select();
    haptic(10);
  }
  function closeEdit() { editing = false; form.hidden = true; $('#nameRow').hidden = false; renderBanner(); }
  $('#nameEdit').addEventListener('click', openEdit);
  $('#meName').addEventListener('click', openEdit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (name) {
      ctx.state.name = name;
      store.set('pk_name', name);
      ctx.send({ t: 'name', name });
      $('#meName').textContent = name;
      haptic([15, 20, 25]);
    }
    input.blur();
    closeEdit();
  });
  input.addEventListener('blur', () => setTimeout(() => { if (editing) form.requestSubmit ? form.requestSubmit() : closeEdit(); }, 120));

  /* --- interactions --- */
  $('#shuffleBtn').addEventListener('click', () => {
    if ($('#shuffleBtn').disabled) return;
    haptic([10, 20, 10, 20]);
    const f = $('#rcFace');
    f.classList.remove('roll'); void f.offsetWidth; f.classList.add('roll');
    ctx.send({ t: 'shuffle' });
  });

  $('#readyBtn').addEventListener('click', () => {
    ready = !ready;
    haptic(ready ? [20, 30, 40] : 15);
    ctx.send({ t: 'ready', ready });
    setReadyUI();
    renderRacer();
  });

  const menu = (a) => () => { haptic(18); ctx.send({ t: 'menu', a }); };
  $('#trackPrev').addEventListener('click', menu('left'));
  $('#trackNext').addEventListener('click', menu('right'));
  $('#lapsBtn').addEventListener('click', menu('laps'));
  $('#ccBtn').addEventListener('click', menu('cc'));
  $('#cpuBtn').addEventListener('click', menu('cpu'));
  $('#startBtn').addEventListener('click', () => { haptic([30, 30, 60]); ctx.send({ t: 'menu', a: 'start' }); });

  chars.ready.then(() => { renderRacer(); if (last) renderPlayers(last.players || []); });

  return {
    update,
    refresh: () => { renderBanner(); renderRacer(); },
    reset() { ready = false; setReadyUI(); renderRacer(); },
  };
}

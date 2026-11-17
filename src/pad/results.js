// Results screen.
import { $, esc, fmtTime, ordinal } from './common.js';
import { chars, faceHTML } from './chars.js';

export function createResults(ctx) {
  function reset() {
    $('#resPlace').innerHTML = '<b>-</b><sup></sup>';
    $('#resTime').textContent = '--:--.---';
    $('#standings').innerHTML = '';
  }

  function show(m) {
    const place = m.place ?? 0;
    const medal = place === 1 ? '#ffd23f' : place === 2 ? '#d9e2ee' : place === 3 ? '#e69a58' : '#ff7eb6';
    const ph = $('#resPlace');
    ph.style.setProperty('--pcol', medal);
    ph.innerHTML = `<b>${place || '-'}</b><sup>${place ? ordinal(place) : ''}</sup>`;
    $('#resLabel') && ($('#resLabel').textContent = place === 1 ? 'YOU WON!' : 'YOU FINISHED');
    $('#resTime').textContent = fmtTime(m.time);
    const list = Array.isArray(m.standings) ? m.standings : [];
    $('#standings').innerHTML = list.map((r, i) => {
      const c = chars.byId(r.char);
      const mine = i + 1 === place;
      return `<li class="${mine ? 'me' : ''}" style="animation-delay:${Math.min(i, 8) * 55}ms">
        <span class="pos">${i + 1}</span>
        <span class="face" style="--c:${esc((c && c.color) || '#666')}">${faceHTML(c)}</span>
        <span class="sn">${esc(r.name)}${mine ? ' (you)' : ''}</span>
        <span class="st">${r.time != null && isFinite(r.time) ? fmtTime(r.time) : 'DNF'}</span>
      </li>`;
    }).join('');
    ctx.haptic && ctx.haptic(place === 1 ? [60, 60, 60, 60, 200] : 40);
  }

  return { show, reset };
}

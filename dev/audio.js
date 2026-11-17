import { AudioEngine, THEME_NAMES, SFX_NAMES } from '../src/audio/audio.js';

const audio = new AudioEngine();
window.__audio = audio;

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent = m; };

$('unlock').onclick = () => {
  audio.unlock();
  $('state').textContent = audio.ctx ? audio.ctx.state : 'no AudioContext';
};
$('mute').onchange = (e) => audio.setMuted(e.target.checked);
$('vol').oninput = (e) => audio.setMasterVolume(+e.target.value);

// music
let current = null;
const themeBtns = {};
for (const t of THEME_NAMES) {
  const b = document.createElement('button');
  b.textContent = t;
  b.dataset.theme = t;
  b.onclick = () => {
    audio.unlock();
    audio.playMusic(t);
    current = t;
    for (const k in themeBtns) themeBtns[k].classList.toggle('on', k === t);
    log('music: ' + t);
  };
  themeBtns[t] = b;
  $('themes').appendChild(b);
}
$('stopMusic').onclick = () => {
  audio.stopMusic();
  current = null;
  for (const k in themeBtns) themeBtns[k].classList.remove('on');
};
$('tempo').oninput = (e) => {
  $('tempoVal').textContent = (+e.target.value).toFixed(2);
  audio.setMusicTempo(+e.target.value);
};

// engines
function pushEngines() {
  const n = +$('karts').value;
  const sp = +$('speed').value;
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      speed01: Math.min(1, Math.max(0, sp * (1 - i * 0.06))),
      boosting: $('boosting').checked && i % 2 === 0,
      drifting: $('drifting').checked && i % 3 === 0,
    });
  }
  audio.setEngines(list);
}
for (const id of ['karts', 'speed', 'boosting', 'drifting']) $(id).oninput = $(id).onchange = () => { audio.unlock(); pushEngines(); };
$('enginesOff').onclick = () => { $('karts').value = 0; audio.setEngines([]); };
$('sweep').onclick = () => {
  audio.unlock();
  if (+$('karts').value < 1) $('karts').value = 1;
  const t0 = performance.now();
  const iv = setInterval(() => {
    const p = (performance.now() - t0) / 4000;
    $('speed').value = p < 0.5 ? p * 2 : Math.max(0, 2 - p * 2);
    pushEngines();
    if (p >= 1) clearInterval(iv);
  }, 50);
};

// sfx
for (const name of SFX_NAMES) {
  const b = document.createElement('button');
  b.textContent = name;
  b.dataset.sfx = name;
  b.onclick = () => {
    audio.unlock();
    audio.sfx(name, { volume: +$('sfxVol').value, pan: +$('sfxPan').value, pitch: +$('sfxPitch').value });
    log('sfx: ' + name);
  };
  $('sfx').appendChild(b);
}

// level meter + test hook
const buf = new Float32Array(2048);
function peak() {
  const an = audio.analyser;
  if (!an) return 0;
  an.getFloatTimeDomainData(buf);
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; }
  return m;
}
/** Max peak seen over `ms` milliseconds (used by automated tests). */
window.__measure = (ms) => new Promise((res) => {
  let m = 0;
  const t0 = performance.now();
  const iv = setInterval(() => {
    m = Math.max(m, peak());
    if (performance.now() - t0 >= ms) { clearInterval(iv); res(m); }
  }, 8);
});
(function frame() {
  $('meterFill').style.width = Math.min(100, peak() * 100) + '%';
  requestAnimationFrame(frame);
})();

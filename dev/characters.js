// Character lab: all 8 karts on a turntable / lineup, animation state toggles,
// and the portrait row. URL params (for screenshots):
//   ?view=turntable|lineup|single  &angle=chase|front|side|top  &id=pip  &state=drive|steer|drift|boost|spin|mega|shield|finished|squash|idle|cycle
//   &portraits=0 to skip portraits, &ui=0 to hide the UI
import * as THREE from 'three';
import { CHARACTERS, buildKart, renderPortraits } from '../src/render/characters.js';

const params = new URLSearchParams(location.search);
let view = params.get('view') || 'turntable';
let angle = params.get('angle') || 'chase';
let stateName = params.get('state') || 'cycle';
const singleId = params.get('id') || 'pip';
const showUi = params.get('ui') !== '0';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd4ff');
scene.fog = new THREE.Fog('#9fd4ff', 30, 70);
scene.add(new THREE.HemisphereLight('#e8f4ff', '#6a8a4a', 1.1));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#7cc35a', roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);
const pad = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.8, 0.08, 64), new THREE.MeshStandardMaterial({ color: '#d9dde8', roughness: 0.7 }));
pad.position.y = -0.04; pad.receiveShadow = true;
scene.add(pad);
const grid = new THREE.GridHelper(19, 19, '#b8bfd0', '#c8cfdc');
grid.position.y = 0.002; scene.add(grid);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);

// --- karts ---------------------------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);
const karts = CHARACTERS.map((c) => buildKart(c.id, { lod: +(params.get('lod') || 0) }));
const ids = CHARACTERS.map((c) => c.id);

function layout() {
  karts.forEach((k, i) => {
    k.group.visible = true;
    if (view === 'turntable') {
      const a = (i / karts.length) * Math.PI * 2;
      k.group.position.set(Math.sin(a) * 5.2, 0, Math.cos(a) * 5.2);
      k.group.rotation.y = a + Math.PI / 2; // tangent: drive around the circle
    } else if (view === 'lineup') {
      const col = i % 4, row = Math.floor(i / 4);
      k.group.position.set((col - 1.5) * -2.6, 0, row * -3.6);
      k.group.rotation.y = 0;
    } else {
      k.group.visible = ids[i] === singleId || view === 'face' && ids[i] === singleId;
      k.group.position.set(0, 0, 0);
      k.group.rotation.y = 0;
    }
    turntable.add(k.group);
  });
}
layout();

// --- stats -----------------------------------------------------------------
function countTris(obj) {
  let tris = 0, calls = 0;
  const by = {};
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && o.parent && o.parent.name) { // skip fx (flames/shield)
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
      tris += n; calls++;
      by[o.parent.name] = (by[o.parent.name] || 0) + n;
    }
  });
  return { tris: Math.round(tris), calls, by };
}
const statsEl = document.getElementById('stats');
const statLines = karts.map((k) => {
  const { tris, calls, by } = countTris(k.group);
  return `${k.charId.padEnd(9)} ${String(tris).padStart(5)} tris ${String(calls).padStart(3)} meshes  ` +
    Object.entries(by).map(([n, v]) => `${n}:${Math.round(v)}`).join(' ');
});
{ const lo = buildKart('pip', { lod: (+(params.get('lod') || 0)) ? 0 : 1 }); const c = countTris(lo.group); statLines.push(`pip other-lod  ${c.tris} tris ${c.calls} meshes`); lo.dispose(); }
console.log(statLines.join(' | '));

// --- states ----------------------------------------------------------------
const STATES = ['idle', 'drive', 'steer', 'drift', 'boost', 'spin', 'mega', 'shield', 'squash', 'finished', 'glide', 'rescued', 'cycle'];
function stateFor(name, t, i) {
  const s = { speed: 0, speedMax: 25, steer: 0, drift: 0, driftLevel: 0, boosting: false, airborne: false, spin: 0, squash: 0, mega: false, shield: false, finished: false, lean: 0 };
  switch (name) {
    case 'idle': break;
    case 'drive': s.speed = 18; break;
    case 'steer': s.speed = 18; s.steer = Math.sin(t * 1.3 + i) > 0 ? 1 : -1; break;
    case 'drift': s.speed = 20; s.steer = 0.8; s.drift = 1; s.driftLevel = 1 + (Math.floor(t / 1.2) % 3); break;
    case 'boost': s.speed = 28; s.boosting = true; break;
    case 'spin': s.speed = 6; s.spin = (t * 9) % (Math.PI * 4); break;
    case 'mega': s.speed = 18; s.mega = Math.floor(t / 2.5) % 2 === 0; break;
    case 'shield': s.speed = 16; s.shield = true; break;
    case 'squash': { const p = (t % 2) / 2; s.squash = p < 0.6 ? 1 - p / 0.6 : 0; s.speed = 4; break; }
    case 'finished': s.speed = 6; s.finished = true; break;
    case 'glide': s.speed = 22; s.gliding = true; s.airborne = true; s.steer = Math.sin(t * 0.8 + i) * 0.5; break;
    case 'glidepop': s.speed = 22; s.gliding = (t % 2.4) < 1.6; s.airborne = s.gliding; break;
    case 'rescued': s.speed = 0; s.rescued = true; break;
    case 'lean': s.speed = 20; s.steer = 1; break;
    // fixed poses for screenshots
    case 'squashhold': s.squash = 0.8; break;
    case 'spinhold': s.speed = 6; s.spin = 2.2; break;
    case 'drifthold': s.speed = 20; s.steer = -0.9; s.drift = -1; s.driftLevel = 2; break;
    case 'cycle': {
      const seq = ['drive', 'steer', 'drift', 'boost', 'spin', 'mega', 'shield', 'squash', 'finished', 'glide'];
      return stateFor(seq[Math.floor(t / 3) % seq.length], t, i);
    }
  }
  return s;
}

// --- UI --------------------------------------------------------------------
const ui = document.getElementById('ui');
function btn(label, on, fn) {
  const b = document.createElement('button');
  b.textContent = label; if (on) b.classList.add('on');
  b.onclick = () => { fn(); renderUi(); };
  ui.appendChild(b);
}
function renderUi() {
  ui.innerHTML = '';
  if (!showUi) return;
  for (const s of STATES) btn(s, s === stateName, () => { stateName = s; });
  ui.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));
  for (const v of ['turntable', 'lineup']) btn(v, v === view, () => { view = v; layout(); });
  for (const a of ['chase', 'front', 'side', 'top']) btn(a, a === angle, () => { angle = a; });
}
renderUi();
statsEl.textContent = statLines.join('\n');
if (!showUi) statsEl.style.display = 'none';

// --- portraits -------------------------------------------------------------
if (params.get('portraits') !== '0') {
  const big = params.get('big') === '1';
  renderPortraits(big ? 256 : 160).then((map) => {
    const row = document.getElementById('portraits');
    if (big) { row.style.cssText = 'top:0;bottom:auto;flex-wrap:wrap;padding:12px;background:#2a3150'; }
    for (const c of CHARACTERS) {
      const f = document.createElement('figure');
      const img = new Image(); img.src = map[c.id]; img.alt = c.name;
      if (big) img.style.cssText = 'width:256px;height:256px';
      const cap = document.createElement('figcaption'); cap.textContent = c.name; cap.style.color = c.color;
      f.append(img, cap); row.appendChild(f);
    }
    window.__portraitsDone = true;
  }).catch((e) => { console.error(e); window.__portraitsDone = true; });
} else window.__portraitsDone = true;

// --- camera ----------------------------------------------------------------
function placeCamera(t) {
  if (view === 'turntable') {
    const a = t * 0.15;
    camera.position.set(Math.sin(a) * 13, 6.5, Math.cos(a) * 13);
    camera.lookAt(0, 0.8, 0);
    return;
  }
  const c = view === 'lineup' ? new THREE.Vector3(0, 0.9, -1.8) : new THREE.Vector3(0, 0.9, 0);
  const d = view === 'lineup' ? 2.6 : 1;
  const off = {
    chase: [0, 2.5, -6], front: [3.4, 1.8, 4.2], side: [6, 1.4, 0], top: [0, 9, -0.01],
  }[angle] || [0, 2.5, -6];
  if (view === 'face') {
    camera.position.set(0.5, 1.55, 1.6);
    camera.lookAt(0, 1.4, -0.3);
  } else if (view === 'single') {
    const sc = angle === 'chase' ? 1 : 0.62;
    camera.position.set(c.x + off[0] * sc, off[1] * (angle === 'chase' ? 1 : 0.8), c.z + off[2] * sc);
    camera.lookAt(0, angle === 'chase' ? 1.1 : 0.85, 0);
  } else {
    camera.position.set(c.x + off[0] * d, off[1] * d * 0.9, c.z + off[2] * d);
    camera.lookAt(c);
  }
}

// --- loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (view === 'turntable') turntable.rotation.y = t * 0.25;
  else turntable.rotation.y = 0;
  karts.forEach((k, i) => k.update(dt, stateFor(stateName, t, i)));
  placeCamera(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

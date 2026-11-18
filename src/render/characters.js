// Turbo Tonz — procedural characters & karts.
// All 8 drivers are original designs built from three.js primitives.
// Static parts are merged per node & per material (vertex colours), so a full
// kart is ~30 draw calls and ~3.4-3.7k triangles at lod 0 (~2.6-3k at lod 1).
// Geometry/material caches are shared between every instance.
//
// Conventions (kart space): +Z forward, +X = driver's LEFT, origin = ground contact at kart centre.
// update() steer/drift sign: +1 = turning RIGHT (towards -X, i.e. heading decreasing). If the physics
// uses the opposite sign, just negate steer/drift/lean before passing them in.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------
export const CHARACTERS = [
  {
    id: 'pip', name: 'Pip', species: 'fox', number: 1,
    vehicle: 'car', vehicleLabel: 'Sports Car', glider: 'paraglider', gliderLabel: 'Paraglider', twoWheel: false,
    color: '#ff7a1a', accent: '#ffffff',
    tagline: 'Quick-witted fox in a low-slung sports car. Lead foot, goggles on.',
    stats: { speed: 0.6, accel: 0.7, handling: 0.7, weight: 0.4 },
  },
  {
    id: 'bao', name: 'Bao', species: 'panda', number: 2,
    vehicle: 'buggy', vehicleLabel: 'Monster Buggy', glider: 'parachute', gliderLabel: 'Parachute', twoWheel: false,
    color: '#e8394a', accent: '#2a2a33',
    tagline: 'Laid-back panda in a monster buggy. Hard to push around.',
    stats: { speed: 0.85, accel: 0.35, handling: 0.45, weight: 0.95 },
  },
  {
    id: 'lily', name: 'Lily', species: 'frog', number: 3,
    vehicle: 'kart', vehicleLabel: 'Classic Kart', glider: 'umbrella', gliderLabel: 'Lily Umbrella', twoWheel: false,
    color: '#2fbf5a', accent: '#ff8fc8',
    tagline: 'Bouncy tree frog in a classic kart, hops into every corner.',
    stats: { speed: 0.45, accel: 0.85, handling: 0.85, weight: 0.3 },
  },
  {
    id: 'sprocket', name: 'Sprocket', species: 'robot', number: 4,
    vehicle: 'hover', vehicleLabel: 'Hover Pod', glider: 'copter', gliderLabel: 'Heli-Copter', twoWheel: false,
    color: '#2f8bff', accent: '#ffb000',
    tagline: 'Pocket-sized robot floating on a hover pod.',
    stats: { speed: 0.9, accel: 0.45, handling: 0.45, weight: 0.75 },
  },
  {
    id: 'pebble', name: 'Pebble', species: 'penguin', number: 5,
    vehicle: 'sled', vehicleLabel: 'Turbo Sled', glider: 'kite', gliderLabel: 'Box Kite', twoWheel: false,
    color: '#ffd23f', accent: '#2b59d9',
    tagline: 'Penguin in a bobble hat on a turbo snow sled.',
    stats: { speed: 0.55, accel: 0.65, handling: 0.9, weight: 0.35 },
  },
  {
    id: 'rory', name: 'Rory', species: 'dino', number: 6,
    vehicle: 'bike', vehicleLabel: 'Moto Bike', glider: 'wings', gliderLabel: 'Bat Wings', twoWheel: true,
    color: '#8a4dff', accent: '#ffb13b',
    tagline: 'Baby dino with tiny arms on a big moto bike.',
    stats: { speed: 0.75, accel: 0.5, handling: 0.55, weight: 0.8 },
  },
  {
    id: 'nova', name: 'Nova', species: 'cat', number: 7,
    vehicle: 'trike', vehicleLabel: 'Space Trike', glider: 'balloon', gliderLabel: 'Party Balloons', twoWheel: false,
    color: '#ff4fa3', accent: '#e9f1ff',
    tagline: 'Space cat astronaut cruising a three-wheel space trike.',
    stats: { speed: 0.7, accel: 0.6, handling: 0.65, weight: 0.5 },
  },
  {
    id: 'mochi', name: 'Mochi', species: 'bunny', number: 8,
    vehicle: 'scooter', vehicleLabel: 'Scooter', glider: 'hangglider', gliderLabel: 'Hang Glider', twoWheel: true,
    color: '#2fd3c0', accent: '#ff7aa8',
    tagline: 'Tiny bunny on a zippy scooter, carrot basket included.',
    stats: { speed: 0.4, accel: 0.95, handling: 0.75, weight: 0.2 },
  },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
export function getCharacter(id) {
  return BY_ID.get(id) || CHARACTERS[0];
}

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const PI = Math.PI;

function toQuat(r) {
  if (!r) return new THREE.Quaternion();
  if (r.isQuaternion) return r;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'XYZ'));
}
function toScale(s) {
  if (s === undefined) return V(1, 1, 1);
  if (typeof s === 'number') return V(s, s, s);
  return V(s[0], s[1], s[2]);
}
function mtx(p, r, s) {
  return new THREE.Matrix4().compose(p ? V(p[0], p[1], p[2]) : V(), toQuat(r), toScale(s));
}
/** quaternion rotating +Y onto dir */
const alignY = (x, y, z) => new THREE.Quaternion().setFromUnitVectors(AY, V(x, y, z).normalize());
/** quaternion rotating +Z onto dir */
const alignZ = (x, y, z) => new THREE.Quaternion().setFromUnitVectors(AZ, V(x, y, z).normalize());

const _c = new THREE.Color();
function shade(hex, f) { // f>0 lighten toward white, f<0 darken
  _c.set(hex);
  const hsl = {};
  _c.getHSL(hsl);
  if (f >= 0) hsl.l = hsl.l + (1 - hsl.l) * f;
  else hsl.l = hsl.l * (1 + f);
  _c.setHSL(hsl.h, hsl.s, hsl.l);
  return '#' + _c.getHexString();
}

// ---------------------------------------------------------------------------
// Geometry source cache
// ---------------------------------------------------------------------------
const GEO = new Map();
function cached(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); GEO.set(key, g); }
  return g;
}
const G = {
  sphere: (w = 14, h = 10) => cached(`s${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  hemi: (w = 14, h = 5) => cached(`hs${w}_${h}`, () => new THREE.SphereGeometry(1, w, h, 0, PI * 2, 0, PI / 2)),
  cyl: (n = 12, open = false) => cached(`c${n}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, open)),
  cone: (n = 8) => cached(`k${n}`, () => new THREE.ConeGeometry(1, 1, n)),
  frustum: (top, n = 10) => cached(`f${top}_${n}`, () => new THREE.CylinderGeometry(top, 1, 1, n)),
  box: () => cached('b', () => new THREE.BoxGeometry(1, 1, 1)),
  rbox: (w, h, d, r, seg = 1) => cached(`rb${w}_${h}_${d}_${r}_${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r)),
  // chamfered box (44 tris) – the cheap "rounded" toy box
  cbox: (w, h, d, c) => cached(`cb${w}_${h}_${d}_${c}`, () => {
    c = Math.min(c, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const x = w / 2, y = h / 2, z = d / 2, pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(V(sx * x, sy * (y - c), sz * (z - c)), V(sx * (x - c), sy * y, sz * (z - c)), V(sx * (x - c), sy * (y - c), sz * z));
    }
    return new ConvexGeometry(pts);
  }),
  // chamfered box with smoothed normals: reads like a soft rounded box, no facet glints
  sbox: (w, h, d, c) => cached(`sb${w}_${h}_${d}_${c}`, () => {
    const g = G.cbox(w, h, d, c).clone();
    g.deleteAttribute('normal');
    const m = mergeVertices(g, 1e-4);
    m.computeVertexNormals();
    return m;
  }),
  // spherical cap around +Z (for irises/pupils that hug an eyeball)
  cap: (theta, w = 10, h = 2) => cached(`cap_${theta}_${w}_${h}`, () => {
    const g = new THREE.SphereGeometry(1, w, h, 0, PI * 2, 0, theta);
    g.rotateX(PI / 2);
    return g;
  }),
  // cheap capsule (lathe), along Y, total height len + 2r
  capsule: (r, len, cs = 2, rs = 8) => cached(`pill${r}_${len}_${cs}_${rs}`, () => {
    const pts = [];
    for (let i = 0; i <= cs; i++) { const a = -PI / 2 + (i / cs) * (PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(a)), -len / 2 + r * Math.sin(a))); }
    for (let i = 0; i <= cs; i++) { const a = (i / cs) * (PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(a)), len / 2 + r * Math.sin(a))); }
    return new THREE.LatheGeometry(pts, rs);
  }),
  torus: (R, t, rs = 6, ts = 16, arc = PI * 2) =>
    cached(`t${R}_${t}_${rs}_${ts}_${arc.toFixed(3)}`, () => new THREE.TorusGeometry(R, t, rs, ts, arc)),
  plane: (half = 0) => cached(`p${half}`, () => {
    const g = new THREE.PlaneGeometry(1, 1);
    if (half) { // map onto the left (1) or right (2) half of a 2:1 atlas
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (half === 2 ? 0.5 : 0));
    }
    return g;
  }),
  disc: (n = 16, thetaLen = PI * 2) => cached(`d${n}_${thetaLen.toFixed(3)}`, () =>
    new THREE.CylinderGeometry(1, 1, 1, n, 1, false, 0, thetaLen)),
};

function tireGeometry(R, W, n) {
  return cached(`tire${R}_${W}_${n}`, () => {
    const h = W / 2, c = Math.min(0.07, W * 0.24);
    const pts = [
      [R * 0.58, -h * 0.82], [R - c, -h], [R, -h + c], [R, h - c], [R - c, h], [R * 0.58, h * 0.82],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, n);
    g.rotateZ(-PI / 2); // axle along X
    return g;
  });
}

function shellGeometry(q) {
  return cached(`shell${q}`, () => {
    // side profile: x = kart Z (forward), y = height
    const s = new THREE.Shape();
    s.moveTo(-0.98, 0.26);
    s.lineTo(-0.98, 0.56);
    s.quadraticCurveTo(-0.98, 0.66, -0.86, 0.66);
    s.lineTo(-0.68, 0.64);
    s.quadraticCurveTo(-0.6, 0.47, -0.46, 0.45);
    s.lineTo(0.2, 0.45);
    s.quadraticCurveTo(0.34, 0.46, 0.44, 0.63);
    s.quadraticCurveTo(0.5, 0.7, 0.62, 0.68);
    s.lineTo(0.96, 0.52);
    s.quadraticCurveTo(1.12, 0.46, 1.12, 0.36);
    s.lineTo(1.1, 0.27);
    s.lineTo(-0.98, 0.26);
    const depth = 0.76;
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07,
      bevelSegments: 1, curveSegments: 3,
    });
    g.rotateY(-PI / 2);
    g.translate(depth / 2, 0, 0);
    return g;
  });
}

function profileExtrude(key, points, depth, bevel = 0.02) {
  return cached(key, () => {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

// ---------------------------------------------------------------------------
// Part sets: collect primitives with transforms + colour, merge per material.
// ---------------------------------------------------------------------------
class Parts {
  constructor() { this.list = []; this.stack = [new THREE.Matrix4()]; }
  top() { return this.stack[this.stack.length - 1]; }
  push(p, r, s) { this.stack.push(this.top().clone().multiply(mtx(p, r, s))); return this; }
  pop() { this.stack.pop(); return this; }
  add(geo, mat, color, p, r, s) {
    this.list.push({ geo, mat, color: new THREE.Color(color), m: this.top().clone().multiply(mtx(p, r, s)) });
    return this;
  }
  build() {
    const by = new Map();
    for (const it of this.list) {
      if (!by.has(it.mat)) by.set(it.mat, []);
      by.get(it.mat).push(it);
    }
    const out = [];
    for (const [mat, items] of by) out.push({ mat, geo: mergeItems(items) });
    return out;
  }
}

function mergeItems(items) {
  const prepared = [];
  let total = 0;
  for (const it of items) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    g.applyMatrix4(it.m);
    prepared.push({ g, flip: it.m.determinant() < 0, color: it.color });
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, flip, color } of prepared) {
    const P = g.attributes.position.array;
    const N = g.attributes.normal ? g.attributes.normal.array : null;
    const U = g.attributes.uv ? g.attributes.uv.array : null;
    const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      let s = i;
      if (flip) { const r = i % 3; s = r === 1 ? i + 1 : r === 2 ? i - 1 : i; }
      const d = o + i;
      pos[d * 3] = P[s * 3]; pos[d * 3 + 1] = P[s * 3 + 1]; pos[d * 3 + 2] = P[s * 3 + 2];
      if (N) { nor[d * 3] = N[s * 3]; nor[d * 3 + 1] = N[s * 3 + 1]; nor[d * 3 + 2] = N[s * 3 + 2]; }
      if (U) { uv[d * 2] = U[s * 2]; uv[d * 2 + 1] = U[s * 2 + 1]; }
      col[d * 3] = color.r; col[d * 3 + 1] = color.g; col[d * 3 + 2] = color.b;
    }
    o += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ---------------------------------------------------------------------------
// Materials (shared cache)
// ---------------------------------------------------------------------------
const MATS = new Map();
function mat(key, make) {
  let m = MATS.get(key);
  if (!m) { m = make(); MATS.set(key, m); }
  return m;
}
function paintMat(hex) {
  return mat('paint:' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.08 }));
}
function resolveMat(key, ch, paintHex) {
  switch (key) {
    case 'vc': return mat('vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
    case 'flat': return mat('flat', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, flatShading: true }));
    case 'gloss': return mat('gloss', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 }));
    case 'metal': return mat('metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.65 }));
    case 'glow': return mat('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true }));
    case 'paint': return paintMat(paintHex || ch.color);
    case 'cloth': return mat('cloth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }));
    case 'decal': return mat('decal:' + ch.id, () => new THREE.MeshStandardMaterial({
      map: decalTexture(ch), transparent: true, alphaTest: 0.35, roughness: 0.35,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    case 'glass': return mat('glass', () => new THREE.MeshStandardMaterial({
      color: '#cdefff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2,
      depthWrite: false, emissive: '#3a6a88', emissiveIntensity: 0.15,
    }));
    default: throw new Error('unknown material ' + key);
  }
}

// --- decals: left half = race number, right half = species emblem ----------
function decalTexture(ch) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const ring = shade(ch.color, -0.25);
  // number roundel
  g.beginPath(); g.arc(64, 64, 58, 0, PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 9; g.strokeStyle = ring; g.stroke();
  g.fillStyle = '#1d2030';
  g.font = '900 78px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(ch.number), 64, 70);
  // emblem roundel
  g.save();
  g.translate(192, 64);
  g.beginPath(); g.arc(0, 0, 58, 0, PI * 2); g.fillStyle = ch.accent; g.fill();
  g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke();
  const ink = isLight(ch.accent) ? ring : '#ffffff';
  drawEmblem(g, ch.species, ink);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function isLight(hex) { _c.set(hex); const hsl = {}; _c.getHSL(hsl); return hsl.l > 0.62; }

function drawEmblem(g, species, ink) {
  g.fillStyle = ink; g.strokeStyle = ink; g.lineJoin = 'round'; g.lineCap = 'round';
  const circ = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill(); };
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
  switch (species) {
    case 'fox': case 'dino': // paw / footprint
      circ(0, 12, 19);
      if (species === 'fox') { circ(-21, -12, 8.5); circ(-7, -24, 8.5); circ(8, -24, 8.5); circ(22, -12, 8.5); }
      else { poly([-24, -2, -14, -34, -6, -6]); poly([-6, -10, 0, -40, 6, -10]); poly([6, -6, 14, -34, 24, -2]); }
      break;
    case 'panda': // bamboo leaf
      g.beginPath(); g.moveTo(-30, 26); g.quadraticCurveTo(-26, -24, 30, -30); g.quadraticCurveTo(18, 22, -30, 26); g.fill();
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.moveTo(-26, 22); g.lineTo(22, -22); g.stroke();
      break;
    case 'frog': // heart
      g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(-48, 0, -22, -38, 0, -14); g.bezierCurveTo(22, -38, 48, 0, 0, 30); g.fill();
      break;
    case 'robot': // lightning bolt
      poly([8, -38, -22, 6, -2, 6, -10, 38, 22, -8, 2, -8]);
      break;
    case 'penguin': // snowflake
      g.lineWidth = 7;
      for (let i = 0; i < 3; i++) {
        g.save(); g.rotate((i * PI) / 3);
        g.beginPath(); g.moveTo(0, -34); g.lineTo(0, 34); g.stroke();
        g.beginPath(); g.moveTo(-10, -26); g.lineTo(0, -16); g.lineTo(10, -26); g.stroke();
        g.beginPath(); g.moveTo(-10, 26); g.lineTo(0, 16); g.lineTo(10, 26); g.stroke();
        g.restore();
      }
      break;
    case 'cat': { // star
      const pts = [];
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 15 : 36, a = -PI / 2 + (i * PI) / 5; pts.push(Math.cos(a) * r, Math.sin(a) * r + 3); }
      poly(pts);
      break;
    }
    case 'bunny': // carrot
      poly([-6, -14, 22, -14, 4, 38]);
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(8, -16); g.lineTo(0, -36); g.moveTo(10, -16); g.lineTo(16, -38); g.moveTo(12, -16); g.lineTo(28, -30); g.stroke();
      break;
    default: circ(0, 0, 24);
  }
}

// ---------------------------------------------------------------------------
// Layout constants (kart space, +Z forward, +X = driver's left, origin = ground)
// ---------------------------------------------------------------------------
const WR = { r: 0.36, w: 0.36, x: 0.7, z: -0.8 };  // rear wheels
const WF = { r: 0.3, w: 0.3, x: 0.67, z: 0.82 };  // front wheels
const TILT = 0.85;                                 // steering wheel tilt
const SW = V(0, 0.92, 0.12);                       // steering wheel centre
const SWR = 0.16;                                  // steering wheel radius
const SHOULDER = V(0.235, 1.0, -0.37);
const NECK = V(0, 1.1, -0.37);
const HEAD = [0, 0.34, 0.03];                      // head centre relative to neck pivot
const PIPE_A = V(0.3, 0.42, -0.98), PIPE_DIR = V(0, 0.5, -0.866), PIPE_LEN = 0.3;
const ARM_REF = 0.4;
const GRIP = [V(SWR * Math.sin(1.2), SWR * Math.cos(1.2), 0), V(-SWR * Math.sin(1.2), SWR * Math.cos(1.2), 0)];

const DARK = '#2b2e3b', CHASSIS = '#34384a', METAL = '#cfd6e2', INK = '#1a1b24', WHITE = '#ffffff';

// ---------------------------------------------------------------------------
// Species art direction
// ---------------------------------------------------------------------------
const LOOK = {
  fox: { skin: '#ff8a2e', suit: '#2c3c86', trim: '#ffffff', sleeve: '#2c3c86', glove: '#ffffff', iris: '#2fa84f', pipes: 'chrome', spoiler: 'wing' },
  panda: { skin: '#f6f6f1', suit: '#f6f6f1', trim: '#e8394a', sleeve: '#23232b', glove: '#23232b', iris: '#5a3a22', pipes: 'bamboo', spoiler: 'wing' },
  frog: { skin: '#a6e34a', suit: '#ff8fc8', trim: '#ffffff', sleeve: '#a6e34a', glove: '#a6e34a', iris: '#3a2a10', pipes: 'chrome', spoiler: 'lilypad' },
  robot: { skin: '#d6dde8', suit: '#d6dde8', trim: '#ffb000', sleeve: '#596173', glove: '#d6dde8', iris: '#5ff3ff', pipes: 'chrome', spoiler: 'wing' },
  penguin: { skin: '#262b45', suit: '#262b45', trim: '#ff4a4a', sleeve: '#262b45', glove: '#262b45', iris: '#2b59d9', pipes: 'chrome', spoiler: 'snow' },
  dino: { skin: '#b07cff', suit: '#b07cff', trim: '#ffe08a', sleeve: '#b07cff', glove: '#b07cff', iris: '#3a7a1a', pipes: 'chrome', spoiler: 'spikes' },
  cat: { skin: '#b9c3d8', suit: '#f4f7ff', trim: '#ff4fa3', sleeve: '#f4f7ff', glove: '#ff4fa3', iris: '#21b8a8', pipes: 'chrome', spoiler: 'fins' },
  bunny: { skin: '#fff8ef', suit: '#2fd3c0', trim: '#ffffff', sleeve: '#2fd3c0', glove: '#fff8ef', iris: '#6a3a8a', pipes: 'chrome', spoiler: 'wing' },
};

// detail level -> segment helpers
//   lod -1: portrait/hero (full segments)   lod 0: default (~3k tris)   lod 1: small split-screen viewports (~2.3k)
function Q(lod) {
  const lv = lod === -1 ? -1 : lod ? 1 : 0;
  const fs = lv < 0 ? 1 : lv ? 0.5 : 0.64;
  const fn = lv < 0 ? 1 : lv ? 0.6 : 0.75;
  return {
    lv, lo: lv > 0, hi: lv < 0,
    s: (w, h) => G.sphere(Math.max(5, Math.round(w * fs)), Math.max(4, Math.round(h * fs))),
    n: (k) => Math.max(4, Math.round(k * fn)),
    pick: (hi, mid, lo) => (lv < 0 ? hi : lv ? lo : mid),
  };
}

// ---------------------------------------------------------------------------
// Builders: wheels
// ---------------------------------------------------------------------------
function buildWheel(ch, W, q) {
  const P = new Parts();
  const tire = '#24252d';
  P.add(tireGeometry(W.r, W.w, q.pick(16, 11, 9)), 'vc', tire);
  const rimR = W.r * 0.6, half = W.w / 2;
  P.add(G.cyl(8, true), 'metal', METAL, [0, 0, 0], [0, 0, PI / 2], [rimR, W.w * 0.84, rimR]);
  // outer face (+X): coloured hex hubcap + centre cap (hex shape makes the spin readable)
  P.add(G.cyl(6), 'gloss', ch.color, [half * 0.88, 0, 0], [0, 0, PI / 2], [rimR * 0.82, 0.05, rimR * 0.82]);
  P.add(G.cyl(5), 'gloss', ch.accent === WHITE ? '#ffd23f' : ch.accent, [half * 0.95 + 0.025, 0, 0], [0, 0, PI / 2], [rimR * 0.32, 0.05, rimR * 0.32]);
  if (W.both) { // centre-line wheels (bikes) are seen from both sides
    P.add(G.cyl(6), 'gloss', ch.color, [-half * 0.88, 0, 0], [0, 0, PI / 2], [rimR * 0.82, 0.05, rimR * 0.82]);
    P.add(G.cyl(5), 'gloss', ch.accent === WHITE ? '#ffd23f' : ch.accent, [-half * 0.95 - 0.025, 0, 0], [0, 0, PI / 2], [rimR * 0.32, 0.05, rimR * 0.32]);
  }
  if (W.knobs && !q.lo) { // chunky off-road tread
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      for (const sx of [-1, 1]) P.add(G.box(), 'flat', tire, [sx * W.w * 0.22, Math.cos(a) * W.r, Math.sin(a) * W.r], [a, 0, 0], [W.w * 0.36, 0.07, 0.13]);
    }
  }
  return P.build();
}

// ---------------------------------------------------------------------------
// Builders: kart body
// ---------------------------------------------------------------------------
function buildBody(ch, L, q) {
  const P = new Parts();
  const acc = ch.accent;
  // floor pan & axles
  P.add(G.box(), 'flat', CHASSIS, [0, 0.2, 0.05], null, [1.0, 0.1, 2.0]);
  if (!q.lo) {
    P.add(G.cyl(5, true), 'metal', '#8a90a0', [0, WR.r, WR.z], [0, 0, PI / 2], [0.045, WR.x * 2 - 0.1, 0.045]);
    P.add(G.cyl(5, true), 'metal', '#8a90a0', [0, WF.r, WF.z], [0, 0, PI / 2], [0.04, WF.x * 2 - 0.1, 0.04]);
  }
  // shell
  P.add(shellGeometry(q.hi ? 1 : 0), 'paint', WHITE);
  // side pods
  for (const sx of [-1, 1]) {
    P.add(G.sbox(0.28, 0.27, 0.9, 0.08), 'paint', WHITE, [sx * 0.5, 0.42, 0.04]);
    P.add(G.box(), 'gloss', acc, [sx * 0.505, 0.3, 0.04], null, [0.3, 0.07, 0.8]);
    // decal (number)
    P.add(G.plane(1), 'decal', WHITE, [sx * 0.642, 0.44, 0.06], [0, sx * PI / 2, 0], 0.25);
  }
  // bumpers
  P.add(G.capsule(0.085, 0.95, 2, q.n(7)), 'gloss', acc, [0, 0.29, 1.2], [0, 0, PI / 2]);
  P.add(G.box(), 'flat', DARK, [0.28, 0.27, 1.1], null, [0.18, 0.1, 0.12]);
  P.add(G.box(), 'flat', DARK, [-0.28, 0.27, 1.1], null, [0.18, 0.1, 0.12]);
  P.add(G.capsule(0.08, 1.05, 2, q.n(7)), 'gloss', acc === WHITE ? DARK : shade(acc, -0.1), [0, 0.29, -1.1], [0, 0, PI / 2]);
  // headlights (on the rounded nose, facing forward-up) + tail lights
  const hq = alignY(0, 0.55, 0.83);
  for (const sx of [-0.25, 0.25]) {
    if (!q.lo) P.add(G.cyl(10, true), 'metal', METAL, [sx, 0.47, 1.135], hq, [0.085, 0.07, 0.085]);
    P.add(G.cyl(8), 'glow', '#fff6cf', [sx, 0.47, 1.135], hq, [0.07, 0.05, 0.07]);
  }
  if (!q.lo) for (const sx of [-0.33, 0.33]) P.add(G.box(), 'glow', '#ff3b4e', [sx, 0.6, -1.06], null, [0.12, 0.06, 0.02]);
  // nose decal + rear decal
  P.add(G.plane(1), 'decal', WHITE, [0, 0.655, 0.835], [-1.107, 0, 0], 0.3);
  P.add(G.plane(2), 'decal', WHITE, [0, 0.47, -1.062], [0, PI, 0], 0.26);
  // seat
  const seat = '#30323f';
  P.add(G.box(), 'vc', seat, [0, 0.5, -0.36], null, [0.5, 0.12, 0.46]);
  P.add(G.cbox(0.54, 0.56, 0.12, 0.05), 'vc', seat, [0, 0.8, -0.62], [-0.22, 0, 0]);
  P.add(G.box(), 'gloss', ch.color, [0, 1.06, -0.68], [-0.22, 0, 0], [0.56, 0.08, 0.13]);
  // dash + steering column
  P.add(G.cyl(q.n(8)), 'flat', DARK, [0, 0.74, 0.44], [-0.5, 0, 0], [0.09, 0.06, 0.09]);
  const colDir = V(0, -Math.sin(TILT), Math.cos(TILT));
  const colC = SW.clone().addScaledVector(colDir, 0.17);
  P.add(G.cyl(6), 'flat', DARK, [colC.x, colC.y, colC.z], alignY(colDir.x, colDir.y, colDir.z), [0.025, 0.32, 0.025]);
  // engine block
  P.add(G.cbox(0.56, 0.2, 0.3, 0.05), 'flat', CHASSIS, [0, 0.79, -0.84]);
  if (!q.lo) for (const sx of [-0.13, 0.13]) P.add(G.cyl(6), 'metal', METAL, [sx, 0.93, -0.84], null, [0.07, 0.1, 0.07]);
  addPipes(P, L, q, PIPE_A, PIPE_DIR, PIPE_LEN);
  // spoiler
  buildSpoiler(P, ch, L, q);
  // species kart details
  KART_EXTRAS[ch.species]?.(P, ch, L, q);
  return P.build();
}

function addPipes(P, L, q, A, D, len) {
  const pq = alignY(D.x, D.y, D.z);
  for (const sx of [-1, 1]) {
    const a = V(sx * A.x, A.y, A.z);
    const mid = a.clone().addScaledVector(D, len / 2);
    const tip = a.clone().addScaledVector(D, len);
    if (L.pipes === 'bamboo') {
      P.add(G.cyl(q.n(8)), 'flat', '#5fbf3a', [mid.x, mid.y, mid.z], pq, [0.065, len, 0.065]);
      for (const t of [0.35, 0.75]) {
        const p = a.clone().addScaledVector(D, len * t);
        P.add(G.cyl(q.n(8), true), 'flat', '#3f9a2a', [p.x, p.y, p.z], pq, [0.075, 0.025, 0.075]);
      }
      P.add(G.cyl(q.n(8)), 'flat', '#3f9a2a', [tip.x, tip.y, tip.z], pq, [0.08, 0.04, 0.08]);
      // little leaf
      P.add(G.sphere(6, 4), 'flat', '#7ed957', [tip.x - sx * 0.07, tip.y - 0.1, tip.z + 0.08], [0.3, 0, sx * 0.9], [0.02, 0.09, 0.04]);
    } else {
      P.add(G.cyl(q.n(8)), 'metal', METAL, [mid.x, mid.y, mid.z], pq, [0.055, len, 0.055]);
      P.add(G.cyl(q.n(8), true), 'metal', '#e8ecf3', [tip.x, tip.y, tip.z], pq, [0.075, 0.07, 0.075]);
    }
  }
}

function buildSpoiler(P, ch, L, q) {
  const acc = ch.accent;
  const strutC = DARK;
  for (const sx of [-0.3, 0.3]) P.add(G.box(), 'flat', strutC, [sx, 0.84, -1.0], [0.25, 0, 0], [0.05, 0.24, 0.09]);
  if (L.spoiler === 'lilypad') {
    P.add(G.disc(q.n(18), PI * 1.75), 'vc', '#3cae3a', [0, 0.97, -1.02], [0, PI * 0.625 + PI, 0], [0.62, 0.04, 0.42]);
    P.add(G.disc(q.n(18), PI * 1.75), 'vc', '#61cf4a', [0, 0.99, -1.02], [0, PI * 0.625 + PI, 0], [0.5, 0.01, 0.33]);
    // little pink flower on the pad
    const fx = 0.36, fz = -1.0, fy = 1.02;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      P.add(q.s(6, 4), 'vc', ch.accent, [fx + Math.cos(a) * 0.06, fy + 0.02, fz + Math.sin(a) * 0.06], [0, -a, 0.4], [0.065, 0.03, 0.045]);
    }
    P.add(q.s(6, 4), 'gloss', '#ffe14a', [fx, fy + 0.04, fz], null, 0.035);
    return;
  }
  P.add(G.cbox(1.3, 0.06, 0.32, 0.025), 'gloss', acc, [0, 0.96, -1.02], [0.1, 0, 0]);
  for (const sx of [-1, 1]) P.add(G.box(), 'paint', WHITE, [sx * 0.66, 0.95, -1.03], null, [0.05, 0.24, 0.4]);
  P.add(G.plane(2), 'decal', WHITE, [0, 0.995, -1.02], [PI / 2 + 0.1, PI, 0], 0.24);
  if (L.spoiler === 'snow') {
    P.add(G.cbox(1.26, 0.06, 0.3, 0.03), 'vc', '#ffffff', [0, 1.0, -1.025], [0.1, 0, 0]);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const len = 0.06 + ((i * 7 + 3) % 4) * 0.025;
      P.add(G.cone(5), 'gloss', '#bfeaff', [i * 0.18, 0.92 - len / 2, -0.88 - 0.015 * Math.abs(i)], [PI, 0, 0], [0.025, len, 0.025]);
    }
  }
  if (L.spoiler === 'spikes') {
    for (let i = -2; i <= 2; i++) {
      P.add(G.cone(5), 'flat', '#ffb13b', [i * 0.22, 1.05, -1.04], [-0.15, 0, 0], [0.06, 0.14, 0.06]);
    }
  }
  if (L.spoiler === 'fins') {
    for (const sx of [-1, 1]) {
      P.add(profileExtrude('fin', [[0, 0], [0.42, 0], [0.12, 0.34], [0, 0.34]], 0.04, 0.015), 'paint', WHITE,
        [sx * 0.66, 0.85, -0.88], [0, PI / 2, 0], [1, 1, 1]);
    }
  }
}

const KART_EXTRAS = {
  robot(P, ch) {
    // antenna with blinking-looking light + rivets on the pods
    P.add(G.cyl(6), 'flat', DARK, [0.42, 1.0, -0.9], null, [0.015, 0.5, 0.015]);
    P.add(G.sphere(7, 5), 'glow', '#ff4060', [0.42, 1.27, -0.9], null, 0.045);
    for (const sx of [-1, 1]) for (const z of [-0.25, 0.33]) {
      P.add(G.sphere(6, 4), 'metal', METAL, [sx * 0.64, 0.5, z], null, 0.025);
    }
    // battery cells on engine
    for (const sx of [-0.06, 0.06]) P.add(G.box(), 'glow', '#5ff3ff', [sx, 0.81, -0.685], null, [0.05, 0.12, 0.01]);
  },
  dino(P) {
    for (let i = 0; i < 4; i++) {
      const z = -0.72 - i * 0.1;
      P.add(G.cone(5), 'flat', '#ffb13b', [0.32, 0.78, z + 0.05], [-0.3, 0, -0.2], [0.05, 0.12, 0.05]);
      P.add(G.cone(5), 'flat', '#ffb13b', [-0.32, 0.78, z + 0.05], [-0.3, 0, 0.2], [0.05, 0.12, 0.05]);
    }
  },
  bunny(P) {
    // carrot flag
    P.add(G.cyl(6), 'flat', '#e9edf5', [-0.45, 1.15, -0.95], null, [0.014, 0.85, 0.014]);
    P.add(G.cone(7), 'gloss', '#ff8a1e', [-0.45, 1.5, -0.95], [PI, 0, 0], [0.07, 0.24, 0.07]);
    for (let i = 0; i < 3; i++) {
      P.add(G.sphere(6, 4), 'flat', '#5fcf3a', [-0.45 + (i - 1) * 0.03, 1.66, -0.95], [0, 0, (i - 1) * 0.5], [0.025, 0.08, 0.025]);
    }
  },
  cat(P) {
    // stars on the pods + space antenna
    P.add(G.cyl(6), 'flat', METAL, [0.42, 1.0, -0.9], null, [0.012, 0.42, 0.012]);
    P.add(G.sphere(7, 5), 'glow', '#ffe36e', [0.42, 1.23, -0.9], null, 0.04);
  },
  panda(P, ch, L, q) {
    // bamboo roll bar behind the seat
    P.add(G.cyl(6, true), 'flat', '#5fbf3a', [0, 1.15, -0.74], [0, 0, PI / 2], [0.04, 0.74, 0.04]);
    for (const sx of [-0.35, 0.35]) P.add(G.cyl(6, true), 'flat', '#5fbf3a', [sx, 0.93, -0.74], null, [0.04, 0.46, 0.04]);
    for (const sx of [-0.35, 0, 0.35]) P.add(G.cyl(6, true), 'flat', '#3f9a2a', [sx, 1.15, -0.74], [0, 0, PI / 2], [0.047, 0.03, 0.047]);
    for (const sx of [-0.35, 0.35]) P.add(q.s(6, 4), 'flat', '#5fbf3a', [sx, 1.15, -0.74], null, 0.042);
  },
};

// ---------------------------------------------------------------------------
// Vehicles: every character rides something different (physics is identical).
// ---------------------------------------------------------------------------
function tube(P, a, b, r, matKey, color, n = 6) {
  const d = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return;
  P.add(G.cyl(n), matKey, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], alignY(d.x, d.y, d.z), [r, len, r]);
}

// front fork rig: head-tube pivot H, axle A (kart space). Fork runs along local -Y.
function rig(H, A, barUp = 0.12) {
  const d = V(A[0] - H[0], A[1] - H[1], A[2] - H[2]);
  const len = d.length();
  return { H, len, rake: -Math.asin(clamp(d.z / len, -1, 1)), barUp };
}

const W_CAR_R = { r: 0.34, w: 0.38, x: 0.71, z: -0.86 }, W_CAR_F = { r: 0.31, w: 0.32, x: 0.7, z: 0.9 };
const W_BUG_R = { r: 0.5, w: 0.42, x: 0.66, z: -0.8, knobs: true }, W_BUG_F = { r: 0.47, w: 0.4, x: 0.66, z: 0.86, knobs: true };
const W_BIKE_R = { r: 0.4, w: 0.24, x: 0, z: -0.82, both: true }, W_BIKE_F = { r: 0.38, w: 0.2, x: 0, z: 0.86, both: true };
const W_SCO_R = { r: 0.29, w: 0.22, x: 0, z: -0.74, both: true }, W_SCO_F = { r: 0.29, w: 0.2, x: 0, z: 0.8, both: true };
const W_TRI_R = { r: 0.4, w: 0.36, x: 0.64, z: -0.76 }, W_TRI_F = { r: 0.36, w: 0.24, x: 0, z: 0.98, both: true };
const W_SKI = { r: 0, w: 0.16, x: 0.48, z: 0.72, ski: true };

const wl = (W, side, front, extra = {}) => ({ W, side, front, ...extra });
const VEHICLES = {
  kart: {
    wheels: [wl(WR, 1, 0), wl(WR, -1, 0), wl(WF, 1, 1), wl(WF, -1, 1)],
    steer: 'wheel', seat: [0, 0, 0], pipeA: PIPE_A, pipeDir: PIPE_DIR, roll: 1, lean: 0, bob: 1,
  },
  car: {
    wheels: [wl(W_CAR_R, 1, 0), wl(W_CAR_R, -1, 0), wl(W_CAR_F, 1, 1), wl(W_CAR_F, -1, 1)],
    steer: 'wheel', seat: [0, -0.03, -0.05], pipeA: V(0.34, 0.3, -1.22), pipeDir: V(0, 0.2, -0.98).normalize(), roll: 0.8, lean: 0, bob: 0.7,
  },
  buggy: {
    wheels: [wl(W_BUG_R, 1, 0), wl(W_BUG_R, -1, 0), wl(W_BUG_F, 1, 1), wl(W_BUG_F, -1, 1)],
    steer: 'wheel', seat: [0, 0.3, -0.02], pipeA: V(0.4, 1.02, -0.84), pipeDir: V(0, 0.92, -0.38).normalize(), roll: 1.6, lean: 0, bob: 2.4,
  },
  hover: {
    wheels: [], points: [[0.42, -0.75], [-0.42, -0.75], [0.42, 0.75], [-0.42, 0.75]],
    steer: 'bar', bar: [0, 0.98, 0.16], seat: [0, 0.14, 0], pipeA: V(0.36, 0.42, -1.16), pipeDir: V(0, 0.02, -1).normalize(), roll: 0, lean: 0.22, bob: 0, hover: 0.32,
  },
  sled: {
    wheels: [wl(W_SKI, 1, 1, { key: 'ski' }), wl(W_SKI, -1, 1, { key: 'ski' })], points: [[0.3, -0.6], [-0.3, -0.6], [0.48, 0.72], [-0.48, 0.72]],
    steer: 'bar', bar: [0, 0.98, 0.2], seat: [0, 0.08, 0], pipeA: V(0.22, 0.46, -1.16), pipeDir: V(0, 0.3, -0.95).normalize(), roll: 0.4, lean: 0.1, bob: 0.6,
  },
  bike: {
    wheels: [wl(W_BIKE_R, 1, 0), wl(W_BIKE_F, 1, 1, { rig: rig([0, 1.0, 0.36], [0, W_BIKE_F.r, W_BIKE_F.z]) })],
    steer: 'rig', seat: [0, 0.02, 0.14], pipeA: V(0.2, 0.36, -0.74), pipeDir: V(0, 0.25, -0.97).normalize(), roll: 0, lean: 0.42, bob: 0.8,
  },
  scooter: {
    wheels: [wl(W_SCO_R, 1, 0), wl(W_SCO_F, 1, 1, { rig: rig([0, 1.02, 0.44], [0, W_SCO_F.r, W_SCO_F.z]) })],
    steer: 'rig', seat: [0, 0.0, 0.12], pipeA: V(0.17, 0.3, -0.84), pipeDir: V(0, 0.2, -0.98).normalize(), roll: 0, lean: 0.36, bob: 0.9,
  },
  trike: {
    wheels: [wl(W_TRI_R, 1, 0), wl(W_TRI_R, -1, 0), wl(W_TRI_F, 1, 1, { rig: rig([0, 0.98, 0.42], [0, W_TRI_F.r, W_TRI_F.z]) })],
    steer: 'rig', seat: [0, 0.04, 0.12], pipeA: V(0.3, 0.5, -1.04), pipeDir: V(0, 0.4, -0.92).normalize(), roll: 0.6, lean: 0.08, bob: 1,
  },
};
export const VEHICLE_TYPES = Object.keys(VEHICLES);
function vehicleOf(ch) { return VEHICLES[ch.vehicle] || VEHICLES.kart; }

function sideDecals(P, x, y, z, s = 0.24) {
  for (const sx of [-1, 1]) P.add(G.plane(1), 'decal', WHITE, [sx * x, y, z], [0, sx * PI / 2, 0], s);
}
function seatParts(P, ch, z = -0.36, y = 0.5) {
  const seat = '#30323f';
  P.add(G.box(), 'vc', seat, [0, y, z], null, [0.5, 0.12, 0.46]);
  P.add(G.cbox(0.54, 0.56, 0.12, 0.05), 'vc', seat, [0, y + 0.3, z - 0.26], [-0.22, 0, 0]);
  P.add(G.box(), 'gloss', ch.color, [0, y + 0.56, z - 0.32], [-0.22, 0, 0], [0.56, 0.08, 0.13]);
}
function headlights(P, q, z, y, xs, dir = [0, 0.3, 0.95]) {
  const hq = alignY(...dir);
  for (const sx of xs) {
    if (!q.lo) P.add(G.cyl(10, true), 'metal', METAL, [sx, y, z], hq, [0.085, 0.07, 0.085]);
    P.add(G.cyl(8), 'glow', '#fff6cf', [sx, y, z], hq, [0.07, 0.05, 0.07]);
  }
}

const BODY = {
  kart: (ch, L, q) => buildBody(ch, L, q),

  car(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.car;
    P.add(G.box(), 'flat', CHASSIS, [0, 0.2, 0], null, [1.1, 0.1, 2.3]);
    P.add(G.sbox(1.3, 0.3, 2.5, 0.12), 'paint', WHITE, [0, 0.38, 0]);
    P.add(G.sbox(1.16, 0.16, 0.95, 0.07), 'paint', WHITE, [0, 0.55, 0.72], [0.12, 0, 0]);
    P.add(G.sbox(1.2, 0.2, 0.72, 0.08), 'paint', WHITE, [0, 0.57, -0.88]);
    for (const sx of [-1, 1]) {
      P.add(G.box(), 'gloss', acc, [sx * 0.655, 0.27, 0], null, [0.04, 0.08, 1.9]);
      P.add(G.sbox(0.4, 0.2, 0.82, 0.08), 'paint', WHITE, [sx * 0.68, 0.58, -0.86]);
      P.add(G.sbox(0.38, 0.18, 0.74, 0.08), 'paint', WHITE, [sx * 0.68, 0.53, 0.9]);
      P.add(G.box(), 'flat', DARK, [sx * 0.66, 0.42, 0.25], null, [0.02, 0.1, 0.3]); // side vent
    }
    // racing stripe over the hood
    P.add(G.box(), 'gloss', acc, [0, 0.64, 0.72], [0.12, 0, 0], [0.18, 0.012, 0.92]);
    // windscreen
    P.add(G.box(), 'flat', DARK, [0, 0.66, 0.24], [-0.6, 0, 0], [0.96, 0.04, 0.05]);
    P.add(G.box(), 'glass', WHITE, [0, 0.79, 0.17], [-0.6, 0, 0], [0.9, 0.3, 0.02]);
    headlights(P, q, 1.18, 0.44, [-0.4, 0.4]);
    if (!q.lo) for (const sx of [-0.4, 0.4]) P.add(G.box(), 'glow', '#ff3b4e', [sx, 0.55, -1.25], null, [0.2, 0.06, 0.02]);
    P.add(G.plane(1), 'decal', WHITE, [0, 0.645, 0.4], [-PI / 2 + 0.12, 0, 0], 0.26);
    P.add(G.plane(2), 'decal', WHITE, [0, 0.42, -1.255], [0, PI, 0], 0.24);
    sideDecals(P, 0.656, 0.42, -0.25, 0.22);
    seatParts(P, ch, -0.4, 0.46);
    P.add(G.cyl(q.n(8)), 'flat', DARK, [0, 0.72, 0.42], [-0.5, 0, 0], [0.09, 0.06, 0.09]);
    const colDir = V(0, -Math.sin(TILT), Math.cos(TILT));
    const colC = SW.clone().addScaledVector(colDir, 0.17); colC.y -= 0.03;
    P.add(G.cyl(6), 'flat', DARK, [colC.x, colC.y, colC.z], alignY(colDir.x, colDir.y, colDir.z), [0.025, 0.32, 0.025]);
    // rear wing
    for (const sx of [-0.4, 0.4]) P.add(G.box(), 'flat', DARK, [sx, 0.8, -1.08], [0.2, 0, 0], [0.05, 0.3, 0.08]);
    P.add(G.cbox(1.34, 0.06, 0.34, 0.025), 'gloss', acc === WHITE ? DARK : acc, [0, 0.97, -1.1], [0.12, 0, 0]);
    for (const sx of [-1, 1]) P.add(G.box(), 'paint', WHITE, [sx * 0.68, 0.95, -1.1], null, [0.05, 0.22, 0.42]);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.2);
    return P.build();
  },

  buggy(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.buggy;
    const cage = acc === '#2a2a33' ? '#3a3d4a' : DARK;
    P.add(G.box(), 'flat', CHASSIS, [0, 0.56, 0.02], null, [0.9, 0.14, 2.0]);
    // suspension arms to the big tyres
    if (!q.lo) for (const sx of [-1, 1]) for (const z of [W_BUG_R.z, W_BUG_F.z]) tube(P, [sx * 0.3, 0.56, z], [sx * 0.6, 0.48, z], 0.05, 'metal', '#8a90a0');
    P.add(G.sbox(1.06, 0.38, 1.5, 0.12), 'paint', WHITE, [0, 0.8, -0.14]);
    P.add(G.sbox(0.86, 0.3, 0.55, 0.1), 'paint', WHITE, [0, 0.78, 0.86], [0.22, 0, 0]);
    for (const sx of [-1, 1]) {
      P.add(G.sbox(0.5, 0.12, 0.78, 0.05), 'gloss', acc, [sx * 0.66, 1.0, W_BUG_R.z], [0, 0, -sx * 0.12]);
      P.add(G.sbox(0.48, 0.12, 0.72, 0.05), 'gloss', acc, [sx * 0.66, 0.97, W_BUG_F.z], [0, 0, -sx * 0.12]);
    }
    sideDecals(P, 0.535, 0.8, -0.2, 0.26);
    P.add(G.plane(1), 'decal', WHITE, [0, 0.94, 0.92], [-PI / 2 + 0.22, 0, 0], 0.26);
    // bull bar + headlights
    tube(P, [-0.42, 0.66, 1.22], [0.42, 0.66, 1.22], 0.05, 'gloss', cage);
    for (const sx of [-0.3, 0.3]) tube(P, [sx, 0.5, 1.12], [sx, 0.82, 1.2], 0.04, 'gloss', cage);
    headlights(P, q, 1.1, 0.88, [-0.22, 0.22]);
    // roll cage
    const T = 1.98;
    for (const sx of [-0.46, 0.46]) {
      tube(P, [sx, 0.95, -0.78], [sx, T, -0.7], 0.045, 'gloss', cage);
      tube(P, [sx, 0.98, 0.42], [sx * 0.94, T, -0.12], 0.045, 'gloss', cage);
      tube(P, [sx * 0.97, T, -0.7], [sx * 0.94, T, -0.12], 0.045, 'gloss', cage);
    }
    tube(P, [-0.46, T, -0.7], [0.46, T, -0.7], 0.045, 'gloss', cage);
    tube(P, [-0.44, T, -0.12], [0.44, T, -0.12], 0.045, 'gloss', cage);
    // light bar on the cage
    P.add(G.box(), 'flat', DARK, [0, T + 0.07, -0.12], null, [0.7, 0.1, 0.1]);
    for (const sx of [-0.24, -0.08, 0.08, 0.24]) P.add(G.box(), 'glow', '#fff6cf', [sx, T + 0.07, -0.065], null, [0.12, 0.07, 0.01]);
    // spare tyre
    P.add(tireGeometry(0.34, 0.24, q.pick(14, 10, 8)), 'vc', '#24252d', [0, 1.05, -1.04], [0, PI / 2, 0]);
    seatParts(P, ch, -0.36, 0.78);
    P.add(G.cyl(q.n(8)), 'flat', DARK, [0, 1.02, 0.42], [-0.5, 0, 0], [0.09, 0.06, 0.09]);
    const colDir = V(0, -Math.sin(TILT), Math.cos(TILT));
    const colC = SW.clone().addScaledVector(colDir, 0.17); colC.y += 0.3;
    P.add(G.cyl(6), 'flat', DARK, [colC.x, colC.y, colC.z], alignY(colDir.x, colDir.y, colDir.z), [0.025, 0.32, 0.025]);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.36);
    if (!q.lo) for (const sx of [-0.35, 0.35]) P.add(G.box(), 'glow', '#ff3b4e', [sx, 0.7, -0.9], null, [0.12, 0.06, 0.02]);
    return P.build();
  },

  hover(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.hover;
    P.add(G.sbox(1.28, 0.32, 2.3, 0.14), 'paint', WHITE, [0, 0.36, -0.05]);
    P.add(q.s(14, 8), 'paint', WHITE, [0, 0.36, 1.1], null, [0.62, 0.16, 0.38]);
    P.add(G.sbox(1.0, 0.1, 1.0, 0.04), 'gloss', acc, [0, 0.53, 0.42]);
    P.add(G.sbox(1.34, 0.08, 2.2, 0.04), 'flat', CHASSIS, [0, 0.2, -0.05]);
    // glowing lift pads underneath + rim
    for (const sx of [-1, 1]) for (const z of [-0.75, 0.75]) {
      P.add(G.cyl(q.n(14)), 'flat', DARK, [sx * 0.42, 0.15, z], null, [0.27, 0.06, 0.27]);
      P.add(G.cyl(q.n(14)), 'glow', '#5ff3ff', [sx * 0.42, 0.11, z], null, [0.21, 0.04, 0.21]);
    }
    // glowing side stripe
    for (const sx of [-1, 1]) {
      P.add(G.box(), 'glow', '#5ff3ff', [sx * 0.645, 0.3, -0.05], null, [0.012, 0.035, 1.8]);
      P.add(profileExtrude('hfin', [[0, 0], [0.55, 0], [0.18, 0.36], [0, 0.36]], 0.05, 0.015), 'paint', WHITE, [sx * 0.62, 0.48, -1.0], [0, PI / 2, 0]);
    }
    sideDecals(P, 0.645, 0.4, 0.3, 0.22);
    P.add(G.plane(2), 'decal', WHITE, [0, 0.4, -1.205], [0, PI, 0], 0.22);
    headlights(P, q, 1.42, 0.38, [-0.2, 0.2], [0, 0.1, 1]);
    // control pod + seat
    P.add(G.sbox(0.42, 0.28, 0.32, 0.08), 'gloss', DARK, [0, 0.66, 0.28]);
    P.add(G.box(), 'glow', '#5ff3ff', [0, 0.74, 0.44], [-0.4, 0, 0], [0.24, 0.1, 0.01]);
    seatParts(P, ch, -0.36, 0.56);
    // rear thrusters
    for (const sx of [-1, 1]) P.add(G.cyl(q.n(10)), 'metal', METAL, [sx * vs.pipeA.x, vs.pipeA.y, -1.06], [PI / 2, 0, 0], [0.12, 0.22, 0.12]);
    for (const sx of [-1, 1]) P.add(G.torus(0.12, 0.03, 4, q.n(12)), 'gloss', acc, [sx * vs.pipeA.x, vs.pipeA.y, -1.17]);
    if (ch.species === 'robot') {
      P.add(G.cyl(6), 'flat', DARK, [0.42, 0.85, -0.9], null, [0.015, 0.6, 0.015]);
      P.add(G.sphere(7, 5), 'glow', '#ff4060', [0.42, 1.17, -0.9], null, 0.045);
    }
    return P.build();
  },

  sled(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.sled;
    // front cowl + windscreen
    P.add(G.sbox(0.96, 0.4, 1.3, 0.14), 'paint', WHITE, [0, 0.52, 0.42]);
    P.add(q.s(12, 8), 'paint', WHITE, [0, 0.46, 1.04], null, [0.46, 0.2, 0.3]);
    P.add(G.box(), 'glass', WHITE, [0, 0.86, 0.5], [-0.55, 0, 0], [0.76, 0.34, 0.02]);
    P.add(G.box(), 'gloss', acc, [0, 0.74, 0.62], [-0.3, 0, 0], [0.8, 0.04, 0.3]);
    headlights(P, q, 1.18, 0.5, [-0.18, 0.18], [0, 0.1, 1]);
    // rear tread + seat + running boards
    P.add(G.box(), 'flat', DARK, [0, 0.24, -0.58], null, [0.62, 0.34, 1.16]);
    if (!q.lo) for (let i = 0; i < 6; i++) P.add(G.box(), 'flat', '#4a4e5e', [0, 0.06, -0.12 - i * 0.18], null, [0.64, 0.06, 0.06]);
    for (const sx of [-1, 1]) {
      P.add(G.box(), 'gloss', acc, [sx * 0.44, 0.34, -0.45], null, [0.26, 0.06, 1.0]);
      P.add(G.sbox(0.2, 0.24, 0.9, 0.06), 'paint', WHITE, [sx * 0.38, 0.5, -0.5]);
    }
    P.add(G.sbox(0.5, 0.16, 0.9, 0.06), 'vc', '#30323f', [0, 0.56, -0.46]);
    P.add(G.box(), 'gloss', ch.color, [0, 0.66, -0.94], null, [0.5, 0.08, 0.12]);
    sideDecals(P, 0.485, 0.55, 0.42, 0.22);
    P.add(G.plane(1), 'decal', WHITE, [0, 0.725, 0.8], [-PI / 2 + 0.3, 0, 0], 0.22);
    // ski struts to the steering skis
    for (const sx of [-1, 1]) tube(P, [sx * 0.3, 0.42, W_SKI.z], [sx * W_SKI.x, 0.22, W_SKI.z], 0.04, 'metal', '#8a90a0');
    if (!q.lo) for (const sx of [-0.25, 0.25]) P.add(G.box(), 'glow', '#ff3b4e', [sx, 0.5, -1.17], null, [0.12, 0.06, 0.02]);
    P.add(G.box(), 'flat', DARK, [0, 0.42, -1.12], null, [0.7, 0.14, 0.1]);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.2);
    // icicle spoiler
    P.add(G.cbox(0.9, 0.05, 0.24, 0.02), 'gloss', acc, [0, 0.86, -1.02], [0.1, 0, 0]);
    for (const sx of [-0.4, 0.4]) P.add(G.box(), 'flat', DARK, [sx, 0.74, -1.0], null, [0.04, 0.22, 0.06]);
    for (let i = -2; i <= 2; i++) P.add(G.cone(5), 'gloss', '#bfeaff', [i * 0.18, 0.79, -1.04], [PI, 0, 0], [0.025, 0.1 + (i & 1) * 0.04, 0.025]);
    return P.build();
  },

  bike(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.bike;
    P.add(G.sbox(0.28, 0.26, 0.62, 0.1), 'paint', WHITE, [0, 0.84, 0.16], [-0.12, 0, 0]);          // tank
    P.add(G.box(), 'gloss', acc, [0, 0.98, 0.16], [-0.12, 0, 0], [0.1, 0.01, 0.56]);
    P.add(G.cbox(0.34, 0.32, 0.46, 0.06), 'flat', CHASSIS, [0, 0.46, 0.02]);                        // engine
    if (!q.lo) for (const y of [0.38, 0.46, 0.54]) P.add(G.box(), 'metal', METAL, [0, y, 0.26], null, [0.4, 0.025, 0.06]);
    P.add(G.cbox(0.3, 0.1, 0.62, 0.04), 'vc', '#30323f', [0, 0.56, -0.24]);                      // seat
    P.add(G.sbox(0.32, 0.22, 0.52, 0.08), 'paint', WHITE, [0, 0.7, -0.74], [-0.22, 0, 0]);        // tail cowl
    P.add(G.box(), 'glow', '#ff3b4e', [0, 0.72, -1.0], [-0.22, 0, 0], [0.18, 0.06, 0.02]);
    P.add(G.sbox(0.24, 0.05, 0.5, 0.02), 'paint', WHITE, [0, 0.86, -0.88], [-0.35, 0, 0]);       // rear fender
    sideDecals(P, 0.162, 0.7, -0.72, 0.18);
    // frame + swingarm
    for (const sx of [-1, 1]) {
      tube(P, [sx * 0.13, 0.4, W_BIKE_R.z], [sx * 0.13, 0.42, -0.12], 0.035, 'metal', '#8a90a0');
      tube(P, [sx * 0.1, 0.92, 0.38], [sx * 0.1, 0.5, -0.1], 0.03, 'gloss', DARK);
    }
    // fixed front fairing with headlight + screen
    P.add(G.sbox(0.42, 0.32, 0.24, 0.08), 'paint', WHITE, [0, 1.02, 0.5], [-0.35, 0, 0]);
    P.add(G.box(), 'glass', WHITE, [0, 1.22, 0.46], [-0.6, 0, 0], [0.34, 0.2, 0.02]);
    headlights(P, q, 0.62, 1.0, [0], [0, 0.25, 0.97]);
    P.add(G.plane(1), 'decal', WHITE, [0, 1.1, 0.6], [-0.35, 0, 0], 0.18);
    // footpegs
    for (const sx of [-1, 1]) P.add(G.cyl(6), 'metal', METAL, [sx * 0.2, 0.3, 0.12], [0, 0, PI / 2], [0.025, 0.14, 0.025]);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.26);
    if (L.spoiler === 'spikes') for (let i = 0; i < 4; i++) P.add(G.cone(5), 'flat', acc, [0, 0.82 - i * 0.03, -0.56 - i * 0.12], [-0.3, 0, 0], [0.05, 0.13, 0.05]);
    return P.build();
  },

  scooter(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.scooter;
    P.add(G.sbox(0.42, 0.08, 1.1, 0.03), 'paint', WHITE, [0, 0.3, 0.0]);                           // floorboard
    P.add(G.box(), 'flat', DARK, [0, 0.35, 0.05], null, [0.38, 0.01, 0.9]);
    P.add(G.sbox(0.52, 0.72, 0.14, 0.06), 'paint', WHITE, [0, 0.66, 0.56], [-0.22, 0, 0]);        // leg shield
    P.add(G.sbox(0.5, 0.36, 0.78, 0.16), 'paint', WHITE, [0, 0.46, -0.58]);                         // rear body
    P.add(G.box(), 'gloss', acc, [0, 0.47, -0.58], null, [0.51, 0.06, 0.6]);
    P.add(G.cbox(0.34, 0.1, 0.62, 0.04), 'vc', '#30323f', [0, 0.6, -0.42]);                       // seat
    P.add(G.box(), 'glow', '#ff3b4e', [0, 0.48, -0.98], null, [0.2, 0.07, 0.02]);
    sideDecals(P, 0.25, 0.46, -0.6, 0.2);
    P.add(G.plane(1), 'decal', WHITE, [0, 0.72, 0.64], [-0.22, 0, 0], 0.22);
    headlights(P, q, 0.66, 1.0, [0], [0, 0.2, 0.98]);
    // carrot basket on the shield
    P.add(G.cbox(0.34, 0.2, 0.2, 0.03), 'flat', '#c98a4a', [0, 0.92, 0.72]);
    if (!q.lo) for (const sx of [-0.06, 0.06]) P.add(G.cone(6), 'gloss', '#ff8a1e', [sx, 1.06, 0.72], [PI - 0.2 * Math.sign(sx), 0, 0], [0.04, 0.2, 0.04]);
    P.add(G.sphere(6, 4), 'flat', '#5fcf3a', [0, 1.17, 0.72], null, [0.08, 0.05, 0.05]);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.16);
    return P.build();
  },

  trike(ch, L, q) {
    const P = new Parts(), acc = ch.accent, vs = VEHICLES.trike;
    tube(P, [0, 0.5, -0.5], [0, 0.82, 0.42], 0.09, 'paint', WHITE, q.n(10));                     // spine
    P.add(G.sbox(1.0, 0.36, 0.86, 0.14), 'paint', WHITE, [0, 0.56, -0.62]);                         // rear pod
    P.add(G.box(), 'gloss', acc, [0, 0.58, -0.62], null, [1.01, 0.06, 0.7]);
    for (const sx of [-1, 1]) {
      P.add(G.sbox(0.42, 0.1, 0.8, 0.04), 'paint', WHITE, [sx * W_TRI_R.x, 0.88, W_TRI_R.z], [0, 0, -sx * 0.18]);
      P.add(profileExtrude('fin', [[0, 0], [0.42, 0], [0.12, 0.34], [0, 0.34]], 0.04, 0.015), 'paint', WHITE, [sx * 0.42, 0.72, -0.8], [0, PI / 2, 0]);
      P.add(G.box(), 'glow', '#ffe36e', [sx * 0.505, 0.5, -0.5], null, [0.012, 0.04, 0.5]);
    }
    P.add(G.cbox(0.4, 0.12, 0.5, 0.04), 'vc', '#30323f', [0, 0.58, -0.26]);
    P.add(G.sbox(0.3, 0.24, 0.5, 0.08), 'paint', WHITE, [0, 0.66, 0.16]);
    sideDecals(P, 0.505, 0.6, -0.78, 0.2);
    P.add(G.plane(2), 'decal', WHITE, [0, 0.56, -1.055], [0, PI, 0], 0.22);
    if (!q.lo) for (const sx of [-0.3, 0.3]) P.add(G.box(), 'glow', '#ff3b4e', [sx, 0.66, -1.06], null, [0.12, 0.06, 0.02]);
    // space antenna
    P.add(G.cyl(6), 'flat', METAL, [0.36, 0.95, -0.9], null, [0.012, 0.5, 0.012]);
    P.add(G.sphere(7, 5), 'glow', '#ffe36e', [0.36, 1.22, -0.9], null, 0.045);
    addPipes(P, L, q, vs.pipeA, vs.pipeDir, 0.22);
    return P.build();
  },
};

// fork (head-tube local frame, fork along -Y) + handlebar
function buildFork(ch, W, rg, q) {
  const P = new Parts();
  for (const sx of [-1, 1]) tube(P, [sx * (W.w / 2 + 0.05), -0.08, 0], [sx * (W.w / 2 + 0.05), -rg.len, 0], 0.035, 'metal', METAL, q.n(8));
  P.add(G.cbox(W.w + 0.2, 0.08, 0.12, 0.03), 'gloss', DARK, [0, -0.06, 0]);
  tube(P, [0, -0.06, 0], [0, rg.barUp, 0], 0.035, 'gloss', DARK, q.n(8));
  P.add(G.sbox(W.w + 0.1, 0.05, 0.6, 0.02), 'paint', WHITE, [0, -rg.len + W.r + 0.08, 0.02], [-rg.rake, 0, 0]);
  return P.build();
}
function buildBar(ch, q, stem = 0) {
  const P = new Parts();
  P.add(G.capsule(0.024, 0.5, 1, q.n(7)), 'gloss', DARK, null, [0, 0, PI / 2]);
  for (const sx of [-1, 1]) P.add(G.capsule(0.038, 0.1, 1, q.n(7)), 'vc', '#202230', [sx * 0.27, 0, 0], [0, 0, PI / 2]);
  P.add(G.cbox(0.1, 0.07, 0.07, 0.02), 'gloss', ch.color, [0, 0, 0]);
  if (stem) tube(P, [0, 0, 0], [0, -stem, 0.08], 0.035, 'gloss', DARK, q.n(8));
  return P.build();
}
function buildSki(ch, q) {
  const P = new Parts();
  P.add(G.cbox(0.16, 0.05, 1.0, 0.02), 'gloss', ch.accent, [0, 0.03, 0]);
  P.add(G.cbox(0.16, 0.05, 0.28, 0.02), 'gloss', ch.accent, [0, 0.11, 0.6], [-0.6, 0, 0]);
  P.add(G.box(), 'metal', METAL, [0, 0.13, 0], null, [0.05, 0.2, 0.1]);
  return P.build();
}

// ---------------------------------------------------------------------------
// Gliders (glider-local: origin between the shoulders, canopy above)
// ---------------------------------------------------------------------------
function cords(P, from, tos, r = 0.01) { for (const t of tos) tube(P, from, t, r, 'flat', '#30323f', 4); }
function buildGlider(ch, L, q) {
  const main = new Parts(), out = { main: null, spin: null, wing: null, spinPos: null, wingPos: null };
  const c1 = ch.color, c2 = ch.accent === '#2a2a33' ? WHITE : ch.accent;
  const hands = [[0.2, 0, 0.05], [-0.2, 0, 0.05]];
  switch (ch.glider) {
    case 'parachute': {
      const n = 8, R = 1.3, cy = 1.35;
      for (let i = 0; i < n; i++) {
        const g = cached(`chute${i}`, () => new THREE.SphereGeometry(1, 3, q.pick(6, 5, 4), (i / n) * PI * 2, (PI * 2) / n, 0, PI / 2));
        main.add(g, 'cloth', i % 2 ? c1 : WHITE, [0, cy, -0.2], null, [R, 0.62, R]);
      }
      main.add(G.cyl(8), 'cloth', '#30323f', [0, cy + 0.63, -0.2], null, [0.14, 0.03, 0.14]);
      const rim = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + 0.3; rim.push([Math.cos(a) * R * 0.98, cy + 0.02, -0.2 + Math.sin(a) * R * 0.98]); }
      cords(main, hands[0], rim.filter(p => p[0] >= 0)); cords(main, hands[1], rim.filter(p => p[0] < 0));
      break;
    }
    case 'paraglider': {
      const cells = 9, R = 1.7;
      const ends = [];
      for (let i = 0; i < cells; i++) {
        const a = (i - (cells - 1) / 2) * 0.17;
        const x = Math.sin(a) * R, y = 0.2 + Math.cos(a) * R;
        main.add(G.sbox(0.4, 0.16, 0.8, 0.06), 'cloth', i % 2 ? c1 : c2 === WHITE ? '#ffd23f' : c2, [x, y, -0.35], [0, 0, -a]);
        if (i === 0 || i === 3 || i === 5 || i === cells - 1) ends.push([x, y - 0.06, -0.3]);
      }
      cords(main, hands[0], ends.filter(p => p[0] > 0)); cords(main, hands[1], ends.filter(p => p[0] < 0));
      break;
    }
    case 'hangglider': {
      const wing = profileExtrude('hgwing', [[-1.6, -0.55], [0, 0.85], [1.6, -0.55], [0, -0.2]], 0.03, 0.01);
      const wg = cached('hgwingflat', () => wing.clone().rotateX(PI / 2));
      main.add(wg, 'cloth', c1, [0, 1.1, -0.35]);
      const stripe = cached('hgstripe', () => profileExtrude('hgs', [[-0.9, -0.12], [0, 0.65], [0.9, -0.12], [0, 0.1]], 0.03, 0.005).clone().rotateX(PI / 2));
      main.add(stripe, 'cloth', c2, [0, 1.13, -0.35]);
      tube(main, [0, 1.12, 0.52], [0, 1.12, -0.9], 0.03, 'metal', METAL);
      tube(main, [0, 1.12, -0.1], [0.32, 0.12, 0.12], 0.025, 'metal', METAL);
      tube(main, [0, 1.12, -0.1], [-0.32, 0.12, 0.12], 0.025, 'metal', METAL);
      tube(main, [0.34, 0.12, 0.12], [-0.34, 0.12, 0.12], 0.025, 'metal', METAL);
      break;
    }
    case 'umbrella': {
      const n = 8, R = 1.1, cy = 1.5;
      for (let i = 0; i < n; i++) {
        const g = cached(`umb${i}`, () => new THREE.CylinderGeometry(0.0, 1, 1, 2, 1, true, (i / n) * PI * 2, (PI * 2) / n));
        main.add(g, 'cloth', i % 2 ? c2 : '#a6e34a', [0, cy, -0.15], null, [R, 0.42, R]);
      }
      tube(main, [0.18, -0.05, 0.1], [0, cy + 0.32, -0.15], 0.025, 'gloss', '#7a4a2a');
      main.add(q.s(8, 6), 'gloss', c2, [0, cy + 0.33, -0.15], null, 0.06);
      main.add(G.torus(0.08, 0.022, 4, 10, PI), 'gloss', '#7a4a2a', [0.2, -0.08, 0.12], [0, PI / 2, PI]);
      break;
    }
    case 'copter': {
      tube(main, [0, -0.1, -0.15], [0, 1.0, -0.15], 0.035, 'metal', METAL);
      main.add(G.cyl(q.n(10)), 'gloss', c2, [0, 1.0, -0.15], null, [0.11, 0.1, 0.11]);
      main.add(G.cbox(0.3, 0.22, 0.14, 0.05), 'gloss', c1, [0, -0.05, -0.2]); // backpack motor
      const sp = new Parts();
      for (const r of [0, PI / 2]) sp.add(G.cbox(2.5, 0.03, 0.16, 0.012), 'gloss', r ? c1 : c2, [0, 0, 0], [0, r, 0]);
      sp.add(q.s(8, 6), 'gloss', '#ff4060', [0, 0.05, 0], null, [0.08, 0.06, 0.08]);
      out.spin = sp.build(); out.spinPos = [0, 1.06, -0.15];
      break;
    }
    case 'wings': {
      main.add(G.cbox(0.3, 0.3, 0.12, 0.05), 'gloss', DARK, [0, 0, -0.18]);
      const wp = new Parts();
      const wing = profileExtrude('batwing', [[0, 0.22], [0.5, 0.36], [1.05, 0.42], [1.45, 0.2], [1.25, -0.02], [1.05, 0.1], [0.82, -0.16], [0.6, 0.02], [0.36, -0.2], [0.14, -0.02], [0, -0.12]], 0.03, 0.01);
      wp.add(cached('batwingflat', () => wing.clone().rotateX(PI / 2)), 'cloth', c1);
      tube(wp, [0, 0.03, 0.22], [1.05, 0.03, 0.42], 0.03, 'gloss', DARK);
      tube(wp, [1.05, 0.03, 0.42], [1.45, 0.03, 0.2], 0.025, 'gloss', DARK);
      out.wing = wp.build(); out.wingPos = [0.12, 0.05, -0.2];
      break;
    }
    case 'kite': {
      const kc = [0, 1.9, -1.1];
      for (const dz of [-0.32, 0.32]) main.add(G.cyl(4, true), 'cloth', dz < 0 ? c1 : c2, [kc[0], kc[1], kc[2] + dz], [PI / 2, 0, 0], [0.5, 0.3, 0.5]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        const x = Math.cos(a) * 0.5, y = Math.sin(a) * 0.5;
        tube(main, [kc[0] + x, kc[1] + y, kc[2] - 0.5], [kc[0] + x, kc[1] + y, kc[2] + 0.5], 0.018, 'flat', '#7a4a2a', 4);
      }
      tube(main, [kc[0] - 0.5, kc[1], kc[2]], [kc[0] + 0.5, kc[1], kc[2]], 0.015, 'flat', '#7a4a2a', 4);
      cords(main, [0, 0.05, 0.1], [[kc[0], kc[1] - 0.5, kc[2] + 0.4]], 0.012);
      // tail bows
      for (let i = 0; i < 3; i++) main.add(G.cbox(0.14, 0.06, 0.05, 0.015), 'cloth', i % 2 ? c1 : c2, [0, kc[1] - 0.7 - i * 0.22, kc[2] - 0.55 - i * 0.12]);
      break;
    }
    case 'balloon':
    default: {
      const bs = [[-0.36, 1.65, -0.2, c1], [0.36, 1.72, -0.28, '#ffe14a'], [0, 2.05, -0.12, '#5ff3ff'], [0.05, 1.5, -0.45, c2 === WHITE ? '#9b6bff' : c2]];
      for (const [x, y, z, c] of bs) {
        main.add(q.s(14, 10), 'gloss', c, [x, y, z], null, [0.36, 0.44, 0.36]);
        main.add(G.cone(6), 'gloss', c, [x, y - 0.47, z], [PI, 0, 0], [0.06, 0.08, 0.06]);
        cords(main, [0, 0.0, 0.05], [[x, y - 0.5, z]], 0.008);
      }
    }
  }
  out.main = main.build();
  return out;
}

// ---------------------------------------------------------------------------
// Builders: steering wheel (local: wheel plane XY, axis Z)
// ---------------------------------------------------------------------------
function buildSteeringWheel(ch, q) {
  const P = new Parts();
  P.add(G.torus(SWR, 0.03, 4, q.pick(14, 12, 9)), 'vc', DARK);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2 + PI / 3;
    P.add(G.box(), 'flat', '#50546a', [Math.cos(a) * SWR * 0.5, Math.sin(a) * SWR * 0.5, 0], [0, 0, a + PI / 2], [0.025, SWR, 0.02]);
  }
  P.add(G.cyl(q.n(8)), 'gloss', ch.color, [0, 0, -0.01], [PI / 2, 0, 0], [0.055, 0.04, 0.055]);
  P.add(G.box(), 'gloss', ch.accent === WHITE ? '#ffd23f' : ch.accent, [0, SWR, 0], null, [0.04, 0.035, 0.07]);
  return P.build();
}

// ---------------------------------------------------------------------------
// Builders: driver
// ---------------------------------------------------------------------------
function eye(P, q, { R, yaw, pitch = 0.04, e = 0.12, iris, side = 1, out = 0.9, inward = 0.06, mat = 'gloss' }) {
  const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const c = d.clone().multiplyScalar(R * out);
  P.push([c.x, c.y, c.z], alignZ(d.x, d.y, d.z));
  // eyeball (ellipsoid); iris & pupil are caps of the same ellipsoid so they hug it
  P.push(null, null, [e, e * 1.18, e * 0.6]);
  P.add(G.sphere(q.pick(12, 10, 8), q.pick(8, 6, 5)), mat, '#ffffff');
  const look = [0.04, -side * inward * 3.2, 0];
  P.add(G.cap(0.72, q.pick(14, 12, 8), 2), 'vc', iris, null, look, 1.04);
  P.add(G.cap(0.42, q.pick(12, 10, 6), 1), 'vc', '#101018', null, look, 1.075);
  P.pop();
  const hx = -side * inward * e * 1.9;
  P.add(G.sphere(6, 4), 'glow', '#ffffff', [hx + e * 0.24, e * 0.3, e * 0.5], null, [e * 0.21, e * 0.22, e * 0.12]);
  if (!q.lo) P.add(G.sphere(4, 3), 'glow', '#ffffff', [hx - e * 0.16, -e * 0.26, e * 0.52], null, [e * 0.09, e * 0.09, e * 0.06]);
  P.pop();
}

function brow(P, q, { R, yaw, pitch = 0.4, side = 1, tilt = 0.28, color = INK, len = 0.09 }) {
  if (q.lo) return;
  const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const c = d.clone().multiplyScalar(R * 1.0);
  P.push([c.x, c.y, c.z], alignZ(d.x, d.y, d.z));
  P.add(G.cbox(len + 0.04, 0.038, 0.03, 0.012), 'vc', color, null, [0, 0, side * tilt]);
  P.pop();
}

function smile(P, { pos, R = 0.06, t = 0.016, color = INK, pitch = -0.3 }) {
  P.add(G.torus(R, t, 3, 8, PI), 'vc', color, pos, [pitch, 0, PI]);
}

// --- heads (local origin = head centre, face +Z) ----------------------------
const HEADS = {
  fox(P, ch, L, q) {
    const R = 0.36, white = '#fff3e6', dark = '#3a2418';
    P.add(q.s(13, 9), 'vc', L.skin, null, null, [R * 1.05, R * 0.95, R]);
    // cheek fluff & muzzle
    for (const sx of [-1, 1]) P.add(q.s(7, 5), 'vc', white, [sx * 0.17, -0.15, 0.18], null, [0.15, 0.12, 0.13]);
    P.add(q.s(10, 6), 'vc', white, [0, -0.12, 0.27], null, [0.15, 0.11, 0.17]);
    P.add(q.s(7, 5), 'gloss', INK, [0, -0.085, 0.44], null, [0.05, 0.04, 0.04]);
    smile(P, { pos: [0, -0.18, 0.37], R: 0.045, pitch: -0.6 });
    // ears
    for (const sx of [-1, 1]) {
      P.push([sx * 0.2, 0.3, -0.04], [-0.12, 0, -sx * 0.4]);
      P.add(G.cone(q.n(6)), 'flat', L.skin, [0, 0.15, 0], null, [0.13, 0.32, 0.09]);
      P.add(G.cone(q.n(6)), 'flat', white, [0, 0.12, 0.035], null, [0.075, 0.2, 0.05]);
      P.add(G.cone(q.n(6)), 'flat', dark, [0, 0.27, 0], null, [0.055, 0.1, 0.04]);
      P.pop();
    }
    for (const side of [-1, 1]) {
      eye(P, q, { R, yaw: side * 0.36, pitch: 0.02, e: 0.12, iris: L.iris, side });
      brow(P, q, { R, yaw: side * 0.36, pitch: 0.36, side, color: dark });
    }
    // goggles pushed up on the forehead
    P.push([0, 0.12, 0], [-0.42, 0, 0]);
    P.add(G.torus(R * 1.0, 0.026, 3, q.n(12)), 'vc', '#6b3f22', null, [PI / 2, 0, 0]);
    P.pop();
    for (const sx of [-1, 1]) {
      const d = V(sx * 0.16, 0.6, 0.78).normalize();
      const c = d.clone().multiplyScalar(R * 1.0);
      const qd = alignY(d.x, d.y, d.z);
      P.add(G.cyl(8, true), 'metal', '#c9a35a', [c.x, c.y, c.z], qd, [0.08, 0.07, 0.08]);
      const l = d.clone().multiplyScalar(R * 1.0 + 0.037);
      P.add(G.cyl(8), 'gloss', '#7fe0ff', [l.x, l.y, l.z], qd, [0.062, 0.01, 0.062]);
    }
  },

  panda(P, ch, L, q) {
    const R = 0.37, black = '#23232b';
    P.add(q.s(13, 9), 'vc', L.skin, null, null, [R * 1.08, R * 0.95, R]);
    for (const sx of [-1, 1]) P.add(q.s(7, 5), 'vc', black, [sx * 0.26, 0.27, -0.03], null, [0.12, 0.12, 0.08]);
    // eye patches (tilted teardrops)
    for (const side of [-1, 1]) {
      const yaw = side * 0.34, pitch = 0.0;
      const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const c = d.clone().multiplyScalar(R * 0.88);
      P.push([c.x, c.y - 0.01, c.z], alignZ(d.x, d.y, d.z));
      P.add(q.s(7, 5), 'vc', black, null, [0, 0, side * 0.55], [0.12, 0.16, 0.08]);
      P.pop();
      eye(P, q, { R, yaw, pitch: 0.03, e: 0.1, iris: L.iris, side, out: 0.98 });
    }
    P.add(q.s(10, 6), 'vc', '#ffffff', [0, -0.15, 0.27], null, [0.16, 0.11, 0.12]);
    P.add(q.s(7, 5), 'gloss', black, [0, -0.1, 0.385], null, [0.065, 0.045, 0.04]);
    smile(P, { pos: [0, -0.19, 0.36], R: 0.04, pitch: -0.5 });
    // red headband with knot tails
    P.push([0, 0.15, 0], [-0.1, 0, 0]);
    P.add(G.torus(R * 0.98, 0.04, 4, q.n(14)), 'vc', L.trim, null, [PI / 2, 0, 0], [1.08, 1, 1]);
    P.pop();
    P.add(q.s(7, 5), 'vc', L.trim, [0, 0.2, -0.38], null, 0.05);
    P.add(G.cbox(0.07, 0.18, 0.03, 0.012), 'vc', L.trim, [0.05, 0.11, -0.42], [0.4, 0, 0.35]);
    P.add(G.cbox(0.07, 0.16, 0.03, 0.012), 'vc', L.trim, [-0.05, 0.12, -0.42], [0.3, 0, -0.45]);
  },

  frog(P, ch, L, q) {
    const R = 0.34;
    P.add(q.s(13, 9), 'vc', L.skin, [0, -0.03, 0], null, [R * 1.2, R * 0.82, R * 1.0]);
    // big eye bumps on top
    for (const side of [-1, 1]) {
      P.add(q.s(10, 7), 'vc', L.skin, [side * 0.17, 0.17, 0.08], null, 0.14);
      P.push([side * 0.17, 0.18, 0.09]);
      eye(P, q, { R: 0.14, yaw: side * 0.15, pitch: 0.05, e: 0.12, iris: L.iris, side, out: 0.55, inward: 0.08 });
      P.pop();
      P.add(q.s(7, 5), 'vc', '#ff8fb8', [side * 0.26, -0.08, 0.2], [0, side * 0.7, 0], [0.07, 0.045, 0.03]);
    }
    P.add(G.torus(0.13, 0.016, 3, 10, PI), 'vc', '#2b4a1a', [0, -0.03, 0.315], [-0.25, 0, PI], [1, 0.55, 1]);
    for (const sx of [-1, 1]) P.add(G.sphere(6, 4), 'vc', '#4a7a2a', [sx * 0.045, 0.02, 0.33], null, 0.014);
    // flower behind the right eye
    const fx = -0.24, fy = 0.16, fz = -0.08;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      P.add(q.s(6, 4), 'vc', ch.accent, [fx - 0.02, fy + Math.sin(a) * 0.055, fz + Math.cos(a) * 0.055], [a, 0, 0], [0.025, 0.05, 0.03]);
    }
    P.add(q.s(6, 4), 'gloss', '#ffe14a', [fx - 0.04, fy, fz], null, 0.03);
  },

  robot(P, ch, L, q) {
    P.add(G.rbox(0.66, 0.54, 0.56, 0.12, q.hi ? 2 : 1), 'gloss', L.skin);
    P.add(G.cbox(0.52, 0.36, 0.06, 0.03), 'gloss', '#1b2140', [0, -0.01, 0.265]);
    for (const sx of [-1, 1]) {
      P.add(q.s(7, 5), 'glow', '#5ff3ff', [sx * 0.12, 0.03, 0.297], null, [0.07, 0.09, 0.015]);
      P.add(q.s(6, 4), 'glow', '#ffffff', [sx * 0.12 + 0.025, 0.065, 0.31], null, 0.018);
      P.add(q.s(7, 5), 'glow', '#ff7ab8', [sx * 0.2, -0.08, 0.297], null, [0.035, 0.022, 0.01]);
      // ear bolts
      P.add(G.cyl(q.n(10)), 'gloss', L.trim, [sx * 0.35, 0, 0], [0, 0, PI / 2], [0.085, 0.07, 0.085]);
      P.add(G.cyl(6), 'metal', '#8a90a0', [sx * 0.39, 0, 0], [0, 0, PI / 2], [0.035, 0.04, 0.035]);
    }
    P.add(G.torus(0.065, 0.014, 4, 10, PI), 'glow', '#5ff3ff', [0, -0.07, 0.3], [0, 0, PI]);
    // antenna
    P.add(G.cyl(6), 'metal', '#8a90a0', [0, 0.36, 0], null, [0.016, 0.2, 0.016]);
    P.add(q.s(7, 5), 'glow', '#ff4060', [0, 0.48, 0], null, 0.05);
    P.add(G.cbox(0.3, 0.05, 0.22, 0.02), 'gloss', ch.color, [0, 0.275, -0.02]);
    // back vent
    for (let i = 0; i < 3; i++) P.add(G.box(), 'flat', '#596173', [0, 0.06 - i * 0.07, -0.28], null, [0.3, 0.025, 0.02]);
  },

  penguin(P, ch, L, q) {
    const R = 0.36;
    P.add(q.s(13, 9), 'vc', L.skin, null, null, [R * 1.03, R * 0.97, R]);
    for (const sx of [-1, 1]) P.add(q.s(10, 7), 'vc', '#ffffff', [sx * 0.105, -0.04, 0.25], [0, sx * 0.3, 0], [0.19, 0.22, 0.11]);
    P.add(G.cone(q.n(8)), 'gloss', '#ffa31a', [0, -0.09, 0.41], [PI / 2, 0, 0], [0.075, 0.15, 0.055]);
    for (const side of [-1, 1]) {
      eye(P, q, { R, yaw: side * 0.3, pitch: 0.05, e: 0.105, iris: L.iris, side, out: 0.98 });
      P.add(q.s(7, 5), 'vc', '#ffa0b8', [side * 0.22, -0.13, 0.27], [0, side * 0.7, 0], [0.05, 0.035, 0.03]);
    }
    // bobble hat
    P.add(G.hemi(q.n(16), q.n(6)), 'vc', ch.accent, [0, 0.12, -0.01], null, [R * 1.06, R * 1.02, R * 1.06]);
    P.add(G.torus(R * 0.98, 0.055, 4, q.n(14)), 'vc', shade(ch.accent, 0.35), [0, 0.135, -0.01], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      P.add(G.box(), 'vc', '#ffffff', [Math.sin(a) * 0.29, 0.31, Math.cos(a) * 0.29 - 0.01], [0, a, -0.5], [0.04, 0.12, 0.02]);
    }
    P.add(q.s(8, 6), 'vc', '#ffffff', [0, 0.5, -0.02], null, 0.1);
  },

  dino(P, ch, L, q) {
    const R = 0.34;
    P.add(q.s(13, 9), 'vc', L.skin, [0, 0, -0.02], null, [R, R * 0.95, R * 1.05]);
    P.add(q.s(10, 7), 'vc', L.skin, [0, -0.11, 0.2], null, [0.25, 0.18, 0.22]);
    P.add(q.s(9, 6), 'vc', L.trim, [0, -0.2, 0.2], null, [0.19, 0.08, 0.17]);
    for (const sx of [-1, 1]) P.add(G.sphere(6, 4), 'vc', '#5a2f9a', [sx * 0.06, -0.06, 0.415], null, 0.018);
    smile(P, { pos: [0, -0.15, 0.402], R: 0.08, pitch: 0.3 });
    for (const sx of [-1, 1]) P.add(G.cone(4), 'vc', '#ffffff', [sx * 0.035, -0.222, 0.378], [PI + 0.3, 0, 0], [0.02, 0.035, 0.014]);
    for (const side of [-1, 1]) {
      eye(P, q, { R, yaw: side * 0.42, pitch: 0.16, e: 0.12, iris: L.iris, side, out: 0.92 });
      brow(P, q, { R, yaw: side * 0.4, pitch: 0.5, side, tilt: -0.15, color: '#5a2f9a' });
    }
    // spikes along the top/back
    [[0.12, 0.13], [0.6, 0.15], [1.08, 0.13], [1.55, 0.1]].forEach(([a, h]) => {
      const d = V(0, Math.cos(a), -Math.sin(a));
      const c = d.clone().multiplyScalar(R * 0.92 + h * 0.4);
      P.add(G.cone(5), 'flat', '#ffb13b', [c.x, c.y, c.z], alignY(d.x, d.y, d.z), [h * 0.6, h, h * 0.35]);
    });
    // spots
    [[0.22, 0.18, -0.18, 0.06], [-0.26, 0.08, -0.14, 0.05], [0.29, -0.05, -0.06, 0.04]].forEach(([x, y, z, r]) => {
      const d = V(x, y, z).normalize();
      const c = d.clone().multiplyScalar(R * 0.98);
      P.add(q.s(7, 5), 'vc', '#9a64f0', [c.x, c.y, c.z], alignZ(d.x, d.y, d.z), [r, r, 0.02]);
    });
  },

  cat(P, ch, L, q) {
    const R = 0.32;
    P.add(q.s(13, 9), 'vc', L.skin, null, null, [R * 1.1, R * 0.95, R]);
    for (const sx of [-1, 1]) {
      P.push([sx * 0.19, 0.24, -0.02], [-0.1, 0, -sx * 0.32]);
      P.add(G.cone(4), 'flat', L.skin, [0, 0.1, 0], [0, PI / 4, 0], [0.12, 0.22, 0.08]);
      P.add(G.cone(4), 'flat', '#ff9ccf', [0, 0.08, 0.03], [0, PI / 4, 0], [0.07, 0.14, 0.04]);
      P.pop();
      P.add(q.s(7, 5), 'vc', '#ffffff', [sx * 0.055, -0.11, 0.27], null, [0.075, 0.06, 0.06]);
      for (const k of [0, 1]) {
        P.add(G.box(), 'vc', '#5b6378', [sx * 0.2, -0.1 - k * 0.035, 0.24], [0, -sx * 0.5, sx * (k ? -0.15 : 0.12)], [0.14, 0.008, 0.008]);
      }
      eye(P, q, { R, yaw: sx * 0.36, pitch: 0.05, e: 0.115, iris: L.iris, side: sx, out: 0.92 });
    }
    P.add(q.s(7, 5), 'gloss', '#ff6fa8', [0, -0.065, 0.315], null, [0.035, 0.025, 0.025]);
    smile(P, { pos: [0, -0.14, 0.3], R: 0.03, t: 0.012, pitch: -0.4 });
    // helmet glass + collar + antenna
    P.add(q.s(14, 9), 'glass', '#ffffff', [0, 0.02, 0.0], null, 0.5);
    P.add(G.torus(0.3, 0.07, 4, q.n(14)), 'gloss', '#f4f7ff', [0, -0.36, 0], [PI / 2, 0, 0]);
    P.add(G.torus(0.3, 0.035, 3, q.n(14)), 'gloss', ch.color, [0, -0.31, 0], [PI / 2, 0, 0]);
    P.add(G.cyl(6), 'metal', METAL, [0.22, 0.5, -0.1], [0, 0, -0.3], [0.012, 0.2, 0.012]);
    P.add(q.s(7, 5), 'glow', '#ffe36e', [0.255, 0.6, -0.1], null, 0.035);
  },

  bunny(P, ch, L, q) {
    const R = 0.35, pink = '#ffb3c8';
    P.add(q.s(13, 9), 'vc', L.skin, null, null, [R * 1.05, R * 0.95, R]);
    // ears: left straight, right one flopped over
    for (const sx of [-1, 1]) {
      P.push([sx * 0.12, 0.27, -0.05], [-0.18, 0, -sx * 0.16]);
      if (sx > 0) {
        P.add(G.capsule(0.075, 0.32, 2, q.n(8)), 'vc', L.skin, [0, 0.22, 0]);
        P.add(G.capsule(0.045, 0.27, 2, q.n(6)), 'vc', pink, [0, 0.22, 0.058], null, [1, 1, 0.45]);
      } else {
        P.add(G.capsule(0.075, 0.16, 2, q.n(8)), 'vc', L.skin, [0, 0.14, 0]);
        P.add(G.capsule(0.045, 0.13, 2, q.n(6)), 'vc', pink, [0, 0.14, 0.058], null, [1, 1, 0.45]);
        P.push([0, 0.27, 0], [0.2, 0, 1.2]);
        P.add(G.capsule(0.075, 0.14, 2, q.n(8)), 'vc', L.skin, [0, 0.11, 0]);
        P.add(G.capsule(0.045, 0.11, 2, q.n(6)), 'vc', pink, [0, 0.11, 0.058], null, [1, 1, 0.45]);
        P.pop();
      }
      P.pop();
      P.add(q.s(7, 5), 'vc', pink, [sx * 0.22, -0.12, 0.25], [0, sx * 0.7, 0], [0.055, 0.035, 0.03]);
      eye(P, q, { R, yaw: sx * 0.36, pitch: 0.03, e: 0.125, iris: L.iris, side: sx });
    }
    P.add(q.s(7, 5), 'gloss', '#ff7aa0', [0, -0.08, 0.345], null, [0.045, 0.032, 0.03]);
    P.add(G.cbox(0.07, 0.06, 0.03, 0.01), 'vc', '#ffffff', [0, -0.16, 0.325], [-0.3, 0, 0]);
    P.add(G.box(), 'vc', '#d8d0c8', [0, -0.16, 0.342], [-0.3, 0, 0], [0.004, 0.05, 0.004]);
    P.add(G.torus(0.035, 0.011, 4, 8, PI), 'vc', INK, [-0.033, -0.12, 0.335], [-0.4, 0, PI]);
    P.add(G.torus(0.035, 0.011, 4, 8, PI), 'vc', INK, [0.033, -0.12, 0.335], [-0.4, 0, PI]);
    P.add(q.s(7, 5), 'vc', L.skin, [0.02, 0.33, 0.1], null, [0.08, 0.06, 0.08]);
  },
};

// --- torso (kart space) -----------------------------------------------------
function buildTorso(ch, L, q, { portrait = false } = {}) {
  const P = new Parts();
  const sp = ch.species;
  const tc = [0, 0.82, -0.38];
  P.add(G.capsule(0.2, 0.22, 3, q.n(10)), 'vc', L.suit, tc);
  // belly / chest panel
  if (sp === 'penguin' || sp === 'dino' || sp === 'frog') {
    P.add(q.s(12, 8), 'vc', sp === 'frog' ? '#f2f7c8' : sp === 'dino' ? L.trim : '#ffffff', [0, 0.8, -0.2], null, [0.145, 0.2, 0.055]);
  }
  if (sp === 'frog') { // overall straps
    for (const sx of [-1, 1]) P.add(G.box(), 'vc', L.suit, [sx * 0.11, 0.96, -0.2], [0.25, 0, 0], [0.05, 0.2, 0.03]);
    P.add(G.capsule(0.2, 0.22, 2, q.n(10)), 'vc', L.skin, [0, 0.96, -0.38], null, [1.01, 0.5, 1.01]);
  }
  if (sp === 'fox' || sp === 'bunny') { // racing stripe / hoodie strings
    P.add(G.box(), 'vc', L.trim, [0, 0.84, -0.18], [0.1, 0, 0], [0.06, 0.3, 0.02]);
  }
  if (sp === 'bunny') {
    P.add(G.torus(0.17, 0.05, 4, q.n(12)), 'vc', shade(L.suit, -0.15), [0, 1.04, -0.42], [PI / 2 + 0.25, 0, 0]);
  }
  if (sp === 'robot') {
    P.add(G.cbox(0.18, 0.14, 0.03, 0.02), 'gloss', '#1b2140', [0, 0.88, -0.19]);
    P.add(q.s(7, 5), 'glow', ch.color, [0, 0.88, -0.17], null, [0.045, 0.045, 0.01]);
    P.add(G.box(), 'glow', '#5ff3ff', [0.045, 0.88, -0.172], null, [0.02, 0.06, 0.004]);
  }
  if (sp === 'cat') { // backpack + suit patch
    P.add(G.cbox(0.34, 0.36, 0.16, 0.05), 'gloss', '#f4f7ff', [0, 0.92, -0.6]);
    for (const sx of [-0.09, 0.09]) P.add(G.cyl(q.n(10)), 'gloss', ch.color, [sx, 0.92, -0.69], null, [0.055, 0.32, 0.055]);
    P.add(G.box(), 'vc', ch.color, [0, 0.9, -0.18], null, [0.14, 0.05, 0.02]);
  }
  if (sp === 'panda') { // black shoulders
    P.add(G.capsule(0.21, 0.04, 2, q.n(10)), 'vc', '#23232b', [0, 1.0, -0.38], null, [1.02, 0.6, 1.02]);
    P.add(G.box(), 'vc', L.trim, [0, 0.66, -0.38], null, [0.42, 0.05, 0.42]);
  }
  if (sp === 'penguin') { // scarf
    P.add(G.torus(0.15, 0.06, 4, q.n(12)), 'vc', L.trim, [0, 1.08, -0.38], [PI / 2, 0, 0]);
    if (!portrait) {
      P.add(G.cbox(0.12, 0.32, 0.04, 0.015), 'vc', L.trim, [0.1, 0.98, -0.58], [0.6, 0, -0.15]);
      P.add(G.cbox(0.12, 0.26, 0.04, 0.015), 'vc', L.trim, [0.17, 0.97, -0.56], [0.75, 0, -0.45]);
    }
  } else if (sp !== 'cat' && sp !== 'bunny' && sp !== 'panda') {
    P.add(G.torus(0.13, 0.04, 4, q.n(12)), 'vc', L.trim === WHITE ? ch.color : L.trim, [0, 1.07, -0.38], [PI / 2, 0, 0]);
  }
  // shoulders
  for (const sx of [-1, 1]) P.add(q.s(7, 5), 'vc', L.sleeve, [sx * SHOULDER.x, SHOULDER.y, SHOULDER.z], null, 0.085);
  if (!portrait) {
    // legs & shoes (mostly hidden in the footwell)
    for (const sx of [-1, 1]) {
      P.add(G.capsule(0.075, 0.5, 1, q.n(6)), 'vc', sp === 'frog' ? L.skin : L.sleeve === '#23232b' ? '#23232b' : L.suit,
        [sx * 0.12, 0.6, 0.0], [PI / 2 - 0.15, 0, 0]);
    }
  }
  if (sp === 'bunny' && !portrait) P.add(q.s(7, 5), 'vc', '#ffffff', [0, 0.72, -0.72], null, 0.1); // cotton tail
  return P.build();
}

// --- arm (pivot at shoulder, extends along +Z) ------------------------------
function buildSleeve(ch, L, q) {
  const P = new Parts();
  P.add(G.capsule(0.06, ARM_REF - 0.1, 2, q.n(7)), 'vc', L.sleeve, [0, 0, ARM_REF / 2], [PI / 2, 0, 0]);
  if (ch.species === 'robot') {
    for (const t of q.hi ? [0.3, 0.6] : [0.45]) P.add(G.torus(0.06, 0.018, 3, 7), 'metal', METAL, [0, 0, ARM_REF * t]);
  } else if (L.sleeve !== L.glove && !q.lo) {
    P.add(G.torus(0.058, 0.022, 3, 7), 'vc', L.trim === WHITE ? ch.color : L.trim, [0, 0, ARM_REF - 0.04]);
  }
  return P.build();
}
function buildHand(ch, L, q) {
  const P = new Parts();
  P.add(q.s(7, 5), ch.species === 'robot' ? 'gloss' : 'vc', L.glove, null, null, [0.085, 0.08, 0.09]);
  P.add(G.sphere(5, 3), 'vc', L.glove, [0.055, 0.02, 0.0], null, 0.04); // thumb
  return P.build();
}

// --- tails ------------------------------------------------------------------
function buildTail(ch, L, q) {
  const P = new Parts();
  if (ch.species === 'fox') {
    P.add(q.s(8, 6), 'vc', L.skin, [0, 0.06, -0.2], [0.9, 0, 0], [0.12, 0.24, 0.12]);
    P.add(q.s(7, 5), 'vc', '#fff3e6', [0, 0.2, -0.38], [0.9, 0, 0], [0.09, 0.12, 0.09]);
  } else if (ch.species === 'dino') {
    P.add(G.cone(q.n(8)), 'vc', L.skin, [0, 0.0, -0.25], [-PI / 2 - 0.25, 0, 0], [0.12, 0.5, 0.12]);
    for (let i = 0; i < 3; i++) P.add(G.cone(5), 'flat', '#ffb13b', [0, 0.1 - i * 0.025, -0.12 - i * 0.12], [-0.25, 0, 0], [0.04, 0.09, 0.03]);
  } else return null;
  return P.build();
}
const TAIL_POS = { fox: V(0, 0.72, -0.66), dino: V(0, 0.62, -0.7) };

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const TEMPLATES = new Map();
function getTemplate(ch, lod) {
  const key = ch.id + ':' + (lod === -1 ? -1 : lod ? 1 : 0);
  let t = TEMPLATES.get(key);
  if (t) return t;
  const q = Q(lod);
  const L = LOOK[ch.species] || LOOK.fox;
  const head = new Parts();
  head.push(HEAD);
  (HEADS[ch.species] || HEADS.fox)(head, ch, L, q);
  const vs = vehicleOf(ch);
  const wheelT = new Map();
  let fork = null;
  for (const wd of vs.wheels) {
    const key = wd.key || wd.W;
    if (!wheelT.has(key)) wheelT.set(key, wd.key === 'ski' ? buildSki(ch, q) : buildWheel(ch, wd.W, q));
    if (wd.rig && !fork) fork = buildFork(ch, wd.W, wd.rig, q);
  }
  t = {
    body: (BODY[ch.vehicle] || BODY.kart)(ch, L, q),
    steer: vs.steer === 'wheel' ? buildSteeringWheel(ch, q) : null,
    bar: vs.steer !== 'wheel' ? buildBar(ch, q, vs.steer === 'bar' ? 0.36 : 0) : null,
    wheel: wheelT, fork,
    glider: buildGlider(ch, L, q),
    torso: buildTorso(ch, L, q),
    head: head.build(),
    sleeve: buildSleeve(ch, L, q),
    hand: buildHand(ch, L, q),
    tail: buildTail(ch, L, q),
  };
  TEMPLATES.set(key, t);
  return t;
}

function meshesInto(parent, parts, ch, list, opts = {}) {
  for (const { mat: key, geo } of parts) {
    const m = new THREE.Mesh(geo, resolveMat(key, ch, opts.paintHex));
    m.userData.matKey = key;
    m.castShadow = key !== 'glass' && key !== 'glow' && key !== 'decal';
    m.receiveShadow = false;
    parent.add(m);
    list.push(m);
  }
}

// shared FX resources
let FX = null;
function fx() {
  if (FX) return FX;
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#7fe8ff') } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = 0.05 + 0.9 * pow(f, 2.4);
        gl_FragColor = vec4(uColor * a, a); }`,
  });
  FX = {
    shieldGeo: new THREE.SphereGeometry(1, 28, 18),
    shieldMat,
    hexGeo: new THREE.IcosahedronGeometry(1.01, 1),
    hexMat: new THREE.MeshBasicMaterial({ color: '#a8f4ff', wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameGeo: new THREE.LatheGeometry([[0.001, -0.12], [0.55, -0.06], [0.85, 0.12], [0.72, 0.38], [0.4, 0.7], [0.001, 1.0]]
      .map(([x, y]) => new THREE.Vector2(x, y)), 8),
    coreMat: new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return FX;
}

// ---------------------------------------------------------------------------
// buildKart
// ---------------------------------------------------------------------------
const FLAME_COLORS = { idle: new THREE.Color('#ff7a1a'), boost: new THREE.Color('#ff9a1f'), d1: new THREE.Color('#3ab0ff'), d2: new THREE.Color('#ff7a1a'), d3: new THREE.Color('#c45cff') };

/**
 * @param {string} charId
 * @param {{lod?: 0|1}} [opts] lod 0 = default detail, lod 1 = lighter (many split viewports / far karts)
 * @returns KartModel { group, update(dt, s), exhaustPoints[2], wheelPoints[4] (RL, RR, FL, FR),
 *   setTint(hex), dispose(), character, charId, nodes{scaleNode,spinNode,bodyNode,driver,headPivot},
 *   tagPoint (above head, follows mega scale), backPoint (behind rear bumper, for trailing items) }
 */
export function buildKart(charId, { lod } = {}) {
  const ch = getCharacter(charId);
  const tpl = getTemplate(ch, lod);
  const L = LOOK[ch.species] || LOOK.fox;
  const meshes = [];
  const F = fx();

  const group = new THREE.Group();
  group.name = 'kart:' + ch.id;
  const scaleNode = new THREE.Group(); group.add(scaleNode);
  const spinNode = new THREE.Group(); scaleNode.add(spinNode);
  const vs = vehicleOf(ch);
  const leanNode = new THREE.Group(); leanNode.name = 'lean'; spinNode.add(leanNode);
  const bodyNode = new THREE.Group(); bodyNode.name = 'body'; leanNode.add(bodyNode);
  meshesInto(bodyNode, tpl.body, ch, meshes);
  const cockpit = new THREE.Group(); cockpit.name = 'cockpit';
  cockpit.position.set(vs.seat[0], vs.seat[1], vs.seat[2]);
  bodyNode.add(cockpit);

  // steering: wheel (karts/cars) or handlebar (bikes, hover, sled)
  let steerWheel = null, bar = null;
  if (tpl.steer) {
    const steerBase = new THREE.Group();
    steerBase.position.copy(SW); steerBase.rotation.x = TILT;
    steerWheel = new THREE.Group(); steerWheel.name = 'steering'; steerBase.add(steerWheel);
    cockpit.add(steerBase);
    meshesInto(steerWheel, tpl.steer, ch, meshes);
  }
  const makeBar = (parent, pos) => {
    bar = new THREE.Group(); bar.name = 'steering';
    bar.position.set(pos[0], pos[1], pos[2]);
    parent.add(bar);
    meshesInto(bar, tpl.bar, ch, meshes);
    for (const sx of [1, -1]) { const m = new THREE.Object3D(); m.position.set(sx * 0.27, 0, 0); bar.add(m); }
  };
  if (vs.steer === 'bar') makeBar(cockpit, [vs.bar[0] - vs.seat[0], vs.bar[1] - vs.seat[1], vs.bar[2] - vs.seat[2]]);

  // wheels (rear first). Two-wheelers lean as a whole, so their wheels live under leanNode.
  const wheels = [];
  const wheelParent = vs.lean > 0.3 ? leanNode : spinNode;
  for (const wd of vs.wheels) {
    const W = wd.W;
    let steerN, spinN;
    if (wd.rig) {
      const rg = wd.rig;
      const headN = new THREE.Group(); headN.position.set(0, rg.H[1], rg.H[2]); headN.rotation.x = rg.rake;
      bodyNode.add(headN);
      steerN = new THREE.Group(); headN.add(steerN);
      meshesInto(steerN, tpl.fork, ch, meshes);
      const off = new THREE.Group(); off.position.y = -rg.len; steerN.add(off);
      spinN = new THREE.Group(); off.add(spinN);
      if (vs.steer === 'rig') makeBar(steerN, [0, rg.barUp, 0]);
    } else {
      steerN = new THREE.Group();
      steerN.position.set(wd.side * W.x, W.r, W.z);
      spinN = new THREE.Group(); steerN.add(spinN);
      wheelParent.add(steerN);
    }
    const holder = new THREE.Group(); holder.name = 'wheel'; holder.scale.x = wd.side; spinN.add(holder);
    meshesInto(holder, tpl.wheel.get(wd.key || W), ch, meshes);
    wheels.push({ steerN, spinN, front: !!wd.front, r: W.r, baseY: W.r, rig: !!wd.rig, spins: !W.ski });
  }
  // contact markers: RL, RR, FL, FR
  const pts = vs.points || (() => {
    const rear = vs.wheels.filter(w => !w.front), front = vs.wheels.filter(w => w.front);
    const pick = (list, side) => { const w = list.find(x => x.W.x === 0) || list.find(x => x.side === side) || list[0]; return [w.W.x === 0 ? 0 : side * w.W.x, w.W.z]; };
    return [pick(rear, 1), pick(rear, -1), pick(front, 1), pick(front, -1)];
  })();
  const wheelPoints = pts.map(([x, z]) => {
    const wp = new THREE.Object3D(); wp.name = 'wheelPoint'; wp.position.set(x, 0, z); spinNode.add(wp); return wp;
  });

  // driver
  const driver = new THREE.Group(); driver.name = 'driver'; cockpit.add(driver);
  meshesInto(driver, tpl.torso, ch, meshes);
  const headPivot = new THREE.Group(); headPivot.name = 'head';
  headPivot.position.copy(NECK);
  driver.add(headPivot);
  meshesInto(headPivot, tpl.head, ch, meshes);
  const arms = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z);
    const sleeve = new THREE.Group(); sleeve.name = 'arm'; pivot.add(sleeve);
    meshesInto(sleeve, tpl.sleeve, ch, meshes);
    const hand = new THREE.Group(); hand.name = 'arm'; pivot.add(hand);
    meshesInto(hand, tpl.hand, ch, meshes);
    hand.scale.x = side;
    driver.add(pivot);
    arms.push({ side, pivot, sleeve, hand, grip: side > 0 ? GRIP[0] : GRIP[1], mark: bar ? bar.children[bar.children.length - (side > 0 ? 2 : 1)] : null });
  }
  let tail = null;
  if (tpl.tail) {
    tail = new THREE.Group(); tail.name = 'tail';
    tail.position.copy(TAIL_POS[ch.species]);
    meshesInto(tail, tpl.tail, ch, meshes);
    cockpit.add(tail);
  }

  // glider (hidden until deployed)
  const glider = new THREE.Group(); glider.name = 'glider';
  glider.position.set(0, 1.12, -0.4);
  glider.visible = false;
  cockpit.add(glider);
  meshesInto(glider, tpl.glider.main, ch, meshes);
  let rotor = null; const wingNodes = [];
  if (tpl.glider.spin) {
    rotor = new THREE.Group(); rotor.position.set(...tpl.glider.spinPos); glider.add(rotor);
    meshesInto(rotor, tpl.glider.spin, ch, meshes);
  }
  if (tpl.glider.wing) {
    for (const sx of [1, -1]) {
      const wn = new THREE.Group(); wn.position.set(sx * tpl.glider.wingPos[0], tpl.glider.wingPos[1], tpl.glider.wingPos[2]);
      wn.scale.x = sx; glider.add(wn); wingNodes.push(wn);
      meshesInto(wn, tpl.glider.wing, ch, meshes);
    }
  }
  for (const m of meshes) if (m.parent === glider || m.parent === rotor || wingNodes.includes(m.parent)) m.castShadow = false;

  // exhaust markers + flames
  const flameMat = new THREE.MeshBasicMaterial({ color: FLAME_COLORS.idle.clone(), transparent: true, opacity: 0.85, depthWrite: false });
  const exhaustPoints = [];
  const flames = [];
  const pDir = vs.pipeDir, pA = vs.pipeA;
  const pLen = ch.vehicle === 'buggy' ? 0.36 : ch.vehicle === 'bike' ? 0.26 : ch.vehicle === 'kart' ? PIPE_LEN : ch.vehicle === 'hover' ? 0.12 : 0.2;
  const pipeRotX = -Math.acos(clamp(pDir.y, -1, 1)); // +Y -> pipe direction
  for (const sx of [1, -1]) {
    const tip = V(sx * pA.x, pA.y, pA.z).addScaledVector(pDir, pLen + 0.02);
    const ep = new THREE.Object3D();
    ep.name = 'exhaustPoint';
    ep.position.copy(tip);
    bodyNode.add(ep);
    exhaustPoints.push(ep);
    const holder = new THREE.Group();
    holder.rotation.x = pipeRotX;
    ep.add(holder);
    const outer = new THREE.Mesh(F.flameGeo, flameMat);
    const core = new THREE.Mesh(F.flameGeo, F.coreMat); core.position.y = 0.02; core.scale.set(0.55, 0.6, 0.55);
    outer.renderOrder = 2; core.renderOrder = 3;
    holder.add(outer, core);
    flames.push(holder);
  }

  // shield bubble
  const shield = new THREE.Group();
  shield.position.y = 0.95;
  const bubble = new THREE.Mesh(F.shieldGeo, F.shieldMat);
  bubble.scale.setScalar(1.55);
  bubble.renderOrder = 5;
  const hex = new THREE.Mesh(F.hexGeo, F.hexMat);
  hex.scale.setScalar(1.56);
  hex.renderOrder = 6;
  shield.add(bubble, hex);
  shield.visible = false;
  scaleNode.add(shield);

  // handy attachment markers
  const tagPoint = new THREE.Object3D(); tagPoint.name = 'tagPoint'; tagPoint.position.set(0, 2.25, -0.3); scaleNode.add(tagPoint);
  const backPoint = new THREE.Object3D(); backPoint.name = 'backPoint'; backPoint.position.set(0, 0.55, -1.55); spinNode.add(backPoint);

  // --- animation state ---
  const st = {
    t: Math.random() * 10, steer: 0, roll: 0, pitch: 0, driftYaw: 0, look: 0,
    mega: 0, shield: 0, celeb: 0, boost: 0, air: 0, squashT: 0, lean: 0, glide: 0, resc: 0,
  };
  const tmp = V(), target = V(), up = V(), dirV = V();
  const qArm = new THREE.Quaternion();

  function update(dt, s = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    st.t += dt;
    const t = st.t;
    const speed = s.speed || 0;
    const smax = s.speedMax || 25;
    const sp01 = clamp(Math.abs(speed) / smax, 0, 1.4);
    const drift = s.drift || 0;
    const finished = !!s.finished;
    st.steer = damp(st.steer, clamp(s.steer || 0, -1, 1), 10, dt);
    st.celeb = damp(st.celeb, finished ? 1 : 0, 5, dt);
    st.boost = damp(st.boost, s.boosting ? 1 : 0, 10, dt);
    st.air = damp(st.air, s.airborne ? 1 : 0, 10, dt);
    st.mega = damp(st.mega, s.mega ? 1 : 0, 4, dt);
    st.shield = damp(st.shield, s.shield ? 1 : 0, 9, dt);

    st.resc = damp(st.resc, s.rescued ? 1 : 0, 6, dt);
    const party = Math.max(st.celeb, st.resc);

    // wheels
    for (const w of wheels) {
      if (w.spins) w.spinN.rotation.x = (w.spinN.rotation.x + (speed / w.r) * dt) % (PI * 2);
      if (w.front) w.steerN.rotation.y = -st.steer * (w.rig ? 0.3 : 0.42) + drift * (w.rig ? 0.1 : 0.18);
      if (!w.rig) w.steerN.position.y = w.baseY - st.air * 0.07;
    }

    // body roll / pitch / bob; two-wheelers & hover lean the whole vehicle into the turn
    const rollT = (-st.steer * 0.075 * Math.min(1, sp01 * 1.6) - drift * 0.12) * vs.roll + (s.lean || 0) * vs.roll;
    st.roll = damp(st.roll, rollT, 8, dt);
    const leanT = (st.steer * Math.min(1, sp01 * 1.4) + drift * 0.6) * vs.lean;
    st.lean = damp(st.lean, clamp(leanT, -0.5, 0.5), 7, dt);
    leanNode.rotation.z = st.lean;
    const pitchT = -st.boost * 0.07 - st.air * 0.06;
    st.pitch = damp(st.pitch, pitchT, 6, dt);
    const bob = ((Math.sin(t * 17) * 0.014 + Math.sin(t * 29.3) * 0.007) * sp01 + Math.sin(t * 5) * 0.004) * (vs.bob || 0.3);
    const hov = vs.hover ? vs.hover + Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.3) * 0.015 - st.air * 0.1 : 0;
    bodyNode.position.y = 0.01 + bob + st.air * 0.03 + hov;
    bodyNode.rotation.set(st.pitch + Math.sin(t * 13) * 0.006 * sp01 * (vs.bob || 0.3) + (vs.hover ? -st.boost * 0.05 : 0), 0, st.roll);

    // drift yaw + spin-out
    st.driftYaw = damp(st.driftYaw, -drift * 0.2, 6, dt);
    const spin = s.spin || 0;
    const spinning = Math.abs(spin) > 0.01 ? 1 : 0;
    spinNode.rotation.set(0, spin + st.driftYaw, spinning * Math.sin(spin * 1.5) * 0.1);

    // scale: mega + squash-and-stretch
    const sq = clamp(s.squash || 0, 0, 1);
    const mg = 1 + 0.6 * st.mega * st.mega * (3 - 2 * st.mega);
    const jig = sq > 0 ? Math.sin(t * 38) * 0.08 * sq : 0;
    scaleNode.scale.set(mg * (1 + 0.32 * sq - jig * 0.5), mg * (1 - 0.48 * sq + jig), mg * (1 + 0.32 * sq - jig * 0.5));

    // steering wheel / handlebar
    const wheelAng = st.steer * 1.15 * (1 - st.celeb);
    if (steerWheel) steerWheel.rotation.z = wheelAng;
    if (bar && vs.steer === 'bar') bar.rotation.y = -st.steer * 0.35;

    // driver: bounce + head look
    driver.position.y = party * Math.abs(Math.sin(t * 7)) * 0.12;
    const lookT = (-st.steer * 0.45 - drift * 0.18) * (1 - party);
    st.look = damp(st.look, lookT, 7, dt);
    headPivot.rotation.y = st.look + st.celeb * Math.sin(t * 3.2) * 0.35 + st.resc * Math.sin(t * 9) * 0.45;
    headPivot.rotation.z = st.steer * 0.12 + spinning * Math.sin(t * 16) * 0.22 + st.celeb * Math.sin(t * 7) * 0.08 + st.resc * Math.cos(t * 9) * 0.2;
    headPivot.rotation.x = -st.boost * 0.12 + bob * 1.5 - st.celeb * 0.15;

    // arms (IK-lite: aim pivot at grip / celebrate pose)
    if (bar) group.updateMatrixWorld(true);
    for (const a of arms) {
      if (a.mark) { a.mark.getWorldPosition(tmp); driver.worldToLocal(tmp); }
      else { tmp.copy(a.grip).applyAxisAngle(AZ, wheelAng).applyAxisAngle(AX, TILT).add(SW); tmp.y -= driver.position.y; }
      up.set(a.side * (0.5 + Math.sin(t * 9 + a.side) * 0.08), SHOULDER.y + 0.62, SHOULDER.z + 0.12);
      target.copy(tmp).lerp(up, party);
      dirV.copy(target).sub(a.pivot.position);
      const dist = dirV.length();
      dirV.multiplyScalar(1 / dist);
      qArm.setFromUnitVectors(AZ, dirV);
      a.pivot.quaternion.copy(qArm);
      a.sleeve.scale.z = dist / ARM_REF;
      a.hand.position.z = dist;
    }

    // glider: pop open (~0.3 s, overshoot) / fold away (~0.25 s)
    st.glide = clamp(st.glide + (s.gliding ? dt / 0.3 : -dt / 0.25), 0, 1);
    glider.visible = st.glide > 0.001;
    if (glider.visible) {
      const g = st.glide;
      const e = s.gliding ? 1 + 2.4 * Math.pow(g - 1, 3) + 1.4 * Math.pow(g - 1, 2) : g * g;
      glider.scale.setScalar(Math.max(0.001, e));
      glider.rotation.set((1 - g) * 1.1 + Math.sin(t * 1.7) * 0.05 * g, Math.sin(t * 0.9) * 0.05 * g, Math.sin(t * 2.1) * 0.08 * g - st.lean * 0.5);
      if (rotor) rotor.rotation.y += dt * 26 * g;
      for (let i = 0; i < wingNodes.length; i++) wingNodes[i].rotation.z = (0.15 + Math.sin(t * 6.5) * 0.28) * g * (i ? -1 : 1);
    }

    if (tail) {
      tail.rotation.y = Math.sin(t * (5 + sp01 * 4)) * 0.28 + st.steer * 0.35 + st.celeb * Math.sin(t * 12) * 0.3;
      tail.rotation.x = -sp01 * 0.15;
    }

    // exhaust flames
    const lvl = s.drift ? (s.driftLevel || 0) : 0;
    let len, wid;
    if (st.boost > 0.05) {
      flameMat.color.copy(FLAME_COLORS.boost);
      len = 0.25 + st.boost * 0.6; wid = 0.06 + st.boost * 0.06;
    } else if (lvl > 0) {
      flameMat.color.copy(lvl >= 3 ? FLAME_COLORS.d3 : lvl === 2 ? FLAME_COLORS.d2 : FLAME_COLORS.d1);
      len = 0.2 + lvl * 0.06; wid = 0.06;
    } else {
      flameMat.color.copy(FLAME_COLORS.idle);
      len = 0.08 + sp01 * 0.14; wid = 0.045;
    }
    flameMat.opacity = 0.75 + st.boost * 0.2;
    for (let i = 0; i < flames.length; i++) {
      const fl = 0.78 + 0.44 * Math.abs(Math.sin(t * 47 + i * 2.1) * Math.sin(t * 23.7 + i));
      flames[i].scale.set(wid * (0.9 + 0.2 * fl), len * fl, wid * (0.9 + 0.2 * fl));
    }

    // shield
    shield.visible = st.shield > 0.02;
    if (shield.visible) {
      const pop = st.shield * (1 + Math.sin(t * 6) * 0.025);
      shield.scale.set(pop * (1 + Math.sin(t * 4.3) * 0.02), pop, pop * (1 + Math.cos(t * 3.7) * 0.02));
      hex.rotation.y = t * 0.6; hex.rotation.x = t * 0.25;
    }
  }

  function setTint(hexColor) {
    const hexStr = '#' + new THREE.Color(hexColor).getHexString();
    for (const m of meshes) if (m.userData.matKey === 'paint') m.material = paintMat(hexStr);
  }

  function dispose() {
    group.removeFromParent();
    flameMat.dispose();
  }

  update(0, {});
  return {
    group, update, exhaustPoints, wheelPoints, setTint, dispose,
    character: ch, charId: ch.id,
    vehicle: ch.vehicle || 'kart', glider: ch.glider,
    nodes: { scaleNode, spinNode, leanNode, bodyNode, cockpit, driver, headPivot, glider },
    tagPoint, backPoint,
  };
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------
function buildPortraitModel(ch) {
  const L = LOOK[ch.species] || LOOK.fox;
  const q = Q(-1);
  const g = new THREE.Group();
  const list = [];
  const torso = buildTorso(ch, L, q, { portrait: true });
  meshesInto(g, torso, ch, list);
  const tpl = getTemplate(ch, -1);
  const hp = new THREE.Group();
  hp.position.copy(NECK);
  hp.rotation.set(0.05, 0.12, 0.04);
  meshesInto(hp, tpl.head, ch, list);
  g.add(hp);
  return { g, torso, hp };
}

export async function renderPortraits(size = 128) {
  const out = {};
  if (typeof document === 'undefined') return out;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    console.warn('[characters] portraits unavailable', e);
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a6080', 0.9));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6); key.position.set(1.6, 2.4, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight('#bcd4ff', 1.0); fill.position.set(-2.4, 0.6, 1.6); scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 2.4); rim.position.set(-0.8, 1.8, -2.6); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);

  for (const ch of CHARACTERS) {
    const { g, torso, hp } = buildPortraitModel(ch);
    g.updateMatrixWorld(true);
    scene.add(g);
    // frame the head: centre a bit below the head centre, fit by head bounds
    const hc = V(NECK.x + HEAD[0], NECK.y + HEAD[1], NECK.z + HEAD[2]);
    const box = new THREE.Box3().setFromObject(hp);
    const top = Math.min(box.max.y + 0.04, hc.y + 0.78);
    const bottom = hc.y - 0.6;
    const cy = (top + bottom) / 2;
    const h = Math.max(top - bottom, 1.22);
    const dist = (h / 2) / Math.tan((cam.fov * PI) / 360) * 1.08;
    const dir = V(0.32, 0.12, 1).normalize();
    cam.position.set(hc.x + dir.x * dist, cy + dir.y * dist, hc.z + dir.z * dist);
    cam.lookAt(hc.x, cy, hc.z);
    renderer.render(scene, cam);
    out[ch.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(g);
    for (const p of torso) p.geo.dispose();
    await new Promise((r) => setTimeout(r, 0));
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}

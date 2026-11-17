// Builds the 3D world for a track: road, curbs, offroad, walls, features, decor, sky & lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const THEMES = {
  meadow: { skyTop: '#2f7fe6', skyMid: '#7cc0ff', skyBottom: '#d9f1ff', fog: '#c9e7ff', fogNear: 160, fogFar: 720, sun: '#fff1d0', sunI: 2.9, hemiSky: '#d6ecff', hemiGround: '#4f7d33', hemiI: 1.15, envI: 0.45, ground: '#5fb043', exposure: 1.0 },
  desert: { skyTop: '#3a7bd5', skyMid: '#f2b880', skyBottom: '#ffe3b3', fog: '#f6d2a0', fogNear: 140, fogFar: 640, sun: '#ffe0b0', sunI: 3.2, hemiSky: '#ffe8c8', hemiGround: '#a8743d', hemiI: 1.0, envI: 0.45, ground: '#e6b874', exposure: 1.0 },
  snow: { skyTop: '#5b8fd6', skyMid: '#b9d6f5', skyBottom: '#f2f7ff', fog: '#e4eefa', fogNear: 110, fogFar: 520, sun: '#ffffff', sunI: 2.4, hemiSky: '#eaf3ff', hemiGround: '#9fb5cc', hemiI: 1.3, envI: 0.55, ground: '#eef4fb', exposure: 0.95 },
  neon: { skyTop: '#05020f', skyMid: '#1c0b3a', skyBottom: '#4a1361', fog: '#1a0b2e', fogNear: 120, fogFar: 600, sun: '#b9c8ff', sunI: 1.6, hemiSky: '#9b7bff', hemiGround: '#2a1640', hemiI: 1.7, envI: 1.1, ground: '#120f1d', exposure: 1.1 },
};

function rngf(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

const BASE_Y = -0.3;

// ---------- geometry helpers ----------
// Extrude a cross-section profile along the track. profile: [[latOffset, height], ...] (lat relative to `baseLat(i)`),
// side: +1 right / -1 left. uv: { mode:'along'|'world', along: meters per v, scale }
function extrude(geo, baseLat, profile, side, { alongTile = 8, worldUV = 0, yBase = null, jitter = 0, seed = 1, latScale = null } = {}) {
  const N = geo.N, P = profile.length;
  const pos = new Float32Array((N + 1) * P * 3), uv = new Float32Array((N + 1) * P * 2);
  const r = rngf(seed);
  const jit = jitter ? Array.from({ length: N * P }, () => (r() - 0.5) * jitter) : null;
  let dist = 0;
  for (let ii = 0; ii <= N; ii++) {
    const i = ii % N;
    if (ii > 0) dist += Math.hypot(geo.x[i] - geo.x[(i - 1 + N) % N], geo.z[i] - geo.z[(i - 1 + N) % N]);
    const bl = baseLat(i);
    for (let p = 0; p < P; p++) {
      const [lo, h] = profile[p];
      const ls = latScale ? latScale(i, p) : 1;
      const lat = side * (bl + lo * ls);
      const j = jit ? jit[i * P + p] : 0;
      const y = (yBase ? yBase(i, p) : geo.y[i]) + h + (h > 0.05 ? j * 0.6 : 0);
      const x = geo.x[i] + geo.rx[i] * (lat + j * side), z = geo.z[i] + geo.rz[i] * (lat + j * side);
      const k = (ii * P + p);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      if (worldUV) { uv[k * 2] = x / worldUV; uv[k * 2 + 1] = z / worldUV; }
      else { uv[k * 2] = p / (P - 1); uv[k * 2 + 1] = dist / alongTile; }
    }
  }
  const idx = [];
  for (let ii = 0; ii < N; ii++) for (let p = 0; p < P - 1; p++) {
    const a = ii * P + p, b = a + 1, c = a + P, d = c + 1;
    if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- decor part library ----------
function partLib(theme) {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
  const L = {};
  L.trunk = { geo: new THREE.CylinderGeometry(0.28, 0.45, 3.2, 6).translate(0, 1.6, 0), mat: std('#8a5a33') };
  L.canopy = { geo: new THREE.IcosahedronGeometry(2.4, 1).scale(1, 0.9, 1).translate(0, 4.6, 0), mat: std('#ffffff') };
  L.canopy2 = { geo: new THREE.IcosahedronGeometry(1.6, 1).translate(1.2, 5.6, 0.4), mat: std('#ffffff') };
  L.pineTrunk = { geo: new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(0, 1, 0), mat: std('#6d4426') };
  L.pine = {
    geo: mergeGeometries([
      new THREE.ConeGeometry(2.6, 3.4, 7).translate(0, 3.2, 0),
      new THREE.ConeGeometry(2.0, 3.0, 7).translate(0, 5.0, 0),
      new THREE.ConeGeometry(1.3, 2.6, 7).translate(0, 6.6, 0),
    ]), mat: std('#ffffff'),
  };
  L.pineSnow = {
    geo: mergeGeometries([
      new THREE.ConeGeometry(1.5, 1.2, 7).translate(0, 4.15, 0),
      new THREE.ConeGeometry(1.0, 1.1, 7).translate(0, 5.8, 0),
      new THREE.ConeGeometry(0.7, 1.2, 7).translate(0, 7.4, 0),
    ]), mat: std('#ffffff'),
  };
  L.bush = { geo: new THREE.IcosahedronGeometry(1.2, 0).scale(1.2, 0.8, 1.2).translate(0, 0.6, 0), mat: std('#ffffff') };
  L.rock = { geo: new THREE.DodecahedronGeometry(1, 0).scale(1.2, 0.8, 1).translate(0, 0.4, 0), mat: std('#ffffff') };
  L.flower = { geo: new THREE.SphereGeometry(0.22, 6, 4).translate(0, 0.35, 0), mat: std('#ffffff', { flatShading: false, roughness: 0.6 }) };
  L.cactus = {
    geo: mergeGeometries([
      new THREE.CapsuleGeometry(0.55, 4.2, 3, 8).translate(0, 2.6, 0),
      new THREE.CapsuleGeometry(0.35, 1.4, 3, 8).translate(1.0, 3.2, 0),
      new THREE.CapsuleGeometry(0.33, 0.9, 3, 8).rotateZ(Math.PI / 2).translate(0.6, 2.4, 0),
      new THREE.CapsuleGeometry(0.33, 1.2, 3, 8).translate(-0.95, 2.6, 0),
      new THREE.CapsuleGeometry(0.3, 0.7, 3, 8).rotateZ(Math.PI / 2).translate(-0.55, 2.0, 0),
    ]), mat: std('#4f9a4a'),
  };
  L.mesa = {
    geo: mergeGeometries([
      new THREE.CylinderGeometry(26, 32, 18, 8).translate(0, 9, 0),
      new THREE.CylinderGeometry(22, 25, 16, 8).translate(0, 26, 0),
      new THREE.CylinderGeometry(19, 21, 8, 8).translate(0, 38, 0),
    ]), mat: std('#c46a3a'),
  };
  L.dune = { geo: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat: std('#efc88c', { flatShading: false }) };
  L.palmTrunk = { geo: new THREE.CylinderGeometry(0.25, 0.4, 7, 6).translate(0, 3.5, 0), mat: std('#9a6b3c') };
  L.palmLeaves = {
    geo: mergeGeometries(Array.from({ length: 6 }, (_, i) => new THREE.ConeGeometry(0.6, 4, 4).scale(1, 1, 0.25).rotateX(Math.PI / 2.3).translate(0, 0, 2).rotateY(i * Math.PI / 3).translate(0, 7, 0))),
    mat: std('#3f9a3c'),
  };
  L.snowman = {
    geo: mergeGeometries([
      new THREE.SphereGeometry(1.2, 10, 8).translate(0, 1.1, 0),
      new THREE.SphereGeometry(0.85, 10, 8).translate(0, 2.7, 0),
      new THREE.SphereGeometry(0.6, 10, 8).translate(0, 3.9, 0),
    ]), mat: std('#ffffff', { flatShading: false, roughness: 0.6 }),
  };
  L.snowmanNose = { geo: new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(Math.PI / 2).translate(0, 3.9, 0.85), mat: std('#ff7a1a') };
  L.snowmanHat = { geo: new THREE.CylinderGeometry(0.45, 0.45, 0.7, 10).translate(0, 4.65, 0), mat: std('#222428') };
  L.mountain = { geo: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), mat: std('#ffffff') };
  L.mountainCap = { geo: new THREE.ConeGeometry(0.42, 0.42, 7).translate(0, 0.79, 0), mat: std('#ffffff') };
  L.cabin = {
    geo: mergeGeometries([
      new THREE.BoxGeometry(6, 3.5, 5).translate(0, 1.75, 0),
    ]), mat: std('#8b5634'),
  };
  L.cabinRoof = { geo: new THREE.CylinderGeometry(0.01, 4.6, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.8).translate(0, 4.8, 0), mat: std('#f4f8ff') };
  L.lamp = { geo: new THREE.CylinderGeometry(0.12, 0.16, 6, 6).translate(0, 3, 0), mat: std('#3b3550', { metalness: 0.5, roughness: 0.4 }) };
  L.lampBulb = { geo: new THREE.SphereGeometry(0.45, 10, 8).translate(0, 6.1, 0), mat: new THREE.MeshBasicMaterial({ color: '#ffffff' }) };
  L.crowd = { geo: new THREE.CapsuleGeometry(0.28, 0.5, 2, 6).translate(0, 0.55, 0), mat: std('#ffffff', { flatShading: false }) };
  return L;
}

class Scatter {
  constructor(lib) { this.lib = lib; this.items = new Map(); }
  add(key, x, y, z, ry = 0, s = 1, color = null, sy = null) {
    if (!this.items.has(key)) this.items.set(key, []);
    this.items.get(key).push({ x, y, z, ry, s, sy: sy ?? s, color });
  }
  build(group, { castShadow = true } = {}) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [key, list] of this.items) {
      const part = this.lib[key];
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((it, i) => {
        e.set(0, it.ry, 0); q.setFromEuler(e); v.set(it.x, it.y, it.z); sc.set(it.s, it.sy, it.s);
        m.compose(v, q, sc); im.setMatrixAt(i, m);
        im.setColorAt(i, c.set(it.color || '#ffffff'));
      });
      im.castShadow = castShadow && key !== 'flower' && key !== 'mountain' && key !== 'mountainCap' && key !== 'mesa' && key !== 'dune';
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

// ---------- main builder ----------
export function buildWorld(race, renderer) {
  const def = race.def, geo = race.geo, theme = THEMES[def.theme] ? def.theme : 'meadow';
  const th = THEMES[theme];
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new THREE.Color(th.skyBottom);
  const world = { scene, theme, th, animated: [], boxes: [], startLights: [], pads: [], dispose: [] };
  const r = rngf(def.id.length * 131 + 7);

  // environment map for nicer kart shading
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyCol = new THREE.Color(th.skyMid), gCol = new THREE.Color(th.hemiGround);
    const envGeo = new THREE.SphereGeometry(10, 16, 8);
    const cols = [];
    const p = envGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) / 10 + 1) / 2; const cc = gCol.clone().lerp(skyCol, t).multiplyScalar(0.6 + t); cols.push(cc.r, cc.g, cc.b); }
    envGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const light = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    light.position.set(5, 7, 3); envScene.add(light);
    const rt = pm.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = th.envI;
    pm.dispose();
  }

  // ---- lights
  const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(th.sun, th.sunI);
  const cx = (geo.minX + geo.maxX) / 2, cz = (geo.minZ + geo.maxZ) / 2;
  const ext = Math.max(geo.maxX - geo.minX, geo.maxZ - geo.minZ) / 2 + 40;
  sun.position.set(cx + 120, 220, cz + 90);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.8; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  world.sun = sun;

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(th.skyTop) }, mid: { value: new THREE.Color(th.skyMid) }, bot: { value: new THREE.Color(th.skyBottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0),0.8)) : mix(mid, bot, clamp(-h*6.0,0.0,1.0)); c = mix(bot, c, smoothstep(-0.02, 0.18, h)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  sky.onBeforeRender = (rr, s, cam) => sky.position.copy(cam.position);
  scene.add(sky);

  // sun / moon disc
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(theme === 'neon' ? 60 : 45, 32), new THREE.MeshBasicMaterial({ color: theme === 'neon' ? '#ffd6f7' : '#fff8d8', fog: false, transparent: true, opacity: theme === 'neon' ? 0.95 : 0.9 }));
  const sunDir = sun.position.clone().sub(sun.target.position).normalize();
  sunDisc.onBeforeRender = (rr, s, cam) => { sunDisc.position.copy(cam.position).addScaledVector(sunDir, 1500); sunDisc.lookAt(cam.position); };
  sunDisc.frustumCulled = false; sunDisc.renderOrder = -9;
  scene.add(sunDisc);

  // ---- ground
  const gtex = T.groundTexture(theme).clone(); gtex.needsUpdate = true; gtex.repeat.set(160, 160);
  const groundMat = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95, color: '#ffffff' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(cx, BASE_Y, cz);
  ground.receiveShadow = true;
  scene.add(ground);
  // ground uses repeat 160 over 3000m → 18.75m per tile; match shoulder world UV
  const worldTile = 3000 / 160;

  const hw = (i) => geo.w[i];
  const wall = (i) => geo.w[i] + geo.shoulder;
  // ---- road
  const roadMat = new THREE.MeshStandardMaterial({ map: T.roadTexture(theme), roughness: theme === 'neon' ? 0.35 : 0.9, metalness: theme === 'neon' ? 0.4 : 0 });
  const roadGeo = extrude(geo, () => 0, [[-1, 0.02], [1, 0.02]], 1, { alongTile: 16, latScale: (i) => hw(i) });
  const road = new THREE.Mesh(roadGeo, roadMat); road.receiveShadow = true; scene.add(road);

  // ---- curbs
  const curbMat = new THREE.MeshStandardMaterial({ map: T.curbTexture(theme), roughness: 0.7, emissive: theme === 'neon' ? '#ffffff' : '#000000', emissiveMap: theme === 'neon' ? T.curbTexture(theme) : null, emissiveIntensity: theme === 'neon' ? 0.9 : 0 });
  for (const side of [-1, 1]) {
    const cg = extrude(geo, hw, [[-0.05, 0.03], [0.9, 0.12], [1.5, 0.04]], side, { alongTile: 8 });
    const m = new THREE.Mesh(cg, curbMat); m.receiveShadow = true; scene.add(m);
  }
  // ---- shoulder (offroad) + skirt
  const shoulderMat = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const sg = extrude(geo, hw, [[1.4, 0.0], [geo.shoulder + 0.8, -0.02]], side, { worldUV: worldTile });
    const m = new THREE.Mesh(sg, shoulderMat); m.receiveShadow = true; scene.add(m);
    // skirt down to ground; clamp length on the inside of curves
    const skirtLen = (i) => {
      const k = geo.curvSmooth[i] * side; // >0 → this side is the inner side
      const L = Math.max(5, (geo.y[i] - BASE_Y) * 5);
      if (k > 1e-4) return Math.max(0.5, Math.min(L, 1 / k - wall(i) - 4));
      return L;
    };
    const kg = extrude(geo, wall, [[0.8, -0.02], [1, 0]], side, {
      worldUV: worldTile,
      latScale: (i, p) => p === 0 ? 1 : skirtLen(i),
      yBase: (i, p) => p === 0 ? geo.y[i] : BASE_Y - 0.05,
    });
    // fix profile: second column offset = skirtLen (lo*ls with lo=1)
    const km = new THREE.Mesh(kg, shoulderMat); km.receiveShadow = true; scene.add(km);
  }

  // ---- walls
  buildWalls(world, geo, theme, wall, r);

  // ---- start line + gantry
  buildStart(world, geo, theme);

  // ---- boost pads
  const padTex = T.boostPadTexture();
  for (const p of race.pads) {
    const t = padTex.clone(); t.needsUpdate = true; t.repeat.set(1, p.len / 5);
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.4, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, p.len).rotateX(-Math.PI / 2).translate(0, 0, p.len / 2), mat);
    m.position.set(p.x, p.y + 0.05, p.z); m.rotation.y = p.heading;
    scene.add(m); world.pads.push(t);
  }
  // ---- ramps
  const rampTex = T.rampTexture();
  for (const rp of race.ramps) {
    const w = rp.hw * 2 + 2, len = rp.len, h = 1.0;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, h), new THREE.Vector2(len - 0.4, h)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6 });
    const m = new THREE.Mesh(g, mat);
    m.position.set(rp.x, rp.y, rp.z); m.rotation.y = rp.heading;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    // arrow sign
    // gantry with a JUMP! banner across the road
    const gw = rp.hw + 2;
    const gantry = new THREE.Group();
    gantry.position.set(rp.x, rp.y, rp.z); gantry.rotation.y = rp.heading;
    const postMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 });
    for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7.5, 8).translate(0, 3.75, 0), postMat); post.position.x = sd * gw; post.castShadow = true; gantry.add(post); }
    const bTex = T.bannerTexture('JUMP!', '#1d4fd8');
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, 1.8), new THREE.MeshBasicMaterial({ map: bTex, side: THREE.DoubleSide }));
    banner.position.y = 6.6; banner.rotation.y = Math.PI;
    gantry.add(banner);
    scene.add(gantry);
  }

  // ---- item crystals
  const crystalGeo = new THREE.OctahedronGeometry(1.35, 0);
  const starTex = T.crystalTexture();
  for (const b of race.boxes) {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive: '#6af', emissiveIntensity: 0.9, flatShading: true });
    const c = new THREE.Mesh(crystalGeo, mat);
    c.castShadow = true;
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthWrite: false, transparent: true }));
    star.scale.set(1.4, 1.4, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.particleTexture(), color: '#bfe9ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    glow.scale.set(5, 5, 1);
    g.add(c, star, glow);
    g.position.set(b.x, b.y + 1.5, b.z);
    scene.add(g);
    world.boxes.push({ box: b, g, c, mat, phase: r() * 6, pop: 1 });
  }

  // ---- decor
  buildDecor(world, race, theme, r);

  return world;
}

function buildWalls(world, geo, theme, wall, r) {
  const scene = world.scene;
  if (theme === 'meadow') {
    const tex = T.curbTexture('meadow');
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const g = extrude(geo, wall, [[-0.45, 0], [-0.45, 0.9], [-0.2, 1.1], [0.45, 1.1], [0.45, 0]], side, { alongTile: 4 });
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  } else if (theme === 'desert') {
    const mat = new THREE.MeshStandardMaterial({ color: '#c47a45', roughness: 1, flatShading: true });
    for (const side of [-1, 1]) {
      const g0 = extrude(geo, wall, [[-0.6, -0.1], [-0.3, 1.6], [0.4, 2.6], [1.4, 2.2], [2.2, 0]], side, { alongTile: 6, jitter: 0.9, seed: side + 5 });
      const g = g0.toNonIndexed(); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  } else if (theme === 'snow') {
    const mat = new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.75 });
    for (const side of [-1, 1]) {
      const g = extrude(geo, wall, [[-0.8, -0.05], [-0.4, 0.8], [0.3, 1.35], [1.2, 1.1], [2.0, 0]], side, { alongTile: 6, jitter: 0.35, seed: side + 9 });
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  } else {
    const base = new THREE.MeshStandardMaterial({ color: '#1a1530', roughness: 0.4, metalness: 0.6 });
    const glowA = new THREE.MeshBasicMaterial({ color: '#22e9ff' });
    const glowB = new THREE.MeshBasicMaterial({ color: '#ff2fd0' });
    for (const side of [-1, 1]) {
      const g = extrude(geo, wall, [[-0.3, 0], [-0.3, 0.7], [0.3, 0.7], [0.3, 0]], side, { alongTile: 6 });
      const m = new THREE.Mesh(g, base); m.receiveShadow = true; scene.add(m);
      const rail = extrude(geo, wall, [[-0.32, 0.72], [-0.32, 0.92], [0.0, 0.98], [0.32, 0.92]], side, { alongTile: 6 });
      scene.add(new THREE.Mesh(rail, side > 0 ? glowA : glowB));
    }
  }
}

function buildStart(world, geo, theme) {
  const scene = world.scene;
  const p = { x: geo.x[0], z: geo.z[0], y: geo.y[0] };
  const heading = Math.atan2(geo.tx[0], geo.tz[0]);
  const w = geo.w[0] * 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: T.checkerTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  line.position.set(p.x, p.y + 0.04, p.z); line.rotation.y = heading; line.receiveShadow = true;
  scene.add(line);
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z); g.rotation.y = heading;
  const colors = { meadow: '#e8333a', desert: '#e2762b', snow: '#2f7fe0', neon: '#ff2fd0' };
  const pillarMat = new THREE.MeshStandardMaterial({ color: theme === 'neon' ? '#221b38' : '#f2f2f2', roughness: 0.5, metalness: 0.2 });
  const span = geo.w[0] + geo.shoulder - 1;
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2).translate(0, 4.5, 0), pillarMat);
    pil.position.x = s * span; pil.castShadow = true; g.add(pil);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.2, 2.2, 1.0), pillarMat);
  beam.position.y = 9; beam.castShadow = true; g.add(beam);
  for (const s of [1, -1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1, 2), new THREE.MeshBasicMaterial({ map: T.bannerTexture('PARTY KARTS', colors[theme]) }));
    banner.position.set(0, 9, s * 0.52); if (s < 0) banner.rotation.y = Math.PI; g.add(banner);
  }
  // start lights
  for (let i = 0; i < 3; i++) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.8), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }));
    housing.position.set((i - 1) * 2, 11.2, 0);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: '#330000' }));
    bulb.position.set((i - 1) * 2, 11.2, -0.42); bulb.rotation.y = Math.PI;
    g.add(housing, bulb);
    world.startLights.push(bulb);
  }
  scene.add(g);
}

function nearTrack(geo, x, z) {
  const p = geo.project(x, z, -1);
  return p;
}

function buildDecor(world, race, theme, r) {
  const geo = race.geo, scene = world.scene;
  const lib = partLib(theme);
  const S = new Scatter(lib);
  const cx = (geo.minX + geo.maxX) / 2, cz = (geo.minZ + geo.maxZ) / 2;
  const span = Math.max(geo.maxX - geo.minX, geo.maxZ - geo.minZ) / 2;
  const groundAt = (x, z, p) => {
    const d = Math.abs(p.lat) - (p.hw + geo.shoulder);
    return Math.max(BASE_Y, p.y - Math.max(0, d) / 5);
  };
  const place = (count, minD, maxD, fn) => {
    let n = 0, tries = 0;
    while (n < count && tries < count * 30) {
      tries++;
      const x = cx + (r() * 2 - 1) * (span + maxD), z = cz + (r() * 2 - 1) * (span + maxD);
      const p = nearTrack(geo, x, z);
      const d = Math.abs(p.lat) - (p.hw + geo.shoulder);
      if (d < minD || d > maxD) continue;
      fn(x, groundAt(x, z, p), z, d, p);
      n++;
    }
  };
  const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l).getStyle();

  if (theme === 'meadow') {
    place(170, 4, 70, (x, y, z) => {
      const s = 0.8 + r() * 0.7;
      if (r() < 0.6) { S.add('trunk', x, y, z, r() * 6, s); S.add('canopy', x, y, z, r() * 6, s, hsl(0.27 + r() * 0.08, 0.55, 0.38 + r() * 0.12)); if (r() < 0.6) S.add('canopy2', x, y, z, r() * 6, s, hsl(0.25 + r() * 0.08, 0.55, 0.42 + r() * 0.1)); }
      else { S.add('pineTrunk', x, y, z, 0, s); S.add('pine', x, y, z, r() * 6, s, hsl(0.36, 0.5, 0.28 + r() * 0.08)); }
    });
    place(140, 2, 40, (x, y, z) => S.add('bush', x, y, z, r() * 6, 0.6 + r() * 0.9, hsl(0.28 + r() * 0.06, 0.55, 0.35 + r() * 0.1)));
    place(600, 1.5, 50, (x, y, z) => S.add('flower', x, y, z, 0, 0.8 + r() * 0.6, ['#ff5a7a', '#ffd23f', '#ffffff', '#b58cff', '#ff9a3c'][Math.floor(r() * 5)]));
    place(40, 3, 60, (x, y, z) => S.add('rock', x, y, z, r() * 6, 0.6 + r() * 1.4, hsl(0.1, 0.05, 0.5 + r() * 0.15)));
    // distant hills
    place(26, 110, 260, (x, y, z) => S.add('dune', x, BASE_Y - 2, z, r() * 6, 40 + r() * 50, hsl(0.28 + r() * 0.05, 0.45, 0.36 + r() * 0.1), 14 + r() * 22));
    // windmills
    for (let i = 0; i < 3; i++) place(1, 25, 60, (x, y, z) => world.animated.push(windmill(scene, x, y, z, r)));
    // balloons
    for (let i = 0; i < 6; i++) {
      const b = balloon(['#ff4d6d', '#ffd23f', '#4dd2ff', '#9b6bff', '#5be37a', '#ff9a3c'][i]);
      const a = r() * Math.PI * 2, d = span * (0.5 + r() * 0.9);
      b.position.set(cx + Math.cos(a) * d, 45 + r() * 50, cz + Math.sin(a) * d);
      scene.add(b);
      const base = b.position.clone(), ph = r() * 6;
      world.animated.push((t) => { b.position.y = base.y + Math.sin(t * 0.4 + ph) * 4; b.position.x = base.x + Math.sin(t * 0.05 + ph) * 20; });
    }
    clouds(world, cx, cz, span, 22, r, 1);
    lake(scene, geo, r, '#3aa7e8', 0.85, world);
  } else if (theme === 'desert') {
    place(110, 3, 60, (x, y, z) => S.add('cactus', x, y, z, r() * 6, 0.7 + r() * 0.7, hsl(0.32 + r() * 0.05, 0.45, 0.32 + r() * 0.1)));
    place(90, 2, 70, (x, y, z) => S.add('rock', x, y, z, r() * 6, 0.6 + r() * 2.2, hsl(0.06 + r() * 0.03, 0.5, 0.45 + r() * 0.12)));
    place(40, 20, 120, (x, y, z) => S.add('dune', x, BASE_Y - 1, z, r() * 6, 12 + r() * 20, hsl(0.09, 0.6, 0.66 + r() * 0.08), 3 + r() * 5));
    place(14, 120, 320, (x, y, z) => S.add('mesa', x, BASE_Y, z, r() * 6, 0.8 + r() * 0.9, hsl(0.04 + r() * 0.03, 0.55, 0.42 + r() * 0.1), 0.8 + r() * 1.2));
    place(30, 4, 30, (x, y, z) => { S.add('palmTrunk', x, y, z, r() * 6, 0.8 + r() * 0.4); S.add('palmLeaves', x, y, z, r() * 6, 0.8 + r() * 0.4); });
    clouds(world, cx, cz, span, 6, r, 0.7);
    lake(scene, geo, r, '#2fb6c9', 0.9, world);
  } else if (theme === 'snow') {
    place(220, 3, 80, (x, y, z) => {
      const s = 0.8 + r() * 0.9;
      S.add('pineTrunk', x, y, z, 0, s); S.add('pine', x, y, z, r() * 6, s, hsl(0.4, 0.45, 0.2 + r() * 0.08)); S.add('pineSnow', x, y, z, 0, s, '#ffffff');
    });
    place(16, 3, 25, (x, y, z) => { const ry = r() * 6; S.add('snowman', x, y, z, ry, 0.9); S.add('snowmanNose', x, y, z, ry, 0.9); S.add('snowmanHat', x, y, z, ry, 0.9); });
    place(50, 2, 50, (x, y, z) => S.add('rock', x, y, z, r() * 6, 0.6 + r() * 1.5, hsl(0.6, 0.1, 0.5 + r() * 0.1)));
    place(8, 12, 40, (x, y, z) => { const ry = r() * 6; S.add('cabin', x, y, z, ry, 1); S.add('cabinRoof', x, y, z, ry, 1); });
    place(22, 140, 360, (x, y, z) => { const s = 120 + r() * 140; S.add('mountain', x, BASE_Y, z, r() * 6, s, hsl(0.6, 0.15, 0.45 + r() * 0.12), s * (0.6 + r() * 0.5)); S.add('mountainCap', x, BASE_Y, z, 0, s * 1.001, '#ffffff', s * (0.6 + r() * 0.5)); });
    clouds(world, cx, cz, span, 14, r, 0.8);
    lake(scene, geo, r, '#bfe3ff', 0.95, world, true);
    world.weather = 'snow';
  } else {
    // neon city
    const bgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mats = [0, 1, 2, 3, 4, 5].map(i => {
      const t = T.windowTexture(i + 1, [280, 190, 320, 210, 260, 170][i]);
      return new THREE.MeshStandardMaterial({ color: '#1a1828', map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.5, metalness: 0.3 });
    });
    const buildings = [];
    place(120, 6, 140, (x, y, z, d) => buildings.push({ x, y, z, w: 10 + r() * 14, d: 10 + r() * 14, h: 14 + r() * (d > 40 ? 90 : 40), m: Math.floor(r() * 6), ry: r() * 6 }));
    for (const m of mats) {
      const list = buildings.filter(b => b.m === mats.indexOf(m));
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(bgeo, m, list.length);
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((b, i) => {
        q.setFromEuler(new THREE.Euler(0, b.ry, 0));
        mm.compose(new THREE.Vector3(b.x, BASE_Y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
        im.setMatrixAt(i, mm);
      });
      // scale UVs by repeating texture: approximate via texture repeat
      m.map.repeat.set(2, 3); m.emissiveMap = m.map;
      im.castShadow = false; im.receiveShadow = true;
      scene.add(im);
    }
    // rooftop beacons
    const beacon = new THREE.MeshBasicMaterial({ color: '#ff3355' });
    for (const b of buildings.filter(() => r() < 0.4)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), beacon);
      s.position.set(b.x, BASE_Y + b.h + 0.6, b.z); scene.add(s);
    }
    // street lamps along the track
    for (let i = 0; i < geo.N; i += 18) for (const side of [-1, 1]) {
      const lat = side * (geo.w[i] + geo.shoulder + 1.5);
      const x = geo.x[i] + geo.rx[i] * lat, z = geo.z[i] + geo.rz[i] * lat;
      S.add('lamp', x, geo.y[i], z, 0, 1);
      S.add('lampBulb', x, geo.y[i], z, 0, 1, (i / 18) % 2 ? '#22e9ff' : '#ff4fd8');
    }
    // neon arches over the track
    const archCols = ['#22e9ff', '#ff2fd0', '#ffe14a', '#7c4dff'];
    let ai = 0;
    for (let i = 10; i < geo.N; i += 34) {
      const w = geo.w[i] + geo.shoulder + 0.5;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(w, 0.35, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: archCols[ai++ % 4] }));
      arch.position.set(geo.x[i], geo.y[i], geo.z[i]);
      arch.rotation.y = Math.atan2(geo.tx[i], geo.tz[i]) + Math.PI / 2 + Math.PI / 2;
      arch.rotation.set(0, Math.atan2(geo.rx[i], geo.rz[i]), 0);
      arch.lookAt(arch.position.x + geo.tx[i], arch.position.y, arch.position.z + geo.tz[i]);
      scene.add(arch);
    }
    // billboards
    const words = ['TURBO', 'ZOOM!', 'DRIFT', 'NITRO', 'PARTY', 'GO GO'];
    for (let k = 0; k < 10; k++) place(1, 6, 18, (x, y, z, d, p) => {
      const sg = new THREE.Group();
      const w = words[k % words.length];
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), new THREE.MeshBasicMaterial({ map: T.signTexture(w, k % 2 ? '#ff3fd8' : '#ffe14a', k % 2 ? '#28e7ff' : '#ff6a3d'), side: THREE.DoubleSide }));
      panel.position.y = 9;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: '#2a2440', metalness: 0.6, roughness: 0.4 }));
      sg.add(panel, post);
      sg.position.set(x, y, z);
      sg.lookAt(p.cx, y, p.cz);
      scene.add(sg);
    });
    // stars
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const a = r() * Math.PI * 2, e = Math.acos(r() * 0.9);
      sp.push(Math.cos(a) * Math.sin(e) * 1600, Math.cos(e) * 1600, Math.sin(a) * Math.sin(e) * 1600);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    stars.frustumCulled = false;
    stars.onBeforeRender = (rr, s, cam) => stars.position.copy(cam.position);
    scene.add(stars);
  }

  // grandstand near start (all themes)
  grandstand(S, geo, r, theme, world);
  S.build(scene);
}

function grandstand(S, geo, r, theme, world) {
  const scene = world.scene;
  const i0 = geo.N - 14;
  for (const side of [-1, 1]) {
    if (side > 0 && theme === 'neon') continue;
    const baseLat = geo.w[i0] + geo.shoulder + 4;
    const heading = Math.atan2(geo.tx[i0], geo.tz[i0]);
    const g = new THREE.Group();
    const lat = side * baseLat;
    g.position.set(geo.x[i0] + geo.rx[i0] * lat, geo.y[i0], geo.z[i0] + geo.rz[i0] * lat);
    g.rotation.y = heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: theme === 'neon' ? '#2a2440' : '#d9dde6', roughness: 0.7 });
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2 + s * 1.2, 2.2).translate(0, (1.2 + s * 1.2) / 2, 0), mat);
      step.position.z = -s * 2.2 - 1; step.castShadow = step.receiveShadow = true; g.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(31, 0.4, 10), new THREE.MeshStandardMaterial({ color: ['#e8333a', '#2f7fe0', '#ffd23f'][Math.floor(r() * 3)], roughness: 0.6 }));
    roof.position.set(0, 9, -4.5); roof.castShadow = true; g.add(roof);
    for (const x of [-15, 15]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4).translate(0, 4.5, 0), mat); p.position.set(x, 0, -8.5); g.add(p); }
    scene.add(g);
    g.updateMatrixWorld(true);
    // crowd (instanced via scatter in world coords)
    const v = new THREE.Vector3();
    for (let s = 0; s < 4; s++) for (let k = 0; k < 24; k++) {
      v.set(-14 + k * 1.2 + (r() - 0.5) * 0.3, 1.2 + s * 1.2, -s * 2.2 - 1.2).applyMatrix4(g.matrixWorld);
      S.add('crowd', v.x, v.y, v.z, 0, 0.9 + r() * 0.3, new THREE.Color().setHSL(r(), 0.7, 0.55).getStyle());
    }
  }
}

function windmill(scene, x, y, z, r) {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 14, 8).translate(0, 7, 0), new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.8, flatShading: true }));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 8).translate(0, 15.5, 0), new THREE.MeshStandardMaterial({ color: '#c8443a', roughness: 0.7, flatShading: true }));
  tower.castShadow = cap.castShadow = true;
  const hub = new THREE.Group(); hub.position.set(0, 13.5, 2.2);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 0.15).translate(0, 4.4, 0), bladeMat);
    b.rotation.z = i * Math.PI / 2; b.castShadow = true; hub.add(b);
  }
  g.add(tower, cap, hub);
  g.position.set(x, y, z); g.rotation.y = r() * Math.PI * 2;
  scene.add(g);
  const sp = 0.6 + r() * 0.5;
  return (t) => { hub.rotation.z = t * sp; };
}

function balloon(color) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true }));
  const stripes = new THREE.Mesh(new THREE.SphereGeometry(5.05, 16, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, flatShading: true }));
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: '#8a5a33' }));
  basket.position.y = -7.6;
  g.add(env, stripes, basket);
  return g;
}

function clouds(world, cx, cz, span, n, r, opacity) {
  const tex = T.cloudTexture();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: opacity * (0.7 + r() * 0.3), depthWrite: false, fog: false }));
    const s = 80 + r() * 120;
    m.scale.set(s, s * 0.45, 1);
    const a = r() * Math.PI * 2, d = 200 + r() * 900;
    m.position.set(cx + Math.cos(a) * d, 90 + r() * 120, cz + Math.sin(a) * d);
    world.scene.add(m);
    const bx = m.position.x, ph = r() * 100;
    world.animated.push((t) => { m.position.x = bx + ((t * 2 + ph) % 200) - 100; });
  }
}

function lake(scene, geo, r, color, opacity, world, frozen = false) {
  // find an infield/outfield spot far enough from the track
  const cx = (geo.minX + geo.maxX) / 2, cz = (geo.minZ + geo.maxZ) / 2;
  let best = null;
  for (let k = 0; k < 400; k++) {
    const x = cx + (r() * 2 - 1) * 220, z = cz + (r() * 2 - 1) * 220;
    const p = geo.project(x, z, -1);
    const d = Math.abs(p.lat) - (p.hw + geo.shoulder);
    if (d > 22 && (!best || d > best.d) && d < 70) best = { x, z, d };
  }
  if (!best) return;
  const rad = Math.min(45, best.d - 6);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: frozen ? 0.15 : 0.05, metalness: frozen ? 0.1 : 0.3, transparent: true, opacity });
  const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 40).rotateX(-Math.PI / 2), mat);
  m.scale.set(1, 1, 0.7);
  m.position.set(best.x, BASE_Y + 0.08, best.z);
  m.receiveShadow = true;
  scene.add(m);
  const rim = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 2.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: frozen ? '#ffffff' : '#d8c38a', roughness: 1 }));
  rim.scale.set(1, 1, 0.7);
  rim.position.set(best.x, BASE_Y + 0.06, best.z);
  scene.add(rim);
  if (!frozen) world.animated.push((t) => { mat.color.setHSL(0.55, 0.65, 0.5 + Math.sin(t * 0.8) * 0.03); });
}

// Per-frame animation of world props
export function animateWorld(world, race, t, dt) {
  for (const f of world.animated) f(t);
  for (const pt of world.pads) pt.offset.y = -t * 1.6;
  for (const b of world.boxes) {
    const alive = b.box.alive;
    b.pop += ((alive ? 1 : 0) - b.pop) * Math.min(1, dt * (alive ? 6 : 20));
    b.g.visible = b.pop > 0.02;
    const s = b.pop;
    b.g.scale.setScalar(s);
    b.c.rotation.y = t * 1.6 + b.phase; b.c.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.35;
    b.g.position.y = b.box.y + 1.5 + Math.sin(t * 2.2 + b.phase) * 0.22;
    b.mat.emissive.setHSL((t * 0.15 + b.phase * 0.1) % 1, 0.9, 0.5);
    b.mat.color.setHSL((t * 0.15 + b.phase * 0.1 + 0.5) % 1, 0.6, 0.85);
  }
  // start lights
  if (world.startLights.length) {
    const cd = race.phase === 'countdown' ? race.countdown : -1;
    const lit = cd < 0 ? 3 : cd < 0.6 ? 3 : cd < 1.6 ? 2 : cd < 2.6 ? 1 : 0;
    const green = race.phase !== 'countdown' && race.time < 4;
    world.startLights.forEach((b, i) => {
      b.material.color.set(green ? '#33ff66' : (i < lit && cd >= 0 ? '#ff2a2a' : '#330000'));
    });
  }
}

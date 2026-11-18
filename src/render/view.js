// Renderer, split-screen viewports, cameras, kart & entity visuals.
import * as THREE from 'three';
import { buildWorld, animateWorld } from './world.js';
import { Effects, makeSnow } from './effects.js';
import { buildKart } from './characters.js';
import { particleTexture } from './textures.js';

export function layoutViewports(n, W, H) {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  let cols, rows;
  if (n === 2) { cols = 2; rows = 1; }
  else if (n <= 4) { cols = 2; rows = 2; }
  else if (n <= 6) { cols = 3; rows = 2; }
  else { cols = 4; rows = 2; }
  const w = Math.floor(W / cols), h = Math.floor(H / rows);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: c * w, y: r * h, w: c === cols - 1 ? W - c * w : w, h: r === rows - 1 ? H - r * h : h }); // y from top
  }
  // center the last row if it is not full
  const lastRowCount = n - (rows - 1) * cols;
  if (rows > 1 && lastRowCount < cols) {
    const off = Math.floor((cols - lastRowCount) * w / 2);
    for (let i = (rows - 1) * cols; i < n; i++) out[i].x += off;
  }
  return out;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  const w = Math.min(240, ctx.measureText(name).width + 36);
  ctx.fillStyle = 'rgba(10,10,20,0.6)';
  ctx.beginPath(); ctx.roundRect(128 - w / 2, 8, w, 46, 23); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(3.2, 0.8, 1);
  s.onBeforeRender = (r, sc, cam) => {
    const d = cam.position.distanceTo(s.position);
    s.material.opacity = Math.max(0, Math.min(1, (d - 7) / 6));
    const k = Math.max(1, d / 30);
    s.scale.set(3.2 * k, 0.8 * k, 1);
  };
  return s;
}

// Hooky — the friendly rescue drone that picks you up when you go the wrong way or fall.
const DRONE = {};
function droneParts() {
  if (DRONE.body) return DRONE;
  DRONE.body = new THREE.SphereGeometry(0.75, 18, 12).scale(1.3, 0.72, 1.1);
  DRONE.eye = new THREE.SphereGeometry(0.2, 12, 8);
  DRONE.pupil = new THREE.SphereGeometry(0.1, 10, 6);
  DRONE.arm = new THREE.BoxGeometry(2.6, 0.12, 0.16);
  DRONE.rotor = new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20);
  DRONE.cable = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, -0.5, 0);
  DRONE.claw = new THREE.TorusGeometry(0.32, 0.08, 6, 14, Math.PI * 1.4);
  DRONE.mYellow = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35, metalness: 0.1 });
  DRONE.mWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  DRONE.mInk = new THREE.MeshStandardMaterial({ color: '#1a1b24', roughness: 0.4 });
  DRONE.mGrey = new THREE.MeshStandardMaterial({ color: '#5a6378', roughness: 0.5, metalness: 0.4 });
  DRONE.mRotor = new THREE.MeshBasicMaterial({ color: '#d8e3f5', transparent: true, opacity: 0.45, depthWrite: false });
  return DRONE;
}
function buildDrone() {
  const P = droneParts();
  const g = new THREE.Group();
  const body = new THREE.Mesh(P.body, P.mYellow);
  g.add(body);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(P.eye, P.mWhite); e.position.set(sx * 0.3, 0.12, 0.72); g.add(e);
    const pu = new THREE.Mesh(P.pupil, P.mInk); pu.position.set(sx * 0.3, 0.12, 0.88); g.add(pu);
  }
  const rotors = [];
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(P.arm, P.mGrey); arm.rotation.y = a; arm.position.y = 0.3; g.add(arm);
    for (const sd of [-1, 1]) {
      const r = new THREE.Mesh(P.rotor, P.mRotor);
      r.position.set(Math.cos(-a) * 1.3 * sd, 0.42, Math.sin(-a) * 1.3 * sd);
      g.add(r); rotors.push(r);
    }
  }
  const cable = new THREE.Mesh(P.cable, P.mInk); cable.position.y = -0.45; g.add(cable);
  const claw = new THREE.Mesh(P.claw, P.mGrey); claw.rotation.x = Math.PI / 2; g.add(claw);
  g.visible = false;
  return { group: g, rotors, cable, claw, t: 0, out: 0, active: false };
}

class ChaseCam {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.3, 2400);
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.heading = 0; this.init = false; this.fov = 72; this.shake = 0;
    this.orbit = 0; this.glide = 0;
  }
  update(k, dt, race, mode = 'chase') {
    const t = 1 - Math.exp(-dt * 10);
    if (!this.init) { this.heading = k.heading; }
    this.heading = angleLerp(this.heading, k.heading - k.driftVis * 0.35, 1 - Math.exp(-dt * (k.drift ? 3.5 : 5)));
    let h = this.heading;
    let dist = 6.6 + Math.max(0, k.v) * 0.035, up = 2.7;
    // over the falls: pull back and up so you see the drop and the far cliff
    this.glide += ((k.gliding ? 1 : 0) - this.glide) * Math.min(1, dt * 2.5);
    dist += this.glide * 4.5; up += this.glide * 5.2;
    if (mode === 'chase' && race.phase === 'countdown') {
      const f = Math.max(0, Math.min(1, (race.countdown - 1.2) / 2.2));
      const e = f * f * (3 - 2 * f);
      // swing round to face your racer on the grid (close enough not to clip the kart ahead)
      h += e * Math.PI * 0.95; dist -= e * 2.2; up += e * 0.2;
    }
    if (mode === 'finish' || mode === 'orbit') { this.orbit += dt * 0.5; h += this.orbit + Math.PI * 0.8; dist = 8; up = 3; }
    else this.orbit = 0;
    const fx = Math.sin(h), fz = Math.cos(h);
    const tx = k.x - fx * dist, tz = k.z - fz * dist, ty = k.y + up + (k.megaT > 0 ? 1.2 : 0);
    if (!this.init) { this.pos.set(tx, ty, tz); this.init = true; }
    else this.pos.lerp(new THREE.Vector3(tx, ty, tz), t);
    // keep the camera inside the track walls
    const g = race.geo;
    const pr = g.project(this.pos.x, this.pos.z, this.ti ?? -1, this._p || (this._p = {}));
    this.ti = pr.i;
    const lim = pr.hw + g.shoulder - 1.2;
    if (Math.abs(pr.lat) > lim) {
      const ex = (Math.abs(pr.lat) - lim) * Math.sign(pr.lat);
      this.pos.x -= pr.rx * ex; this.pos.z -= pr.rz * ex;
    }
    if (this.pos.y < pr.y + 1.2) this.pos.y = pr.y + 1.2;
    const lx = k.x + Math.sin(k.heading) * 3, lz = k.z + Math.cos(k.heading) * 3;
    this.look.set(lx, k.y + 1.2 + this.glide * 1.2, lz);
    this.cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      const s = this.shake * 0.35;
      this.cam.position.x += (Math.random() - 0.5) * s; this.cam.position.y += (Math.random() - 0.5) * s;
    }
    this.cam.lookAt(this.look);
    const boost = k.boostT > 0 ? 1 : 0;
    const want = 70 + Math.min(10, Math.max(0, k.v) * 0.18) + boost * 9;
    this.fov += (want - this.fov) * Math.min(1, dt * 5);
    this.cam.fov = this.fov;
  }
}

export class GameView {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.setScissorTest(true);
    this.maxPR = Math.min(window.devicePixelRatio || 1, 1.75);
    this.pr = Math.min(this.maxPR, 1.25);
    r.setPixelRatio(this.pr);
    container.appendChild(r.domElement);
    r.domElement.className = 'game-canvas';
    this.renderer = r;
    this.cams = []; this.karts = []; this.ents = new Map(); this.worlds = new Map();
    this.time = 0; this.frameTimes = []; this.prTimer = 0;
    this.mode = 'attract';
    this.attract = { cam: new ChaseCam(), target: 0, t: 0, shot: 0 };
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const W = this.container.clientWidth || innerWidth, H = this.container.clientHeight || innerHeight;
    this.W = W; this.H = H;
    this.renderer.setSize(W, H);
    this.layout = layoutViewports(Math.max(1, this.humanIds ? this.humanIds.length : 1), W, H);
  }

  // Remove this race's karts, tags, drones and items. The track world itself stays cached.
  dispose() {
    if (!this.scene) return;
    for (const { model, blob, tag, drone } of this.karts) {
      model.dispose?.();
      this.raceGroup.remove(model.group, blob, drone.group);
      if (tag) { this.raceGroup.remove(tag); tag.material.map?.dispose(); tag.material.dispose(); }
    }
    for (const m of this.ents.values()) {
      this.raceGroup.remove(m);
      m.traverse(o => { o.geometry?.dispose(); });
    }
    this.karts = []; this.ents.clear();
    this.scene = null;
  }

  // Each track's 3D world is built once and kept, so switching tracks is instant
  // (no page freeze, no stutter in the music).
  getWorld(race) {
    const id = race.def.id;
    let w = this.worlds.get(id);
    if (!w) {
      w = buildWorld(race, this.renderer);
      w.effects = new Effects(w.scene, w.theme);
      w.snowFx = w.weather === 'snow' ? makeSnow(w.scene) : null;
      w.raceGroup = new THREE.Group();
      w.scene.add(w.raceGroup);
      this.renderer.compile(w.scene, this.attract.cam.cam); // compile shaders now, not on the first frame
      this.worlds.set(id, w);
    } else {
      // item crystals belong to the new race object (same layout, same order)
      w.boxes.forEach((b, i) => { if (race.boxes[i]) b.box = race.boxes[i]; });
    }
    return w;
  }

  // Build a track's world ahead of time (called while the lobby is idle).
  preload(race) { if (!this.worlds.has(race.def.id)) this.getWorld(race); }

  setRace(race, mode = 'race') {
    this.dispose();
    this.race = race;
    this.mode = mode;
    this.world = this.getWorld(race);
    this.scene = this.world.scene;
    this.raceGroup = this.world.raceGroup;
    this.renderer.toneMappingExposure = this.world.th.exposure;
    this.effects = this.world.effects;
    this.snow = this.world.snowFx;
    this.shadowFrame = 0;
    if (!this.blobMat) {
      this.blobMat = new THREE.MeshBasicMaterial({ map: particleTexture(), color: '#000', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      this.blobGeo = new THREE.PlaneGeometry(2.6, 3.2).rotateX(-Math.PI / 2);
    }
    const blobMat = this.blobMat, blobGeo = this.blobGeo;
    this.humanIds = race.karts.filter(k => k.human).sort((a, b) => a.slot - b.slot).map(k => k.id);
    for (const k of race.karts) {
      const model = buildKart(k.char, { lod: this.humanIds.length >= 3 ? 1 : 0 });
      model.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      this.raceGroup.add(model.group);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      this.raceGroup.add(blob);
      let tag = null;
      if (k.human) {
        tag = nameTag(k.name, k.color);
        const layer = 1 + this.humanIds.indexOf(k.id);
        tag.layers.set(layer);
        this.raceGroup.add(tag);
      }
      const drone = buildDrone();
      this.raceGroup.add(drone.group);
      this.karts.push({ k, model, blob, tag, drone });
    }
    this.cams = this.humanIds.map((id, i) => {
      const c = new ChaseCam();
      c.cam.layers.enableAll(); c.cam.layers.disable(1 + i);
      return { id, cc: c };
    });
    this.attract.cam = new ChaseCam(); this.attract.cam.cam.layers.enableAll();
    this.attract.target = Math.floor(Math.random() * Math.max(1, race.karts.length));
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
  }

  // follow a specific kart in attract/results mode
  focus(kartId, shot = 'orbit') { this.attract.target = kartId; this.attract.forced = shot; }

  shake(kartId, amount = 1) {
    const c = this.cams.find(c => c.id === kartId);
    if (c) c.cc.shake = Math.max(c.cc.shake, amount);
  }

  handleEvents(events) {
    if (!this.effects) return;
    for (const e of events) {
      this.effects.event(e);
      if (e.type === 'hit' && e.k.human) this.shake(e.k.id, e.kind === 'explosion' ? 1.6 : 0.9);
      if (e.type === 'wall' && e.k.human) this.shake(e.k.id, Math.min(1, e.impact / 20));
      if (e.type === 'bump') { if (e.a.human) this.shake(e.a.id, 0.4); if (e.b.human) this.shake(e.b.id, 0.4); }
      if (e.type === 'zap') this.zapFlash = 1;
      if (e.type === 'cliff') this.effects.ring(e.k.x, e.k.y + 0.5, e.k.z, '#bfe9ff', 6, 0.5);
      if (e.type === 'glideLand') this.effects.ring(e.k.x, e.k.y + 0.3, e.k.z, '#ffffff', 5, 0.4);
    }
  }

  syncEntities() {
    const seen = new Set();
    const list = [...this.race.projectiles, ...this.race.hazards];
    for (const e of list) {
      seen.add(e.id);
      let m = this.ents.get(e.id);
      if (!m) { m = this.makeEntity(e); this.ents.set(e.id, m); this.raceGroup.add(m); }
      m.position.set(e.x, e.type === 'oil' ? e.y + 0.06 : e.y, e.z);
      if (e.type === 'bouncer') { m.rotation.x += 0.3; m.rotation.y += 0.2; }
      if (e.type === 'rocket') { m.rotation.y = Math.atan2(e.vx, e.vz); }
      if (e.type === 'oil') { const s = Math.min(1, e.age * 4); m.scale.set(s, 1, s); }
    }
    for (const [id, m] of this.ents) if (!seen.has(id)) { this.raceGroup.remove(m); m.traverse(o => o.geometry?.dispose()); this.ents.delete(id); }
  }

  makeEntity(e) {
    const g = new THREE.Group();
    if (e.type === 'bouncer') {
      const mat = new THREE.MeshStandardMaterial({ color: '#3ddc5a', roughness: 0.3, metalness: 0.2, emissive: '#0a5a1a', emissiveIntensity: 0.6, flatShading: true });
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), mat));
      const spikeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
      const ico = new THREE.IcosahedronGeometry(0.62, 0).attributes.position;
      for (let i = 0; i < ico.count; i += 3) {
        const v = new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize();
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), spikeMat);
        sp.position.copy(v.clone().multiplyScalar(0.66)); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
        g.add(sp);
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    } else if (e.type === 'rocket') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8333a', roughness: 0.3, metalness: 0.3 }));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 10).rotateX(Math.PI / 2).translate(0, 0, 1.05), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
      const finMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4 });
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.5), finMat); f.position.z = -0.6; f.rotation.z = i * Math.PI / 2; f.position.x = Math.cos(i * Math.PI / 2 + Math.PI / 2) * 0.3; f.position.y = Math.sin(i * Math.PI / 2 + Math.PI / 2) * 0.3; g.add(f); }
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: particleTexture(), color: '#ff9a2a', blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.scale.set(1.6, 1.6, 1); flame.position.z = -1.1;
      g.add(body, nose, flame);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    } else if (e.type === 'oil') {
      const mat = new THREE.MeshPhysicalMaterial({ color: '#141018', roughness: 0.05, metalness: 0.4, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -3 });
      const shape = new THREE.Shape();
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2, rr = 1.5 + Math.sin(i * 2.7) * 0.35; i ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), mat);
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  honk(kartId) {
    const kd = this.karts.find(e => e.k.id === kartId);
    if (kd && this.effects) this.effects.ring(kd.k.x, kd.k.y + 1.6, kd.k.z, kd.k.color, 3, 0.3);
  }

  syncDrone(kd, dt) {
    const { k, drone: d } = kd;
    const rescuing = k.rescueT > 0;
    if (rescuing && !d.active) { d.active = true; d.t = 0; d.out = 0; }
    if (!rescuing && d.active) { d.active = false; d.out = 0.001; }
    if (d.active) d.t += dt;
    else if (d.out > 0) d.out += dt;
    const visible = d.active || (d.out > 0 && d.out < 0.8);
    d.group.visible = visible;
    if (!visible) { d.out = 0; return; }
    // swoop in from above, hold while carrying, then zip up and away
    const arrive = Math.min(1, d.t / 0.35), e = 1 - (1 - arrive) ** 3;
    const leave = d.out > 0 ? d.out / 0.8 : 0;
    const hover = 3.3 + (1 - e) * 10 + leave * leave * 16 + Math.sin(this.time * 9) * 0.06;
    d.group.position.set(k.x - Math.sin(k.heading) * leave * 6, k.y + hover, k.z - Math.cos(k.heading) * leave * 6);
    d.group.rotation.set(Math.sin(this.time * 3) * 0.06 - leave * 0.4, k.heading, Math.cos(this.time * 2.3) * 0.05);
    for (const r of d.rotors) r.rotation.y += dt * 40;
    const cableLen = d.active ? Math.max(0.3, hover - 2.2) : 0.6;
    d.cable.scale.y = cableLen;
    d.claw.position.y = -0.45 - cableLen;
  }

  syncKarts(dt) {
    for (const kd of this.karts) {
      const { k, model, blob, tag } = kd;
      const gr = model.group;
      gr.position.set(k.x, k.y, k.z);
      gr.rotation.order = 'YXZ';
      gr.rotation.y = k.heading - k.driftVis;
      gr.rotation.x = k.grounded ? 0 : Math.max(-0.35, Math.min(0.35, -k.vy * 0.025));
      model.update(dt, {
        speed: k.v, speedMax: 34, steer: k.steerVis, drift: k.drift, driftLevel: k.driftLevel,
        boosting: k.boostT > 0, airborne: !k.grounded, spin: k.spinVis, squash: k.squash,
        mega: k.megaT > 0, shield: k.shieldT > 0, finished: k.finished, lean: k.steerVis * 0.1,
        zapped: k.zapT > 0, gliding: k.gliding, rescued: k.rescueT > 0,
      });
      this.syncDrone(kd, dt);
      const zs = k.zapT > 0 ? 0.6 : 1;
      if (k.zapT > 0 || gr.userData.zs !== undefined) {
        gr.userData.zs = (gr.userData.zs ?? 1) + (zs - (gr.userData.zs ?? 1)) * Math.min(1, dt * 6);
        gr.scale.setScalar(gr.userData.zs);
      }
      const gy = k._proj ? k._proj.y : k.y;
      blob.position.set(k.x, gy + 0.04, k.z);
      blob.rotation.y = k.heading;
      const air = Math.max(0, k.y - gy);
      blob.visible = !k.gliding && k.rescueT <= 0;
      blob.scale.setScalar(Math.max(0.4, 1 - air * 0.08) * (k.megaT > 0 ? 1.6 : 1));
      if (tag) { tag.position.set(k.x, k.y + 3.1 + (k.megaT > 0 ? 1.4 : 0), k.z); }
      if (this.effects) this.effects.kart(k, null, dt);
    }
  }

  render(dt) {
    if (!this.scene) return;
    this.time += dt;
    const race = this.race;
    animateWorld(this.world, race, this.time, dt);
    this.syncKarts(dt);
    this.syncEntities();
    this.effects.update(dt);
    if (this.snow) this.snow.update(this.time);
    this.zapFlash = Math.max(0, (this.zapFlash || 0) - dt * 2);

    const r = this.renderer;
    // shadows: update every other frame
    this.shadowFrame++;
    // shadows are shared by every viewport; refresh them less often with lots of screens
    if (this.shadowFrame % (this.cams.length > 4 ? 3 : 2) === 0) r.shadowMap.needsUpdate = true;

    const views = [];
    if (this.mode === 'race' && this.cams.length) {
      this.layout = layoutViewports(this.cams.length, this.W, this.H);
      this.cams.forEach((c, i) => {
        const k = race.karts[c.id];
        c.cc.update(k, dt, race, k.finished ? 'finish' : 'chase');
        views.push({ cam: c.cc.cam, vp: this.layout[i] });
      });
    } else {
      // attract / results: one cinematic camera
      const a = this.attract;
      a.t += dt;
      if (!a.forced && a.t > 7) { a.t = 0; a.target = Math.floor(Math.random() * race.karts.length); a.shot = (a.shot + 1) % 3; a.cam.init = false; }
      const k = race.karts[a.target] || race.karts[0];
      a.cam.update(k, dt, race, a.forced === 'orbit' || a.shot === 1 ? 'orbit' : 'chase');
      views.push({ cam: a.cam.cam, vp: { x: 0, y: 0, w: this.W, h: this.H } });
    }
    for (const v of views) {
      const { x, y, w, h } = v.vp;
      v.cam.aspect = w / h; v.cam.updateProjectionMatrix();
      r.setViewport(x, this.H - y - h, w, h);
      r.setScissor(x, this.H - y - h, w, h);
      this.effects.setViewportHeight(h * this.pr);
      if (this.snow) this.snow.setHeight(h * this.pr);
      r.render(this.scene, v.cam);
      r.shadowMap.needsUpdate = false;
    }
    this.adaptResolution(dt);
  }

  adaptResolution(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.prTimer += dt;
    if (this.prTimer < 2 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    let pr = this.pr;
    if (avg > 1 / 45 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
    else if (avg < 1 / 58 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + 0.1);
    if (pr !== this.pr) { this.pr = pr; this.renderer.setPixelRatio(pr); this.resize(); this.prTimer = 0; }
    else this.prTimer = 1.2;
  }

  // viewport rects (CSS px, y from top) for HUD placement
  viewports() {
    if (this.mode === 'race' && this.cams.length) return layoutViewports(this.cams.length, this.W, this.H).map((vp, i) => ({ ...vp, kartId: this.cams[i].id }));
    return [];
  }
}

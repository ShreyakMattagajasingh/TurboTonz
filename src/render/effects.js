// Pooled GPU particle systems (additive sparks/flames + alpha smoke/dust/confetti).
import * as THREE from 'three';
import { particleTexture } from './textures.js';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), uScale * 0.07);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex; varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class Pool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: particleTexture() }, uScale: { value: 400 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, color, life, s0, s1, grav = 0, drag = 1) {
    let i = this.n;
    if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life; this.size0[i] = s0; this.size1[i] = s1; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
        }
        i--; continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alpha[i] = t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9;
    }
    this.geo.setDrawRange(0, this.n);
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
  setScale(h) { this.mat.uniforms.uScale.value = h; }
}

const C = (h) => new THREE.Color(h);
const DRIFT_COLORS = [C('#ffffff'), C('#3fb6ff'), C('#ff9a1f'), C('#d05bff')];
const FLAME = [C('#ffd34a'), C('#ff7a1a'), C('#ff3d1a')];
const tmpV = new THREE.Vector3();
const EXH = C('#d8d8e0');
const SMOKE = C('#cfd2da');

export class Effects {
  constructor(scene, theme) {
    this.add = new Pool(scene, 5000, true);
    this.alpha = new Pool(scene, 4000, false);
    this.theme = theme;
    this.dust = C({ meadow: '#a98c5f', desert: '#e8c088', snow: '#ffffff', neon: '#6a4bd6', falls: '#9a7f55' }[theme] || '#aaa');
    this.grass = C({ meadow: '#6ab34a', desert: '#d9a862', snow: '#f4f8ff', neon: '#3a2a66', falls: '#5cb84a' }[theme] || '#888');
    this.rings = [];
    this.scene = scene;
    this.ringGeo = new THREE.RingGeometry(0.8, 1.2, 32).rotateX(-Math.PI / 2);
  }

  setViewportHeight(h) { this.add.setScale(h * 0.9); this.alpha.setScale(h * 0.9); }

  rand(a) { return (Math.random() * 2 - 1) * a; }

  // per-frame continuous emitters for a kart
  kart(k, view, dt) {
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const rx = -fz, rz = fx;
    const sp = Math.abs(k.v);
    // drift sparks from rear wheels
    if (k.drift !== 0 && k.grounded) {
      const col = DRIFT_COLORS[k.driftLevel];
      const n = k.driftLevel > 0 ? 3 : 1;
      for (const side of [-1, 1]) for (let j = 0; j < n; j++) {
        const x = k.x - fx * 1.0 + rx * side * 0.8, z = k.z - fz * 1.0 + rz * side * 0.8;
        this.add.emit(x, k.y + 0.25, z, -fx * 3 + this.rand(3) + rx * side * 2, 2 + Math.random() * 3, -fz * 3 + this.rand(3) + rz * side * 2, col, 0.22 + Math.random() * 0.18, k.driftLevel ? 0.75 : 0.4, 0.1, 12, 2);
      }
      if (k.driftLevel > 0) for (const side of [-1, 1]) this.add.emit(k.x - fx * 0.9 + rx * side * 0.8, k.y + 0.3, k.z - fz * 0.9 + rz * side * 0.8, 0, 0, 0, col, 0.035, 0.7 + k.driftLevel * 0.1, 0.4, 0, 0);
      if (Math.random() < 0.18) this.alpha.emit(k.x - fx * 1.2, k.y + 0.25, k.z - fz * 1.2, this.rand(1), 0.6, this.rand(1), SMOKE, 0.4, 0.4, 1.1, -0.3, 1.5);
    }
    // boost flames
    if (k.boostT > 0 || k.megaT > 0) {
      for (const side of [-1, 1]) {
        const x = k.x - fx * 1.45 + rx * side * 0.42, z = k.z - fz * 1.45 + rz * side * 0.42;
        this.add.emit(x, k.y + 0.55, z, -fx * (6 + Math.random() * 4) + this.rand(0.8), this.rand(0.8) + 0.5, -fz * (6 + Math.random() * 4) + this.rand(0.8), FLAME[Math.floor(Math.random() * 3)], 0.12 + Math.random() * 0.1, 0.8, 0.15, 0, 3);
      }
    }
    if (k.megaT > 0 && Math.random() < 0.7) {
      const c = new THREE.Color().setHSL(Math.random(), 1, 0.6);
      this.add.emit(k.x + this.rand(1.5), k.y + 1 + Math.random() * 1.5, k.z + this.rand(1.5), this.rand(2), 2, this.rand(2), c, 0.5, 1.0, 0.2, 2, 1);
    }
    // offroad dust / grass
    if (k.offroad && sp > 6 && k.grounded) {
      for (const side of [-1, 1]) if (Math.random() < 0.6) {
        this.alpha.emit(k.x - fx * 1.0 + rx * side * 0.8, k.y + 0.2, k.z - fz * 1.0 + rz * side * 0.8, this.rand(1.5) - fx * 2, 1.5 + Math.random() * 2, this.rand(1.5) - fz * 2, Math.random() < 0.5 ? this.dust : this.grass, 0.5, 0.6, 1.6, 3, 2);
      }
    }
    // exhaust puffs
    if (sp > 1 && Math.random() < 0.08 && k.boostT <= 0) {
      this.alpha.emit(k.x - fx * 1.4, k.y + 0.6, k.z - fz * 1.4, -fx * 1, 0.8, -fz * 1, EXH, 0.45, 0.25, 0.8, -0.4, 1);
    }
    // spin smoke stars
    if (k.spinT > 0 && Math.random() < 0.5) {
      this.add.emit(k.x + this.rand(0.6), k.y + 1.8, k.z + this.rand(0.6), this.rand(2), 1.5, this.rand(2), C('#fff6a0'), 0.5, 0.8, 0.2, 0, 1);
    }
    // zapped static
    if (k.zapT > 0 && Math.random() < 0.3) {
      this.add.emit(k.x + this.rand(0.8), k.y + 1 + Math.random(), k.z + this.rand(0.8), this.rand(3), this.rand(3), this.rand(3), C('#8fd8ff'), 0.15, 0.9, 0.1, 0, 0);
    }
    void view; void dt;
  }

  burst(x, y, z, n, colors, speed, life, size, grav = 8, additive = true) {
    const pool = additive ? this.add : this.alpha;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      pool.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + speed * 0.3, Math.sin(a) * Math.cos(e) * s, colors[i % colors.length], life * (0.6 + Math.random() * 0.6), size, size * 0.2, grav, 1.5);
    }
  }

  ring(x, y, z, color, maxR = 6, dur = 0.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, maxR });
  }

  event(e) {
    const k = e.k;
    switch (e.type) {
      case 'box':
        this.burst(e.box.x, e.box.y + 1.5, e.box.z, 26, [C('#ff6bd6'), C('#6be8ff'), C('#ffe36b'), C('#9bff6b'), C('#ffffff')], 9, 0.7, 1.2, 10);
        break;
      case 'miniTurbo':
        this.burst(k.x, k.y + 0.6, k.z, 10 + e.level * 8, [DRIFT_COLORS[e.level], C('#ffffff')], 6 + e.level * 2, 0.4, 1.3, 4);
        break;
      case 'pad': case 'nitro': case 'startBoost': case 'trickBoost':
        this.ring(k.x, k.y + 0.6, k.z, '#ffb02e', 4, 0.35);
        break;
      case 'hit':
        this.burst(k.x, k.y + 1, k.z, 18, [C('#fff6a0'), C('#ffffff'), C('#ffcf3f')], 7, 0.6, 1.2, 6);
        break;
      case 'explode': {
        const big = e.kind === 'rocket';
        this.burst(e.x, e.y, e.z, big ? 60 : 24, [C('#ffdd55'), C('#ff8a2a'), C('#ff3b1f'), C('#ffffff')], big ? 16 : 9, 0.6, big ? 2.4 : 1.4, 6);
        this.burst(e.x, e.y, e.z, big ? 26 : 10, [C('#555'), C('#777'), C('#999')], big ? 6 : 3, 1.2, big ? 4 : 2.4, -1, false);
        this.ring(e.x, e.y - 0.4, e.z, '#ff9a2a', big ? 10 : 5, 0.45);
        break;
      }
      case 'shieldBlock':
        this.burst(k.x, k.y + 1, k.z, 30, [C('#7fdcff'), C('#ffffff')], 8, 0.5, 1.2, 2);
        break;
      case 'mega':
        this.ring(k.x, k.y + 0.5, k.z, '#ffd23f', 9, 0.6);
        this.burst(k.x, k.y + 1, k.z, 40, [C('#ffd23f'), C('#ff6bd6'), C('#6be8ff')], 10, 0.8, 1.4, 4);
        break;
      case 'zap':
        break;
      case 'bump':
        this.burst(e.x, e.y, e.z, 10, [C('#ffffff'), C('#ffe36b')], 5, 0.35, 0.9, 6);
        break;
      case 'wall':
        this.burst(k.x, k.y + 0.6, k.z, 8, [C('#ffe36b'), C('#ffffff')], 5, 0.35, 0.8, 8);
        break;
      case 'land':
        this.alpha.emit(k.x, k.y + 0.2, k.z, 0, 0.5, 0, this.dust, 0.5, 1.5, 4, 0, 2);
        break;
      case 'oilHit':
        this.burst(k.x, k.y + 0.3, k.z, 14, [C('#222'), C('#3b2a5a'), C('#111')], 5, 0.6, 1.0, 10, false);
        break;
      case 'finish':
        if (k.human) for (let i = 0; i < 4; i++) this.burst(k.x, k.y + 3, k.z, 40, [C('#ff4d6d'), C('#ffd23f'), C('#4dd2ff'), C('#5be37a'), C('#b58cff')], 12, 1.8, 1.0, 9, false);
        break;
    }
  }

  update(dt) {
    this.add.update(dt); this.alpha.update(dt);
    for (const r of this.rings) {
      r.t += dt;
      const f = r.t / r.dur;
      r.m.scale.setScalar(1 + f * r.maxR);
      r.m.material.opacity = 0.9 * (1 - f);
    }
    this.rings = this.rings.filter(r => { if (r.t >= r.dur) { this.scene.remove(r.m); r.m.material.dispose(); return false; } return true; });
  }
}

// Falling snow volume that wraps around each camera
export function makeSnow(scene) {
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 80 - 40; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = Math.random() * 80 - 40; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uTex: { value: particleTexture() }, uH: { value: 720 } },
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uH; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y - uTime*4.0, 40.0); p.x += sin(uTime*0.7 + position.z)*1.5;
      vec3 w = uCam + vec3(mod(p.x - uCam.x, 80.0)-40.0, p.y - 12.0, mod(p.z - uCam.z, 80.0)-40.0);
      vec4 mv = viewMatrix * vec4(w,1.0); gl_PointSize = 0.17*uH/max(1.0,-mv.z); vA = clamp(1.0 - length(w-uCam)/45.0, 0.0, 1.0); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(1.0,1.0,1.0, t.a*vA*0.9); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = (r, s, cam) => { mat.uniforms.uCam.value.copy(cam.position); };
  scene.add(pts);
  return { update(t) { mat.uniforms.uTime.value = t; }, setHeight(h) { mat.uniforms.uH.value = h; } };
}
void tmpV;

// Pure track geometry: spline sampling + projection queries. No three.js dependency.

const SPACING = 2; // meters between samples

function catmull(p0, p1, p2, p3, t, alpha = 0.5) {
  // centripetal Catmull-Rom on arrays of equal length
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = [];
  for (let k = 0; k < p0.length; k++) {
    const A1 = (t1 - tt) / (t1 - t0) * p0[k] + (tt - t0) / (t1 - t0) * p1[k];
    const A2 = (t2 - tt) / (t2 - t1) * p1[k] + (tt - t1) / (t2 - t1) * p2[k];
    const A3 = (t3 - tt) / (t3 - t2) * p2[k] + (tt - t2) / (t3 - t2) * p3[k];
    const B1 = (t2 - tt) / (t2 - t0) * A1 + (tt - t0) / (t2 - t0) * A2;
    const B2 = (t3 - tt) / (t3 - t1) * A2 + (tt - t1) / (t3 - t1) * A3;
    out.push((t2 - tt) / (t2 - t1) * B1 + (tt - t1) / (t2 - t1) * B2);
  }
  return out;
}

export class TrackGeo {
  constructor(def) {
    this.def = def;
    const pts = def.points.map(p => [p[0], p[1], p[2] ?? 0, p[3] ?? def.halfWidth]);
    const n = pts.length;
    // dense sampling — [x, z, y, w]
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
    }
    // arc length
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = cum[dense.length];
    const N = Math.round(this.length / SPACING);
    this.N = N;
    this.x = new Float32Array(N); this.z = new Float32Array(N); this.y = new Float32Array(N);
    this.w = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); // unit tangent (xz)
    this.rx = new Float32Array(N); this.rz = new Float32Array(N); // unit right
    this.curv = new Float32Array(N); // signed curvature (1/m), + = turning right
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = (i / N) * this.length;
      while (cum[j + 1] < target) j++;
      const f = (target - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      const a = dense[j], b = dense[(j + 1) % dense.length];
      this.x[i] = a[0] + (b[0] - a[0]) * f;
      this.z[i] = a[1] + (b[1] - a[1]) * f;
      this.y[i] = a[2] + (b[2] - a[2]) * f;
      this.w[i] = a[3] + (b[3] - a[3]) * f;
    }
    // smooth heights a bit
    for (let pass = 0; pass < 3; pass++) {
      const y2 = Float32Array.from(this.y);
      for (let i = 0; i < N; i++) y2[i] = (this.y[(i - 2 + N) % N] + this.y[(i - 1 + N) % N] + this.y[i] + this.y[(i + 1) % N] + this.y[(i + 2) % N]) / 5;
      this.y = y2;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      this.rx[i] = -dz; this.rz[i] = dx;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      const ha = Math.atan2(this.tx[a], this.tz[a]);
      const hb = Math.atan2(this.tx[b], this.tz[b]);
      let dh = hb - ha;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.curv[i] = -dh / (4 * SPACING); // heading decreasing = turning right
    }
    // smoothed curvature for skirts / AI
    this.curvSmooth = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -6; k <= 6; k++) s += this.curv[(i + k + N) % N];
      this.curvSmooth[i] = s / 13;
    }
    this.shoulder = def.shoulder ?? 7;
    // spatial grid for global nearest queries
    this.cell = 24;
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const key = this._key(Math.floor(this.x[i] / this.cell), Math.floor(this.z[i] / this.cell));
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }
    this.minX = Math.min(...this.x); this.maxX = Math.max(...this.x);
    this.minZ = Math.min(...this.z); this.maxZ = Math.max(...this.z);
    this.ice = def.ice || [];
    // cliff gaps, in continuous sample coords
    this.gaps = (def.gaps || []).map(gp => ({ ...gp, s0: gp.u0 * N, s1: gp.u1 * N, lipY: this.y[Math.floor(gp.u0 * N)], landY: this.y[Math.ceil(gp.u1 * N) % N] }));
    this.gapMask = new Uint8Array(N);
    for (const gp of this.gaps) for (let i = Math.floor(gp.s0); i < Math.ceil(gp.s1); i++) this.gapMask[this.wrap(i)] = 1;
  }

  // the gap containing continuous sample coord s, or null
  gapAt(s) {
    if (!this.gaps.length) return null;
    for (const gp of this.gaps) if (s >= gp.s0 && s <= gp.s1) return gp;
    return null;
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  wrap(i) { return ((i % this.N) + this.N) % this.N; }

  nearestGlobal(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const arr = this.grid.get(this._key(cx + a, cz + b));
        if (!arr) continue;
        for (const i of arr) {
          const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    if (best < 0) {
      for (let i = 0; i < this.N; i++) {
        const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  // Project world (x,z) onto the centerline. hint = previous sample index (or -1).
  // Returns { i, f (fraction to next), s (continuous sample coord), u (0..1), lat (signed lateral, + = right), y, hw, tx, tz, rx, rz }
  project(x, z, hint = -1, out = {}) {
    let i;
    if (hint < 0) i = this.nearestGlobal(x, z);
    else {
      i = hint;
      let bd = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      for (let k = -25; k <= 25; k++) {
        const j = this.wrap(hint + k);
        const d = (this.x[j] - x) ** 2 + (this.z[j] - z) ** 2;
        if (d < bd) { bd = d; i = j; }
      }
      if (bd > 60 * 60) i = this.nearestGlobal(x, z);
    }
    // decide segment [i, i+1] or [i-1, i]
    const N = this.N;
    let a = i, b = this.wrap(i + 1);
    let ex = this.x[b] - this.x[a], ez = this.z[b] - this.z[a];
    let t = ((x - this.x[a]) * ex + (z - this.z[a]) * ez) / (ex * ex + ez * ez);
    if (t < 0) {
      a = this.wrap(i - 1); b = i;
      ex = this.x[b] - this.x[a]; ez = this.z[b] - this.z[a];
      t = ((x - this.x[a]) * ex + (z - this.z[a]) * ez) / (ex * ex + ez * ez);
    }
    t = Math.min(1, Math.max(0, t));
    const cx = this.x[a] + ex * t, cz = this.z[a] + ez * t;
    const rx = this.rx[a] + (this.rx[b] - this.rx[a]) * t;
    const rz = this.rz[a] + (this.rz[b] - this.rz[a]) * t;
    const rl = Math.hypot(rx, rz) || 1;
    out.i = a; out.f = t;
    out.s = a + t;
    out.u = out.s / N;
    out.rx = rx / rl; out.rz = rz / rl;
    out.tx = out.rz; out.tz = -out.rx;
    out.lat = (x - cx) * out.rx + (z - cz) * out.rz;
    out.y = this.y[a] + (this.y[b] - this.y[a]) * t;
    out.hw = this.w[a] + (this.w[b] - this.w[a]) * t;
    out.cx = cx; out.cz = cz;
    return out;
  }

  // Point at continuous sample coord s with lateral offset lat
  pointAt(s, lat = 0, out = {}) {
    const a = this.wrap(Math.floor(s)), b = this.wrap(a + 1), t = s - Math.floor(s);
    const rx = this.rx[a] + (this.rx[b] - this.rx[a]) * t;
    const rz = this.rz[a] + (this.rz[b] - this.rz[a]) * t;
    out.x = this.x[a] + (this.x[b] - this.x[a]) * t + rx * lat;
    out.z = this.z[a] + (this.z[b] - this.z[a]) * t + rz * lat;
    out.y = this.y[a] + (this.y[b] - this.y[a]) * t;
    out.tx = this.tx[a]; out.tz = this.tz[a];
    out.rx = rx; out.rz = rz;
    out.heading = Math.atan2(this.tx[a], this.tz[a]);
    out.hw = this.w[a];
    return out;
  }

  sAtU(u) { return (((u % 1) + 1) % 1) * this.N; }

  wallDist(i) { return this.w[i] + this.shoulder; }

  isIce(u) {
    for (const z of this.ice) if (u >= z.u0 && u <= z.u1) return true;
    return false;
  }

  // Minimum turning radius of the centerline (for validation)
  minRadius() {
    let m = Infinity;
    for (let i = 0; i < this.N; i++) {
      const c = Math.abs(this.curvSmooth[i]);
      if (c > 1e-6) m = Math.min(m, 1 / c);
    }
    return m;
  }
}

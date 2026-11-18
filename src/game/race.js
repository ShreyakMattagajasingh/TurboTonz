// Race simulation: karts, AI, items, collisions, laps & places. Pure logic; emits events.
import { TrackGeo } from './trackgeo.js';
import { makeKart, stepKart, giveBoost, hitKart } from './kart.js';
import { ITEMS, rollItem } from './items.js';

// Countdown: 1 s "ready" intro, then 3 · 2 · 1 (one second each), then GO.
export const COUNTDOWN = 4.0;
export const ROLL_TIME = 1.3;          // item reel spin time
export const RESCUE_TIME = 1.9;        // drone pick-up → carry → drop
const DT = 1 / 60;
export const CC_SCALE = { 50: 0.8, 100: 0.94, 150: 1.06, 200: 1.22 };
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export class Race {
  constructor({ trackDef, racers, laps = 3, cc = 150, seed = 1, attract = false }) {
    this.def = trackDef;
    this.geo = new TrackGeo(trackDef);
    this.laps = attract ? 999 : laps;
    this.scale = CC_SCALE[cc] || 1;
    this.rnd = mulberry(seed);
    this.attract = attract;
    this.phase = attract ? 'race' : 'countdown';
    this.countdown = attract ? 0 : COUNTDOWN;
    this.time = 0;
    this.events = [];
    this.acc = 0;
    this.doneT = 0;
    this.firstHumanFinish = -1;
    this.finished = false;
    this.nextId = 1;
    const g = this.geo;

    // --- features
    this.boxes = [];
    for (const u of trackDef.itemRows) {
      const s = g.sAtU(u);
      for (const f of [-0.6, -0.2, 0.2, 0.6]) {
        const p = g.pointAt(s, f * g.w[Math.floor(s)]);
        this.boxes.push({ id: this.nextId++, x: p.x, y: p.y, z: p.z, alive: true, t: 0 });
      }
    }
    this.pads = trackDef.boostPads.map(b => {
      const s = g.sAtU(b.u);
      const p = g.pointAt(s, b.lat * g.w[Math.floor(s)]);
      return { s0: s, s1: s + b.len / 2, lat: b.lat * g.w[Math.floor(s)], half: 2.6, x: p.x, y: p.y, z: p.z, heading: p.heading, len: b.len };
    });
    this.ramps = trackDef.ramps.map(r => {
      const s = g.sAtU(r.u);
      const p = g.pointAt(s, 0);
      return { s0: s, s1: s + r.len / 2, power: r.power, x: p.x, y: p.y, z: p.z, heading: p.heading, len: r.len, hw: p.hw };
    });
    this.projectiles = [];
    this.hazards = [];

    // --- karts on the grid
    this.karts = racers.map((r, i) => {
      const k = makeKart({ ...r, id: i });
      // staggered two-wide starting grid, pole on the left
      const back = 6 + i * 4.6;
      const s = g.N - back / 2;
      const lat = (i % 2 === 0 ? -1 : 1) * 4.6;
      const p = g.pointAt(s, lat);
      k.x = p.x; k.z = p.z; k.y = p.y; k.heading = p.heading;
      k.ti = Math.floor(g.wrap(s));
      k.u = s / g.N; k.lastU = k.u; k.lap = -1; k.prog = k.lap + k.u;
      k.gridPos = i + 1;
      if (!r.human) k.ai = this.makeAI(r.skill ?? 0.6);
      return k;
    });
    this.updatePlaces();
    this.env = {
      geo: g, scale: this.scale, phase: this.phase,
      emit: (e) => this.events.push(e),
      rampAt: (p) => this.rampAt(p),
    };
  }

  makeAI(skill) {
    return {
      skill, lane: (this.rnd() * 2 - 1) * 0.5, laneT: 2 + this.rnd() * 3,
      itemDelay: 1 + this.rnd() * 3, holdDrift: false, stuckT: 0, reverseT: 0,
    };
  }

  emit(e) { this.events.push(e); }

  rampAt(p) {
    for (const r of this.ramps) if (p.s >= r.s0 && p.s <= r.s1) return r;
    return null;
  }

  humans() { return this.karts.filter(k => k.human); }

  // advance the simulation by real dt; returns events produced since last call
  update(dtReal) {
    this.acc += Math.min(dtReal, 0.1);
    while (this.acc >= DT) { this.step(DT); this.acc -= DT; }
    const ev = this.events; this.events = [];
    return ev;
  }

  step(dt) {
    if (this.phase === 'countdown') {
      const before = this.countdown;
      this.countdown -= dt;
      for (const n of [3, 2, 1]) if (before > n && this.countdown <= n) this.emit({ type: 'count', n });
      // Start boost: press BOOST (LEFT) while the "2" is up and keep holding through GO.
      // Pressed during "3" and held → stall. Pressed during "1" → a small boost.
      for (const k of this.karts) {
        if (k.ai) {
          if (k.sbPress == null && this.countdown < 2 && this.countdown > 1.2 && this.rnd() < k.ai.skill * 0.02) k.sbPress = this.countdown;
          continue;
        }
        const held = k.input.l > 0.5;
        if (held && !k.sbHeld) k.sbPress = this.countdown;
        if (!held) k.sbPress = null;
        k.sbHeld = held;
      }
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.emit({ type: 'go' });
        for (const k of this.karts) {
          const pc = k.sbPress;
          if (pc != null) {
            if (pc > 2) { k.stallT = 0.9; this.emit({ type: 'startStall', k }); }
            else if (pc > 1) { giveBoost(k, 1.4, 1.1); this.emit({ type: 'startBoost', k, level: 2 }); }
            else { giveBoost(k, 0.6, 0.8); this.emit({ type: 'startBoost', k, level: 1 }); }
          }
          k.sbPress = null; k.sbHeld = k.input.l > 0.5;
        }
      }
    }
    if (this.phase !== 'countdown') this.time += dt;
    this.env.phase = this.phase === 'done' ? 'race' : this.phase;

    for (const k of this.karts) {
      if (k.ai && k.rescueT <= 0) this.aiThink(k, dt);
      k.speedMul = k.ai ? k.ai.rb || 1 : 1;
      const prevScale = this.env.scale;
      this.env.scale = this.scale * k.speedMul;
      stepKart(k, dt, this.env);
      this.env.scale = prevScale;
      if (k.rescueT > 0) this.stepRescue(k, dt);
      else this.watchdog(k, dt);
      this.honk(k, dt);
      this.items(k, dt);
      this.features(k);
      this.progress(k);
    }
    this.kartCollisions();
    this.stepProjectiles(dt);
    this.stepBoxes(dt);
    this.updatePlaces();
    this.checkEnd(dt);
  }

  // ---------------- rescue drone ----------------
  // Wrong way for a bit, stuck against something, or fell into the falls → the drone picks
  // you up, turns you the right way and drops you back on the road around the same spot.
  watchdog(k, dt) {
    if (this.phase !== 'race' || this.attract && !k.ai) return;
    if (k.finished && !k.ai) return;
    const g = this.geo;
    // fell short of a gap (or any other way below the world)
    const gp = g.gapAt(k.s);
    if ((gp && k.y < gp.lipY - 5) || k.y < -25) { this.startRescue(k, 'fall'); return; }
    if (!k.grounded) return;
    const i = k.ti >= 0 ? k.ti : 0;
    const dot = Math.sin(k.heading) * g.tx[i] + Math.cos(k.heading) * g.tz[i];
    if (dot < -0.35 && k.v > 2 && k.spinT <= 0) k.wrongT += dt;
    else k.wrongT = Math.max(0, k.wrongT - dt * 2);
    if (k.wrongT > 1.8) { this.startRescue(k, 'wrong'); return; }
    if (Math.abs(k.v) < 3 && k.spinT <= 0 && k.stallT <= 0 && !k.finished) k.stuckT += dt;
    else k.stuckT = 0;
    if (k.stuckT > (k.ai ? 4 : 2.5)) this.startRescue(k, 'stuck');
  }

  startRescue(k, reason) {
    if (k.rescueT > 0) return;
    const g = this.geo;
    let s = k.s;
    if (reason === 'fall') {
      // drop them just past the gap they fell into (friendlier than making them redo the jump)
      const gp = g.gapAt(s) || g.gaps.find(q => s < q.s0 && q.s0 - s < 30);
      if (gp) s = gp.s1 + 5;
    } else if (reason === 'wrong') {
      s = s - 1; // back where they turned around
    }
    let gp2 = g.gapAt(s);
    if (gp2) s = gp2.s1 + 5;
    const hw = g.w[g.wrap(Math.floor(s))];
    const lat = Math.max(-hw * 0.45, Math.min(hw * 0.45, reason === 'fall' ? 0 : k.lat));
    const tp = g.pointAt(s, lat, {});
    k.rescue = { reason, t: 0, fx: k.x, fy: k.y, fz: k.z, fh: k.heading, tx: tp.x, ty: tp.y, tz: tp.z, th: tp.heading };
    k.rescueT = RESCUE_TIME;
    k.v = 0; k.vy = 0; k.kx = 0; k.kz = 0;
    k.drift = 0; k.driftCharge = 0; k.driftLevel = 0; k.driftArm = false;
    k.spinT = 0; k.gliding = false; k.grounded = false; k.trick = false; k.fromRamp = false;
    k.wrongT = 0; k.stuckT = 0;
    this.emit({ type: 'rescue', k, reason });
  }

  stepRescue(k, dt) {
    const r = k.rescue, g = this.geo;
    r.t += dt; k.rescueT -= dt;
    const LIFT = 0.45, CARRY = 1.35, H = 4.5;
    if (r.t < LIFT) {
      const e = smooth(r.t / LIFT);
      k.x = r.fx; k.z = r.fz; k.y = r.fy + e * H; k.heading = r.fh;
    } else if (r.t < CARRY) {
      const e = smooth((r.t - LIFT) / (CARRY - LIFT));
      k.x = r.fx + (r.tx - r.fx) * e; k.z = r.fz + (r.tz - r.fz) * e;
      k.y = r.fy + (r.ty - r.fy) * e + H + Math.sin(e * Math.PI) * 1.5;
      k.heading = r.fh + wrapAngle(r.th - r.fh) * e;
    } else {
      const e = smooth((r.t - CARRY) / (RESCUE_TIME - CARRY));
      k.x = r.tx; k.z = r.tz; k.y = r.ty + (1 - e) * H; k.heading = r.th;
    }
    const p = g.project(k.x, k.z, k.ti, k._proj || (k._proj = {}));
    k.ti = p.i; k.s = p.s; k.lat = p.lat;
    if (k.rescueT <= 0) {
      k.rescueT = 0; k.rescue = null;
      k.x = r.tx; k.z = r.tz; k.y = r.ty; k.heading = r.th;
      k.grounded = true; k.v = 15 * this.scale; k.invulnT = 1.2;
      k.steerIn = 0; k.prevDrift = 1; k.prevHop = 1; // ignore buttons still held from before
      this.emit({ type: 'rescued', k });
    }
  }

  honk(k, dt) {
    k.honkT = Math.max(0, (k.honkT || 0) - dt);
    const held = !k.ai && k.input.l > 0.5;
    if (this.phase === 'race' && held && !k.honkHeld && k.honkT <= 0 && !k.finished) { k.honkT = 0.45; this.emit({ type: 'honk', k }); }
    k.honkHeld = held;
  }

  features(k) {
    if (!k.grounded) return;
    for (const p of this.pads) {
      if (k.s >= p.s0 && k.s <= p.s1 && Math.abs(k.lat - p.lat) < p.half) {
        if (k.boostT < 0.8) this.emit({ type: 'pad', k });
        giveBoost(k, 1.0, 1.0);
      }
    }
  }

  progress(k) {
    const u = k.s / this.geo.N;
    if (k.lastU > 0.8 && u < 0.2) k.lap++;
    else if (k.lastU < 0.2 && u > 0.8) k.lap--;
    k.lastU = u; k.u = u;
    k.prog = k.lap + u;
    if (!k.finished && k.lap >= this.laps && this.phase === 'race') {
      k.finished = true; k.finishTime = this.time;
      if (k.human) {
        k.ai = this.makeAI(0.5);
        if (this.firstHumanFinish < 0) this.firstHumanFinish = this.time;
      }
      this.emit({ type: 'finish', k });
    } else if (k.human && !k.finished && k.lap > (k.maxLap ?? -1)) {
      k.maxLap = k.lap;
      if (k.lap >= 1 && k.lap < this.laps) this.emit({ type: k.lap === this.laps - 1 ? 'finalLap' : 'lap', k, lap: k.lap + 1 });
    }
  }

  updatePlaces() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
    sorted.forEach((k, i) => { k.place = i + 1; });
    this.order = sorted;
  }

  checkEnd(dt) {
    if (this.attract || this.phase !== 'race') return;
    const humans = this.humans();
    const allHumansDone = humans.length > 0 && humans.every(k => k.finished);
    const allDone = this.karts.every(k => k.finished);
    const timeout = this.firstHumanFinish >= 0 && this.time - this.firstHumanFinish > 30;
    if (allHumansDone || allDone || timeout) {
      this.doneT += dt;
      if (this.doneT > (allDone ? 1.5 : 3.5) || timeout) {
        // force-finish the rest by estimated time
        const rest = this.order.filter(k => !k.finished);
        for (const k of rest) {
          const remaining = Math.max(0.01, this.laps - k.prog);
          const avg = this.time / Math.max(0.3, k.prog);
          k.finished = true; k.finishTime = this.time + remaining * avg; k.estimated = true;
        }
        this.updatePlaces();
        this.phase = 'done';
        this.emit({ type: 'raceOver' });
      }
    }
  }

  // ---------------- AI ----------------
  aiThink(k, dt) {
    const ai = k.ai, g = this.geo, inp = k.input;
    const lead = this.order ? this.order[0] : k;
    // rubber band relative to the best human (or leader)
    const humans = this.humans().filter(h => !h.finished);
    if (humans.length && !k.finished) {
      const ref = Math.max(...humans.map(h => h.prog));
      const gap = (k.prog - ref) * g.length; // meters ahead (+) / behind (-)
      ai.rb = gap > 0 ? Math.max(0.86, 1 - gap / 900) : Math.min(1.12, 1 - gap / 1100);
      ai.rb *= 0.94 + 0.08 * ai.skill;
    } else ai.rb = k.finished ? 0.8 : 0.97;

    ai.laneT -= dt;
    if (ai.laneT <= 0) { ai.lane = (this.rnd() * 2 - 1) * 0.45; ai.laneT = 2 + this.rnd() * 4; }
    const look = (9 + Math.max(0, k.v) * 0.55) / 2;
    const ts = k.s + look;
    const curvAhead = g.curvSmooth[g.wrap(Math.floor(k.s + look * 1.4))];
    // inside line on curves
    let lane = ai.lane - Math.sign(curvAhead) * Math.min(0.5, Math.abs(curvAhead) * 25) * ai.skill;
    // dodge hazards ahead
    for (const h of this.hazards) {
      const dx = h.x - k.x, dz = h.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d < 26 && d > 2) {
        const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
        if ((dx * fx + dz * fz) / d > 0.85) {
          const side = dx * -fz + dz * fx; // + = hazard to the left? (right vector = (-fz, fx))
          lane += (side > 0 ? -0.5 : 0.5) * ai.skill;
        }
      }
    }
    lane = Math.max(-0.55, Math.min(0.55, lane));
    const tp = g.pointAt(ts, lane * g.w[g.wrap(Math.floor(ts))], this._tp || (this._tp = {}));
    const want = Math.atan2(tp.x - k.x, tp.z - k.z);
    let diff = want - k.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    let steer = Math.max(-1, Math.min(1, -diff * 2.6));
    inp.g = 1; inp.b = 0;

    // drifting in long curves
    const strong = Math.abs(curvAhead) > 1 / 85 && k.v > 16;
    if (!ai.holdDrift && strong && k.grounded && k.spinT <= 0 && this.rnd() < 0.15 * ai.skill + 0.02) ai.holdDrift = true;
    if (ai.holdDrift) {
      if (!strong && (k.driftLevel >= 1 || k.drift === 0) || k.spinT > 0) ai.holdDrift = false;
      if (k.drift !== 0 && Math.sign(steer) !== k.drift && Math.abs(diff) > 0.8) ai.holdDrift = false;
      // drifting wide into the wall: let go
      const hwNow = g.w[g.wrap(Math.floor(k.s))];
      if (k.drift !== 0 && Math.abs(k.lat) > hwNow * 0.72 && Math.sign(k.lat) === -k.drift) ai.holdDrift = false;
    }
    inp.d = ai.holdDrift ? 1 : 0;
    if (ai.holdDrift && k.drift === 0 && Math.abs(steer) < 0.3) steer = Math.sign(curvAhead || 1) * 0.45;
    inp.s = steer;

    // stuck recovery
    if (this.phase === 'race' && Math.abs(k.v) < 2 && k.spinT <= 0) ai.stuckT += dt; else ai.stuckT = 0;
    if (ai.stuckT > 1.5) { ai.reverseT = 1.0; ai.stuckT = 0; }
    if (ai.reverseT > 0) { ai.reverseT -= dt; inp.g = 0; inp.b = 1; inp.s = -steer; }

    // items
    inp.i = 0;
    if (k.item && k.itemRoll <= 0) {
      ai.itemDelay -= dt;
      if (ai.itemDelay <= 0) {
        let use = false;
        const it = k.item;
        const ahead = this.order[k.place - 2];
        const behind = this.order[k.place];
        if (it === 'nitro' || it === 'triple_nitro') use = Math.abs(curvAhead) < 1 / 120 || ai.itemDelay < -6;
        else if (it === 'oil') use = (behind && (k.prog - behind.prog) * g.length < 25) || ai.itemDelay < -8;
        else if (it === 'bouncer' || it === 'triple_bouncer') {
          if (ahead) {
            const dx = ahead.x - k.x, dz = ahead.z - k.z, d = Math.hypot(dx, dz);
            use = d < 45 && (dx * Math.sin(k.heading) + dz * Math.cos(k.heading)) / d > 0.95;
          }
          use = use || ai.itemDelay < -9;
        } else if (it === 'shield') use = k.shieldT <= 0;
        else use = true;
        if (use) { inp.i = 1; ai.itemDelay = 0.4 + this.rnd() * 2.5; }
      }
    }
    void lead;
  }

  // ---------------- items ----------------
  items(k, dt) {
    if (k.itemRoll > 0) {
      k.itemRoll -= dt;
      if (k.itemRoll <= 0) {
        k.itemRoll = 0;
        k.item = k.itemNext || rollItem(k.place, this.karts.length, this.rnd);
        k.itemNext = null;
        k.itemCharges = ITEMS[k.item].charges;
        this.emit({ type: 'itemGet', k, item: k.item });
      }
    }
    const btn = k.input.i > 0.5;
    const press = btn && !k.itemPrevBtn;
    k.itemPrevBtn = btn;
    if (!press || !k.item || k.itemRoll > 0 || this.phase !== 'race' || k.spinT > 0 || k.rescueT > 0) return;
    if (k.finished && k.human) return;
    this.useItem(k);
  }

  useItem(k) {
    const it = k.item;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const back = k.input.b > 0.5;
    switch (it) {
      case 'nitro': case 'triple_nitro':
        giveBoost(k, 1.3, 1.1); this.emit({ type: 'nitro', k }); break;
      case 'oil': {
        const d = back ? -3.2 : -3.2;
        this.hazards.push({ id: this.nextId++, type: 'oil', x: k.x + fx * d, z: k.z + fz * d, y: k.y, life: 90, owner: k.id, age: 0 });
        if (this.hazards.length > 24) this.hazards.shift();
        this.emit({ type: 'drop', k }); break;
      }
      case 'bouncer': case 'triple_bouncer': {
        const dir = back ? -1 : 1;
        const sp = back ? 26 : Math.max(46, k.v + 22);
        this.projectiles.push({ id: this.nextId++, type: 'bouncer', x: k.x + fx * 2.6 * dir, z: k.z + fz * 2.6 * dir, y: k.y + 0.5,
          vx: fx * sp * dir, vz: fz * sp * dir, life: 7, bounces: 0, owner: k.id, age: 0, ti: k.ti });
        this.emit({ type: 'throw', k }); break;
      }
      case 'rocket': {
        const target = k.place > 1 ? this.order[k.place - 2] : null;
        this.projectiles.push({ id: this.nextId++, type: 'rocket', x: k.x + fx * 2.6, z: k.z + fz * 2.6, y: k.y + 0.6,
          vx: fx * 50, vz: fz * 50, life: 12, owner: k.id, target: target ? target.id : -1, age: 0, ti: k.ti, s: k.s, lat: k.lat });
        this.emit({ type: 'rocketLaunch', k }); break;
      }
      case 'shield': k.shieldT = 10; this.emit({ type: 'shield', k }); break;
      case 'mega': k.megaT = 7.5; k.spinT = 0; giveBoost(k, 0.6, 0.6); this.emit({ type: 'mega', k }); break;
      case 'zap': {
        for (const o of this.karts) {
          if (o.place < k.place && !o.finished) {
            if (hitKart(o, 'zap', this.env)) o.zapT = 5;
          }
        }
        this.emit({ type: 'zap', k }); break;
      }
    }
    k.itemCharges--;
    if (k.itemCharges <= 0) { k.item = null; k.itemCharges = 0; }
  }

  stepBoxes(dt) {
    for (const b of this.boxes) {
      if (!b.alive) { b.t -= dt; if (b.t <= 0) b.alive = true; continue; }
      for (const k of this.karts) {
        if (k.rescueT > 0) continue;
        const dx = k.x - b.x, dz = k.z - b.z;
        if (dx * dx + dz * dz < 2.7 * 2.7 && Math.abs(k.y - b.y) < 3) {
          b.alive = false; b.t = 2.5;
          this.emit({ type: 'box', k, box: b });
          if (!k.item && k.itemRoll <= 0) {
            k.itemNext = rollItem(k.place, this.karts.length, this.rnd);
            k.itemRoll = ROLL_TIME;
            this.emit({ type: 'roll', k, item: k.itemNext, dur: ROLL_TIME });
          }
          break;
        }
      }
    }
  }

  stepProjectiles(dt) {
    const g = this.geo;
    const tmp = this._pp || (this._pp = {});
    for (const pr of this.projectiles) {
      pr.age += dt; pr.life -= dt;
      if (pr.type === 'bouncer') {
        pr.x += pr.vx * dt; pr.z += pr.vz * dt;
        const p = g.project(pr.x, pr.z, pr.ti, tmp); pr.ti = p.i; pr.y = p.y + 0.55;
        const wall = p.hw + g.shoulder - 0.6;
        if (Math.abs(p.lat) > wall) {
          const sgn = Math.sign(p.lat);
          const nx = p.rx * sgn, nz = p.rz * sgn;
          const dot = pr.vx * nx + pr.vz * nz;
          if (dot > 0) { pr.vx -= 2 * dot * nx; pr.vz -= 2 * dot * nz; pr.bounces++; this.emit({ type: 'bounce', pr }); }
          pr.x -= nx * (Math.abs(p.lat) - wall); pr.z -= nz * (Math.abs(p.lat) - wall);
          if (pr.bounces > 6) pr.life = 0;
        }
      } else if (pr.type === 'rocket') {
        const target = this.karts[pr.target];
        let tx, tz;
        const dToT = target ? Math.hypot(target.x - pr.x, target.z - pr.z) : Infinity;
        if (target && (dToT < 28 || pr.locked)) {
          pr.locked = true;
          tx = target.x; tz = target.z;
        } else {
          // follow the track centerline, drifting toward target's lane
          pr.s += 50 * dt / 2;
          const wantLat = target ? target.lat : 0;
          pr.lat += (wantLat - pr.lat) * Math.min(1, dt * 1.5);
          const q = g.pointAt(pr.s + 4, pr.lat, tmp);
          tx = q.x; tz = q.z;
        }
        const dx = tx - pr.x, dz = tz - pr.z, d = Math.hypot(dx, dz) || 1;
        const sp = 52;
        const turn = Math.min(1, dt * (pr.locked ? 10 : 6));
        pr.vx += (dx / d * sp - pr.vx) * turn; pr.vz += (dz / d * sp - pr.vz) * turn;
        const vl = Math.hypot(pr.vx, pr.vz) || 1;
        pr.vx = pr.vx / vl * sp; pr.vz = pr.vz / vl * sp;
        pr.x += pr.vx * dt; pr.z += pr.vz * dt;
        const p = g.project(pr.x, pr.z, pr.ti, tmp); pr.ti = p.i; pr.y = p.y + 0.9;
        if (!pr.locked) pr.s = Math.max(pr.s, p.s);
        if (target && target.finished) pr.life = Math.min(pr.life, 0.5);
      }
      // hits on karts
      if (pr.life > 0) {
        for (const k of this.karts) {
          if (k.id === pr.owner && pr.age < 0.5) continue;
          if (k.rescueT > 0) continue;
          const dx = k.x - pr.x, dz = k.z - pr.z;
          if (dx * dx + dz * dz < (k.megaT > 0 ? 2.6 : 1.8) ** 2 && Math.abs(k.y + 0.5 - pr.y) < 2.5) {
            hitKart(k, pr.type === 'rocket' ? 'explosion' : 'spin', this.env);
            this.emit({ type: 'explode', x: pr.x, y: pr.y, z: pr.z, kind: pr.type });
            pr.life = 0; break;
          }
        }
      }
      // projectile vs hazard
      if (pr.life > 0) {
        for (const h of this.hazards) {
          if (h.life > 0 && (h.x - pr.x) ** 2 + (h.z - pr.z) ** 2 < 2.2 * 2.2) {
            h.life = 0; pr.life = 0; this.emit({ type: 'explode', x: pr.x, y: pr.y, z: pr.z, kind: 'small' }); break;
          }
        }
      }
      if (pr.life <= 0 && !pr.dead) { pr.dead = true; this.emit({ type: 'projDead', pr }); }
    }
    // projectile vs projectile
    for (let i = 0; i < this.projectiles.length; i++) for (let j = i + 1; j < this.projectiles.length; j++) {
      const a = this.projectiles[i], b = this.projectiles[j];
      if (a.life > 0 && b.life > 0 && a.age > 0.3 && b.age > 0.3 && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 2.4 * 2.4) {
        a.life = b.life = 0; this.emit({ type: 'explode', x: a.x, y: a.y, z: a.z, kind: 'small' });
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
    // hazards
    for (const h of this.hazards) {
      h.age += dt; h.life -= dt;
      if (h.life <= 0) continue;
      for (const k of this.karts) {
        if (h.owner === k.id && h.age < 0.6) continue;
        if ((k.x - h.x) ** 2 + (k.z - h.z) ** 2 < 2.0 * 2.0 && k.grounded && k.rescueT <= 0) {
          if (k.invulnT > 0 && k.megaT <= 0) continue; // already spinning — pass through
          hitKart(k, 'spin', this.env); h.life = 0; this.emit({ type: 'oilHit', k, h });
          break;
        }
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
  }

  kartCollisions() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      if (a.rescueT > 0 || b.rescueT > 0) continue;
      const ra = a.megaT > 0 ? 1.9 : 1.25, rb = b.megaT > 0 ? 1.9 : 1.25;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz, R = ra + rb;
      if (d2 >= R * R || Math.abs(a.y - b.y) > 1.8) continue;
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
      if (a.megaT > 0 && b.megaT <= 0) { hitKart(b, 'spin', this.env); }
      else if (b.megaT > 0 && a.megaT <= 0) { hitKart(a, 'spin', this.env); }
      const wa = 0.6 + a.stats.weight, wb = 0.6 + b.stats.weight;
      const pen = R - d;
      a.x -= nx * pen * wb / (wa + wb); a.z -= nz * pen * wb / (wa + wb);
      b.x += nx * pen * wa / (wa + wb); b.z += nz * pen * wa / (wa + wb);
      // relative velocity along normal
      const avx = Math.sin(a.heading) * a.v + a.kx, avz = Math.cos(a.heading) * a.v + a.kz;
      const bvx = Math.sin(b.heading) * b.v + b.kx, bvz = Math.cos(b.heading) * b.v + b.kz;
      const rel = (avx - bvx) * nx + (avz - bvz) * nz;
      if (rel > 0) {
        const imp = rel * 1.2 + 3;
        a.kx -= nx * imp * wb / (wa + wb); a.kz -= nz * imp * wb / (wa + wb);
        b.kx += nx * imp * wa / (wa + wb); b.kz += nz * imp * wa / (wa + wb);
        if (rel > 3) this.emit({ type: 'bump', a, b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.6, z: (a.z + b.z) / 2, rel });
      }
    }
  }

  standings() {
    return this.order.map(k => ({ id: k.id, name: k.name, char: k.char, color: k.color, human: k.human, slot: k.slot, place: k.place, time: k.finishTime, estimated: !!k.estimated }));
  }
}

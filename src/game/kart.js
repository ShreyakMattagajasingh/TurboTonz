// Arcade kart physics. Pure logic (no rendering). Fixed timestep friendly.
//
// Everyone drives at the same speed: there is no gas or brake for humans. The kart always
// drives forward and you steer, drift, hop and use items. Character stats are cosmetic;
// physics uses one shared stat line so a party race is fair.

export const DRIFT_LEVELS = [0, 0.85, 1.8, 2.9]; // seconds of charge for blue / orange / purple
const DRIFT_BOOST = [0, 0.55, 1.0, 1.5];
const GRAVITY = 30;
export const GLIDE_GRAVITY = 9;      // while the glider is out over a cliff gap
const SHARED_STATS = { speed: 0.5, accel: 0.55, handling: 0.6, weight: 0.5 };

const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function emptyInput() { return { s: 0, d: 0, i: 0, l: 0, u: 0, g: 0, b: 0 }; }

export function makeKart(opts) {
  return {
    id: opts.id, slot: opts.slot ?? -1, name: opts.name || 'Racer', char: opts.char, color: opts.color || '#fff',
    human: !!opts.human, stats: SHARED_STATS, look: opts.stats || null,
    x: 0, y: 0, z: 0, heading: 0,
    v: 0, vy: 0, kx: 0, kz: 0,           // forward speed, vertical, knockback velocity
    grounded: true, airT: 0, gliding: false, fromRamp: false,
    steerIn: 0,                           // smoothed steering input (humans)
    steerVis: 0,                          // smoothed steer for visuals
    drift: 0, driftCharge: 0, driftLevel: 0, hopT: 0, driftVis: 0, driftArm: false,
    boostT: 0, boostPow: 0, stallT: 0,
    spinT: 0, spinVis: 0, squash: 0,
    megaT: 0, shieldT: 0, zapT: 0, invulnT: 0, trick: false,
    offroad: false, onIce: false,
    // rescue drone (wrong way / stuck / fell): handled by Race
    rescueT: 0, rescue: null, wrongT: 0, stuckT: 0,
    // track progress
    ti: -1, s: 0, u: 0, lat: 0, lap: -1, lastU: 0, prog: -1, place: 1,
    finished: false, finishTime: 0,
    item: null, itemCharges: 0, itemRoll: 0, itemNext: null, itemPrevBtn: false,
    input: emptyInput(),
    prevDrift: 0, prevHop: 0,
    ai: null,
  };
}

export function speedCap(k, scale) {
  let cap = (28 + 5 * k.stats.speed) * scale;
  if (k.zapT > 0) cap *= 0.7;
  if (k.megaT > 0) cap *= 1.12;
  return cap;
}

// One physics step. env = { geo, scale, phase, emit(evt), rampAt(p) }
export function stepKart(k, dt, env) {
  const { geo, scale } = env;
  const inp = k.input;
  const racing = env.phase === 'race' && !k.finished;
  const canDrive = racing || (k.finished && k.ai);

  // --- timers
  k.boostT = Math.max(0, k.boostT - dt);
  k.megaT = Math.max(0, k.megaT - dt);
  k.shieldT = Math.max(0, k.shieldT - dt);
  k.zapT = Math.max(0, k.zapT - dt);
  k.invulnT = Math.max(0, k.invulnT - dt);
  k.stallT = Math.max(0, k.stallT - dt);
  k.squash = Math.max(0, k.squash - dt * 2.5);
  if (k.spinT > 0) { k.spinT -= dt; k.spinVis += dt * 14; if (k.spinT <= 0) { k.spinT = 0; } }
  else k.spinVis = k.spinVis % (Math.PI * 2) * Math.max(0, 1 - dt * 6);
  if (k.rescueT > 0) return; // the drone has us; Race moves the kart

  const control = canDrive && k.spinT <= 0 && k.stallT <= 0;

  // --- steering input (humans get a smoothing filter so phone jitter never reaches the kart)
  const rawSteer = control ? clamp(inp.s || 0, -1, 1) : 0;
  if (k.human) k.steerIn += (rawSteer - k.steerIn) * Math.min(1, dt * 14);
  else k.steerIn = rawSteer;
  const steer = k.steerIn;

  // --- surface
  const p = geo.project(k.x, k.z, k.ti, k._proj || (k._proj = {}));
  k.ti = p.i; k.lat = p.lat; k.s = p.s;
  k.offroad = false;
  k.onIce = geo.isIce(p.u);

  let cap = speedCap(k, scale);
  const boosting = k.boostT > 0;
  if (boosting) cap *= 1.0 + 0.32 * k.boostPow;
  if (!k.grounded) cap = Math.max(cap, k.v);

  // --- longitudinal: humans always drive; AI can reverse out of trouble
  const accel = (11 + 7 * k.stats.accel) * scale;
  const brake = control && !k.human && inp.b > 0.5;
  const gas = control && !brake && (k.human || inp.g > 0.5 || boosting);
  if (k.spinT > 0) {
    k.v *= Math.exp(-3.2 * dt);
  } else if (k.stallT > 0) {
    k.v *= Math.exp(-6 * dt);
  } else if (gas) {
    if (k.v < cap) {
      const a = boosting ? accel * 2.4 : accel * (1 - 0.55 * Math.max(0, k.v) / cap);
      k.v = Math.min(cap, k.v + a * dt + (k.v < 0 ? 18 * dt : 0));
    } else {
      k.v = Math.max(cap, k.v - 9 * dt);
    }
  } else if (brake) {
    if (k.v > 0) k.v = Math.max(-1, k.v - 30 * dt);
    else k.v = Math.max(-9, k.v - 12 * dt);
  } else {
    k.v *= Math.exp(-0.55 * dt);
    if (Math.abs(k.v) < 0.2) k.v = 0;
    if (k.v > cap) k.v = Math.max(cap, k.v - 20 * dt);
  }

  // --- hop (UP or DOWN) / drift (hold DOWN)
  const driftBtn = control && inp.d > 0.5;
  const hopBtn = control && inp.u > 0.5;
  const dPressed = driftBtn && !k.prevDrift;
  const uPressed = hopBtn && !k.prevHop;
  k.prevDrift = driftBtn ? 1 : 0;
  k.prevHop = hopBtn ? 1 : 0;
  if ((dPressed || uPressed) && k.grounded) {
    k.vy = 5.2; k.grounded = false; k.hopT = 0.0; env.emit({ type: 'hop', k });
    k.driftArm = dPressed;
  } else if ((dPressed || uPressed) && !k.grounded && k.fromRamp && !k.trick) {
    k.trick = true; env.emit({ type: 'trick', k });
  }
  if (!driftBtn) {
    if (k.drift !== 0) {
      const lvl = k.driftLevel;
      if (lvl > 0) { giveBoost(k, DRIFT_BOOST[lvl], 0.75 + 0.15 * lvl); env.emit({ type: 'miniTurbo', k, level: lvl }); }
      k.drift = 0; k.driftCharge = 0; k.driftLevel = 0;
    }
    k.driftArm = false;
  }

  // --- steering
  k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 10);
  const handling = 0.5 + 0.5 * k.stats.handling;
  const vAbs = Math.abs(k.v);
  const speedFactor = Math.min(1, vAbs / 7);
  let yawRate = 0;
  if (k.drift !== 0) {
    // inner steer = tighter, outer = wider
    const rel = steer * k.drift; // -1..1
    yawRate = k.drift * (0.42 + 1.0 * (rel + 1) / 2) * (0.85 + 0.3 * handling) * speedFactor;
    {
      // drift assist: with the stick near centre the kart follows the corner by itself,
      // so "hold DOWN through the turn" is enough to get a clean drift on a phone.
      const lookS = k.s + (10 + vAbs * 0.45) / 2;
      const tp = geo.pointAt(lookS, clamp(k.lat, -p.hw * 0.6, p.hw * 0.6), k._tp || (k._tp = {}));
      const diff = wrapAngle(Math.atan2(tp.x - k.x, tp.z - k.z) - k.heading);
      const assist = clamp(-diff * 2.4, -1.7, 1.7) * speedFactor;
      const w = k.human ? 0.2 + 0.6 * (1 - Math.min(1, Math.abs(steer) / 0.7)) : 0.55;
      yawRate = yawRate * (1 - w) + assist * w;
    }
    if (k.grounded) {
      k.driftCharge += dt * (0.8 + 0.5 * Math.max(0, rel));
      let lvl = 0;
      for (let l = 3; l >= 1; l--) if (k.driftCharge >= DRIFT_LEVELS[l]) { lvl = l; break; }
      if (lvl > k.driftLevel) { k.driftLevel = lvl; env.emit({ type: 'driftLevel', k, level: lvl }); }
    }
    if (vAbs < 8) { k.drift = 0; k.driftCharge = 0; k.driftLevel = 0; }
  } else {
    const hiSpeedDamp = 1 - 0.3 * Math.min(1, vAbs / 30);
    yawRate = steer * (1.6 + 0.9 * handling) * speedFactor * hiSpeedDamp;
    if (k.onIce) yawRate *= 0.55;
  }
  if (k.v < 0) yawRate = -yawRate;
  if (!k.grounded) yawRate *= k.gliding ? 0.75 : 0.6;
  if (k.gliding) {
    // glider keeps you pointed at the far cliff so nobody misses the landing
    const want = Math.atan2(p.tx, p.tz);
    k.heading += wrapAngle(want - k.heading) * Math.min(1, dt * 1.6);
  }
  k.heading -= yawRate * dt;
  k.driftVis += ((k.drift * 0.42) - k.driftVis) * Math.min(1, dt * 7);

  // --- integrate position
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  k.x += (fx * k.v + k.kx) * dt;
  k.z += (fz * k.v + k.kz) * dt;
  const kd = Math.exp(-5 * dt);
  k.kx *= kd; k.kz *= kd;

  // --- vertical
  const p2 = geo.project(k.x, k.z, k.ti, k._proj);
  k.ti = p2.i; k.s = p2.s; k.lat = p2.lat;
  const gap = geo.gapAt(p2.s);
  const groundY = gap ? -60 : p2.y;
  if (gap && !k.gliding && k.rescueT <= 0) {
    // off the cliff: pop the glider. Works even if we arrive mid-hop or spinning.
    k.gliding = true; k.grounded = false; k.airT = 0; k.trick = false; k.fromRamp = true;
    k.vy = Math.max(k.vy, gap.power);
    k.drift = 0; k.driftCharge = 0; k.driftLevel = 0;
    env.emit({ type: 'cliff', k });
  }
  if (k.gliding && !k.grounded) {
    // the glider carries you across even if you were slowed or hit
    const minV = 21 * Math.max(0.9, scale);
    if (k.v < minV) k.v += (minV - k.v) * Math.min(1, dt * 3);
    // ease back towards the road centre
    k.kx -= p2.rx * p2.lat * 0.35 * dt * 4;
    k.kz -= p2.rz * p2.lat * 0.35 * dt * 4;
  }
  if (k.grounded) {
    const ramp = env.rampAt ? env.rampAt(p2) : null;
    if (ramp && k.v > 10) {
      k.vy = ramp.power * Math.min(1.2, k.v / 28); k.grounded = false; k.airT = 0; k.trick = false; k.fromRamp = true;
      env.emit({ type: 'ramp', k });
    } else {
      k.y = groundY;
    }
  }
  if (!k.grounded) {
    k.airT += dt;
    k.vy -= (k.gliding ? GLIDE_GRAVITY : GRAVITY) * dt;
    if (k.gliding) k.vy = Math.max(k.vy, -9); // glider limits sink rate
    k.y += k.vy * dt;
    if (k.y <= groundY) {
      k.y = groundY;
      const wasHop = k.airT < 0.5;
      k.grounded = true; k.vy = 0;
      if (k.trick) { giveBoost(k, 0.7, 0.8); env.emit({ type: 'trickBoost', k }); }
      if (k.gliding) { k.gliding = false; env.emit({ type: 'glideLand', k }); }
      k.trick = false; k.fromRamp = false;
      if (!wasHop || k.airT > 0.3) env.emit({ type: 'land', k });
      k.airT = 0;
      // start a drift after the hop: direction from the stick, or from the corner ahead if the stick is centred
      if (k.driftArm && driftBtn && vAbs > 10 && k.drift === 0) {
        let dir = 0;
        if (Math.abs(steer) > 0.25) dir = Math.sign(steer);
        else if (k.human) {
          const c = geo.curvSmooth[geo.wrap(Math.floor(k.s + 8))];
          if (Math.abs(c) > 1 / 260) dir = Math.sign(c);
        }
        if (dir) {
          k.drift = dir; k.driftCharge = 0; k.driftLevel = 0;
          env.emit({ type: 'driftStart', k });
        }
      }
      k.driftArm = false;
    }
  }

  // --- walls: they sit right on the curb, so you slide along them instead of leaving the road
  const wall = p2.hw + geo.shoulder;
  if (Math.abs(p2.lat) > wall - 0.9) {
    const sgn = Math.sign(p2.lat);
    const pen = Math.abs(p2.lat) - (wall - 0.9);
    k.x -= p2.rx * sgn * pen;
    k.z -= p2.rz * sgn * pen;
    const vx = fx * k.v, vz = fz * k.v;
    const into = (vx * p2.rx + vz * p2.rz) * sgn;
    if (into > 0) {
      const tang = vx * p2.tx + vz * p2.tz;
      const impact = into;
      const newHeading = Math.atan2(p2.tx * Math.sign(tang || 1), p2.tz * Math.sign(tang || 1));
      k.heading += wrapAngle(newHeading - k.heading) * 0.35;
      k.v *= Math.max(0.72, 1 - impact / 70);
      k.kx -= p2.rx * sgn * impact * 0.18;
      k.kz -= p2.rz * sgn * impact * 0.18;
      if (impact > 5) env.emit({ type: 'wall', k, impact });
    }
  }
}

export function giveBoost(k, dur, pow = 1) {
  k.boostT = Math.max(k.boostT, dur);
  k.boostPow = Math.max(pow, k.boostPow * 0.5);
}

// Returns true if the hit landed
export function hitKart(k, kind, env) {
  if (k.megaT > 0 || k.invulnT > 0 || k.rescueT > 0) return false;
  if (k.shieldT > 0) { k.shieldT = 0; k.invulnT = 0.5; env.emit({ type: 'shieldBlock', k }); return false; }
  const dur = kind === 'explosion' ? 1.4 : kind === 'zap' ? 0.9 : 1.1;
  k.spinT = dur; k.invulnT = dur + 0.6; k.squash = 1;
  k.drift = 0; k.driftCharge = 0; k.driftLevel = 0; k.boostT = 0;
  if (kind === 'explosion' && !k.gliding) { k.vy = 7; k.grounded = false; k.airT = 0.6; }
  env.emit({ type: 'hit', k, kind });
  return true;
}

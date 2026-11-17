// Arcade kart physics. Pure logic (no rendering). Fixed timestep friendly.

export const DRIFT_LEVELS = [0, 0.85, 1.8, 2.9]; // seconds of charge for blue / orange / purple
const DRIFT_BOOST = [0, 0.55, 1.0, 1.5];
const GRAVITY = 30;

export function makeKart(opts) {
  const st = opts.stats || { speed: 0.5, accel: 0.5, handling: 0.5, weight: 0.5 };
  return {
    id: opts.id, slot: opts.slot ?? -1, name: opts.name || 'Racer', char: opts.char, color: opts.color || '#fff',
    human: !!opts.human, stats: st,
    x: 0, y: 0, z: 0, heading: 0,
    v: 0, vy: 0, kx: 0, kz: 0,           // forward speed, vertical, knockback velocity
    grounded: true, airT: 0,
    steerVis: 0,                          // smoothed steer for visuals
    drift: 0, driftCharge: 0, driftLevel: 0, driftHeld: false, hopT: 0, driftVis: 0,
    boostT: 0, boostPow: 0,
    spinT: 0, spinVis: 0, squash: 0,
    megaT: 0, shieldT: 0, zapT: 0, invulnT: 0, trick: false,
    offroad: false, onIce: false,
    // track progress
    ti: -1, s: 0, u: 0, lat: 0, lap: -1, lastU: 0, prog: -1, place: 1,
    finished: false, finishTime: 0,
    item: null, itemCharges: 0, itemRoll: 0, itemPrevBtn: false,
    input: { s: 0, g: 0, b: 0, d: 0, i: 0 },
    prevDrift: 0,
    ai: null,
    events: null,
    startBoostWindow: 0,
  };
}

export function speedCap(k, scale) {
  let cap = (28 + 5 * k.stats.speed) * scale;
  if (k.zapT > 0) cap *= 0.7;
  if (k.megaT > 0) cap *= 1.12;
  return cap;
}

// One physics step. env = { geo, scale, phase, emit(evt) }
export function stepKart(k, dt, env) {
  const { geo, scale } = env;
  const inp = k.input;
  const racing = env.phase === 'race' && !k.finished;
  const canDrive = racing || (k.finished && k.ai);
  const control = canDrive && k.spinT <= 0;

  // --- timers
  k.boostT = Math.max(0, k.boostT - dt);
  k.megaT = Math.max(0, k.megaT - dt);
  k.shieldT = Math.max(0, k.shieldT - dt);
  k.zapT = Math.max(0, k.zapT - dt);
  k.invulnT = Math.max(0, k.invulnT - dt);
  k.squash = Math.max(0, k.squash - dt * 2.5);
  if (k.spinT > 0) { k.spinT -= dt; k.spinVis += dt * 14; if (k.spinT <= 0) { k.spinT = 0; } }
  else k.spinVis = k.spinVis % (Math.PI * 2) * Math.max(0, 1 - dt * 6);

  // --- surface
  const p = geo.project(k.x, k.z, k.ti, k._proj || (k._proj = {}));
  k.ti = p.i; k.lat = p.lat; k.s = p.s;
  const absLat = Math.abs(p.lat);
  k.offroad = absLat > p.hw + 0.3 && k.megaT <= 0 && k.boostT <= 0.05;
  k.onIce = geo.isIce(p.u);

  let cap = speedCap(k, scale);
  const boosting = k.boostT > 0;
  if (boosting) cap *= 1.0 + 0.32 * k.boostPow;
  if (k.offroad) cap *= 0.48;
  if (!k.grounded) cap = Math.max(cap, k.v);

  // --- longitudinal
  const accel = (11 + 7 * k.stats.accel) * scale;
  const gas = control && (inp.g > 0.5 || boosting);
  const brake = control && inp.b > 0.5;
  if (k.spinT > 0) {
    k.v *= Math.exp(-3.2 * dt);
  } else if (gas && !brake) {
    if (k.v < cap) {
      const a = boosting ? accel * 2.4 : accel * (1 - 0.55 * Math.max(0, k.v) / cap);
      k.v = Math.min(cap, k.v + a * dt + (k.v < 0 ? 18 * dt : 0));
    } else {
      k.v = Math.max(cap, k.v - (k.offroad ? 40 : 9) * dt);
    }
  } else if (brake) {
    if (k.v > 0) k.v = Math.max(-1, k.v - 30 * dt);
    else k.v = Math.max(-9, k.v - 12 * dt);
  } else {
    k.v *= Math.exp(-(k.offroad ? 1.6 : 0.55) * dt);
    if (Math.abs(k.v) < 0.2) k.v = 0;
    if (k.v > cap) k.v = Math.max(cap, k.v - 20 * dt);
  }

  // --- drift / hop
  const driftBtn = control && inp.d > 0.5;
  const pressed = driftBtn && !k.prevDrift;
  k.prevDrift = driftBtn ? 1 : 0;
  if (pressed && k.grounded) {
    k.vy = 5.2; k.grounded = false; k.hopT = 0.0; env.emit({ type: 'hop', k });
    k.driftArm = true;
  }
  if (pressed && !k.grounded && k.fromRamp && !k.trick) {
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
  const steer = control ? Math.max(-1, Math.min(1, inp.s)) : 0;
  k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 10);
  const handling = 0.5 + 0.5 * k.stats.handling;
  const vAbs = Math.abs(k.v);
  const speedFactor = Math.min(1, vAbs / 7);
  let yawRate = 0;
  if (k.drift !== 0) {
    // inner steer = tighter, outer = wider
    const rel = steer * k.drift; // -1..1
    yawRate = k.drift * (0.42 + 1.0 * (rel + 1) / 2) * (0.85 + 0.3 * handling) * speedFactor;
    if (k.grounded) {
      k.driftCharge += dt * (0.8 + 0.5 * Math.max(0, rel)) * (k.offroad ? 0.4 : 1);
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
  if (!k.grounded) yawRate *= 0.6;
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
  k.ti = p2.i;
  const groundY = p2.y;
  if (k.grounded) {
    // ramp launch
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
    k.vy -= GRAVITY * dt;
    k.y += k.vy * dt;
    if (k.y <= groundY) {
      k.y = groundY;
      const wasHop = k.airT < 0.5;
      k.grounded = true; k.vy = 0;
      if (k.trick) { giveBoost(k, 0.7, 0.8); env.emit({ type: 'trickBoost', k }); }
      k.trick = false; k.fromRamp = false;
      if (!wasHop || k.airT > 0.3) env.emit({ type: 'land', k });
      k.airT = 0;
      // start drift after hop if steering
      if (k.driftArm && driftBtn && Math.abs(steer) > 0.25 && vAbs > 10 && k.drift === 0) {
        k.drift = Math.sign(steer); k.driftCharge = 0; k.driftLevel = 0;
        env.emit({ type: 'driftStart', k });
      }
      k.driftArm = false;
    }
  }

  // --- walls
  const wall = p2.hw + geo.shoulder;
  if (Math.abs(p2.lat) > wall - 0.9) {
    const sgn = Math.sign(p2.lat);
    const pen = Math.abs(p2.lat) - (wall - 0.9);
    k.x -= p2.rx * sgn * pen;
    k.z -= p2.rz * sgn * pen;
    // velocity component into the wall
    const vx = fx * k.v, vz = fz * k.v;
    const into = (vx * p2.rx + vz * p2.rz) * sgn;
    if (into > 0) {
      const tang = vx * p2.tx + vz * p2.tz;
      const impact = into;
      // redirect heading along the wall
      const newHeading = Math.atan2(p2.tx * Math.sign(tang || 1), p2.tz * Math.sign(tang || 1));
      let dh = newHeading - k.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      k.heading += dh * 0.5;
      k.v *= Math.max(0.35, 1 - impact / 40);
      k.kx -= p2.rx * sgn * impact * 0.35;
      k.kz -= p2.rz * sgn * impact * 0.35;
      if (impact > 4) env.emit({ type: 'wall', k, impact });
    }
  }
}

export function giveBoost(k, dur, pow = 1) {
  k.boostT = Math.max(k.boostT, dur);
  k.boostPow = Math.max(k.boostT > 0 ? k.boostPow * 0.5 : 0, pow);
  k.boostPow = Math.max(pow, k.boostPow);
}

// Returns true if the hit landed
export function hitKart(k, kind, env) {
  if (k.megaT > 0 || k.invulnT > 0) return false;
  if (k.shieldT > 0) { k.shieldT = 0; k.invulnT = 0.5; env.emit({ type: 'shieldBlock', k }); return false; }
  const dur = kind === 'explosion' ? 1.4 : kind === 'zap' ? 0.9 : 1.1;
  k.spinT = dur; k.invulnT = dur + 0.6; k.squash = 1;
  k.drift = 0; k.driftCharge = 0; k.driftLevel = 0; k.boostT = 0;
  if (kind === 'explosion') { k.vy = 7; k.grounded = false; k.airT = 0.6; }
  env.emit({ type: 'hit', k, kind });
  return true;
}

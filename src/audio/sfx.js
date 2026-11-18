// Designed one-shot sound effects. Each entry receives a helper object and
// returns the approximate total duration in seconds (used for node cleanup).
import { tone, noise, bell, noteFreq as N } from './synth.js';

function helpers(ctx, out, t0, pitch) {
  return {
    tone: (o) => tone(ctx, out, { pitch, ...o, t: t0 + (o.at || 0) }),
    noise: (o) => noise(ctx, out, { pitch, ...o, t: t0 + (o.at || 0) }),
    bell: (o) => bell(ctx, out, { pitch, ...o, t: t0 + (o.at || 0) }),
  };
}

function miniTurbo(h, level) {
  // 1 = small blue spark, 2 = orange, 3 = purple mega spark
  const base = [0, 620, 760, 900][level];
  h.noise({ ftype: 'highpass', f: 2500, f2: 7000, dur: 0.18 + level * 0.04, vol: 0.18 + level * 0.04, q: 0.8 });
  h.tone({ type: 'square', f: base, f2: base * 2, dur: 0.16 + level * 0.03, vol: 0.2, lp: 4000 });
  if (level >= 2) h.tone({ type: 'square', f: base * 1.5, f2: base * 3, dur: 0.2, vol: 0.14, at: 0.07, lp: 5000 });
  if (level >= 3) {
    h.tone({ type: 'sawtooth', f: base * 2, f2: base * 4, dur: 0.3, vol: 0.14, at: 0.14, lp: 6000 });
    h.bell({ f: N('e6'), vol: 0.14, dur: 0.5, at: 0.18 });
    h.noise({ ftype: 'bandpass', f: 500, f2: 3500, q: 1.5, dur: 0.4, vol: 0.2, at: 0.05 });
  }
  return 0.6;
}

export const SFX = {
  countdown(h) {
    h.tone({ type: 'square', f: N('a4'), dur: 0.3, vol: 0.28, lp: 3000, sustain: true });
    h.tone({ type: 'sine', f: N('a5'), dur: 0.3, vol: 0.12, sustain: true });
    return 0.4;
  },
  go(h) {
    for (const f of [N('a5'), N('c#6'), N('e6')]) {
      h.tone({ type: 'square', f, dur: 0.6, vol: 0.18, lp: 5000, sustain: true });
    }
    h.tone({ type: 'sawtooth', f: N('a4'), f2: N('a5'), dur: 0.12, vol: 0.16, lp: 3000 });
    h.noise({ ftype: 'bandpass', f: 800, f2: 5000, q: 1, dur: 0.3, vol: 0.14 });
    return 0.7;
  },
  itemBox(h) {
    const notes = ['c6', 'e6', 'g6', 'c7', 'e7'];
    notes.forEach((n, i) => {
      h.tone({ type: 'triangle', f: N(n), dur: 0.22, vol: 0.2, at: i * 0.045 });
      h.bell({ f: N(n), vol: 0.1, dur: 0.35, at: i * 0.045 });
    });
    h.noise({ ftype: 'highpass', f: 6000, dur: 0.3, vol: 0.06, at: 0.05 });
    return 0.7;
  },
  roulette(h) {
    h.tone({ type: 'square', f: 1250, f2: 820, dur: 0.045, vol: 0.18, lp: 3500 });
    return 0.1;
  },
  itemGet(h) {
    ['g5', 'c6', 'e6', 'g6'].forEach((n, i) => {
      h.tone({ type: 'square', f: N(n), dur: 0.11, vol: 0.17, at: i * 0.065, lp: 4500 });
    });
    h.bell({ f: N('c7'), vol: 0.16, dur: 0.6, at: 0.26 });
    return 0.9;
  },
  boost(h) {
    h.noise({ ftype: 'bandpass', f: 350, f2: 4200, q: 2.2, dur: 0.7, vol: 0.5, a: 0.05 });
    h.tone({ type: 'sawtooth', f: 110, f2: 420, dur: 0.6, vol: 0.18, lp: 2200, a: 0.03 });
    h.noise({ ftype: 'highpass', f: 3000, dur: 0.5, vol: 0.1, at: 0.1 });
    return 0.8;
  },
  miniTurbo1: (h) => miniTurbo(h, 1),
  miniTurbo2: (h) => miniTurbo(h, 2),
  miniTurbo3: (h) => miniTurbo(h, 3),
  driftStart(h) {
    h.noise({ ftype: 'bandpass', f: 2600, f2: 1800, q: 6, dur: 0.22, vol: 0.2, a: 0.01 });
    h.tone({ type: 'sawtooth', f: 180, f2: 120, dur: 0.15, vol: 0.1, lp: 900 });
    return 0.3;
  },
  hop(h) {
    h.tone({ type: 'sine', f: 280, f2: 760, fdur: 0.1, dur: 0.16, vol: 0.3 });
    h.tone({ type: 'triangle', f: 560, f2: 1200, fdur: 0.1, dur: 0.12, vol: 0.1 });
    return 0.2;
  },
  spin(h) {
    h.tone({ type: 'sawtooth', f: 950, f2: 140, dur: 0.9, vol: 0.2, lp: 3000, vib: { rate: 13, depth: 500 } });
    h.tone({ type: 'sine', f: 700, f2: 100, dur: 0.9, vol: 0.18, fm: { ratio: 0.5, depth: 120, depth2: 10 } });
    h.noise({ ftype: 'bandpass', f: 1500, f2: 400, q: 2, dur: 0.6, vol: 0.12 });
    return 1.0;
  },
  hit(h) {
    h.noise({ ftype: 'lowpass', f: 2800, f2: 250, q: 0.8, dur: 0.28, vol: 0.5 });
    h.tone({ type: 'square', f: 200, f2: 55, dur: 0.22, vol: 0.4, lp: 1200 });
    h.tone({ type: 'triangle', f: 900, f2: 300, dur: 0.1, vol: 0.2 });
    return 0.4;
  },
  shieldBlock(h) {
    h.tone({ type: 'sine', f: 1800, dur: 0.45, vol: 0.22, fm: { ratio: 1.5, depth: 600, depth2: 20 } });
    h.tone({ type: 'sine', f: 2700, dur: 0.3, vol: 0.12 });
    h.noise({ ftype: 'highpass', f: 5000, dur: 0.15, vol: 0.2 });
    h.tone({ type: 'triangle', f: 300, f2: 150, dur: 0.1, vol: 0.2 });
    return 0.5;
  },
  throw(h) {
    h.noise({ ftype: 'bandpass', f: 500, f2: 2200, q: 1.5, dur: 0.17, vol: 0.3 });
    h.tone({ type: 'triangle', f: 300, f2: 620, dur: 0.12, vol: 0.18 });
    return 0.25;
  },
  drop(h) {
    h.tone({ type: 'sine', f: 520, f2: 140, dur: 0.18, vol: 0.3 });
    h.noise({ ftype: 'lowpass', f: 1200, f2: 200, dur: 0.1, vol: 0.25, at: 0.08 });
    h.tone({ type: 'square', f: 110, f2: 60, dur: 0.12, vol: 0.2, at: 0.08, lp: 600 });
    return 0.3;
  },
  rocketLaunch(h) {
    h.noise({ ftype: 'lowpass', f: 300, f2: 3200, q: 1.2, dur: 0.95, vol: 0.5, a: 0.04 });
    h.tone({ type: 'sawtooth', f: 80, f2: 340, dur: 0.9, vol: 0.2, lp: 1400 });
    h.noise({ ftype: 'highpass', f: 2500, dur: 0.6, vol: 0.12, at: 0.1 });
    h.tone({ type: 'square', f: 55, dur: 0.15, vol: 0.3, lp: 300 });
    return 1.0;
  },
  explosion(h) {
    h.noise({ ftype: 'lowpass', f: 4000, f2: 90, q: 0.7, dur: 1.2, vol: 0.9, a: 0.002 });
    h.tone({ type: 'sine', f: 130, f2: 32, fdur: 0.5, dur: 0.9, vol: 0.9, a: 0.002 });
    h.noise({ ftype: 'highpass', f: 3500, dur: 0.18, vol: 0.3 });
    for (let i = 0; i < 4; i++) h.noise({ ftype: 'bandpass', f: 1500 + i * 700, q: 2, dur: 0.06, vol: 0.2, at: 0.1 + i * 0.07 });
    return 1.3;
  },
  zap(h) {
    h.tone({ type: 'sawtooth', f: 900, f2: 160, dur: 0.65, vol: 0.2, lp: 5000, fm: { ratio: 7.1, depth: 900, depth2: 80 } });
    h.tone({ type: 'square', f: 1400, f2: 300, dur: 0.5, vol: 0.1, vib: { rate: 38, depth: 900 } });
    for (let i = 0; i < 6; i++) h.noise({ ftype: 'highpass', f: 4000, dur: 0.04, vol: 0.28, at: i * 0.09 + Math.random() * 0.03 });
    return 0.8;
  },
  mega(h) {
    h.tone({ type: 'sawtooth', f: 70, f2: 300, dur: 0.9, vol: 0.28, lp: 1800, a: 0.03 });
    h.tone({ type: 'square', f: 72, f2: 305, dur: 0.9, vol: 0.14, lp: 1500, detune: 12 });
    ['c3', 'e3', 'g3', 'c4'].forEach((n, i) => {
      h.tone({ type: 'square', f: N(n), dur: 0.25, vol: 0.16, at: 0.1 + i * 0.12, lp: 2200 });
    });
    h.tone({ type: 'sine', f: 90, f2: 35, dur: 0.5, vol: 0.5, at: 0.62 });
    h.noise({ ftype: 'lowpass', f: 400, f2: 2400, dur: 0.8, vol: 0.25, a: 0.05 });
    return 1.3;
  },
  lap(h) {
    h.bell({ f: N('e6'), vol: 0.3, dur: 0.7 });
    h.bell({ f: N('a6'), vol: 0.3, dur: 0.9, at: 0.15 });
    h.tone({ type: 'triangle', f: N('e5'), dur: 0.3, vol: 0.1, sustain: true });
    return 1.1;
  },
  finalLap(h) {
    const seq = [['c5', 0], ['e5', 0.1], ['g5', 0.2], ['c6', 0.3]];
    seq.forEach(([n, at]) => h.tone({ type: 'square', f: N(n), dur: 0.12, vol: 0.2, at, lp: 4500, sustain: true }));
    for (const n of ['c5', 'e5', 'g5', 'c6']) h.tone({ type: 'square', f: N(n), dur: 0.55, vol: 0.12, at: 0.4, lp: 4000, sustain: true });
    h.bell({ f: N('c7'), vol: 0.2, dur: 0.8, at: 0.4 });
    h.noise({ ftype: 'highpass', f: 6000, dur: 0.12, vol: 0.12, at: 0.4 });
    return 1.1;
  },
  finish(h) {
    const seq = [['g4', 0, 0.12], ['g4', 0.14, 0.12], ['g4', 0.28, 0.12], ['c5', 0.42, 0.18], ['g4', 0.62, 0.1], ['c5', 0.74, 0.1]];
    seq.forEach(([n, at, d]) => h.tone({ type: 'square', f: N(n), dur: d, vol: 0.2, at, lp: 4000, sustain: true }));
    for (const n of ['c5', 'e5', 'g5', 'c6']) h.tone({ type: 'sawtooth', f: N(n), dur: 0.9, vol: 0.1, at: 0.86, lp: 3500, sustain: true });
    h.bell({ f: N('g6'), vol: 0.2, dur: 1.0, at: 0.86 });
    return 1.8;
  },
  bump(h) {
    h.tone({ type: 'triangle', f: 160, f2: 65, dur: 0.14, vol: 0.45 });
    h.noise({ ftype: 'lowpass', f: 1200, f2: 300, dur: 0.1, vol: 0.25 });
    return 0.2;
  },
  wall(h) {
    h.noise({ ftype: 'bandpass', f: 900, f2: 500, q: 1.2, dur: 0.22, vol: 0.4 });
    h.tone({ type: 'square', f: 120, f2: 55, dur: 0.16, vol: 0.28, lp: 700 });
    h.noise({ ftype: 'highpass', f: 4000, dur: 0.05, vol: 0.18 });
    return 0.3;
  },
  select(h) {
    h.tone({ type: 'square', f: N('e5'), dur: 0.07, vol: 0.16, lp: 3500 });
    h.tone({ type: 'square', f: N('b5'), dur: 0.12, vol: 0.16, at: 0.06, lp: 3500 });
    return 0.22;
  },
  join(h) {
    ['c5', 'e5', 'g5'].forEach((n, i) => {
      h.tone({ type: 'triangle', f: N(n), dur: 0.2, vol: 0.26, at: i * 0.08 });
      h.bell({ f: N(n) * 2, vol: 0.08, dur: 0.4, at: i * 0.08 });
    });
    return 0.5;
  },
  padZoom(h) {
    // soft, airy swoosh for driving over a boost strip (the big 'boost' sound is for items)
    h.noise({ ftype: 'bandpass', f: 500, f2: 1600, q: 1.2, dur: 0.45, vol: 0.16, a: 0.04 });
    h.tone({ type: 'sine', f: N('e5'), f2: N('b5'), dur: 0.22, vol: 0.07, a: 0.02 });
    return 0.5;
  },
  honk(h) {
    // two-tone party horn
    h.tone({ type: 'square', f: N('e4'), dur: 0.16, vol: 0.2, lp: 2200, sustain: true });
    h.tone({ type: 'square', f: N('g#4'), dur: 0.16, vol: 0.16, lp: 2200, sustain: true });
    h.tone({ type: 'square', f: N('e4'), dur: 0.22, vol: 0.2, lp: 2200, sustain: true, at: 0.2 });
    h.tone({ type: 'square', f: N('b4'), dur: 0.22, vol: 0.16, lp: 2200, sustain: true, at: 0.2 });
    return 0.5;
  },
  rescue(h) {
    // drone whirr + friendly chirp
    h.noise({ ftype: 'bandpass', f: 900, f2: 1400, q: 4, dur: 0.9, vol: 0.12 });
    h.tone({ type: 'sawtooth', f: 180, f2: 240, dur: 0.9, vol: 0.06, lp: 900 });
    ['c6', 'g6', 'e6'].forEach((n, i) => h.tone({ type: 'triangle', f: N(n), dur: 0.1, vol: 0.18, at: 0.15 + i * 0.09 }));
    return 1.0;
  },
  glide(h) {
    // whoosh off the cliff + the glider popping open
    h.noise({ ftype: 'bandpass', f: 400, f2: 2400, q: 0.8, dur: 0.8, vol: 0.22 });
    h.tone({ type: 'triangle', f: N('g5'), f2: N('g6'), dur: 0.25, vol: 0.14, at: 0.12 });
    h.bell({ f: N('d7'), vol: 0.1, dur: 0.5, at: 0.3 });
    return 1.0;
  },
  land(h) {
    h.noise({ ftype: 'lowpass', f: 600, f2: 200, dur: 0.2, vol: 0.25 });
    h.tone({ type: 'sine', f: 120, f2: 60, dur: 0.18, vol: 0.25 });
    return 0.3;
  },
  uiMove(h) {
    h.tone({ type: 'triangle', f: 880, f2: 760, dur: 0.045, vol: 0.2 });
    return 0.1;
  },
  uiConfirm(h) {
    h.tone({ type: 'square', f: N('e5'), dur: 0.08, vol: 0.15, lp: 3500 });
    h.tone({ type: 'square', f: N('a5'), dur: 0.16, vol: 0.15, at: 0.07, lp: 3500 });
    h.bell({ f: N('a6'), vol: 0.07, dur: 0.3, at: 0.07 });
    return 0.3;
  },
  offroad(h) {
    h.noise({ ftype: 'lowpass', f: 380, f2: 220, q: 1, dur: 0.28, vol: 0.45, a: 0.02 });
    h.tone({ type: 'triangle', f: 58, f2: 46, dur: 0.28, vol: 0.28, vib: { rate: 28, depth: 300 } });
    return 0.35;
  },
};

export const SFX_NAMES = Object.keys(SFX);

/** Fire sfx `name` into `out` at time t0. Returns duration (s) or 0 if unknown. */
export function playSfx(ctx, out, name, t0, pitch) {
  const fn = SFX[name];
  if (!fn) return 0;
  return fn(helpers(ctx, out, t0, pitch)) || 1;
}

// Continuous engine voices (<= 3) driven by setEngines().
import { getNoise } from './synth.js';

const MAX_VOICES = 3;

function makeVoice(ctx, bus, pan) {
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const o3 = ctx.createOscillator(); o3.type = 'sine'; // sub
  o1.detune.value = -7; o2.detune.value = 9;
  const g1 = ctx.createGain(); g1.gain.value = 0.5;
  const g2 = ctx.createGain(); g2.gain.value = 0.22;
  const g3 = ctx.createGain(); g3.gain.value = 0.35;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.value = 400;
  const vg = ctx.createGain(); vg.gain.value = 0;
  o1.connect(g1); o2.connect(g2); o3.connect(g3);
  g1.connect(lp); g2.connect(lp); g3.connect(lp);
  lp.connect(vg);
  let panner = null;
  if (ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    vg.connect(panner); panner.connect(bus);
  } else vg.connect(bus);

  // idle putter / engine wobble
  const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
  const lfoG = ctx.createGain(); lfoG.gain.value = 4;
  lfo.connect(lfoG);
  lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);

  // drift squeal
  const ns = ctx.createBufferSource(); ns.buffer = getNoise(ctx); ns.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2700; bp.Q.value = 7;
  const sq = ctx.createGain(); sq.gain.value = 0;
  ns.connect(bp); bp.connect(sq); sq.connect(panner || bus);

  // boost "whine" layer
  const bo = ctx.createOscillator(); bo.type = 'sawtooth';
  const bg = ctx.createGain(); bg.gain.value = 0;
  const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.Q.value = 4; bf.frequency.value = 1200;
  bo.connect(bf); bf.connect(bg); bg.connect(panner || bus);

  const all = [o1, o2, o3, lfo, ns, bo];
  all.forEach((n) => n.start());
  return { panner, o1, o2, o3, lp, vg, lfo, lfoG, sq, bp, bo, bg, bf, all, nodes: [g1, g2, g3, lp, vg, lfoG, bp, sq, bf, bg, panner].filter(Boolean) };
}

export class EngineSynth {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.voices = [];
  }

  _ensure(n) {
    const pans = [[0], [-0.3, 0.3], [-0.45, 0, 0.45]];
    while (this.voices.length < n) {
      const i = this.voices.length;
      // pan assigned by index within the largest layout (good enough)
      this.voices.push(makeVoice(this.ctx, this.bus, pans[MAX_VOICES - 1][i]));
    }
  }

  /** list: [{ speed01, boosting, drifting }] */
  update(list) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const groups = [];
    if (list && list.length) {
      const n = Math.min(MAX_VOICES, list.length);
      for (let i = 0; i < n; i++) groups.push([]);
      list.forEach((e, i) => groups[i % n].push(e || {}));
    }
    this._ensure(groups.length);
    const tc = 0.06;
    const layouts = [[0], [-0.3, 0.3], [-0.45, 0, 0.45]];
    this.voices.forEach((v, i) => {
      const grp = groups[i];
      if (grp && v.panner) v.panner.pan.setTargetAtTime(layouts[groups.length - 1][i], now, 0.1);
      if (!grp) {
        v.vg.gain.setTargetAtTime(0, now, 0.15);
        v.sq.gain.setTargetAtTime(0, now, 0.05);
        v.bg.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      let sp = 0, bo = 0, dr = 0;
      for (const e of grp) {
        sp += Math.min(1, Math.max(0, +e.speed01 || 0));
        bo += e.boosting ? 1 : 0;
        dr += e.drifting ? 1 : 0;
      }
      sp /= grp.length; bo /= grp.length; dr /= grp.length;
      const detuneMul = 1 + i * 0.013; // avoid phase-locked beating between voices
      const base = (62 + 150 * Math.pow(sp, 0.9)) * (1 + 0.1 * bo) * detuneMul;
      v.o1.frequency.setTargetAtTime(base, now, tc);
      v.o2.frequency.setTargetAtTime(base * 0.5, now, tc);
      v.o3.frequency.setTargetAtTime(base * 0.5, now, tc);
      v.lp.frequency.setTargetAtTime(280 + 1500 * sp + 1800 * bo, now, tc);
      v.lfo.frequency.setTargetAtTime(8 + 14 * sp, now, tc);
      v.lfoG.gain.setTargetAtTime(5 * (1 - sp) + 0.8, now, tc);
      const gain = (0.22 + 0.78 * Math.pow(sp, 0.8)) * (grp.length > 1 ? 0.85 : 1) * (1 + 0.25 * bo);
      v.vg.gain.setTargetAtTime(gain * 0.55, now, tc);
      v.sq.gain.setTargetAtTime(0.1 * dr * (0.4 + 0.6 * sp), now, 0.04);
      v.bp.frequency.setTargetAtTime(2300 + 900 * sp, now, tc);
      v.bo.frequency.setTargetAtTime(base * 3, now, tc);
      v.bf.frequency.setTargetAtTime(900 + 2500 * sp, now, tc);
      v.bg.gain.setTargetAtTime(0.06 * bo, now, 0.05);
    });
  }

  dispose() {
    for (const v of this.voices) {
      for (const s of v.all) { try { s.stop(); } catch (e) { /* ignore */ } }
      for (const n of [...v.all, ...v.nodes]) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    }
    this.voices = [];
  }
}

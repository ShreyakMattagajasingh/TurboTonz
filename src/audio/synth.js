// Low-level WebAudio synthesis helpers (no assets). All functions take an
// AudioContext and an output node and fire-and-forget one-shot voices that
// disconnect themselves when finished.

const NOTE_INDEX = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'a4' -> 69, 'f#5' -> 78, 'bb3' -> 58. Returns NaN if unparsable. */
export function noteToMidi(name) {
  const m = /^([a-g])([#b]?)(-?\d)$/i.exec(name);
  if (!m) return NaN;
  let n = NOTE_INDEX[m[1].toLowerCase()];
  if (m[2] === '#') n += 1;
  else if (m[2] === 'b') n -= 1;
  return n + (parseInt(m[3], 10) + 1) * 12;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function noteFreq(name) {
  return midiToFreq(noteToMidi(name));
}

const noiseCache = new WeakMap();

/** Shared 2s white-noise buffer per context. */
export function getNoise(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function safeDisconnect(n) {
  try { n.disconnect(); } catch (e) { /* already gone */ }
}

/** Disconnect `nodes` once every source in `sources` has ended. */
export function disposeOnEnd(sources, nodes) {
  let left = sources.length;
  const done = () => {
    if (--left > 0) return;
    for (const n of nodes) safeDisconnect(n);
  };
  for (const s of sources) s.onended = done;
}

const FLOOR = 0.0001;

/**
 * One oscillator note with envelope.
 * o: { type, f, f2, fdur, t, dur, vol, a, pitch, detune, lp, lpFrom, q,
 *      sustain (bool: hold then release, else exp decay),
 *      fm: {ratio, depth, depth2}, vib: {rate, depth /*cents*\/, delay} }
 */
export function tone(ctx, out, o) {
  const {
    type = 'sine', f, f2, fdur, t, dur, vol = 0.3, a = 0.004, pitch = 1,
    detune = 0, lp, lpFrom, q = 0.8, sustain = false, fm, vib,
  } = o;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f * pitch), t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2 * pitch), t + (fdur || dur));
  if (detune) osc.detune.value = detune;

  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(a, dur * 0.5));
  if (sustain) {
    const rel = Math.min(0.07, dur * 0.4);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
    g.gain.linearRampToValueAtTime(FLOOR, t + dur);
  } else {
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  }

  const sources = [osc];
  const nodes = [osc, g];
  let head = osc;
  if (lp) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.min(20000, (lpFrom || lp) * pitch), t);
    if (lpFrom) flt.frequency.exponentialRampToValueAtTime(Math.max(40, lp * pitch), t + Math.min(0.18, dur));
    osc.connect(flt);
    head = flt;
    nodes.push(flt);
  }
  head.connect(g);
  g.connect(out);

  if (fm) {
    const mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(f * pitch * fm.ratio, t);
    if (f2) mod.frequency.exponentialRampToValueAtTime(Math.max(1, f2 * pitch * fm.ratio), t + (fdur || dur));
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(fm.depth * pitch, t);
    if (fm.depth2 !== undefined) mg.gain.exponentialRampToValueAtTime(Math.max(0.01, fm.depth2 * pitch), t + dur);
    mod.connect(mg);
    mg.connect(osc.frequency);
    mod.start(t);
    mod.stop(t + dur + 0.04);
    sources.push(mod);
    nodes.push(mod, mg);
  }
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vib.rate;
    const lg = ctx.createGain();
    const delay = vib.delay || 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(vib.depth, t + delay + 0.12);
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.04);
    sources.push(lfo);
    nodes.push(lfo, lg);
  }
  osc.start(t);
  osc.stop(t + dur + 0.04);
  disposeOnEnd(sources, nodes);
}

/**
 * Filtered noise burst.
 * o: { t, dur, vol, a, ftype, f, f2, q, pitch, sustain }
 */
export function noise(ctx, out, o) {
  const { t, dur, vol = 0.3, a = 0.003, ftype = 'bandpass', f = 1000, f2, q = 1, pitch = 1, sustain = false } = o;
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = ftype;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(Math.min(20000, Math.max(20, f * pitch)), t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, f2 * pitch)), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(a, dur * 0.5));
  if (sustain) {
    const rel = Math.min(0.1, dur * 0.4);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
    g.gain.linearRampToValueAtTime(FLOOR, t + dur);
  } else {
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  }
  src.connect(flt);
  flt.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 1.4);
  src.stop(t + dur + 0.04);
  disposeOnEnd([src], [src, flt, g]);
}

/** Bell: inharmonic sine partials with fast decay. */
export function bell(ctx, out, o) {
  const { f, t, dur = 0.8, vol = 0.25, pitch = 1 } = o;
  tone(ctx, out, { type: 'sine', f, t, dur, vol, a: 0.002, pitch });
  tone(ctx, out, { type: 'sine', f: f * 2.76, t, dur: dur * 0.5, vol: vol * 0.35, a: 0.002, pitch });
  tone(ctx, out, { type: 'sine', f: f * 5.4, t, dur: dur * 0.22, vol: vol * 0.15, a: 0.002, pitch });
}

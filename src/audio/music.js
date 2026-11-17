// Original chiptune/funk/synth compositions, sequenced in code.
// Every theme = 8 bars x 16 sixteenth-steps (A section: bars 1-4, B section: bars 5-8).
//
// Pattern notation
//  drums : 16 chars. x = hit, X = accent, o = open hat, . = rest
//  bass  : 16 space separated tokens. integer = semitones above the bar root,
//          '=' = hold previous note, '.' = rest
//  lead  : 16 tokens. note name (e5, f#5, bb4), '=' hold, '.' rest
//  arp   : 16 tokens. index into the chord (0,1,2 = chord tones, 3 = root+oct, 4 = 2nd+oct)
import { tone, noise, bell, noteToMidi, midiToFreq } from './synth.js';

const STEPS_PER_BAR = 16;
const BARS = 8;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

// --- raw theme data -------------------------------------------------------

const RAW = {
  // chill bouncy funk, C major, ~100bpm
  lobby: {
    bpm: 100, swing: 0.2,
    drums: {
      A: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.xxx.x.x.x.xo' },
      B: { k: 'x.....x.x.x.....', s: '....x.......x...', h: 'xxx.x.xxx.x.x.xo' },
      F: { k: 'x.......x.x.x...', s: '....x.......xxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 . . 12 . . 0 . 7 . . 0 . 5 7 .',
      b: '0 . 12 . 0 . 7 . 0 . 12 . 7 . 5 .',
    },
    bassInst: { type: 'sawtooth', vol: 0.34, lp: 520, lpFrom: 1800 },
    comp: { type: 'triangle', pat: 'x.....x...x.....', len: 3, vol: 0.14, lp: 2600 },
    lead: { type: 'square', vol: 0.11, lp: 2800, vib: { rate: 5, depth: 8, delay: 0.1 }, gate: 2 },
    bars: [
      ['c2', 'e4 g4 b4', 'a', 'e5 . g5 . . e5 . d5 . . c5 . . . . .', 'A'],
      ['a1', 'c4 e4 g4', 'b', 'c5 . e5 . . d5 . c5 . a4 = . . . . .', 'A'],
      ['d2', 'c4 f4 a4', 'a', 'd5 . f5 . . a5 . g5 . . f5 . e5 . d5 .', 'A'],
      ['g1', 'b3 d4 f4', 'b', 'b4 . d5 = . . g5 . . . f5 . d5 . . .', 'F'],
      ['f2', 'a3 c4 e4', 'a', 'a5 . . g5 . f5 . . e5 . c5 . . . . .', 'B'],
      ['e2', 'g3 b3 d4', 'b', 'g5 . e5 . . g5 . b5 . . a5 . g5 . e5 .', 'B'],
      ['d2', 'c4 f4 a4', 'a', 'f5 . . d5 . f5 . a5 . . g5 = = . f5 .', 'B'],
      ['g1', 'c4 d4 f4', 'b', 'd5 . e5 . d5 . c5 . b4 . . . g4 . . .', 'F'],
    ],
  },

  // sunny upbeat major, G, ~140bpm
  meadow: {
    bpm: 140, swing: 0,
    drums: {
      A: { k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.' },
      B: { k: 'x...x...x...x..x', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      F: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 . 12 . 0 . 12 . 0 . 12 . 0 . 7 .',
      b: '0 . 0 12 . . 0 . 7 . 0 12 . . 7 .',
    },
    bassInst: { type: 'square', vol: 0.26, lp: 900, lpFrom: 2200 },
    comp: { type: 'sawtooth', pat: '..x...x...x...x.', len: 1.5, vol: 0.09, lp: 3200 },
    lead: { type: 'square', vol: 0.12, lp: 4200, vib: { rate: 6, depth: 6, delay: 0.2 }, gate: 1.6 },
    bars: [
      ['g2', 'b3 d4 g4', 'a', 'g5 . b5 . d6 . b5 . g5 . . . a5 . b5 .', 'A'],
      ['d2', 'a3 d4 f#4', 'a', 'a5 . . f#5 . a5 . d6 . . c#6 . a5 . f#5 .', 'A'],
      ['e2', 'g3 b3 e4', 'a', 'g5 . . e5 . g5 . b5 . . a5 . g5 . e5 .', 'A'],
      ['c2', 'g3 c4 e4', 'a', 'e5 . g5 . c6 . . . b5 . g5 . e5 . . .', 'A'],
      ['g2', 'b3 d4 g4', 'b', 'd6 . . d6 . b5 . g5 . . b5 . d6 . g6 .', 'B'],
      ['d2', 'a3 d4 f#4', 'b', 'f#6 . . d6 . a5 . d6 . . f#6 . e6 . d6 .', 'B'],
      ['c2', 'g3 c4 e4', 'b', 'e6 . . c6 . g5 . c6 . . e6 . d6 . c6 .', 'B'],
      ['d2', 'a3 d4 f#4', 'b', 'a5 . b5 . c#6 . d6 . . . . . a5 . . .', 'F'],
    ],
  },

  // swingy hijaz flavour (D E-flat F# G A B-flat C), ~132bpm
  desert: {
    bpm: 132, swing: 0.28,
    drums: {
      A: { k: 'x.....x.x.....x.', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.o.' },
      B: { k: 'x..x..x.x.x...x.', s: '....x.......x.x.', h: 'x.x.x.x.x.x.x.x.' },
      F: { k: 'x.....x.x.x.x...', s: '..x.x...x.x.xxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 . 0 0 . . 12 . 0 . 0 0 . . 7 .',
      b: '0 . . 0 . 7 . 0 . . 12 . 7 . 5 .',
    },
    bassInst: { type: 'sawtooth', vol: 0.3, lp: 600, lpFrom: 1600 },
    comp: { type: 'square', pat: '..x...x...x...x.', len: 1.2, vol: 0.075, lp: 2200 },
    lead: { type: 'sawtooth', vol: 0.1, lp: 3000, vib: { rate: 5.5, depth: 14, delay: 0.05 }, gate: 2.5 },
    bars: [
      ['d2', 'a3 d4 f#4', 'a', 'a5 . . bb5 a5 . g5 . f#5 . eb5 . d5 . . .', 'A'],
      ['eb2', 'bb3 eb4 g4', 'a', 'eb5 . f#5 . g5 . f#5 eb5 . . d5 . eb5 . . .', 'A'],
      ['d2', 'a3 d4 f#4', 'a', 'd5 . f#5 . a5 . . bb5 . a5 g5 . f#5 . g5 .', 'A'],
      ['a1', 'a3 c#4 e4', 'b', 'a5 . . . f#5 . eb5 . d5 . . . . . . .', 'F'],
      ['g1', 'bb3 d4 g4', 'b', 'bb5 . . a5 . g5 . . a5 . bb5 . d6 . . .', 'B'],
      ['eb2', 'bb3 eb4 g4', 'a', 'c6 . bb5 . g5 . . f#5 . g5 . bb5 . . . .', 'B'],
      ['d2', 'a3 d4 f#4', 'a', 'a5 a5 . bb5 . a5 . g5 f#5 . eb5 . f#5 . g5 .', 'B'],
      ['a1', 'a3 c#4 e4', 'b', 'a5 . . . eb5 . . . d5 . . . . . . .', 'F'],
    ],
  },

  // sparkly bells, F major, ~126bpm
  snow: {
    bpm: 126, swing: 0.06,
    drums: {
      A: { k: 'x.......x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.o.' },
      B: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      F: { k: 'x...x...x...x...', s: '....x...x...xxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 = = = . . . . 7 = = . 0 . . .',
      b: '0 . . 0 . . 12 . 7 . . . 0 . 7 .',
    },
    bassInst: { type: 'triangle', vol: 0.42, lp: 700, lpFrom: 900 },
    pad: { type: 'triangle', vol: 0.07, lp: 1800 },
    arp: { pat: '0 . 1 . 2 . 1 . 0 . 1 . 2 . 3 .', oct: 12, vol: 0.075, len: 0.6 },
    lead: { bell: true, vol: 0.2 },
    bars: [
      ['f2', 'a3 c4 f4', 'a', 'c6 . . a5 . c6 . f6 . . e6 . c6 . . .', 'A'],
      ['d2', 'a3 d4 f4', 'a', 'd6 . . a5 . d6 . f6 . . e6 . d6 . . .', 'A'],
      ['bb1', 'bb3 d4 f4', 'a', 'f6 . . d6 . bb5 . d6 . . c6 . bb5 . . .', 'A'],
      ['c2', 'g3 c4 e4', 'a', 'e6 . . c6 . g5 . c6 . . d6 . e6 . . .', 'A'],
      ['f2', 'a3 c4 f4', 'b', 'a6 . . f6 . c6 . f6 . . a6 . c7 . . .', 'B'],
      ['a1', 'a3 c4 e4', 'b', 'e6 . . c6 . a5 . c6 . . e6 . a6 . . .', 'B'],
      ['bb1', 'bb3 d4 f4', 'b', 'bb6 . . f6 . d6 . f6 . . bb6 . a6 . . .', 'B'],
      ['c2', 'g3 c4 e4', 'b', 'g6 . . e6 . c6 . . d6 . . e6 . . . .', 'F'],
    ],
  },

  // synthwave / electro, A minor, ~150bpm
  neon: {
    bpm: 150, swing: 0,
    drums: {
      A: { k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.' },
      B: { k: 'x...x...x...x..x', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx' },
      F: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 0 . 0 0 . 0 0 12 0 . 0 0 . 0 7',
      b: '0 = = = 0 = = = 0 = = = 12 = 7 =',
    },
    bassInst: { type: 'sawtooth', vol: 0.3, lp: 480, lpFrom: 2000 },
    pad: { type: 'sawtooth', vol: 0.05, lp: 1500 },
    arp: { pat: '0 1 2 3 2 1 2 3 0 1 2 3 2 1 2 1', oct: 12, type: 'sawtooth', vol: 0.06, len: 0.8, lp: 3200 },
    lead: { type: 'square', vol: 0.1, lp: 3600, vib: { rate: 5.5, depth: 18, delay: 0.15 }, gate: 3 },
    bars: [
      ['a1', 'a3 c4 e4', 'a', 'e5 . . . a5 . . . c6 . b5 . a5 . . .', 'A'],
      ['f1', 'a3 c4 f4', 'a', 'a5 . . . f5 . . . c6 . . a5 . . . .', 'A'],
      ['c2', 'g3 c4 e4', 'a', 'g5 . . e5 . . c5 . e5 . g5 . c6 . . .', 'A'],
      ['g1', 'g3 b3 d4', 'a', 'b5 . . . d6 . . . b5 . a5 . g5 . . .', 'F'],
      ['a1', 'a3 c4 e4', 'b', 'e6 . . d6 c6 . . b5 a5 . . . c6 . e6 .', 'B'],
      ['f1', 'a3 c4 f4', 'b', 'f6 . . e6 c6 . . a5 c6 . . f6 . . e6 .', 'B'],
      ['g1', 'g3 b3 d4', 'b', 'd6 . . b5 g5 . . b5 d6 . . g6 . . d6 .', 'B'],
      ['e1', 'g3 b3 e4', 'b', 'e6 . . . . . b5 . g5 . . . e5 . . .', 'F'],
    ],
  },

  // triumphant short loop, C major, ~124bpm
  results: {
    bpm: 124, swing: 0.04,
    drums: {
      A: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
      B: { k: 'x...x...x...x..x', s: '....X.......X..x', h: 'xxx.xxx.xxx.xxxo' },
      F: { k: 'x...x...x...x...', s: '....x.x.xxxxxxxx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: {
      a: '0 . 0 . 7 . 0 . 0 . 0 . 7 . 12 .',
      b: '0 . . 0 . . 0 . 12 . . 7 . . 12 .',
    },
    bassInst: { type: 'square', vol: 0.27, lp: 800, lpFrom: 2000 },
    comp: { type: 'sawtooth', pat: 'x.....x.x.......', len: 3, vol: 0.085, lp: 3000 },
    pad: { type: 'triangle', vol: 0.05, lp: 2200 },
    lead: { type: 'square', vol: 0.12, lp: 4500, vib: { rate: 5.5, depth: 10, delay: 0.2 }, gate: 3 },
    bars: [
      ['c2', 'e4 g4 c5', 'a', 'c5 . . e5 . . g5 . . . c6 = = . . .', 'A'],
      ['f2', 'f4 a4 c5', 'a', 'a5 . . g5 . . f5 . a5 . c6 = = . . .', 'A'],
      ['g2', 'd4 g4 b4', 'a', 'b5 . . d6 . . g6 . . . f6 . e6 . d6 .', 'A'],
      ['c2', 'e4 g4 c5', 'a', 'e6 . . . c6 = = = . . . . . . . .', 'F'],
      ['c2', 'e4 g4 c5', 'b', 'g5 . c6 . e6 . g6 = = = . . e6 . g6 .', 'B'],
      ['f2', 'f4 a4 c5', 'b', 'f6 . . e6 . . d6 . c6 . a5 . c6 . f6 .', 'B'],
      ['g2', 'd4 g4 b4', 'b', 'd6 . g6 . b5 . d6 . g6 = = = . . . .', 'B'],
      ['c2', 'e4 g4 c5', 'b', 'c6 . . e6 . . g6 . c7 = = = = = . .', 'F'],
    ],
  },
};

export const THEME_NAMES = Object.keys(RAW);

// --- compile ----------------------------------------------------------------

function toks(str) {
  return str.trim().split(/\s+/);
}

function hit(ch) {
  return ch === 'x' ? 0.8 : ch === 'X' ? 1 : ch === 'o' ? 0.8 : 0;
}

function compileTheme(name, th) {
  const steps = [];
  for (let i = 0; i < LOOP_STEPS; i++) steps.push({ k: 0, s: 0, h: 0, o: 0, bass: null, lead: null, arp: null, comp: null, pad: null });
  th.bars.forEach(([root, chord, bassKey, leadStr, drumKey], bar) => {
    const base = bar * STEPS_PER_BAR;
    const dr = th.drums[drumKey];
    const rootMidi = noteToMidi(root);
    const chordMidi = chord.split(/\s+/).map(noteToMidi);
    for (let st = 0; st < 16; st++) {
      const e = steps[base + st];
      e.k = hit(dr.k[st]);
      e.s = hit(dr.s[st]);
      if (dr.h[st] === 'o') e.o = 0.8;
      else e.h = hit(dr.h[st]) * (st % 4 === 0 ? 1 : 0.7);
    }
    // bass
    const bt = toks(th.bass[bassKey]);
    for (let st = 0; st < 16; st++) {
      const tk = bt[st];
      if (tk === '.' || tk === '=') continue;
      let len = 1;
      while (st + len < 16 && bt[st + len] === '=') len++;
      steps[base + st].bass = { midi: rootMidi + parseInt(tk, 10), len };
    }
    // lead
    const lt = toks(leadStr);
    const gate = th.lead.gate || 1.5;
    for (let st = 0; st < 16; st++) {
      const tk = lt[st];
      if (tk === '.' || tk === '=') continue;
      let len = 1;
      while (st + len < 16 && lt[st + len] === '=') len++;
      let next = st + len;
      while (next < 16 && (lt[next] === '.' || lt[next] === '=')) next++;
      const dist = next - st;
      if (len < gate) len = Math.min(gate, dist);
      steps[base + st].lead = { midi: noteToMidi(tk), len };
    }
    // pad
    if (th.pad) steps[base].pad = { notes: chordMidi, len: 16 };
    // comp stabs
    if (th.comp) {
      for (let st = 0; st < 16; st++) {
        if (th.comp.pat[st] === 'x') steps[base + st].comp = { notes: chordMidi, len: th.comp.len };
      }
    }
    // arp
    if (th.arp) {
      const at = toks(th.arp.pat);
      for (let st = 0; st < 16; st++) {
        const tk = at[st];
        if (tk === '.') continue;
        const idx = parseInt(tk, 10);
        const m = idx < 3 ? chordMidi[idx] : chordMidi[idx - 3] + 12;
        steps[base + st].arp = m + th.arp.oct;
      }
    }
  });
  return { name, bpm: th.bpm, swing: th.swing || 0, def: th, steps };
}

export const THEMES = {};
for (const n of THEME_NAMES) THEMES[n] = compileTheme(n, RAW[n]);

// --- playback of one step ---------------------------------------------------

function kick(ctx, out, t, v) {
  tone(ctx, out, { type: 'sine', f: 165, f2: 42, fdur: 0.11, t, dur: 0.32, vol: 0.85 * v, a: 0.002 });
  noise(ctx, out, { t, dur: 0.02, vol: 0.12 * v, ftype: 'lowpass', f: 3000, a: 0.001 });
}
function snare(ctx, out, t, v) {
  noise(ctx, out, { t, dur: 0.17, vol: 0.34 * v, ftype: 'highpass', f: 1700, a: 0.001 });
  tone(ctx, out, { type: 'triangle', f: 230, f2: 130, fdur: 0.08, t, dur: 0.11, vol: 0.28 * v, a: 0.001 });
}
function hat(ctx, out, t, v, open) {
  noise(ctx, out, { t, dur: open ? 0.2 : 0.045, vol: (open ? 0.12 : 0.15) * v, ftype: 'highpass', f: 7500, a: 0.001 });
}

/**
 * Schedule everything that happens on step `idx` (0..LOOP_STEPS-1) at time t.
 * sd = duration of one 16th step in seconds at the current tempo.
 */
export function playStep(ctx, out, theme, idx, t0, sd) {
  const e = theme.steps[idx];
  const st = idx % 16;
  const d = theme.def;
  const t = t0 + (st % 2 === 1 ? theme.swing * sd : 0);
  if (e.k) kick(ctx, out, t, e.k);
  if (e.s) snare(ctx, out, t, e.s);
  if (e.h) hat(ctx, out, t, e.h, false);
  if (e.o) hat(ctx, out, t, e.o, true);

  if (e.bass) {
    const b = d.bassInst;
    tone(ctx, out, {
      type: b.type, f: midiToFreq(e.bass.midi), t, dur: Math.max(0.06, e.bass.len * sd * 0.92),
      vol: b.vol, a: 0.005, lp: b.lp, lpFrom: b.lpFrom, q: 2.5, sustain: true,
    });
    // sub-octave sine for weight on lowest notes
    tone(ctx, out, { type: 'sine', f: midiToFreq(e.bass.midi - 12), t, dur: Math.max(0.06, e.bass.len * sd * 0.9), vol: b.vol * 0.5, a: 0.008, sustain: true });
  }
  if (e.pad && d.pad) {
    const dur = e.pad.len * sd;
    for (const m of e.pad.notes) {
      for (const dt of [-7, 7]) {
        tone(ctx, out, { type: d.pad.type, f: midiToFreq(m), detune: dt, t, dur, vol: d.pad.vol, a: 0.12, lp: d.pad.lp, sustain: true });
      }
    }
  }
  if (e.comp && d.comp) {
    const dur = Math.max(0.05, e.comp.len * sd);
    for (const m of e.comp.notes) {
      tone(ctx, out, { type: d.comp.type, f: midiToFreq(m), t, dur, vol: d.comp.vol, a: 0.004, lp: d.comp.lp, lpFrom: d.comp.lp * 2, sustain: false });
    }
  }
  if (e.arp && d.arp) {
    const A = d.arp;
    if (A.type) {
      tone(ctx, out, { type: A.type, f: midiToFreq(e.arp), t, dur: A.len * sd * 1.6, vol: A.vol, a: 0.003, lp: A.lp || 3000, lpFrom: (A.lp || 3000) * 1.8 });
    } else {
      bell(ctx, out, { f: midiToFreq(e.arp), t, dur: 0.55, vol: A.vol });
    }
  }
  if (e.lead && Number.isFinite(e.lead.midi)) {
    const L = d.lead;
    const f = midiToFreq(e.lead.midi);
    const dur = e.lead.len * sd * 0.95;
    if (L.bell) {
      bell(ctx, out, { f, t, dur: Math.max(0.5, dur * 1.5), vol: L.vol });
    } else {
      tone(ctx, out, { type: L.type, f, t, dur, vol: L.vol, a: 0.006, lp: L.lp, vib: L.vib, sustain: true });
    }
  }
}

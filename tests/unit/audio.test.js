import { describe, it, expect, vi, afterEach } from 'vitest';
import { AudioEngine, THEME_NAMES, SFX_NAMES } from '../../src/audio/audio.js';
import { THEMES, LOOP_STEPS } from '../../src/audio/music.js';

const SPEC_SFX = [
  'countdown', 'go', 'itemBox', 'roulette', 'itemGet', 'boost', 'miniTurbo1', 'miniTurbo2', 'miniTurbo3',
  'driftStart', 'hop', 'spin', 'hit', 'shieldBlock', 'throw', 'drop', 'rocketLaunch', 'explosion', 'zap',
  'mega', 'lap', 'finalLap', 'finish', 'bump', 'wall', 'select', 'join', 'uiMove', 'uiConfirm', 'offroad',
];
const SPEC_THEMES = ['lobby', 'meadow', 'desert', 'snow', 'neon', 'results'];

describe('AudioEngine without AudioContext (node)', () => {
  it('never throws before or without unlock', () => {
    const a = new AudioEngine();
    expect(() => {
      a.setMuted(true);
      expect(a.muted).toBe(true);
      a.setMuted(false);
      expect(a.muted).toBe(false);
      a.setMasterVolume(0.5);
      a.setMasterVolume(NaN);
      a.playMusic('lobby');
      a.playMusic('nope');
      a.setMusicTempo(1.15);
      a.setMusicTempo('x');
      a.setEngines([{ speed01: 0.5, boosting: true, drifting: false }]);
      a.setEngines([]);
      a.setEngines(null);
      for (const n of SPEC_SFX) a.sfx(n, { volume: 0.5, pan: -1, pitch: 1.2 });
      a.sfx('doesNotExist');
      a.sfx();
      a.stopMusic();
      a.unlock(); // no AudioContext in node: still a no-op
      a.unlock();
      a.playMusic('neon');
      a.sfx('hit');
      a.setEngines([{ speed01: 1 }]);
      a.stopMusic();
    }).not.toThrow();
  });

  it('exposes every spec sfx and theme', () => {
    for (const n of SPEC_SFX) expect(SFX_NAMES).toContain(n);
    for (const n of SPEC_THEMES) expect(THEME_NAMES).toContain(n);
  });
});

describe('theme data', () => {
  it('has 8 bars x 16 steps with a distinct tempo/feel per theme', () => {
    const bpms = new Set();
    for (const n of SPEC_THEMES) {
      const t = THEMES[n];
      expect(t.steps.length).toBe(LOOP_STEPS);
      expect(t.def.bars.length).toBeGreaterThanOrEqual(8);
      bpms.add(t.bpm);
      // every bar produced drums, bass and a melody somewhere
      expect(t.steps.some((s) => s.k)).toBe(true);
      expect(t.steps.some((s) => s.bass)).toBe(true);
      expect(t.steps.filter((s) => s.lead && Number.isFinite(s.lead.midi)).length).toBeGreaterThan(8);
      for (const [, , bk, lead, dk] of t.def.bars) {
        expect(t.def.bass[bk].trim().split(/\s+/).length).toBe(16);
        expect(lead.trim().split(/\s+/).length).toBe(16);
        const d = t.def.drums[dk];
        for (const k of ['k', 's', 'h']) expect(d[k].length).toBe(16);
      }
    }
    expect(bpms.size).toBe(6);
  });
});

// A permissive recording fake AudioContext, to exercise the real code paths.
function makeFakeContext() {
  const counts = { osc: 0, buf: 0 };
  const mk = (kind) => {
    const target = function () {};
    const store = { value: 0 };
    return new Proxy(target, {
      get(_, k) {
        if (k === 'value') return store.value;
        if (k === 'then') return undefined;
        if (!(k in store)) {
          if (kind === 'ctx') {
            if (k === 'currentTime') return fake.t;
            if (k === 'sampleRate') return 8000;
            if (k === 'state') return 'running';
            if (k === 'destination') return mk('dest');
            if (k === 'createOscillator') return () => { counts.osc++; return mk('node'); };
            if (k === 'createBufferSource') return () => { counts.buf++; return mk('node'); };
            if (k === 'createBuffer') return (c, len) => ({ getChannelData: () => new Float32Array(len) });
          }
          return mk('node');
        }
        return store[k];
      },
      apply() { return mk('node'); },
      set(_, k, v) { store[k] = v; return true; },
    });
  };
  const fake = { t: 0, counts };
  fake.ctx = mk('ctx');
  return fake;
}

describe('AudioEngine with a fake AudioContext', () => {
  afterEach(() => { vi.useRealTimers(); delete globalThis.AudioContext; });

  it('builds the graph, schedules music/sfx/engines without throwing', () => {
    vi.useFakeTimers();
    const fake = makeFakeContext();
    globalThis.AudioContext = function () { return fake.ctx; };
    const a = new AudioEngine();
    a.unlock();
    expect(a.unlocked).toBe(true);
    for (const th of SPEC_THEMES) {
      a.playMusic(th);
      fake.t += 0.5;
      vi.advanceTimersByTime(500);
    }
    expect(fake.counts.osc).toBeGreaterThan(50);
    a.setMusicTempo(1.15);
    a.setEngines(Array.from({ length: 8 }, (_, i) => ({ speed01: i / 7, boosting: i % 2 === 0, drifting: i % 3 === 0 })));
    a.setEngines([{ speed01: 0 }]);
    a.setEngines([]);
    for (const n of SPEC_SFX) {
      fake.t += 0.1;
      a.sfx(n, { volume: 0.7, pan: 0.5, pitch: 1.1 });
    }
    a.setMuted(true);
    a.sfx('hit');
    a.stopMusic();
    vi.advanceTimersByTime(3000);
  });

  it('rate-limits identical sfx', () => {
    const fake = makeFakeContext();
    globalThis.AudioContext = function () { return fake.ctx; };
    const a = new AudioEngine();
    a.unlock();
    const before = fake.counts.osc;
    a.sfx('hop'); const one = fake.counts.osc - before;
    a.sfx('hop'); // same currentTime -> blocked
    expect(fake.counts.osc - before).toBe(one);
    fake.t += 0.05;
    a.sfx('hop');
    expect(fake.counts.osc - before).toBe(one * 2);
  });
});

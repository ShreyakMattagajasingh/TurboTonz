// Party Karts audio engine: everything is synthesized with WebAudio.
// Every public method is a safe no-op before unlock() or without AudioContext.
import { THEMES, THEME_NAMES, LOOP_STEPS, playStep } from './music.js';
import { SFX_NAMES, playSfx } from './sfx.js';
import { EngineSynth } from './engineSynth.js';

export { THEME_NAMES, SFX_NAMES };

const LOOKAHEAD = 0.12;     // seconds scheduled ahead
const TICK_MS = 25;         // scheduler interval
const CROSSFADE = 1.0;      // seconds
const MIN_GAP = 0.04;       // identical sfx rate limit (s)

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;       // tap after the compressor (for meters / tests)
    this._muted = false;
    this._volume = 0.8;
    this._tempoTarget = 1;
    this._tempoCur = 1;
    this._tempoStamp = 0;
    this._wantTheme = null;     // requested before unlock
    this._track = null;
    this._lastSfx = new Map();
    this._engine = null;
    this._pendingEngines = null;
  }

  get muted() { return this._muted; }
  get unlocked() { return !!this.ctx; }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        try { this._build(); } catch (e) { this.ctx = null; return; }
      }
      if (this.ctx.state !== 'running') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (this._wantTheme && !this._track) this.playMusic(this._wantTheme);
    } catch (e) { /* never throw */ }
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.comp.connect(this.analyser);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.35; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.engineBus = ctx.createGain(); this.engineBus.gain.value = 0.25; this.engineBus.connect(this.master);
    this._engine = new EngineSynth(ctx, this.engineBus);
  }

  _applyMaster() {
    if (!this.ctx || !this.master) return;
    const v = this._muted ? 0 : this._volume;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setMuted(m) {
    try { this._muted = !!m; this._applyMaster(); } catch (e) { /* noop */ }
  }

  setMasterVolume(v) {
    try {
      v = Number(v);
      this._volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.8));
      this._applyMaster();
    } catch (e) { /* noop */ }
  }

  // ---- music ---------------------------------------------------------------

  playMusic(theme) {
    try {
      if (!THEMES[theme]) return;
      this._wantTheme = theme;
      const ctx = this.ctx;
      if (!ctx) return;
      if (this._track && this._track.name === theme && !this._track.fading) return;
      const now = ctx.currentTime;
      const old = this._track;
      if (old) this._fadeOut(old, CROSSFADE);

      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.linearRampToValueAtTime(1, now + CROSSFADE);
      out.connect(this.musicBus);
      const track = { name: theme, theme: THEMES[theme], out, step: 0, next: now + 0.06, timer: null, fading: false, dead: false };
      track.timer = setInterval(() => this._tick(track), TICK_MS);
      this._track = track;
      this._tick(track);
    } catch (e) { /* noop */ }
  }

  stopMusic() {
    try {
      this._wantTheme = null;
      if (this._track) { this._fadeOut(this._track, 0.4); this._track = null; }
    } catch (e) { /* noop */ }
  }

  _fadeOut(track, secs) {
    if (track.fading) return;
    track.fading = true;
    const now = this.ctx.currentTime;
    const g = track.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + secs);
    setTimeout(() => this._kill(track), secs * 1000 + 250);
  }

  _kill(track) {
    track.dead = true;
    clearInterval(track.timer);
    try { track.out.disconnect(); } catch (e) { /* ignore */ }
  }

  setMusicTempo(mult) {
    try {
      mult = Number(mult);
      if (!Number.isFinite(mult)) return;
      this._tempoTarget = Math.min(2, Math.max(0.5, mult));
    } catch (e) { /* noop */ }
  }

  _tick(track) {
    if (track.dead || !this.ctx) return;
    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      // smooth tempo glide (~0.5s time constant), updated once per wall tick
      if (now !== this._tempoStamp) {
        const dt = Math.max(0, now - this._tempoStamp);
        this._tempoStamp = now;
        const k = 1 - Math.exp(-Math.min(dt, 0.5) / 0.5);
        this._tempoCur += (this._tempoTarget - this._tempoCur) * k;
      }
      if (track.next < now - 0.1) track.next = now + 0.02; // tab was throttled: resync, no burst
      const horizon = now + LOOKAHEAD;
      let guard = 0;
      while (track.next < horizon && guard++ < 8) {
        const sd = 60 / (track.theme.bpm * this._tempoCur) / 4;
        playStep(ctx, track.out, track.theme, track.step, track.next, sd);
        track.next += sd;
        track.step = (track.step + 1) % LOOP_STEPS;
      }
    } catch (e) { /* noop */ }
  }

  // ---- engines -------------------------------------------------------------

  setEngines(list) {
    try {
      if (!this.ctx || !this._engine) return;
      this._engine.update(Array.isArray(list) ? list : []);
    } catch (e) { /* noop */ }
  }

  // ---- sfx -----------------------------------------------------------------

  sfx(name, opts = {}) {
    try {
      const ctx = this.ctx;
      if (!ctx || this._muted) return;
      if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      const now = ctx.currentTime;
      const last = this._lastSfx.get(name);
      if (last !== undefined && now - last < MIN_GAP) return;
      const { volume = 1, pan = 0, pitch = 1 } = opts || {};
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Number(volume) || 0);
      let head = g;
      let panner = null;
      if (ctx.createStereoPanner && pan) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.min(1, Math.max(-1, Number(pan) || 0));
        g.connect(panner);
        head = panner;
      }
      head.connect(this.sfxBus);
      const dur = playSfx(ctx, g, name, now + 0.005, Math.min(4, Math.max(0.25, Number(pitch) || 1)));
      if (!dur) { g.disconnect(); if (panner) panner.disconnect(); return; }
      this._lastSfx.set(name, now);
      setTimeout(() => {
        try { g.disconnect(); if (panner) panner.disconnect(); } catch (e) { /* ignore */ }
      }, (dur + 0.5) * 1000);
    } catch (e) { /* noop */ }
  }
}

export default AudioEngine;

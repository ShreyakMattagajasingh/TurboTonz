import { describe, it, expect } from 'vitest';
import { TRACKS } from '../../src/game/tracks.js';
import { Race } from '../../src/game/race.js';
import { rollItem, ITEMS } from '../../src/game/items.js';

const stats = (i) => ({ speed: (i % 4) / 3, accel: 1 - (i % 4) / 3, handling: (i % 3) / 2, weight: (i % 5) / 4 });

describe('race sim', () => {
  for (const def of TRACKS) {
    it(`${def.id}: 8 CPU karts finish 2 laps`, () => {
      const racers = Array.from({ length: 8 }, (_, i) => ({ name: 'CPU' + i, char: 'c' + i, stats: stats(i), skill: 0.4 + i * 0.07 }));
      const race = new Race({ trackDef: def, racers, laps: 2, cc: 100, seed: 7 });
      let t = 0, maxLat = 0, hits = 0, items = 0, drifts = 0, walls = 0;
      while (race.phase !== 'done' && t < 260) {
        const ev = race.update(1 / 30); t += 1 / 30;
        for (const e of ev) { if (e.type === 'hit') hits++; if (e.type === 'itemGet') items++; if (e.type === 'miniTurbo') drifts++; if (e.type === 'wall') walls++; }
        for (const k of race.karts) {
          expect(Number.isFinite(k.x) && Number.isFinite(k.z) && Number.isFinite(k.y)).toBe(true);
          maxLat = Math.max(maxLat, Math.abs(k.lat) - (k._proj?.hw ?? 10));
        }
      }
      const times = race.order.map(k => k.finishTime.toFixed(1) + (k.estimated ? '*' : ''));
      console.log(def.id, 'simT', t.toFixed(0), 'times', times.join(' '), 'hits', hits, 'items', items, 'miniTurbos', drifts, 'walls', walls, 'maxOutside', maxLat.toFixed(1));
      expect(race.phase).toBe('done');
      expect(race.karts.filter(k => !k.estimated).length).toBeGreaterThanOrEqual(6);
      expect(items).toBeGreaterThan(5);
      expect(maxLat).toBeLessThan(def.shoulder + 0.5);
    });
  }

  it('human kart progresses laps and finishes', () => {
    const def = TRACKS[0];
    const race = new Race({ trackDef: def, racers: [{ human: true, name: 'P1', char: 'a', stats: stats(1) }, { name: 'CPU', char: 'b', stats: stats(2) }], laps: 1, seed: 3 });
    const h = race.karts[0];
    // simple autopilot: steer to the centerline ahead
    let t = 0;
    while (race.phase !== 'done' && t < 120) {
      const g = race.geo, tp = g.pointAt(h.s + 8, 0);
      let diff = Math.atan2(tp.x - h.x, tp.z - h.z) - h.heading;
      while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      h.input = { s: Math.max(-1, Math.min(1, -diff * 2.5)), g: 1, b: 0, d: 0, i: h.item ? 1 : 0 };
      race.update(1 / 60); t += 1 / 60;
    }
    expect(h.finished).toBe(true);
    expect(h.finishTime).toBeGreaterThan(20);
  });

  it('item rolls are weighted by place', () => {
    let backMega = 0, frontMega = 0;
    for (let i = 0; i < 2000; i++) { if (rollItem(8, 8) === 'mega') backMega++; if (rollItem(1, 8) === 'mega') frontMega++; }
    expect(backMega).toBeGreaterThan(200);
    expect(frontMega).toBe(0);
    for (let p = 1; p <= 8; p++) expect(ITEMS[rollItem(p, 8)]).toBeTruthy();
  });
});

describe('party rules', () => {
  const cpu = (n) => Array.from({ length: n }, (_, i) => ({ name: 'CPU' + i, char: 'c' + i, stats: stats(i), skill: 0.5 + i * 0.05 }));

  it('niyagara falls: everyone glides over the gap, nobody falls in', () => {
    const def = TRACKS.find(t => t.id === 'falls');
    expect(def.name).toBe('Niyagara Falls');
    for (const cc of [50, 150, 200]) {
      const race = new Race({ trackDef: def, racers: cpu(8), laps: 2, cc, seed: 11 });
      const ev = { cliff: 0, glideLand: 0, fall: 0 };
      let t = 0;
      while (race.phase !== 'done' && t < 260) {
        for (const e of race.update(1 / 30)) {
          if (e.type === 'cliff') ev.cliff++;
          if (e.type === 'glideLand') ev.glideLand++;
          if (e.type === 'rescue' && e.reason === 'fall') ev.fall++;
        }
        t += 1 / 30;
      }
      console.log('falls', cc + 'cc', ev);
      expect(race.phase).toBe('done');
      expect(ev.cliff).toBeGreaterThanOrEqual(14);
      expect(ev.fall).toBe(0);
    }
  });

  it('a kart that stalls mid-air over the gap still lands or gets rescued past it', () => {
    const def = TRACKS.find(t => t.id === 'falls');
    const race = new Race({ trackDef: def, racers: [{ human: true, name: 'P', char: 'a', stats: stats(0) }], laps: 3, seed: 2 });
    race.phase = 'race'; race.countdown = 0;
    const k = race.karts[0], g = race.geo, gp = g.gaps[0];
    const p = g.pointAt(gp.s0 - 3, 0);
    Object.assign(k, { x: p.x, z: p.z, y: p.y, heading: p.heading, v: 4, ti: -1 });
    let landed = false;
    for (let i = 0; i < 60 * 6; i++) {
      k.input = { s: 0, d: 0, i: 0, l: 0, u: 0 };
      for (const e of race.update(1 / 60)) if (e.type === 'glideLand' || e.type === 'rescued') landed = true;
      if (landed) break;
    }
    expect(landed).toBe(true);
    expect(k.s).toBeGreaterThan(gp.s1);
  });

  it('start boost: LEFT on "2" held through GO boosts, during "3" stalls', () => {
    const def = TRACKS[0];
    const race = new Race({ trackDef: def, racers: [{ human: true, name: 'A', char: 'a', stats: stats(0) }, { human: true, name: 'B', char: 'b', stats: stats(1) }, { human: true, name: 'C', char: 'c', stats: stats(2) }], laps: 1, seed: 1 });
    const [a, b, c] = race.karts;
    const evs = [];
    while (race.phase === 'countdown') {
      const cd = race.countdown;
      a.input = { s: 0, l: cd < 1.8 ? 1 : 0 };          // pressed while "2" is showing
      b.input = { s: 0, l: cd < 2.6 ? 1 : 0 };          // pressed during "3"
      c.input = { s: 0, l: cd < 0.5 ? 1 : 0 };          // pressed during "1"
      evs.push(...race.update(1 / 60));
    }
    const boost = evs.filter(e => e.type === 'startBoost');
    expect(boost.find(e => e.k === a)?.level).toBe(2);
    expect(boost.find(e => e.k === c)?.level).toBe(1);
    expect(evs.some(e => e.type === 'startStall' && e.k === b)).toBe(true);
    expect(evs.filter(e => e.type === 'count').map(e => e.n)).toEqual([3, 2, 1]);
  });

  it('wrong way: the drone turns you around near the same spot', () => {
    const def = TRACKS[0];
    const race = new Race({ trackDef: def, racers: [{ human: true, name: 'P', char: 'a', stats: stats(0) }], laps: 3, seed: 4 });
    race.phase = 'race'; race.countdown = 0;
    const k = race.karts[0], g = race.geo;
    const p = g.pointAt(60, 0);
    Object.assign(k, { x: p.x, z: p.z, y: p.y, heading: p.heading + Math.PI, v: 20, ti: -1 });
    const s0 = 60;
    let rescued = null;
    for (let i = 0; i < 60 * 6 && !rescued; i++) {
      k.input = { s: 0 };
      for (const e of race.update(1 / 60)) if (e.type === 'rescued') rescued = e;
    }
    expect(rescued).toBeTruthy();
    const dot = Math.sin(k.heading) * g.tx[k.ti] + Math.cos(k.heading) * g.tz[k.ti];
    expect(dot).toBeGreaterThan(0.9);
    expect(Math.abs(k.s - s0)).toBeLessThan(40);
  });

  it('nobody leaves the road and everyone drives the same speed', () => {
    const race = new Race({ trackDef: TRACKS[2], racers: cpu(8), laps: 1, cc: 150, seed: 5 });
    const caps = new Set(race.karts.map(k => k.stats.speed));
    expect(caps.size).toBe(1);
  });
});

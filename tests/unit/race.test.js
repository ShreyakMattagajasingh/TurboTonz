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

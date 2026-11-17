import { describe, it, expect } from 'vitest';
import { TRACKS } from '../../src/game/tracks.js';
import { TrackGeo } from '../../src/game/trackgeo.js';

function closestNonAdjacent(g) {
  // min distance between samples that are far apart along the track
  let worst = Infinity, at = null;
  const skip = Math.ceil(60 / 2);
  for (let i = 0; i < g.N; i += 2) for (let j = i + skip; j < g.N; j += 2) {
    const along = Math.min(j - i, g.N - (j - i));
    if (along < skip) continue;
    const d = Math.hypot(g.x[i] - g.x[j], g.z[i] - g.z[j]);
    if (d < worst) { worst = d; at = [i, j]; }
  }
  return { worst, at };
}

describe('tracks', () => {
  for (const def of TRACKS) {
    it(`${def.id} is a valid circuit`, () => {
      const g = new TrackGeo(def);
      const { worst, at } = closestNonAdjacent(g);
      const corridor = 2 * (def.halfWidth + (def.shoulder ?? 7)) + 4;
      console.log(def.id, 'len', g.length.toFixed(0), 'minR', g.minRadius().toFixed(1), 'closest', worst.toFixed(1), at, 'needs', corridor);
      expect(g.length).toBeGreaterThan(700);
      expect(g.length).toBeLessThan(1400);
      expect(g.minRadius()).toBeGreaterThan(def.halfWidth + (def.shoulder ?? 7) + 2);
      expect(worst).toBeGreaterThan(corridor);
    });
    it(`${def.id} projection round-trips`, () => {
      const g = new TrackGeo(def);
      for (let k = 0; k < 50; k++) {
        const s = Math.random() * g.N, lat = (Math.random() * 2 - 1) * 8;
        const p = g.pointAt(s, lat);
        const pr = g.project(p.x, p.z, -1);
        expect(Math.abs(pr.lat - lat)).toBeLessThan(0.6);
        let ds = Math.abs(pr.s - s); ds = Math.min(ds, g.N - ds);
        expect(ds).toBeLessThan(1.5);
      }
    });
  }
});

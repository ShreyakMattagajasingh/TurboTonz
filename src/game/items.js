// Item definitions + roll tables. Pure logic.
// The five power-ups in rotation (the others still work if forced, e.g. in tests):
//   nitro   — instant speed burst
//   oil     — slick dropped behind you; spins out whoever drives over it
//   bouncer — spiky ball fired straight ahead, bounces off walls
//   rocket  — homing rocket that chases the racer in front of you
//   mega    — grow huge for a few seconds: faster, can't be hit, flattens anyone you touch
export const ITEMS = {
  nitro:          { name: 'Nitro',          charges: 1 },
  triple_nitro:   { name: 'Triple Nitro',   charges: 3 },
  oil:            { name: 'Oil Slick',      charges: 1 },
  bouncer:        { name: 'Bouncer',        charges: 1 },
  triple_bouncer: { name: 'Triple Bouncer', charges: 3 },
  rocket:         { name: 'Homing Rocket',  charges: 1 },
  shield:         { name: 'Bubble Shield',  charges: 1 },
  mega:           { name: 'Mega Mode',      charges: 1 },
  zap:            { name: 'Thunder Zap',    charges: 1 },
};

export const ROTATION = ['nitro', 'oil', 'bouncer', 'rocket', 'mega'];

// Mostly random, with a light nudge: the leader never gets Mega/Rocket, the back of the pack
// sees them more often. [maxPlaceFraction, weights]
const TABLES = [
  [0.15, { nitro: 30, oil: 36, bouncer: 34 }],
  [0.55, { nitro: 24, oil: 18, bouncer: 24, rocket: 22, mega: 12 }],
  [1.01, { nitro: 26, oil: 8, bouncer: 16, rocket: 28, mega: 22 }],
];

export function rollItem(place, total, rnd = Math.random) {
  const frac = total <= 1 ? 0.3 : (place - 1) / (total - 1);
  const table = TABLES.find(t => frac <= t[0])[1];
  const entries = Object.entries(table);
  let sum = 0; for (const [, w] of entries) sum += w;
  let r = rnd() * sum;
  for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
  return entries[0][0];
}

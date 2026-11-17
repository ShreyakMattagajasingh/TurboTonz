// Item definitions + roll tables. Pure logic.
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

const TABLES = [
  // [maxFrac, weights]
  [0.15, { oil: 34, bouncer: 34, shield: 18, nitro: 10, triple_bouncer: 4 }],
  [0.45, { nitro: 20, bouncer: 16, rocket: 18, oil: 12, triple_nitro: 10, shield: 12, triple_bouncer: 8, mega: 4 }],
  [0.75, { nitro: 16, rocket: 24, triple_nitro: 20, triple_bouncer: 12, shield: 8, mega: 12, zap: 3, bouncer: 5 }],
  [1.01, { triple_nitro: 26, rocket: 22, mega: 20, zap: 10, nitro: 12, triple_bouncer: 10 }],
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

// Item icons — original, dependency-free SVG strings (64x64 viewBox, flat toon style).
// Used by the pad controller and reusable by the host HUD:  el.innerHTML = ITEM_ICONS.rocket
// No gradients / ids on purpose, so icons can be inlined many times on one page safely.

const INK = '#1b1030';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

function star(cx, cy, ro, ri, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / n;
    pts.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1));
  }
  return pts.join(' ');
}

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" focusable="false" aria-hidden="true">${inner}</svg>`;

// ---- nitro canister (flame on top) -------------------------------------
function canister(tx = 0, ty = 0, s = 1) {
  return `<g transform="translate(${tx} ${ty}) scale(${s})">
    <path d="M32 2 C40 10 45 15 41 22 C39 25 35 26 32 26 C28 26 24 23 25 18 C26 13 30 11 32 2 Z" fill="#ff8a1f" ${S}/>
    <path d="M32 13 C36 17 37 20 35 23 C34 24 33 24.5 32 24.5 C30 24.5 28 22 29 19 C30 17 31 16 32 13 Z" fill="#ffe14a"/>
    <rect x="26" y="22" width="12" height="9" rx="2.5" fill="#c9d1e0" ${S}/>
    <rect x="18" y="29" width="28" height="31" rx="9" fill="#2f80ff" ${S}/>
    <rect x="19.5" y="39" width="25" height="9" fill="#ffffff"/>
    <path d="M24 33 v22" stroke="#8fc0ff" stroke-width="3" stroke-linecap="round" fill="none"/>
  </g>`;
}

const nitro = svg(canister(0, 0, 1));
const triple_nitro = svg(
  canister(-9, 12, 0.6) + canister(25, 12, 0.6) + canister(8, 3, 0.66)
);

// ---- oil -----------------------------------------------------------------
const oil = svg(`
  <path d="M7 42 C5 31 15 26 23 30 C27 21 42 21 46 29 C56 27 61 37 55 45 C51 55 32 57 22 53 C12 55 8 49 7 42 Z" fill="#2a1f45" ${S}/>
  <ellipse cx="21" cy="40" rx="5" ry="2.6" fill="#6a5a9a" transform="rotate(-18 21 40)"/>
  <path d="M32 3 C38 13 43 18 43 24 A11 11 0 0 1 21 24 C21 18 26 13 32 3 Z" fill="#352858" ${S}/>
  <ellipse cx="27" cy="23" rx="2.6" ry="4.2" fill="#8d7cc4" transform="rotate(18 27 23)"/>
`);

// ---- bouncer (green spiky orb) ------------------------------------------
function orb(cx, cy, r) {
  const k = r / 29;
  return `<polygon points="${star(cx, cy, r, r * 0.66, 10)}" fill="#35c94a" ${S}/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.56).toFixed(1)}" fill="#7dec6e" stroke="${INK}" stroke-width="${(2.4 * Math.max(k, 0.7)).toFixed(1)}"/>
    <ellipse cx="${(cx - r * 0.2).toFixed(1)}" cy="${(cy - r * 0.22).toFixed(1)}" rx="${(r * 0.17).toFixed(1)}" ry="${(r * 0.1).toFixed(1)}" fill="#fff" transform="rotate(-35 ${(cx - r * 0.2).toFixed(1)} ${(cy - r * 0.22).toFixed(1)})"/>`;
}
const bouncer = svg(orb(32, 32, 29));
const triple_bouncer = svg(orb(17, 43, 17) + orb(47, 43, 17) + orb(32, 20, 18));

// ---- rocket ----------------------------------------------------------------
const rocket = svg(`<g transform="rotate(42 32 32) translate(3.2 3.2) scale(.9)">
  <path d="M26 46 L32 63 L38 46 Z" fill="#ff9d1f" ${S}/>
  <path d="M29 46 L32 56 L35 46 Z" fill="#ffe14a"/>
  <path d="M22 34 L8 50 L22 48 Z" fill="#ffd23f" ${S}/>
  <path d="M42 34 L56 50 L42 48 Z" fill="#ffd23f" ${S}/>
  <path d="M32 2 C44 13 46 28 43 47 L21 47 C18 28 20 13 32 2 Z" fill="#ff3b4a" ${S}/>
  <path d="M21.6 40 H42.4" stroke="${INK}" stroke-width="3" fill="none"/>
  <rect x="21.6" y="40" width="20.8" height="6" fill="#fff"/>
  <circle cx="32" cy="26" r="6.5" fill="#7fe3ff" ${S}/>
  <path d="M29 24 a4 4 0 0 1 3 -2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
</g>`);

// ---- shield (blue bubble) -------------------------------------------------
const shield = svg(`
  <circle cx="32" cy="32" r="27" fill="#4aa8ff" fill-opacity=".55" ${S}/>
  <circle cx="32" cy="32" r="20" fill="none" stroke="#bfe6ff" stroke-width="3" stroke-opacity=".9"/>
  <path d="M14 26 A19 19 0 0 1 28 13" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>
  <circle cx="43" cy="46" r="3.4" fill="#fff" fill-opacity=".9"/>
  <polygon points="${star(32, 33, 9, 4.2, 4, -Math.PI / 4)}" fill="#fff" fill-opacity=".85"/>
`);

// ---- mega (golden burst + crown) -------------------------------------------
const mega = svg(`
  <polygon points="${star(32, 32, 30, 21, 12)}" fill="#ffcc1a" ${S}/>
  <circle cx="32" cy="32" r="17" fill="#ffe680" stroke="${INK}" stroke-width="2.5"/>
  <path d="M19 42 L20.5 24 L27 32 L32 20 L37 32 L43.5 24 L45 42 Z" fill="#ff9d00" ${S}/>
  <rect x="19" y="41" width="26" height="6" rx="2.5" fill="#ffb800" ${S}/>
  <circle cx="32" cy="38" r="2.6" fill="#ff3b4a"/>
  <circle cx="24.5" cy="39" r="1.8" fill="#27e1ff"/>
  <circle cx="39.5" cy="39" r="1.8" fill="#27e1ff"/>
`);

// ---- zap (lightning cloud) ---------------------------------------------------
const zap = svg(`
  <path d="M16 38 C7 38 5 27 14 25 C14 14 28 10 35 18 C43 12 55 18 53 28 C61 31 59 40 50 40 Z" fill="#9a90c4" ${S}/>
  <path d="M15 27 C17 22 22 20 26 21" stroke="#d6d0f0" stroke-width="3" stroke-linecap="round" fill="none"/>
  <polygon points="37,24 23,44 31,44 26,62 43,38 34,38 40,24" fill="#ffe14a" ${S}/>
`);

export const ITEM_ICONS = {
  nitro, triple_nitro, oil, bouncer, triple_bouncer, rocket, shield, mega, zap,
};

export const ITEM_LABELS = {
  nitro: 'Nitro', triple_nitro: 'Triple Nitro', oil: 'Oil Slick', bouncer: 'Bouncer',
  triple_bouncer: 'Triple Bouncer', rocket: 'Rocket', shield: 'Shield', mega: 'Mega', zap: 'Zap',
};

export const ITEM_IDS = Object.keys(ITEM_ICONS);

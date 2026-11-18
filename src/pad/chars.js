// Character list + portraits for the pad. Loads src/render/characters.js dynamically and
// falls back to colored emoji cards if it is missing or fails.

const FALLBACK = [
  { id: 'pip', name: 'Pip', species: 'fox', color: '#ff7a1a' },
  { id: 'bao', name: 'Bao', species: 'panda', color: '#e8394a' },
  { id: 'lily', name: 'Lily', species: 'frog', color: '#2fbf5a' },
  { id: 'sprocket', name: 'Sprocket', species: 'robot', color: '#2f8bff' },
  { id: 'pebble', name: 'Pebble', species: 'penguin', color: '#ffd23f' },
  { id: 'rory', name: 'Rory', species: 'dino', color: '#8a4dff' },
  { id: 'nova', name: 'Nova', species: 'cat', color: '#ff4fa3' },
  { id: 'mochi', name: 'Mochi', species: 'bunny', color: '#2fd3c0' },
];

const EMOJI = {
  fox: '🦊', bear: '🐻', frog: '🐸', cat: '🐱', panda: '🐼', octopus: '🐙', dino: '🦖', dinosaur: '🦖',
  bunny: '🐰', rabbit: '🐰', dog: '🐶', penguin: '🐧', owl: '🦉', lion: '🦁', tiger: '🐯', pig: '🐷',
  koala: '🐨', monkey: '🐵', duck: '🦆', turtle: '🐢', hedgehog: '🦔', raccoon: '🦝', wolf: '🐺',
  robot: '🤖', shark: '🦈', mouse: '🐭', hamster: '🐹', sloth: '🦥', otter: '🦦', crocodile: '🐊', gator: '🐊',
};

export function emojiFor(c) {
  return EMOJI[String(c.species || '').toLowerCase()] || '🏁';
}

const KEY = 'pk_portraits_160_v2';

export const chars = {
  list: FALLBACK.map((c) => ({ ...c, emoji: emojiFor(c) })),
  portraits: {},
  real: false,
  ready: null,
  byId(id) { return this.list.find((c) => c.id === id) || null; },
};

chars.ready = (async () => {
  let mod = null;
  try {
    // import.meta.glob tolerates the file not existing yet (literal import() would fail the Vite transform)
    const loaders = import.meta.glob('../render/characters.js');
    const load = loaders['../render/characters.js'];
    if (!load) throw new Error('characters.js not present');
    mod = await load();
  } catch (e) {
    console.info('[pad] characters.js unavailable, using fallback cards');
    return chars;
  }
  try {
    if (Array.isArray(mod.CHARACTERS) && mod.CHARACTERS.length) {
      chars.list = mod.CHARACTERS.map((c) => ({ ...c, emoji: emojiFor(c) }));
      chars.real = true;
    }
  } catch {}
  // cached portraits (per tab session)
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (cached && chars.list.every((c) => cached[c.id])) { chars.portraits = cached; return chars; }
  } catch {}
  try {
    if (typeof mod.renderPortraits === 'function') {
      const p = await mod.renderPortraits(160);
      if (p && typeof p === 'object') {
        chars.portraits = p;
        try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch {}
      }
    }
  } catch (e) {
    console.info('[pad] renderPortraits failed, using emoji cards', e && e.message);
  }
  return chars;
})();

// HTML for a character face: portrait image if available, else emoji.
export function faceHTML(c) {
  if (!c) return '<span>?</span>';
  const url = chars.portraits[c.id];
  if (url) return `<img alt="" draggable="false" src="${url}">`;
  return `<span>${c.emoji || '🏁'}</span>`;
}

# Party Karts — module contracts

An ORIGINAL arcade kart racer (no Nintendo/Mario names, characters, art, music or tracks).
Laptop = host screen (split-screen, up to 8 humans + CPU fill). Phones = controllers via WebRTC (PeerJS).
Stack: Vite (multi-page: `index.html` host, `pad.html` controller), Three.js 0.170, vanilla ES modules, no TS.

World conventions: 1 unit = 1 meter, Y up. A kart model faces **+Z** (heading θ → forward = (sin θ, 0, cos θ), `group.rotation.y = θ`).
Kart footprint ≈ 1.7 wide × 2.6 long; driver head top ≈ 1.9 high. Model origin = ground contact point at kart center.
Art style: chunky, bright, low-poly toy look (MeshStandardMaterial / MeshToonMaterial, flatShading where it looks good), big expressive eyes, readable silhouettes from a chase camera ~6 m behind / 2.5 m up.

## 1. Characters — `src/render/characters.js`

```js
export const CHARACTERS = [ // exactly 8, original designs
  { id: 'pip', name: 'Pip', species: 'fox', color: '#ff7a1a', accent: '#ffffff',
    stats: { speed: 0..1, accel: 0..1, handling: 0..1, weight: 0..1 } }, ...
];
export function getCharacter(id)               // -> entry (fallback to first)
export function buildKart(charId, { lod } = {}) // -> KartModel
export async function renderPortraits(size=128) // -> { [id]: dataURL } (headshots, transparent bg)
```
`KartModel`:
- `group: THREE.Group` — add to scene; physics sets `group.position` and `group.rotation.y` each frame.
- `update(dt, s)` — animate internals. `s = { speed /*m/s*/, speedMax, steer /*-1..1*/, drift /*-1|0|1*/, driftLevel /*0..3*/, boosting, airborne, spin /*rad, spin-out visual yaw offset*/, squash /*0..1 hit*/, mega /*bool, scale up*/, shield /*bool*/, finished /*bool → celebrate*/, lean /*rad*/ }`.
  Animate: wheel rotation from speed, front-wheel steer angle, body lean/roll on steer & drift, driver head look into turns, suspension bob, exhaust flicker, celebrate pose (arms up) when finished, spin-out wobble.
- `exhaustPoints: THREE.Object3D[]` (2 markers at the tailpipes, used by particle system), `wheelPoints: THREE.Object3D[]` (4 markers at the wheel contact points, rear two first).
- `setTint(hexColor)` optional.
- `dispose()`.

## 2. Audio — `src/audio/audio.js` (all synthesized with WebAudio, no asset files)

```js
export class AudioEngine {
  unlock()                // call from a user gesture; creates/resumes AudioContext
  setMuted(bool); get muted()
  setMasterVolume(0..1)
  playMusic(theme)        // 'lobby'|'meadow'|'desert'|'snow'|'neon'|'results' — loops, crossfades
  stopMusic()
  setMusicTempo(mult)     // 1 normal, 1.15 on final lap
  setEngines(list)        // [{ speed01, boosting, drifting }] for human karts; mix to ≤ 2–3 voices
  sfx(name, { volume=1, pan=0, pitch=1 } = {})
}
```
SFX names: `countdown`, `go`, `itemBox`, `roulette` (short tick), `itemGet`, `boost`, `miniTurbo1|2|3`, `driftStart`, `hop`, `spin`, `hit`, `shieldBlock`, `throw`, `drop`, `rocketLaunch`, `explosion`, `zap`, `mega`, `lap`, `finalLap`, `finish`, `bump`, `wall`, `select`, `join`, `uiMove`, `uiConfirm`, `offroad`.
Music: original upbeat chiptune/funk loops (sequenced in code: drums, bass, chords, lead), distinct per theme. Must never throw if AudioContext unavailable (no-op).

## 3. Network protocol (via `src/net/transport.js`)

Room code: 4 letters. Pad URL: `/pad.html?room=ABCD` (+ `&local=1` to use BroadcastChannel transport for tests).

Pad → Host:
- `{ t:'hello', pid, name }` — pid persisted in localStorage (`pk_pid`) so reconnects reclaim the slot.
- `{ t:'pick', char }` — character id.
- `{ t:'ready', ready: bool }`
- `{ t:'in', s, g, b, d, i, seq }` — steer -1..1, gas 0/1, brake 0/1, drift(hop) 0/1, item 0/1 (held state). Send at ~30 Hz while racing + on change.
- `{ t:'menu', a }` — lobby nav for the first player: `'left'|'right'|'start'|'laps'|'cpu'`.
- `{ t:'ping', ts }`

Host → Pad:
- `{ t:'welcome', slot, color, name }`
- `{ t:'lobby', players:[{slot,name,char,ready,color}], track, trackName, laps, isLeader, taken:[charIds] }`
- `{ t:'phase', phase }` — `'lobby'|'countdown'|'race'|'results'`
- `{ t:'hud', place, total, lap, laps, item, itemSpin, speed, finished }` — ~6 Hz; `item` is an item id or null.
- `{ t:'buzz', ms }` — vibrate.
- `{ t:'results', place, time, standings:[{name, char, time}] }`
- `{ t:'pong', ts }`
- `{ t:'full' }` — room full.

Item ids: `nitro`, `triple_nitro`, `oil`, `bouncer`, `triple_bouncer`, `rocket`, `shield`, `mega`, `zap`.

## 4. Pad (controller) — `pad.html`, `src/pad/main.js`, `src/pad/pad.css`

Mobile-first, landscape race layout, portrait-friendly lobby. Screens: join (enter code if none in URL + name) → lobby (character grid w/ portraits or 3D preview, taken chars greyed, ready toggle; leader also gets track ◀ ▶ / laps / CPUs / START) → race controller → results.
Race controller: steering via device tilt (DeviceOrientation; iOS permission button) with a touch-slider fallback toggle; big buttons: GAS (with auto-gas toggle, default ON), BRAKE, DRIFT/HOP (hold), ITEM. Shows place, lap, current item icon, player color edge glow. Haptics via `navigator.vibrate`. Screen Wake Lock. Auto-reconnect with same pid. Multi-touch must work (steer slider + drift + item at once).

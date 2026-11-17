# Party Karts 🏁

A couch kart racer. The **laptop is the TV**, and up to **8 friends join with their phones** by scanning a QR code. There's no app to install and no game server: phones connect to the laptop directly over WebRTC.

## Play
1. Open the site on the laptop (ideally fullscreen with sound on). It shows a QR code and a 4-letter room code.
2. Everyone scans the QR code, or opens `/pad.html` and types the code, enters a name and picks a racer.
3. The first phone to join is the **leader** 👑 and can change the track, laps and CPUs, then press **START**.
4. Phone controls: tilt to steer (or switch to the touch slider), **GAS** (auto-gas is on by default), **BRAKE**, hold **DRIFT** to hop and drift, and **ITEM**.

Drift: hold drift while turning. Release when the sparks turn **blue → orange → purple** for an increasingly big boost. Hit the drift button again in the air off a ramp to do a trick boost.

Laptop-only players:
- **Keyboard P1:** `Space` to join, `WASD`, drift `Space`, item `E`.
- **Keyboard P2:** `↑` to join, arrow keys, drift `/`, item `.`.
- **Gamepads:** press `A` to join.

Laptop shortcuts:
- In the lobby: `A`/`D` changes character, `Enter` starts, `[`/`]` changes track.
- During a race: `Esc` pauses and `M` mutes.

Content: 4 tracks (Sunny Meadow, Dune Canyon, Frostbite Pass, Neon Nights), 8 original racers, 9 items (Nitro, Triple Nitro, Oil Slick, Bouncer, Triple Bouncer, Homing Rocket, Bubble Shield, Mega Mode, Thunder Zap), and CPU racers with rubber-banding, split-screen for 1–8 players, and synthesized music and sound effects.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173 — phones must use your LAN IP (printed by Vite), not localhost
npm test           # unit tests (track geometry, physics/race sim, items, audio)
npx playwright install chromium
npm run e2e        # browser tests: lobby, phone join -> race, full race -> results
```
Add `?local=1` to both the host and pad URLs to use same-browser tabs instead of WebRTC (offline testing).

Test URL params on the host:
- `kb=1|2` adds keyboard players.
- `fake=N` adds N placeholder players.
- `bot=1` makes the CPU drive the human karts.
- `autostart=1` starts the race immediately.
- `track=0..3` and `laps=N` set the track and lap count.

## Deploy to Vercel
It's a static site, so either:
- run `npx vercel` in this folder (framework: Vite, output: `dist`), or
- push to GitHub and import the repo at vercel.com/new.

Vercel serves over HTTPS, which phones need for tilt steering on iOS.

Networking: WebRTC data channels via [PeerJS](https://peerjs.com). Signaling uses the free public PeerJS cloud server, and after that phones talk to the laptop peer-to-peer. Everyone should be on the same Wi-Fi for the lowest latency.

## Layout
- `src/game/`: pure simulation (tracks, physics, items, AI, race)
- `src/render/`: Three.js world, karts and characters, particles, split-screen
- `src/host/`: laptop app and HUD
- `src/pad/`: phone controller
- `src/audio/`: WebAudio synth
- `src/net/`: transport

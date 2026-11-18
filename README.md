# Turbo Tonz 🏁

A couch kart racer. The **laptop is the TV**, and up to **8 friends join with their phones** by scanning a QR code. There's no app to install and no game server: phones connect to the laptop directly over WebRTC.

## Play
1. Open the site on the laptop (ideally fullscreen with sound on). It shows a QR code and a 4-letter room code.
2. Everyone scans the QR code (or opens `/pad.html` and types the code) and **names their racer**. Each phone is handed a unique racer, and you get 3 **shuffles** if you want a different one.
3. The first phone to join is the **leader** 👑 and picks the track, laps, speed (**50 / 150 / 200cc**) and CPUs, then presses **START**.
4. **Click once on the TV page (or press OK on the remote)** so the browser allows music. A banner reminds you until sound is on.

Phone controls (Joy-Con style):
- **Left thumbstick**: steer. A small **STICK | TILT** switch under it changes to tilt steering, even mid-race, on that phone only.
- **▼ DRIFT**: hold through a corner, with the stick or without it (the drift follows the bend). Let go on **blue → orange → purple** sparks for a boost.
- **▶ ITEM**: use your power-up. The button shows a slot reel when you grab one.
- **▲ HOP**: hop. Tap it off a ramp or the falls cliff for a trick boost on landing.
- **◀ BOOST / HONK**: press it **when the 2 appears** in the countdown and hold through GO for a **rocket start**. Pressing on 3 stalls you. During the race it's a horn.
- There's no gas or brake: every kart drives itself at the same speed.

Power-ups (random, with a slight boost for the back of the pack): **Nitro**, **Oil Slick**, **Bouncer**, **Homing Rocket**, **Mega Mode**.

Safety nets: walls sit on the curb, so nobody leaves the road. If you drive the wrong way for about 2 s, get stuck, or drop into the falls, **Hooky the rescue drone** picks you up, turns you the right way and puts you back around the same spot.

Tracks: **Tonztown Circuit**, **Dune Canyon**, **Niya Nights**, and the finale **Niyagara Falls**, where you launch off a cliff, glide over the waterfall gorge and land on the far side.

Laptop-only players:
- **Keyboard P1:** `Space` to join, `A`/`D` steer, `S`/`Space` drift, `E` item, `W` hop, `Q` boost, `R` new racer (lobby).
- **Keyboard P2:** `/` to join, `←`/`→` steer, `↓` drift, `.` item, `↑` hop, `,` boost.
- **Gamepads:** press `A` to join. A = drift, B = item, X = boost, Y = hop.

TV / projector remote (when the game runs in the projector's own browser):
- **D-pad + OK** move between and press the on-screen buttons.
- **Back** pauses in a race, resumes from pause, and goes from results back to the lobby. It never leaves the page.

Laptop shortcuts: `[`/`]` change track, `Esc`/`P` pause, `M` mute, `F` fullscreen.

Content: 4 tracks, 8 original racers, each with their own vehicle (sports car, monster buggy, kart, hover pod, snow sled, motorbike, trike, scooter) and glider. Also CPU racers with rubber-banding, 1–8 player split screen (4 up / 4 down for 8), and original synthesized music and sound effects (no copyrighted audio).

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
- `track=0..3`, `laps=N` and `cc=50|150|200` set the track, lap count and speed.

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

# walabean 🏝️

A 3D multiplayer browser game. Up to 3 players each spawn on their own beach island and battle to eliminate each other with rocks, bow & arrow, and bombs.

**Status:** playable — lobby with room codes, combat, lives, and a win condition are in.

## Lobby, rooms & lives

- On load (no game code in the URL) you get a lobby: **Host Game** or **Join Game**.
- Hosting creates a room with a **4-character code** shown at the top of the screen; the code also goes in the URL (`?g=CODE`).
- Join asks for a 4-character code. **Max 3 players per room.**
- Refreshing (F5) auto-rejoins the room in the URL. A per-tab token (sessionStorage) reattaches you to the *same* player — your lives/health/position are preserved through a short disconnect grace window.
- Each player has **3 lives**. Losing all your health costs a life and respawns you; losing all 3 lives is **permanent elimination** (you become a spectator).
- The **last player standing wins** — a "Congratulations!" modal shows the winner.

## Stack

- **server/** — Node.js + Express + Socket.IO (game state relay, 20 Hz snapshot broadcast)
- **client/** — React + Vite + Three.js via @react-three/fiber and @react-three/drei, zustand for state

## Deploying (Render — single service)

The whole game runs as **one Render web service**: the build compiles the client
to `client/dist`, and the Node + Socket.IO server serves those static files from
the same origin as the realtime connection. WebSockets work on all Render plans,
so nothing extra is needed for multiplayer.

The repo includes [`render.yaml`](render.yaml):

- **Build command:** `npm run build` — installs server + client deps and runs `vite build`.
- **Start command:** `npm run start` — `node server/src/index.js`, which serves `client/dist` and the socket server on Render's `$PORT`.

To deploy: on [render.com](https://render.com), **New → Blueprint**, point it at this repo, and it reads `render.yaml`. (Or **New → Web Service** with the two commands above.) No env vars are required — the client connects to its own origin in production. The free plan sleeps after inactivity, so the first load after idle is slow.

Local dev is unchanged: `npm run dev` runs the client (Vite :5173) and server (:3001) separately; the client talks to `:3001`.

## Getting started

```bash
npm run install:all   # installs root, server, and client deps
npm run dev           # starts server (:3001) and client (:5173) together
```

Open http://localhost:5173 — open it in up to 3 tabs/browsers to see multiplayer sync.

## Controls

- **Click the game** — capture the mouse (Esc releases it)
- **Mouse** — aim / orbit the camera (crosshair at screen center)
- **WASD / arrow keys** — move (camera-relative)
- **Space** — jump
- **Hold left click** — aim: the camera holds still, the crosshair moves with the mouse, and a red arc previews where the shot lands. **Release** to fire along that arc.
- **E** — pick up the rock or coconut you're standing over
- **1-4** — switch weapon: 1 rocks, 2 coconuts, 3 bow, 4 bombs
- You can't walk off your island — the beach edge keeps you out of the ocean

## Items & weapons

- You start with a **bow + 5 arrows** and **2 bombs**; rocks and coconuts start at 0.
- Pickup stones are scattered on each island; coconuts hang in the palms.
- Any projectile that hits a coconut (bomb blasts too) knocks it to the ground, where it can be picked up like a rock.
- Thrown rocks and coconuts stay where they land and can be picked up again. If one splashes into the ocean, it respawns somewhere on the nearest island — ammo never drains away.
- Every island is kept stocked with at least **5 pickup stones** — the server tops them up every few seconds, so you can never run out.

## Combat & health

- Everyone has **100 health**, shown as a large bar at the top of your screen and as a small floating bar above each other player.
- Damage per hit: **rock 10 · coconut 30 · arrow 50 · bomb 100** (a direct bomb blast is a one-shot).
- Bombs damage every player caught in the blast radius (not the thrower).
- At 0 health a player is downed and respawns at full health on their island after a few seconds.
- Hits are detected on the thrower's client and applied by the server, which broadcasts the new health in the world snapshot.

## Architecture notes

- Game constants (island layout, colors, spawn heights) live in `server/src/constants.js` and are mirrored in `client/src/game/constants.js` — keep them in sync.
- The server hosts multiple rooms keyed by a 4-char code (`server/src/game.js`), using Socket.IO rooms; all game events are scoped to `io.to(code)`.
- Movement is client-authoritative (client sends `player:move`, server relays snapshots at 20 Hz). Combat features should eventually move authority to the server.
- Island props (palms, rocks) are placed with a seeded RNG keyed by island id, so all clients render identical scenery with no sync needed. Those props are also solid colliders (`client/src/game/obstacles.js`).

## Roadmap

- [x] Throwing/shooting projectiles (rock, coconut, arrow, bomb) with arc + gravity
- [x] Coconut knockdown + item pickups (E key)
- [x] Weapon switching + HUD legend
- [x] Projectiles damage players — health bars, damage values, respawn
- [x] Stone auto-respawn (min 5 per island)
- [x] Lobby with room codes, F5 rejoin, 3 lives, last-player-standing win
- [ ] Player names in the lobby
- [ ] Bomb fuse timer + knockback
- [ ] Server-authoritative movement + hit detection

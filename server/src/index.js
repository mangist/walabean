import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { TICK_RATE, ISLANDS, MAX_PLAYERS } from './constants.js';
import {
  createGame,
  getGame,
  deleteGame,
  eachGame,
  addPlayer,
  reattachPlayer,
  markDisconnected,
  updatePlayerTransform,
  snapshot,
  playerCount,
  isFull,
  itemList,
  pickupItem,
  spendAmmo,
  knockCoconut,
  landProjectile,
  damagePlayer,
  replenishStones,
  checkWin,
} from './game.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, maxPlayers: MAX_PLAYERS });
});

// Serve the built client from the same origin (single-service deploy, e.g.
// Render). In local dev the client is served by Vite and client/dist won't
// exist, so this is skipped.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — hand any non-file route to index.html. (Socket.IO's own
  // /socket.io/ requests are handled before Express, so they're unaffected.)
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log(`serving client from ${clientDist}`);
}

const server = http.createServer(app);
const io = new Server(server, {
  // Reflect any origin so the game is reachable from other devices on the LAN
  // (dev convenience — tighten for production).
  cors: { origin: true },
});

io.on('connection', (socket) => {
  let game = null; // the room this socket is in

  const sendInit = (player, g) => {
    game = g;
    socket.join(g.code);
    socket.emit('game:init', {
      selfId: socket.id,
      code: g.code,
      players: snapshot(g),
      items: itemList(g),
    });
    socket.to(g.code).emit('player:joined', player);
  };

  socket.on('game:host', ({ name, token } = {}) => {
    const g = createGame();
    const player = addPlayer(g, socket.id, name, token);
    if (!player) {
      socket.emit('join:error', { reason: 'full' });
      return;
    }
    console.log(`[host] ${player.name} created ${g.code}`);
    sendInit(player, g);
  });

  socket.on('game:join', ({ code, name, token } = {}) => {
    const g = getGame((code || '').toUpperCase());
    if (!g) {
      socket.emit('join:error', { reason: 'not_found' });
      return;
    }
    if (g.over) {
      socket.emit('join:error', { reason: 'over' });
      return;
    }
    // A refresh reattaches to the existing player (same token); otherwise it's
    // a fresh join into a free slot.
    let player = reattachPlayer(g, socket.id, token);
    if (!player) {
      if (isFull(g)) {
        socket.emit('join:error', { reason: 'full' });
        return;
      }
      player = addPlayer(g, socket.id, name, token);
    }
    if (!player) {
      socket.emit('join:error', { reason: 'full' });
      return;
    }
    console.log(`[join] ${player.name} -> ${g.code}`);
    sendInit(player, g);
  });

  socket.on('player:move', (transform) => {
    if (game) updatePlayerTransform(game, socket.id, transform);
  });

  socket.on('item:pickup', ({ id } = {}) => {
    if (!game) return;
    const item = pickupItem(game, socket.id, id);
    if (item) io.to(game.code).emit('item:update', { id: item.id, state: 'gone' });
  });

  socket.on('projectile:throw', ({ id, kind, origin, velocity } = {}) => {
    if (!game || !spendAmmo(game, socket.id, kind)) return;
    socket.to(game.code).emit('projectile:spawned', {
      id,
      kind,
      origin,
      velocity,
      playerId: socket.id,
    });
  });

  socket.on('projectile:landed', ({ kind, position } = {}) => {
    if (!game || !position) return;
    const item = landProjectile(game, kind, position);
    if (item) io.to(game.code).emit('item:spawned', item);
  });

  socket.on('coconut:hit', ({ id } = {}) => {
    if (!game) return;
    const item = knockCoconut(game, id);
    if (item) {
      io.to(game.code).emit('item:update', { id: item.id, state: 'ground', position: item.position });
    }
  });

  socket.on('player:hit', ({ targetId, kind } = {}) => {
    if (!game) return;
    const result = damagePlayer(game, targetId, kind);
    if (!result) return;
    io.to(game.code).emit('player:damaged', {
      id: targetId,
      health: result.target.health,
      lives: result.target.lives,
      by: socket.id,
      kind,
      dead: result.dead,
      permanent: result.permanent,
    });
    if (result.win) io.to(game.code).emit('game:over', result.win);
  });

  socket.on('disconnect', () => {
    if (!game) return;
    const g = game;
    // Others drop the ghost immediately; the slot is held for a grace period
    // so a refresh can reattach with the same token.
    io.to(g.code).emit('player:left', { id: socket.id });
    markDisconnected(g, socket.id, () => {
      const win = checkWin(g);
      if (win) io.to(g.code).emit('game:over', win);
      if (playerCount(g) === 0) deleteGame(g.code);
    });
  });
});

// Broadcast each room's world snapshot at a fixed tick.
setInterval(() => {
  eachGame((g) => {
    if (playerCount(g) > 0) io.to(g.code).emit('game:state', { players: snapshot(g) });
  });
}, 1000 / TICK_RATE);

// Keep each room's islands stocked with pickup stones.
setInterval(() => {
  eachGame((g) => {
    const spawned = replenishStones(g);
    for (const item of spawned) io.to(g.code).emit('item:spawned', item);
  });
}, 3000);

server.listen(PORT, () => {
  console.log(`walabean server listening on http://localhost:${PORT}`);
});

import {
  MAX_PLAYERS,
  ISLANDS,
  ISLAND_RADIUS,
  ISLAND_HEIGHT,
  PLAYER_COLORS,
  SPAWN_HEIGHT,
  MAX_HEALTH,
} from './constants.js';
import { createItems } from './world.js';

// Multiple game rooms, each keyed by a 4-character code. A room holds its own
// players and world items. Players have 3 lives; losing all 3 is permanent
// death, and the last player standing wins.

const MAX_LIVES = 3;
export const DAMAGE = { rock: 10, coconut: 30, arrow: 50, bomb: 100 };
export const AMMO_KEY = { rock: 'rocks', coconut: 'coconuts', arrow: 'arrows', bomb: 'bombs' };

const PICKUP_RANGE = 3.5;
const STARTING_INVENTORY = { rocks: 0, coconuts: 0, arrows: 5, bombs: 2 };
const MIN_STONES_PER_ISLAND = 5;
const RESPAWN_DELAY_MS = 3000;
const DISCONNECT_GRACE_MS = 30000; // keep a slot this long so refresh can rejoin

const games = new Map(); // code -> game
let dropCounter = 0;

// --- Rooms ------------------------------------------------------------------

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable 0/O/1/I
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (games.has(code));
  return code;
}

export function createGame() {
  const code = makeCode();
  const game = {
    code,
    players: new Map(), // socketId -> player
    items: createItems(),
    over: false,
    winnerId: null,
    everHadTwo: false,
  };
  games.set(code, game);
  return game;
}

export function getGame(code) {
  return code ? games.get(code) : undefined;
}

export function deleteGame(code) {
  games.delete(code);
}

export function eachGame(fn) {
  for (const game of games.values()) fn(game);
}

// --- Players ----------------------------------------------------------------

function freeIslandSlot(game) {
  const taken = new Set([...game.players.values()].map((p) => p.island));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
  return -1;
}

export function playerCount(game) {
  return game.players.size;
}

export function isFull(game) {
  return game.players.size >= MAX_PLAYERS;
}

function findByToken(game, token) {
  if (!token) return null;
  for (const p of game.players.values()) if (p.token === token) return p;
  return null;
}

export function addPlayer(game, socketId, name, token) {
  if (game.over) return null;
  const island = freeIslandSlot(game);
  if (island === -1) return null;

  const spawn = ISLANDS[island];
  const player = {
    id: socketId,
    token: token || null,
    name: name?.slice(0, 16) || `Bean ${island + 1}`,
    island,
    color: PLAYER_COLORS[island],
    position: { x: spawn.x, y: SPAWN_HEIGHT, z: spawn.z },
    rotation: 0,
    health: MAX_HEALTH,
    lives: MAX_LIVES,
    alive: true,
    dead: false, // permanently eliminated
    disconnected: false,
    removeTimer: null,
    inventory: { ...STARTING_INVENTORY },
  };
  game.players.set(socketId, player);
  if (game.players.size >= 2) game.everHadTwo = true;
  return player;
}

// Reattach a disconnected player to a new socket id (F5 refresh), keeping their
// lives/health/position. Returns the player, or null if no matching token.
export function reattachPlayer(game, newSocketId, token) {
  const existing = findByToken(game, token);
  if (!existing) return null;
  game.players.delete(existing.id);
  if (existing.removeTimer) {
    clearTimeout(existing.removeTimer);
    existing.removeTimer = null;
  }
  existing.id = newSocketId;
  existing.disconnected = false;
  game.players.set(newSocketId, existing);
  return existing;
}

// Mark a player disconnected but keep their slot for a grace period so a
// refresh can reattach. onRemoved fires if they never come back.
export function markDisconnected(game, socketId, onRemoved) {
  const p = game.players.get(socketId);
  if (!p) return;
  p.disconnected = true;
  p.removeTimer = setTimeout(() => {
    game.players.delete(socketId);
    onRemoved();
  }, DISCONNECT_GRACE_MS);
}

export function updatePlayerTransform(game, socketId, { position, rotation } = {}) {
  const player = game.players.get(socketId);
  if (!player || !player.alive) return;
  if (position) player.position = position;
  if (typeof rotation === 'number') player.rotation = rotation;
}

// Snapshot excludes disconnected players so they vanish for others during the
// grace window (and reappear via player:joined on reattach).
export function snapshot(game) {
  return [...game.players.values()].filter((p) => !p.disconnected);
}

export function itemList(game) {
  return [...game.items.values()];
}

// --- Win condition ----------------------------------------------------------

function livingPlayers(game) {
  // Still in the running: at least one life left (respawning/disconnected count).
  return [...game.players.values()].filter((p) => p.lives > 0);
}

export function checkWin(game) {
  if (game.over || !game.everHadTwo) return null;
  const living = livingPlayers(game);
  if (living.length <= 1) {
    game.over = true;
    const winner = living[0] || null;
    game.winnerId = winner?.id ?? null;
    return { winnerId: game.winnerId, winnerName: winner?.name ?? null };
  }
  return null;
}

// --- Actions ----------------------------------------------------------------

export function pickupItem(game, socketId, itemId) {
  const player = game.players.get(socketId);
  const item = game.items.get(itemId);
  if (!player || !player.alive || !item || item.state !== 'ground') return null;

  const dx = player.position.x - item.position.x;
  const dz = player.position.z - item.position.z;
  if (dx * dx + dz * dz > PICKUP_RANGE * PICKUP_RANGE) return null;

  item.state = 'gone';
  player.inventory[item.kind === 'rock' ? 'rocks' : 'coconuts'] += 1;
  return item;
}

export function spendAmmo(game, socketId, kind) {
  const player = game.players.get(socketId);
  const key = AMMO_KEY[kind];
  if (!player || !player.alive || !key || player.inventory[key] <= 0) return false;
  player.inventory[key] -= 1;
  return true;
}

export function knockCoconut(game, itemId) {
  const item = game.items.get(itemId);
  if (!item || item.kind !== 'coconut' || item.state !== 'tree') return null;
  item.state = 'ground';
  item.position = { ...item.groundPosition };
  return item;
}

function islandOf(x, z) {
  for (let i = 0; i < ISLANDS.length; i++) {
    const dx = x - ISLANDS[i].x;
    const dz = z - ISLANDS[i].z;
    if (dx * dx + dz * dz <= ISLAND_RADIUS * ISLAND_RADIUS) return i;
  }
  return -1;
}

function nearestIsland(x, z) {
  let best = ISLANDS[0];
  let bestDistSq = Infinity;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = island;
    }
  }
  return best;
}

export function landProjectile(game, kind, position) {
  if (kind !== 'rock' && kind !== 'coconut') return null;
  let landing = { x: position.x, y: ISLAND_HEIGHT, z: position.z };
  if (islandOf(position.x, position.z) === -1) {
    const island = nearestIsland(position.x, position.z);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * (ISLAND_RADIUS - 1.5);
    landing = {
      x: island.x + Math.cos(angle) * dist,
      y: ISLAND_HEIGHT,
      z: island.z + Math.sin(angle) * dist,
    };
  }
  const item = { id: `drop-${dropCounter++}`, kind, state: 'ground', position: landing };
  game.items.set(item.id, item);
  return item;
}

// Apply damage. Handles lives, respawn, permanent death and win detection.
export function damagePlayer(game, targetId, kind) {
  const target = game.players.get(targetId);
  const dmg = DAMAGE[kind];
  if (!target || !target.alive || game.over || !dmg) return null;

  target.health = Math.max(0, target.health - dmg);
  if (target.health > 0) return { target, dead: false, permanent: false, win: null };

  // Died this life.
  target.alive = false;
  target.lives -= 1;
  let permanent = false;

  if (target.lives > 0) {
    // Respawn on their island after a short delay.
    setTimeout(() => {
      const p = game.players.get(targetId);
      if (!p || game.over) return;
      const spawn = ISLANDS[p.island];
      p.health = MAX_HEALTH;
      p.alive = true;
      p.position = { x: spawn.x, y: SPAWN_HEIGHT, z: spawn.z };
    }, RESPAWN_DELAY_MS);
  } else {
    permanent = true;
    target.dead = true; // eliminated for good
  }

  const win = checkWin(game);
  return { target, dead: true, permanent, win };
}

export function replenishStones(game) {
  const counts = new Array(ISLANDS.length).fill(0);
  for (const item of game.items.values()) {
    if (item.kind !== 'rock' || item.state !== 'ground') continue;
    const isl = islandOf(item.position.x, item.position.z);
    if (isl >= 0) counts[isl]++;
  }
  const spawned = [];
  for (let i = 0; i < ISLANDS.length; i++) {
    while (counts[i] < MIN_STONES_PER_ISLAND) {
      const island = ISLANDS[i];
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * (ISLAND_RADIUS - 1.5);
      const item = {
        id: `drop-${dropCounter++}`,
        kind: 'rock',
        state: 'ground',
        position: {
          x: island.x + Math.cos(angle) * dist,
          y: ISLAND_HEIGHT,
          z: island.z + Math.sin(angle) * dist,
        },
      };
      game.items.set(item.id, item);
      spawned.push(item);
      counts[i]++;
    }
  }
  return spawned;
}

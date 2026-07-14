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

// Anti-camping: stand still (horizontally) for this long and you bleed health.
const CAMP_TIMEOUT_MS = 10000;
const CAMP_DPS = 5; // health drained per second while camping
const CAMP_MOVE_THRESH_SQ = 0.04; // ~0.2 units of movement resets the timer

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
    hostToken: null, // token of the player who created the room
    generation: 0, // bumped on restart to invalidate stale respawn timers
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
    lastMoveAt: Date.now(),
    lastMovePos: { x: spawn.x, z: spawn.z },
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
  // Fresh anti-camp grace after a refresh.
  existing.lastMoveAt = Date.now();
  existing.lastMovePos = { x: existing.position.x, z: existing.position.z };
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
  if (position) {
    // Reset the anti-camp timer only on real horizontal movement.
    const lp = player.lastMovePos;
    const dx = position.x - lp.x;
    const dz = position.z - lp.z;
    if (dx * dx + dz * dz > CAMP_MOVE_THRESH_SQ) {
      player.lastMovePos = { x: position.x, z: position.z };
      player.lastMoveAt = Date.now();
    }
    player.position = position;
  }
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
    // Stand the champion back up, full health — they survived (and may have
    // just been mid-respawn or bled out to camping as the last blow landed).
    if (winner) {
      winner.alive = true;
      winner.health = MAX_HEALTH;
    }
    const defeated = [...game.players.values()]
      .filter((p) => p.id !== game.winnerId)
      .map((p) => p.name);
    return { winnerId: game.winnerId, winnerName: winner?.name ?? null, defeated };
  }
  return null;
}

export function isHost(game, socketId) {
  const p = game.players.get(socketId);
  return !!p && p.token != null && p.token === game.hostToken;
}

// Host restart: reset everyone to a fresh round in the same room/code.
export function restartGame(game) {
  game.over = false;
  game.winnerId = null;
  game.items = createItems();
  game.generation += 1; // invalidate any pending respawn timers
  for (const p of game.players.values()) {
    const spawn = ISLANDS[p.island];
    p.health = MAX_HEALTH;
    p.lives = MAX_LIVES;
    p.alive = true;
    p.dead = false;
    p.position = { x: spawn.x, y: SPAWN_HEIGHT, z: spawn.z };
    p.rotation = 0;
    p.inventory = { ...STARTING_INVENTORY };
    p.lastMoveAt = Date.now();
    p.lastMovePos = { x: spawn.x, z: spawn.z };
  }
  game.everHadTwo = game.players.size >= 2;
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

// A player's health hit 0: lose a life and respawn, or be eliminated. Returns
// { permanent, win }. Shared by combat damage and anti-camp drain.
function loseLife(game, target) {
  target.alive = false;
  target.lives -= 1;
  let permanent = false;

  if (target.lives > 0) {
    const gen = game.generation;
    setTimeout(() => {
      const p = game.players.get(target.id);
      if (!p || game.over || game.generation !== gen) return; // stale after restart
      const spawn = ISLANDS[p.island];
      p.health = MAX_HEALTH;
      p.alive = true;
      p.position = { x: spawn.x, y: SPAWN_HEIGHT, z: spawn.z };
      p.lastMoveAt = Date.now();
      p.lastMovePos = { x: spawn.x, z: spawn.z };
    }, RESPAWN_DELAY_MS);
  } else {
    permanent = true;
    target.dead = true; // eliminated for good
  }

  return { permanent, win: checkWin(game) };
}

// Apply combat damage. Handles lives, respawn, permanent death, win detection.
export function damagePlayer(game, targetId, kind) {
  const target = game.players.get(targetId);
  const dmg = DAMAGE[kind];
  if (!target || !target.alive || game.over || !dmg) return null;

  target.health = Math.max(0, target.health - dmg);
  if (target.health > 0) return { target, dead: false, permanent: false, win: null };

  const { permanent, win } = loseLife(game, target);
  return { target, dead: true, permanent, win };
}

// Drain health from players who have stood still past the camp timeout. Called
// on an interval with the seconds elapsed since the last call. Returns an
// array of death events (with any `win`) to broadcast; ongoing health loss
// rides along in the normal snapshot.
export function applyCampDamage(game, dtSec) {
  if (game.over) return [];
  const now = Date.now();
  const deaths = [];
  for (const p of game.players.values()) {
    if (!p.alive || p.disconnected || p.health <= 0) continue;
    if (now - p.lastMoveAt < CAMP_TIMEOUT_MS) continue;
    p.health = Math.max(0, p.health - CAMP_DPS * dtSec);
    if (p.health <= 0) {
      p.health = 0;
      const { permanent, win } = loseLife(game, p);
      deaths.push({ id: p.id, health: 0, lives: p.lives, dead: true, permanent, win });
    }
  }
  return deaths;
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

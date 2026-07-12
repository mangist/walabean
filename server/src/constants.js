// Shared game configuration. The client has a mirror copy in
// client/src/game/constants.js — keep them in sync when tuning.

export const MAX_PLAYERS = 3;
export const TICK_RATE = 20; // server broadcasts per second

// Three islands arranged in a triangle around the map origin.
export const ISLAND_DISTANCE = 42;
export const ISLAND_RADIUS = 12;
export const ISLAND_HEIGHT = 2.4;

export const ISLANDS = [0, 1, 2].map((i) => {
  const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
  return {
    id: i,
    x: Math.cos(angle) * ISLAND_DISTANCE,
    z: Math.sin(angle) * ISLAND_DISTANCE,
  };
});

export const PLAYER_COLORS = ['#e8833a', '#4fb0a5', '#b06ab3'];

export const SPAWN_HEIGHT = ISLAND_HEIGHT + 0.9;

export const MAX_HEALTH = 100;

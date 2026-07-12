// Mirror of server/src/constants.js — keep them in sync when tuning.

export const MAX_PLAYERS = 3;

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

// Movement tuning
export const MOVE_SPEED = 7;
export const JUMP_SPEED = 9;
export const GRAVITY = 24;
export const WATER_LEVEL = -4; // fall below this -> respawn

// Weapons — selected with the number keys. `ammo` is the inventory key,
// `projectile` is what flies when you attack with it. Speeds are set well
// above the island-to-island distance (~72u) so throws are fast and flat: the
// higher the speed, the shallower the (flatter) ballistic solution, so shots
// zip across rather than lobbing high.
export const WEAPON_ORDER = ['rock', 'coconut', 'bow', 'bomb'];
export const WEAPONS = {
  rock: { icon: '🪨', label: 'Rocks', ammo: 'rocks', projectile: 'rock', speed: 68, cooldown: 0.45 },
  coconut: { icon: '🥥', label: 'Coconuts', ammo: 'coconuts', projectile: 'coconut', speed: 66, cooldown: 0.5 },
  bow: { icon: '🏹', label: 'Bow', ammo: 'arrows', projectile: 'arrow', speed: 58, cooldown: 0.7 },
  bomb: { icon: '💣', label: 'Bombs', ammo: 'bombs', projectile: 'bomb', speed: 62, cooldown: 1 },
};

// Projectile physics/visuals per kind.
export const PROJECTILES = {
  rock: { gravity: 22, radius: 0.22 },
  coconut: { gravity: 22, radius: 0.3 },
  arrow: { gravity: 12, radius: 0.12 },
  bomb: { gravity: 20, radius: 0.32 },
};

export const PICKUP_RADIUS = 2.0; // stand this close to press E
export const COCONUT_HIT_RADIUS = 0.75; // projectile-to-coconut hit distance
export const BOMB_BLAST_RADIUS = 4;
export const PROJECTILE_LIFETIME = 6; // seconds before a stray throw despawns

// Combat
export const MAX_HEALTH = 100;
export const MAX_LIVES = 3;
export const PLAYER_HIT_RADIUS = 0.9; // projectile-to-player body radius
export const DAMAGE = { rock: 10, coconut: 30, arrow: 50, bomb: 100 };

// Water surface height — projectiles splash out at this level.
export const WATER_Y = 0;

// Visual palette (matches the soft teal/orange concept art vibe)
export const COLORS = {
  sky: '#5bc4b8',
  fogFar: '#3f9e94',
  // Water gradient: bright turquoise shallows fading to deep teal.
  waterShallow: '#4fd1c0',
  waterDeep: '#137a73',
  waterCrest: '#a9ecdf',
  foam: '#eafcf7',
  // Sand tones from dry dune crests down to wet shoreline and silty seabed.
  sandDry: '#f0d18a',
  sandDry2: '#e2b96c',
  sandWet: '#c39a5e',
  seabed: '#5f7a63',
  // Kept for any older references.
  water: '#2b8c85',
  sandTop: '#efc57f',
  sandSide: '#d9a45e',
  rock: '#7e8a87',
  trunk: '#8a5a34',
  leaves: '#4d9c5f',
};

// Terrain shape (radii as fractions of ISLAND_RADIUS). The widest point sits
// exactly at the waterline (SHORE_R) so the island rises out of the sea
// instead of floating above it.
export const TERRAIN = {
  plateauR: ISLAND_RADIUS * 0.95, // flat, walkable sand out to here
  shoreR: ISLAND_RADIUS * 1.14, // waterline — island's widest radius
  deepR: ISLAND_RADIUS * 1.75, // seabed skirt fades out here
  seabedY: WATER_Y - 3.6,
};

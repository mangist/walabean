// Deterministic world layout, seeded per island — palms, decor rocks, pickup
// rocks, and coconuts. Mirrored in server/src/worldLayout.js so both sides
// agree on positions without syncing scenery. Keep them identical.

import { ISLANDS, ISLAND_RADIUS, ISLAND_HEIGHT } from './constants.js';

const PALMS_PER_ISLAND = 4;
const DECOR_ROCKS_PER_ISLAND = 3;
const PICKUP_ROCKS_PER_ISLAND = 14;
const COCONUTS_PER_PALM = 2;

// Canopy sits at local (0.18, 3.35, 0) inside the palm group (see PalmTree).
const CANOPY_X = 0.18;
const COCONUT_HANG_Y = 3.0;
const COCONUT_HANG_RADIUS = 0.38;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function islandLayout(islandId) {
  const rand = mulberry32(islandId * 1000 + 7);
  const island = ISLANDS[islandId];

  const palms = [];
  for (let i = 0; i < PALMS_PER_ISLAND; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = ISLAND_RADIUS * (0.45 + rand() * 0.4);
    palms.push({
      x: island.x + Math.cos(angle) * dist,
      z: island.z + Math.sin(angle) * dist,
      scale: 0.85 + rand() * 0.5,
      rotY: rand() * Math.PI * 2,
    });
  }

  const decorRocks = [];
  for (let i = 0; i < DECOR_ROCKS_PER_ISLAND; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = ISLAND_RADIUS * (0.3 + rand() * 0.5);
    decorRocks.push({
      x: island.x + Math.cos(angle) * dist,
      z: island.z + Math.sin(angle) * dist,
      scale: 0.9 + rand() * 0.9,
      seed: rand() * 10,
    });
  }

  const pickupRocks = [];
  for (let i = 0; i < PICKUP_ROCKS_PER_ISLAND; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = ISLAND_RADIUS * (0.2 + rand() * 0.6);
    pickupRocks.push({
      id: `rock-${islandId}-${i}`,
      x: island.x + Math.cos(angle) * dist,
      z: island.z + Math.sin(angle) * dist,
    });
  }

  // Coconuts hang under each palm's canopy. Their world position replicates
  // the palm group transform (rotY then scale) so visuals and collision match.
  const coconuts = [];
  palms.forEach((palm, p) => {
    const cosT = Math.cos(palm.rotY);
    const sinT = Math.sin(palm.rotY);
    for (let j = 0; j < COCONUTS_PER_PALM; j++) {
      const a = j * 2.6 + 0.8;
      const lx = CANOPY_X + Math.cos(a) * COCONUT_HANG_RADIUS;
      const lz = Math.sin(a) * COCONUT_HANG_RADIUS;
      const wx = (lx * cosT + lz * sinT) * palm.scale;
      const wz = (-lx * sinT + lz * cosT) * palm.scale;
      coconuts.push({
        id: `coco-${islandId}-${p}-${j}`,
        x: palm.x + wx,
        y: ISLAND_HEIGHT + COCONUT_HANG_Y * palm.scale,
        z: palm.z + wz,
        // Where it lands when knocked down: at the palm's base, pushed
        // outward so it doesn't sit inside the trunk.
        groundX: palm.x + wx * 3,
        groundZ: palm.z + wz * 3,
      });
    }
  });

  return { palms, decorRocks, pickupRocks, coconuts };
}

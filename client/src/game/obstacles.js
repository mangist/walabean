import { ISLANDS, ISLAND_HEIGHT } from './constants.js';
import { islandLayout } from './worldLayout.js';

// Solid colliders for the scenery — palm trunks and decorative boulders —
// derived from the same deterministic layout the meshes use, so collision
// matches what you see. Each is an upright cylinder in world space:
//   { x, z, radius, bottom, top }
// Used for both character movement and projectile blocking. Computed once.

let cached = null;

export function getObstacles() {
  if (cached) return cached;
  const obs = [];
  for (const island of ISLANDS) {
    const layout = islandLayout(island.id);
    for (const p of layout.palms) {
      obs.push({
        x: p.x,
        z: p.z,
        radius: 0.38 * p.scale, // trunk is thin
        bottom: ISLAND_HEIGHT - 0.3,
        top: ISLAND_HEIGHT + 3.2 * p.scale, // up into the canopy
      });
    }
    for (const r of layout.decorRocks) {
      obs.push({
        x: r.x,
        z: r.z,
        radius: 0.82 * r.scale,
        bottom: ISLAND_HEIGHT - 0.5,
        top: ISLAND_HEIGHT + 1.5 * r.scale,
      });
    }
  }
  cached = obs;
  return obs;
}

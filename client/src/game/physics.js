import { ISLANDS, ISLAND_RADIUS, ISLAND_HEIGHT, WATER_Y } from './constants.js';

// Height of whatever a projectile can land on at (x, z): island sand or the
// sea surface.
export function surfaceYAt(x, z) {
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    if (dx * dx + dz * dz <= ISLAND_RADIUS * ISLAND_RADIUS) return ISLAND_HEIGHT;
  }
  return WATER_Y;
}

// Ballistic position along a throw at time t.
export function trajectoryAt(origin, velocity, gravity, t) {
  return {
    x: origin.x + velocity.x * t,
    y: origin.y + velocity.y * t - 0.5 * gravity * t * t,
    z: origin.z + velocity.z * t,
  };
}

// Given a launch origin, a target landing point, a fixed projectile speed and
// gravity, solve the launch velocity so the projectile passes through the
// target. Uses the flatter (lower-angle) of the two ballistic arcs. Returns
// { x, y, z, reachable }: when the target is out of range, `reachable` is
// false and the velocity is a best-effort 45° max-distance shot.
export function solveThrow(origin, target, speed, gravity) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const d = Math.hypot(dx, dz);
  const v2 = speed * speed;

  if (d < 1e-3) {
    // Directly above/below — just fire vertically toward it.
    return { x: 0, y: dy >= 0 ? speed : -speed, z: 0, reachable: true };
  }

  const dirx = dx / d;
  const dirz = dz / d;
  const k = (gravity * d * d) / (2 * v2); // shorthand from the range equation
  const disc = d * d - 4 * k * (dy + k);

  let u; // u = tan(launch angle)
  let reachable = true;
  if (disc < 0) {
    u = 1; // out of range → 45° for maximum reach
    reachable = false;
  } else {
    const s = Math.sqrt(disc);
    u = (d - s) / (2 * k); // flatter arc
    if (!isFinite(u)) u = (d + s) / (2 * k);
  }

  const inv = 1 / Math.sqrt(1 + u * u);
  const vh = speed * inv; // horizontal speed
  const vv = speed * u * inv; // vertical speed
  return { x: dirx * vh, y: vv, z: dirz * vh, reachable };
}

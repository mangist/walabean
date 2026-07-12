import * as THREE from 'three';
import { ISLAND_RADIUS, ISLAND_HEIGHT, WATER_Y, TERRAIN, COLORS } from './constants.js';

// Builds a single island as a radial heightfield: a flat walkable plateau
// that curves down into a beach, crosses the waterline at its widest radius,
// then tapers to a seabed skirt below the sea. Gentle dune noise + per-vertex
// sand shading give it terrain/texture. Client-only (the server needs no
// mesh), returned as a BufferGeometry with position + color attributes.

const RADIAL = 64; // slices around
const RINGS = 22; // rings from center outward

const { plateauR, shoreR, deepR, seabedY } = TERRAIN;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const A = new THREE.Color();
const B = new THREE.Color();
function mix(hexA, hexB, t, out) {
  A.set(hexA);
  B.set(hexB);
  return out.copy(A).lerp(B, t);
}

export function buildIslandGeometry(islandId) {
  const rand = mulberry32(islandId * 7919 + 17);
  // Per-island dune phase offsets so no two islands share a silhouette.
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  const p4 = rand() * Math.PI * 2;

  const dune = (x, z) =>
    Math.sin(x * 0.55 + p1) * Math.cos(z * 0.5 + p2) * 0.6 +
    Math.sin((x + z) * 0.33 + p3) * 0.32 +
    Math.cos(x * 0.9 - z * 0.7 + p4) * 0.18;

  // Smooth base profile as a function of distance from the island center.
  const baseHeight = (r) => {
    if (r <= plateauR) return ISLAND_HEIGHT;
    if (r <= shoreR) {
      return THREE.MathUtils.lerp(ISLAND_HEIGHT, WATER_Y, smoothstep(plateauR, shoreR, r));
    }
    return THREE.MathUtils.lerp(WATER_Y, seabedY, smoothstep(shoreR, deepR, r));
  };

  const heightAt = (r, x, z) => {
    const n = dune(x, z);
    if (r <= plateauR) {
      // Dunes only dip below the walking plane so the player never sinks in.
      return ISLAND_HEIGHT - Math.abs(n) * 0.22;
    }
    let h = baseHeight(r);
    if (r < shoreR) {
      // Blend dune detail out as we approach the clean waterline.
      h += n * 0.28 * (1 - smoothstep(plateauR, shoreR, r));
    }
    return h;
  };

  const colorAt = (h, x, z, out) => {
    if (h >= WATER_Y + 0.35) {
      mix(COLORS.sandDry2, COLORS.sandDry, dune(x, z) * 0.5 + 0.5, out);
    } else if (h >= WATER_Y - 0.15) {
      out.set(COLORS.sandWet); // wet shoreline band
    } else {
      mix(COLORS.sandWet, COLORS.seabed, smoothstep(WATER_Y - 0.15, seabedY, h), out);
    }
    const j = 0.94 + rand() * 0.12; // break up color banding
    return out.multiplyScalar(j);
  };

  const positions = [];
  const colors = [];
  const indices = [];
  const c = new THREE.Color();

  // Center vertex (index 0).
  const h0 = heightAt(0, 0, 0);
  positions.push(0, h0, 0);
  colorAt(h0, 0, 0, c);
  colors.push(c.r, c.g, c.b);

  for (let i = 1; i <= RINGS; i++) {
    const r = (i / RINGS) * deepR;
    for (let j = 0; j < RADIAL; j++) {
      const theta = (j / RADIAL) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const h = heightAt(r, x, z);
      positions.push(x, h, z);
      colorAt(h, x, z, c);
      colors.push(c.r, c.g, c.b);
    }
  }

  const ringStart = (i) => 1 + (i - 1) * RADIAL; // first vertex index of ring i

  // Center fan -> ring 1.
  for (let j = 0; j < RADIAL; j++) {
    const a = ringStart(1) + j;
    const b = ringStart(1) + ((j + 1) % RADIAL);
    indices.push(0, b, a);
  }

  // Quad strips between successive rings.
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = ringStart(i) + j;
      const b = ringStart(i) + ((j + 1) % RADIAL);
      const cIdx = ringStart(i + 1) + j;
      const d = ringStart(i + 1) + ((j + 1) % RADIAL);
      indices.push(a, d, cIdx);
      indices.push(a, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

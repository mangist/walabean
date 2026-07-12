import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLANDS, WATER_Y, TERRAIN, COLORS } from './constants.js';

const SIZE = 560; // spans well past the fog so there's no visible sea edge
const SEG = 128; // grid resolution — finer so ripples/caps have room to read

const WAVE_MAX = 1.04; // sum of the amplitudes below, for normalizing foam

// Sum of travelling sine waves across several scales: broad swells down to
// fine chop. The high-frequency terms are what let whitecaps and ripple
// glints form instead of one smooth sheet.
function waveHeight(x, z, t) {
  return (
    Math.sin(x * 0.12 + t * 0.9) * 0.35 +
    Math.sin(z * 0.15 + t * 1.05) * 0.28 +
    Math.sin((x + z) * 0.08 + t * 0.7) * 0.22 +
    Math.sin((x - z) * 0.31 + t * 1.7) * 0.09 +
    Math.sin(x * 0.62 - z * 0.44 + t * 2.3) * 0.06 +
    Math.sin((x * 0.9 + z * 0.8) + t * 3.1) * 0.04
  );
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function Sea() {
  const meshRef = useRef();
  const baseRef = useRef(null); // flat XZ positions captured once
  const baseColorRef = useRef(null); // depth gradient colors captured once

  const foam = useMemo(() => new THREE.Color(COLORS.foam), []);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2); // lie flat in the XZ plane, normals up
    // Depth-tinted vertex colors: brighter toward the map center (shallows
    // around the islands), deeper teal out toward the horizon.
    const pos = geo.attributes.position;
    const colors = [];
    const shallow = new THREE.Color(COLORS.waterShallow);
    const deep = new THREE.Color(COLORS.waterDeep);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      const t = Math.min(1, d / 150);
      tmp.copy(shallow).lerp(deep, t);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const geo = meshRef.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    if (!baseRef.current) baseRef.current = Float32Array.from(pos.array); // flat grid
    if (!baseColorRef.current) baseColorRef.current = Float32Array.from(col.array);
    const base = baseRef.current;
    const bcol = baseColorRef.current;
    const t = clock.elapsedTime;
    const fr = foam.r;
    const fg = foam.g;
    const fb = foam.b;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const x = base[ix];
      const z = base[ix + 2];
      const y = waveHeight(x, z, t);
      pos.array[ix + 1] = y;

      // Whitecaps: the tops of the swells foam over, but broken into patches
      // by a slow cross pattern so they look like real caps, not solid stripes.
      const crest = smoothstep(0.3 * WAVE_MAX, 0.66 * WAVE_MAX, y);
      const patch = Math.sin(x * 0.5 + t * 1.8) * Math.sin(z * 0.45 - t * 1.6);
      const capFoam = crest * (0.35 + 0.65 * smoothstep(0.15, 0.85, patch));
      // Ripple glints: sharp peaks of a faster cross pattern scatter small
      // moving white highlights across the whole surface, like light catching
      // the ripples between crests.
      const ripple = Math.sin(x * 0.32 - z * 0.4 + t * 2.6) * Math.sin(x * 0.28 + z * 0.36 + t * 1.3);
      const glint = smoothstep(0.68, 0.98, ripple) * 0.55;
      let f = capFoam + glint;
      if (f > 1) f = 1;

      // Blend the depth color toward foam white by the foam amount.
      col.array[ix] = bcol[ix] + (fr - bcol[ix]) * f;
      col.array[ix + 1] = bcol[ix + 1] + (fg - bcol[ix + 1]) * f;
      col.array[ix + 2] = bcol[ix + 2] + (fb - bcol[ix + 2]) * f;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // flatShading derives normals from the animated facets in-shader, so no
    // per-frame computeVertexNormals is needed.
    if (import.meta.env.DEV) window.__sea = meshRef.current;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, WATER_Y, 0]} receiveShadow>
      <meshStandardMaterial
        vertexColors
        flatShading
        transparent
        opacity={0.9}
        roughness={0.5}
        metalness={0.05}
      />
    </mesh>
  );
}

// Pulsing foam collar where the surf meets an island's shoreline.
function Foam({ position }) {
  const ref = useRef();
  const geometry = useMemo(
    () => new THREE.RingGeometry(TERRAIN.shoreR * 0.97, TERRAIN.shoreR * 1.16, 48),
    []
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 1.6 + position[0]) * 0.012;
    ref.current.scale.set(s, s, 1);
    ref.current.material.opacity = 0.5 + Math.sin(clock.elapsedTime * 1.6 + position[0]) * 0.18;
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={[position[0], WATER_Y + 0.06, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshBasicMaterial color={COLORS.foam} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

export default function Water() {
  return (
    <group>
      <Sea />
      {ISLANDS.map((island) => (
        <Foam key={island.id} position={[island.x, WATER_Y, island.z]} />
      ))}
    </group>
  );
}

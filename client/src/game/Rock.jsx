import { COLORS } from './constants.js';

// Chunky low-poly boulder — big enough to hide behind.
export default function Rock({ position = [0, 0, 0], scale = 1, seed = 0 }) {
  return (
    <group position={position} rotation={[0, seed * 2.4, 0]}>
      <mesh position={[0, 0.55 * scale, 0]} scale={scale} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color={COLORS.rock} flatShading />
      </mesh>
      <mesh
        position={[0.7 * scale, 0.3 * scale, 0.3 * scale]}
        scale={scale * 0.45}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color={COLORS.rock} flatShading />
      </mesh>
    </group>
  );
}

import { COLORS } from './constants.js';

// Low-poly palm: trunk segments + a fan of drooping cone fronds. Kept
// upright (no lean) so coconut positions computed in worldLayout.js line up
// exactly with the canopy.
export default function PalmTree({ position = [0, 0, 0], scale = 1, rotY = 0 }) {
  const fronds = [0, 1, 2, 3, 4];
  return (
    <group position={position} scale={scale} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 2.2, 6]} />
        <meshStandardMaterial color={COLORS.trunk} flatShading />
      </mesh>
      <mesh position={[0.12, 2.7, 0]} rotation={[0, 0, -0.1]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.2, 6]} />
        <meshStandardMaterial color={COLORS.trunk} flatShading />
      </mesh>
      <group position={[0.18, 3.35, 0]}>
        {fronds.map((i) => {
          const angle = (i / fronds.length) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, angle, 0]}>
              {/* Cone tipped past horizontal so the frond droops outward */}
              <mesh
                position={[0.75, 0.12, 0]}
                rotation={[0, 0, -Math.PI / 2 - 0.4]}
                scale={[1, 1, 0.45]}
                castShadow
              >
                <coneGeometry args={[0.3, 1.7, 4]} />
                <meshStandardMaterial color={COLORS.leaves} flatShading />
              </mesh>
            </group>
          );
        })}
        <mesh>
          <sphereGeometry args={[0.28, 6, 5]} />
          <meshStandardMaterial color={COLORS.leaves} flatShading />
        </mesh>
      </group>
    </group>
  );
}

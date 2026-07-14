import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

const OUTFIT = '#5c7a6e';
const SKIN = '#f0c8a0';
const ARM_SWING = 0.85; // max forward/back swing (radians) while walking
const ARM_REST_Z = 0.12; // slight outward splay so arms clear the body
const FALL_ANGLE = 1.45; // ~83°: topple over onto the ground when dead

const CROWN_GOLD = '#f4c531';

// A little low-poly gold crown for the winner: a band + a ring of points.
function Crown() {
  const points = [0, 1, 2, 3, 4, 5];
  return (
    <group position={[0, 2.0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.16, 12, 1, true]} />
        <meshStandardMaterial
          color={CROWN_GOLD}
          metalness={0.7}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {points.map((i) => {
        const a = (i / points.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.3, 0.15, Math.sin(a) * 0.3]} castShadow>
            <coneGeometry args={[0.07, 0.18, 4]} />
            <meshStandardMaterial color={CROWN_GOLD} metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

// Stylized chibi bean: round body, big head, goggles + scarf accent color,
// plus swinging arms with sphere hands. Shared by the local and remote
// players; origin at the feet. Arm motion is driven by the character's own
// world-position change, so it animates the same way no matter who moves it.
// When `fallen` is set (player dead), it topples over from the feet; when
// `winner` is set, it wears a crown.
export default function Character({
  color = '#e8833a',
  name,
  showName = true,
  fallen = false,
  winner = false,
}) {
  const root = useRef();
  const leftArm = useRef();
  const rightArm = useRef();

  const phase = useRef(0);
  const swing = useRef(0); // eased 0..1 walk amplitude
  const fall = useRef(0); // eased 0..1 fall-over amount
  const cur = useRef(new THREE.Vector3());
  const last = useRef(new THREE.Vector3());
  const started = useRef(false);

  useFrame((_, rawDelta) => {
    if (!root.current) return;
    const delta = Math.min(rawDelta, 0.05) || 0.016;

    // Topple over when dead, stand back up on respawn.
    fall.current += ((fallen ? 1 : 0) - fall.current) * Math.min(1, delta * 8);
    root.current.rotation.x = fall.current * FALL_ANGLE;

    root.current.getWorldPosition(cur.current);
    if (!started.current) {
      last.current.copy(cur.current);
      started.current = true;
    }
    const dx = cur.current.x - last.current.x;
    const dz = cur.current.z - last.current.z;
    last.current.copy(cur.current);
    const speed = Math.hypot(dx, dz) / delta; // world units / second

    // Ease the swing amplitude in/out so starting and stopping look natural.
    const moving = speed > 0.4;
    swing.current += ((moving ? 1 : 0) - swing.current) * Math.min(1, delta * 10);

    // Advance the walk cycle proportional to speed while moving.
    const cadence = Math.min(speed, 8) * 1.3;
    phase.current += cadence * delta;

    const s = Math.sin(phase.current) * ARM_SWING * swing.current;
    if (leftArm.current) leftArm.current.rotation.x = s;
    if (rightArm.current) rightArm.current.rotation.x = -s;

    if (import.meta.env.DEV) {
      window.__armSwingMax = Math.max(window.__armSwingMax || 0, Math.abs(s));
    }
  });

  return (
    <group ref={root}>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.38, 0.5, 6, 12]} />
        <meshStandardMaterial color={OUTFIT} flatShading />
      </mesh>
      {/* Arms: shoulder-pivoted so they swing around the top. */}
      <group ref={leftArm} position={[-0.46, 1.0, 0]} rotation={[0, 0, ARM_REST_Z]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.09, 0.56, 6]} />
          <meshStandardMaterial color={OUTFIT} flatShading />
        </mesh>
        <mesh position={[0, -0.6, 0]} castShadow>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={SKIN} flatShading />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.46, 1.0, 0]} rotation={[0, 0, -ARM_REST_Z]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.09, 0.56, 6]} />
          <meshStandardMaterial color={OUTFIT} flatShading />
        </mesh>
        <mesh position={[0, -0.6, 0]} castShadow>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={SKIN} flatShading />
        </mesh>
      </group>
      {/* Scarf (team color) */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <torusGeometry args={[0.3, 0.12, 8, 14]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.42, 14, 12]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      {/* Helmet */}
      <mesh position={[0, 1.68, -0.02]} castShadow>
        <sphereGeometry args={[0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color="#9b7048" flatShading />
      </mesh>
      {/* Goggles */}
      <mesh position={[-0.16, 1.72, 0.34]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#bcd9d4" metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[0.16, 1.72, 0.34]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#bcd9d4" metalness={0.3} roughness={0.3} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.13, 1.5, 0.38]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#2b2320" />
      </mesh>
      <mesh position={[0.13, 1.5, 0.38]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#2b2320" />
      </mesh>
      {/* Boots */}
      <mesh position={[-0.18, 0.12, 0.05]} castShadow>
        <boxGeometry args={[0.24, 0.24, 0.36]} />
        <meshStandardMaterial color="#7a4a2b" flatShading />
      </mesh>
      <mesh position={[0.18, 0.12, 0.05]} castShadow>
        <boxGeometry args={[0.24, 0.24, 0.36]} />
        <meshStandardMaterial color="#7a4a2b" flatShading />
      </mesh>
      {winner && <Crown />}
      {showName && name && (
        <Billboard position={[0, 2.5, 0]}>
          <Text
            fontSize={0.32}
            color="#ffffff"
            outlineWidth={0.02}
            outlineColor="#000000"
            outlineOpacity={0.55}
          >
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

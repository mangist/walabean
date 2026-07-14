import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import Character from './Character.jsx';
import { MAX_HEALTH } from './constants.js';

function healthColor(frac) {
  if (frac > 0.5) return '#57c04a';
  if (frac > 0.25) return '#e8b23a';
  return '#e14b3b';
}

// Small camera-facing health bar floating above a player's head.
function HealthBar3D({ health }) {
  const frac = Math.max(0, Math.min(1, (health ?? MAX_HEALTH) / MAX_HEALTH));
  const W = 1.3;
  const H = 0.17;
  return (
    <Billboard position={[0, 2.35, 0]}>
      <mesh>
        <planeGeometry args={[W + 0.09, H + 0.09]} />
        <meshBasicMaterial color="#0e1f24" transparent opacity={0.72} />
      </mesh>
      {frac > 0 && (
        <mesh position={[-(W * (1 - frac)) / 2, 0, 0.01]} scale={[frac, 1, 1]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial color={healthColor(frac)} />
        </mesh>
      )}
    </Billboard>
  );
}

// Renders another player's bean, smoothing toward the latest server snapshot.
export default function RemotePlayer({ player, winnerId }) {
  const group = useRef();

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const t = 1 - Math.pow(0.0001, delta); // exponential smoothing
    g.position.x += (player.position.x - g.position.x) * t;
    g.position.y += (player.position.y - g.position.y) * t;
    g.position.z += (player.position.z - g.position.z) * t;
    g.rotation.y += (player.rotation - g.rotation.y) * t;
  });

  return (
    <group ref={group} position={[player.position.x, player.position.y, player.position.z]}>
      <Character
        color={player.color}
        name={player.name}
        fallen={player.alive === false}
        winner={winnerId === player.id}
      />
      <HealthBar3D health={player.health} />
    </group>
  );
}

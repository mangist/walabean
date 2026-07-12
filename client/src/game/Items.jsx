import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store.js';
import { GRAVITY } from './constants.js';

const COCONUT_COLOR = '#6b4a2f';
const PICKUP_ROCK_COLOR = '#8d9995';
const HIGHLIGHT = '#ffb054';

// Small rock lying on the sand, ready to be picked up with E.
function PickupRock({ item, highlighted }) {
  return (
    <mesh
      position={[item.position.x, item.position.y + 0.14, item.position.z]}
      rotation={[0, item.position.x * 5.7, 0]}
      castShadow
    >
      <dodecahedronGeometry args={[0.2, 0]} />
      <meshStandardMaterial
        color={PICKUP_ROCK_COLOR}
        flatShading
        emissive={highlighted ? HIGHLIGHT : '#000000'}
        emissiveIntensity={highlighted ? 0.5 : 0}
      />
    </mesh>
  );
}

// Coconut still hanging under a palm canopy.
function TreeCoconut({ item }) {
  return (
    <mesh position={[item.position.x, item.position.y, item.position.z]} castShadow>
      <sphereGeometry args={[0.3, 10, 8]} />
      <meshStandardMaterial color={COCONUT_COLOR} flatShading />
    </mesh>
  );
}

// Coconut on the ground (possibly mid-fall, animating down from the canopy).
function GroundCoconut({ item, highlighted }) {
  const ref = useRef();
  const y = useRef(item.dropFrom ? item.dropFrom.y : item.position.y + 0.28);
  const x = useRef(item.dropFrom ? item.dropFrom.x : item.position.x);
  const z = useRef(item.dropFrom ? item.dropFrom.z : item.position.z);
  const velocityY = useRef(0);

  useFrame((_, delta) => {
    const restY = item.position.y + 0.28;
    if (y.current > restY) {
      velocityY.current -= GRAVITY * delta;
      y.current = Math.max(restY, y.current + velocityY.current * delta);
      // Drift sideways toward the landing spot as it falls.
      x.current += (item.position.x - x.current) * Math.min(1, delta * 4);
      z.current += (item.position.z - z.current) * Math.min(1, delta * 4);
    } else {
      x.current = item.position.x;
      z.current = item.position.z;
    }
    if (ref.current) ref.current.position.set(x.current, y.current, z.current);
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.3, 10, 8]} />
      <meshStandardMaterial
        color={COCONUT_COLOR}
        flatShading
        emissive={highlighted ? HIGHLIGHT : '#000000'}
        emissiveIntensity={highlighted ? 0.5 : 0}
      />
    </mesh>
  );
}

export default function Items() {
  const items = useGameStore((s) => s.items);
  const nearbyId = useGameStore((s) => s.nearby?.id);

  return items.map((item) => {
    if (item.state === 'gone') return null;
    if (item.kind === 'rock') {
      return <PickupRock key={item.id} item={item} highlighted={item.id === nearbyId} />;
    }
    if (item.state === 'tree') {
      return <TreeCoconut key={item.id} item={item} />;
    }
    return <GroundCoconut key={item.id} item={item} highlighted={item.id === nearbyId} />;
  });
}

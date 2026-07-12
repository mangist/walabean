import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store.js';

const DURATION = 0.45;

// Expanding, fading fireball for bomb explosions.
function Explosion({ effect }) {
  const ref = useRef();
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const k = t.current / DURATION;
    if (k >= 1) {
      useGameStore.getState().removeEffect(effect.id);
      return;
    }
    if (ref.current) {
      ref.current.scale.setScalar(0.5 + k * effect.radius);
      ref.current.material.opacity = 0.85 * (1 - k);
    }
  });

  return (
    <mesh ref={ref} position={[effect.position.x, effect.position.y, effect.position.z]}>
      <sphereGeometry args={[1, 14, 12]} />
      <meshBasicMaterial color="#ff9a3c" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

export default function Effects() {
  const effects = useGameStore((s) => s.effects);
  return effects.map((e) => <Explosion key={e.id} effect={e} />);
}

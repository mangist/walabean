import { useGameStore } from '../store.js';
import Island from './Island.jsx';
import Water from './Water.jsx';
import Items from './Items.jsx';
import Projectiles from './Projectiles.jsx';
import Effects from './Effects.jsx';
import LocalPlayer from './LocalPlayer.jsx';
import RemotePlayer from './RemotePlayer.jsx';
import { ISLANDS, COLORS } from './constants.js';

export default function Scene() {
  const selfId = useGameStore((s) => s.selfId);
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winner?.id ?? null);

  const self = players.find((p) => p.id === selfId);
  const others = players.filter((p) => p.id !== selfId);

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.fogFar, 80, 220]} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[40, 60, 25]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />

      <Water />
      {ISLANDS.map((island) => (
        <Island key={island.id} island={island} />
      ))}
      <Items />
      <Projectiles />
      <Effects />

      {self && <LocalPlayer key={self.id} player={self} winnerId={winnerId} />}
      {others.map((p) => (
        <RemotePlayer key={p.id} player={p} winnerId={winnerId} />
      ))}
    </>
  );
}

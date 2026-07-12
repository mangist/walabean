import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './game/Scene.jsx';
import Hud from './ui/Hud.jsx';
import Lobby from './ui/Lobby.jsx';
import WinnerModal from './ui/WinnerModal.jsx';
import { connect } from './net/socket.js';
import { useGameStore } from './store.js';

export default function App() {
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    connect();
  }, []);

  const inGame = phase === 'playing' || phase === 'over';

  return (
    <>
      {inGame && (
        <>
          <Canvas shadows camera={{ position: [0, 30, 60], fov: 55 }}>
            <Scene />
          </Canvas>
          <Hud />
        </>
      )}
      {phase === 'over' && <WinnerModal />}
      {(phase === 'lobby' || phase === 'connecting') && <Lobby />}
    </>
  );
}

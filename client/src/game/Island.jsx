import { useMemo } from 'react';
import PalmTree from './PalmTree.jsx';
import Rock from './Rock.jsx';
import { islandLayout } from './worldLayout.js';
import { buildIslandGeometry } from './terrain.js';
import { ISLAND_HEIGHT } from './constants.js';

// Static island scenery. The terrain mesh comes from a seeded radial
// heightfield (beach that meets the waterline); prop positions come from the
// shared seeded layout so every client and the server agree on them.
export default function Island({ island }) {
  const layout = islandLayout(island.id);
  const geometry = useMemo(() => buildIslandGeometry(island.id), [island.id]);

  return (
    <group>
      <mesh
        geometry={geometry}
        position={[island.x, 0, island.z]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0} />
      </mesh>
      {/* Palms and boulders are placed in world coordinates by the layout */}
      {layout.palms.map((palm, i) => (
        <PalmTree
          key={`palm-${i}`}
          position={[palm.x, ISLAND_HEIGHT, palm.z]}
          scale={palm.scale}
          rotY={palm.rotY}
        />
      ))}
      {layout.decorRocks.map((rock, i) => (
        <Rock
          key={`rock-${i}`}
          position={[rock.x, ISLAND_HEIGHT, rock.z]}
          scale={rock.scale}
          seed={rock.seed}
        />
      ))}
    </group>
  );
}

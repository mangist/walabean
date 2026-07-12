import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store.js';
import { sendCoconutHit, sendProjectileLanded, sendPlayerHit } from '../net/socket.js';
import { surfaceYAt, trajectoryAt } from './physics.js';
import { getObstacles } from './obstacles.js';
import { playSfx } from '../audio/sound.js';
import {
  PROJECTILES,
  COCONUT_HIT_RADIUS,
  BOMB_BLAST_RADIUS,
  PROJECTILE_LIFETIME,
  PLAYER_HIT_RADIUS,
} from './constants.js';

const TORSO_OFFSET = 0.9; // aim hit checks at the player's chest, not their feet

let effectCounter = 0;

function explode(position) {
  useGameStore.getState().addEffect({
    id: `boom-${effectCounter++}`,
    position: { ...position },
    radius: BOMB_BLAST_RADIUS,
  });
  playSfx('bomb');
}

// Knock every tree coconut within the blast out of its palm (thrower only —
// the server validates and broadcasts the result).
function blastCoconuts(position) {
  const { items } = useGameStore.getState();
  for (const item of items) {
    if (item.kind !== 'coconut' || item.state !== 'tree') continue;
    const dx = item.position.x - position.x;
    const dy = item.position.y - position.y;
    const dz = item.position.z - position.z;
    if (dx * dx + dy * dy + dz * dz <= BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS) {
      sendCoconutHit(item.id);
    }
  }
}

// Damage every other living player caught in a bomb blast (thrower authority).
function blastPlayers(position, throwerId) {
  const { players } = useGameStore.getState();
  for (const p of players) {
    if (p.id === throwerId || p.alive === false) continue;
    const dx = p.position.x - position.x;
    const dy = p.position.y + TORSO_OFFSET - position.y;
    const dz = p.position.z - position.z;
    if (dx * dx + dy * dy + dz * dz <= BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS) {
      sendPlayerHit(p.id, 'bomb');
    }
  }
}

function ProjectileMesh({ kind }) {
  if (kind === 'rock') {
    return (
      <mesh castShadow>
        <dodecahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#8d9995" flatShading />
      </mesh>
    );
  }
  if (kind === 'coconut') {
    return (
      <mesh castShadow>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#6b4a2f" flatShading />
      </mesh>
    );
  }
  if (kind === 'arrow') {
    // Built along +Z so the parent group can lookAt() the flight direction.
    return (
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
          <meshStandardMaterial color="#c9a36a" flatShading />
        </mesh>
        <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 6]} />
          <meshStandardMaterial color="#5a5f63" flatShading />
        </mesh>
      </group>
    );
  }
  // bomb
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#2f3336" flatShading />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.16, 5]} />
        <meshStandardMaterial color="#c96a2b" flatShading />
      </mesh>
    </group>
  );
}

// Collision sweep resolution (seconds). Small enough that even the fastest
// projectile (~68 u/s) advances well under a thin palm-trunk radius per step,
// so it can't tunnel through obstacles or hitboxes.
const SWEEP_STEP = 0.004;

function Projectile({ projectile }) {
  const ref = useRef();
  const t = useRef(0);
  const finished = useRef(false);
  const config = PROJECTILES[projectile.kind];

  const posAt = (time) => trajectoryAt(projectile.origin, projectile.velocity, config.gravity, time);

  const finish = (impact) => {
    if (finished.current) return;
    finished.current = true;
    if (projectile.kind === 'bomb' && impact) {
      // Everyone renders the explosion (deterministic sim); only the thrower
      // reports the coconut knockdowns and player damage.
      explode(impact);
      if (projectile.local) {
        blastCoconuts(impact);
        blastPlayers(impact, projectile.playerId);
      }
    }
    // Rocks and coconuts stay in the world where they land — the server
    // turns the impact into a new pickup (respawned ashore if it splashed).
    if (
      impact &&
      projectile.local &&
      (projectile.kind === 'rock' || projectile.kind === 'coconut')
    ) {
      sendProjectileLanded(projectile.kind, impact);
    }
    useGameStore.getState().removeProjectile(projectile.id);
  };

  // Check collisions at one instant of the flight. Returns true if the
  // projectile stopped there.
  const collideAt = (time) => {
    const { x, y, z } = posAt(time);

    // Thrower's client is the authority for what its projectile hits.
    if (projectile.local) {
      const state = useGameStore.getState();

      // Player collision. Bombs don't damage on contact — they detonate and
      // their blast (in finish) does the damage — but they still stop here.
      const playerDist = PLAYER_HIT_RADIUS + config.radius;
      for (const p of state.players) {
        if (p.id === projectile.playerId || p.alive === false) continue;
        const dx = p.position.x - x;
        const dy = p.position.y + TORSO_OFFSET - y;
        const dz = p.position.z - z;
        if (dx * dx + dy * dy + dz * dz <= playerDist * playerDist) {
          if (projectile.kind !== 'bomb') sendPlayerHit(p.id, projectile.kind);
          finish({ x, y, z });
          return true;
        }
      }

      // Tree coconut collision.
      const hitDist = COCONUT_HIT_RADIUS + config.radius;
      for (const item of state.items) {
        if (item.kind !== 'coconut' || item.state !== 'tree') continue;
        const dx = item.position.x - x;
        const dy = item.position.y - y;
        const dz = item.position.z - z;
        if (dx * dx + dy * dy + dz * dz <= hitDist * hitDist) {
          sendCoconutHit(item.id);
          finish({ x, y, z });
          return true;
        }
      }
    }

    // Solid scenery (rocks, palm trunks) — blocks everyone's projectiles.
    for (const o of getObstacles()) {
      if (y < o.bottom || y > o.top) continue;
      const dx = x - o.x;
      const dz = z - o.z;
      const rr = o.radius + config.radius;
      if (dx * dx + dz * dz <= rr * rr) {
        finish({ x, y, z });
        return true;
      }
    }

    // Ground / water impact.
    if (y <= surfaceYAt(x, z) + config.radius) {
      finish({ x, y, z });
      return true;
    }
    return false;
  };

  useFrame((_, delta) => {
    if (finished.current) return;
    const from = t.current;
    t.current += delta;
    const time = t.current;

    const { x, y, z } = posAt(time);
    if (ref.current) {
      ref.current.position.set(x, y, z);
      if (projectile.kind === 'arrow') {
        ref.current.lookAt(
          x + projectile.velocity.x,
          y + (projectile.velocity.y - config.gravity * time),
          z + projectile.velocity.z
        );
      }
    }

    // Sweep the flight path since last frame so slow frames can't tunnel
    // past a coconut (or the ground) between samples.
    for (let s = Math.min(from + SWEEP_STEP, time); ; s = Math.min(s + SWEEP_STEP, time)) {
      if (collideAt(s)) return;
      if (s >= time) break;
    }

    if (time > PROJECTILE_LIFETIME) finish(null);
  });

  return (
    <group ref={ref} position={[projectile.origin.x, projectile.origin.y, projectile.origin.z]}>
      <ProjectileMesh kind={projectile.kind} />
    </group>
  );
}

export default function Projectiles() {
  const projectiles = useGameStore((s) => s.projectiles);
  return projectiles.map((p) => <Projectile key={p.id} projectile={p} />);
}

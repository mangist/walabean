import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Character from './Character.jsx';
import { useKeyboard } from './useKeyboard.js';
import { sendMove, sendPickup, throwProjectile } from '../net/socket.js';
import { useGameStore } from '../store.js';
import { surfaceYAt, trajectoryAt, solveThrow } from './physics.js';
import { getObstacles } from './obstacles.js';
import { playSfx, startAudio } from '../audio/sound.js';
import {
  ISLANDS,
  ISLAND_RADIUS,
  ISLAND_HEIGHT,
  MOVE_SPEED,
  JUMP_SPEED,
  GRAVITY,
  WATER_Y,
  WEAPONS,
  WEAPON_ORDER,
  PROJECTILES,
  PICKUP_RADIUS,
} from './constants.js';

const CHAR_RADIUS = 0.4; // horizontal collision radius of the bean

const CAM_DIST = 8;
const HEAD_HEIGHT = 1.6;
const SHOULDER_OFFSET = 1.2; // camera sits over the shoulder so the body doesn't block the crosshair/arc
const HAND_HEIGHT = 1.4; // where a throw launches from
const MOUSE_SENSITIVITY = 0.0028;
const AIM_CLAMP = 0.9; // how far the crosshair can travel from center, in NDC
// Pitch is the camera's elevation above the player: higher = looking down from
// above. Floor it just above horizontal so the camera can never tilt up under
// the island (which clipped through terrain and glitched the view).
const PITCH_MIN = 0.06;
const PITCH_MAX = 1.2; // looking steeply down
const EDGE_MARGIN = 0.7; // keep feet on the sand, off the very rim
const NET_INTERVAL = 1 / 20; // outgoing move updates per second
const ARC_SAMPLES = 34; // points sampled along the trajectory tube
// The local player owns its own position (client-authoritative), so we ignore
// the stale server snapshot for normal movement. Only snap to the server on a
// large divergence (e.g. a respawn teleport).
const RECONCILE_THRESHOLD = 4;

export default function LocalPlayer({ player }) {
  const group = useRef();
  const keys = useKeyboard();
  const { camera, gl, scene } = useThree();

  const velocityY = useRef(0);
  const yaw = useRef(0);
  const pitch = useRef(0.35);
  const netTimer = useRef(0);
  const lastThrow = useRef(-Infinity);

  // Aiming state (kept in refs so the frame loop reads them without re-renders).
  const aimNDC = useMemo(() => new THREE.Vector2(0, 0), []);
  const aimSolution = useRef(null); // {origin, velocity, weapon} for release
  const lastTarget = useRef(null); // for debugging
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const waterExcluded = useRef(false);

  // Soft red trajectory tube: a bright core + an additive glow halo.
  const coreRef = useRef();
  const glowRef = useRef();
  const coreMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ff2b2b',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    []
  );
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ff5a5a',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const home = ISLANDS[player.island];

  // Spawn position captured once. The group's position is NOT bound to the
  // `player` prop — if it were, every 20 Hz snapshot re-render would reset the
  // local player back to the stale server position and fight the frame loop
  // (that was the movement jitter). We seed it here and let useFrame own it.
  const spawn = useMemo(() => ({ ...player.position }), []);
  useLayoutEffect(() => {
    group.current?.position.set(spawn.x, spawn.y, spawn.z);
  }, [spawn]);

  // Direction-based launch params (used by the dev throw hook).
  const launchParams = (dirOverride) => {
    const g = group.current;
    if (!g) return null;
    const dir = new THREE.Vector3(dirOverride.x, dirOverride.y, dirOverride.z).normalize();
    const weapon = WEAPONS[useGameStore.getState().weapon];
    const origin = new THREE.Vector3(g.position.x, g.position.y + HAND_HEIGHT, g.position.z)
      .addScaledVector(dir, 0.7);
    return {
      weapon,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      velocity: { x: dir.x * weapon.speed, y: dir.y * weapon.speed, z: dir.z * weapon.speed },
    };
  };

  // True only when we're actively playing and alive (not respawning, not
  // eliminated, game not over) — gates all player actions.
  const canAct = () => {
    const state = useGameStore.getState();
    if (state.phase !== 'playing') return false;
    const self = state.players.find((p) => p.id === state.selfId);
    return !!self && self.alive !== false;
  };

  const tryPickup = () => {
    if (!canAct()) return;
    const { nearby } = useGameStore.getState();
    if (nearby) {
      sendPickup(nearby.id);
      playSfx('pickup');
    }
  };

  // Fire a specific weapon along a precomputed velocity, respecting ammo and
  // cooldown. Shared by the aim-release throw and the dev hook.
  const throwWithVelocity = (weapon, origin, velocity) => {
    if (!canAct()) return false;
    const state = useGameStore.getState();
    const self = state.players.find((p) => p.id === state.selfId);
    if (!self || (self.inventory?.[weapon.ammo] ?? 0) <= 0) return false;
    const now = performance.now() / 1000;
    if (now - lastThrow.current < weapon.cooldown) return false;
    lastThrow.current = now;
    throwProjectile(weapon.projectile, origin, {
      x: velocity.x,
      y: velocity.y,
      z: velocity.z,
    });
    return true;
  };

  const throwActiveWeapon = (dirOverride) => {
    const params = launchParams(dirOverride);
    if (!params) return false;
    return throwWithVelocity(params.weapon, params.origin, params.velocity);
  };

  // Raycast from the camera through the crosshair (NDC) to the point the arc
  // should land on: terrain, props, players, or the sea surface.
  const findAimTarget = () => {
    camera.updateMatrixWorld();
    raycaster.setFromCamera(aimNDC, camera);

    // Disable the big water plane from raycasts once — it has thousands of
    // animated triangles; we intersect the sea analytically instead.
    if (!waterExcluded.current) {
      scene.traverse((o) => {
        if (o.isMesh && o.geometry?.type === 'PlaneGeometry') o.raycast = () => {};
      });
      waterExcluded.current = true;
    }

    let best = null;
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object;
      let own = false;
      while (o) {
        if (o === group.current) {
          own = true; // skip our own character
          break;
        }
        o = o.parent;
      }
      if (!own) {
        best = { point: h.point, distance: h.distance };
        break;
      }
    }

    // Analytic sea-surface intersection.
    const ray = raycaster.ray;
    if (Math.abs(ray.direction.y) > 1e-4) {
      const t = (WATER_Y - ray.origin.y) / ray.direction.y;
      if (t > 0 && (!best || t < best.distance)) {
        best = { point: ray.origin.clone().addScaledVector(ray.direction, t), distance: t };
      }
    }
    return best ? best.point : null;
  };

  const buildTube = (points, radius) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length, radius, 7, false);

  // Update the arc tube to the trajectory that lands under the crosshair.
  const updateArc = (weapon) => {
    const core = coreRef.current;
    const glow = glowRef.current;
    if (!core || !glow) return;

    const g = group.current;
    const target = findAimTarget();
    lastTarget.current = target;
    if (!target) {
      core.visible = false;
      glow.visible = false;
      aimSolution.current = null;
      return;
    }

    const origin = { x: g.position.x, y: g.position.y + HAND_HEIGHT, z: g.position.z };
    const gravity = PROJECTILES[weapon.projectile].gravity;
    const velocity = solveThrow(origin, target, weapon.speed, gravity);
    aimSolution.current = { origin, velocity, weapon };

    const vh = Math.hypot(velocity.x, velocity.z) || 1e-3;
    const dHoriz = Math.hypot(target.x - origin.x, target.z - origin.z);
    const tCap = velocity.reachable ? (dHoriz / vh) * 1.001 : 6;

    const pts = [];
    for (let i = 0; i <= ARC_SAMPLES; i++) {
      const t = (i / ARC_SAMPLES) * tCap;
      const p = trajectoryAt(origin, velocity, gravity, t);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
      if (i > 0 && p.y <= surfaceYAt(p.x, p.z)) break;
    }
    if (pts.length < 2) {
      core.visible = false;
      glow.visible = false;
      return;
    }

    core.geometry.dispose();
    glow.geometry.dispose();
    core.geometry = buildTube(pts, 0.07);
    glow.geometry = buildTube(pts, 0.2);
    core.visible = true;
    glow.visible = true;
  };

  // Pointer lock: click the canvas to capture the mouse, Esc releases it.
  useEffect(() => {
    const canvas = gl.domElement;
    const onClick = () => {
      startAudio(); // first user gesture — unlock the AudioContext + music
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      useGameStore.setState({ pointerLocked: locked, ...(locked ? {} : { aiming: false }) });
    };
    // While aiming the mouse steers the crosshair (camera frozen); otherwise
    // it orbits the camera.
    const onMouseMove = (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (useGameStore.getState().aiming) {
        aimNDC.x = THREE.MathUtils.clamp(aimNDC.x + e.movementX * MOUSE_SENSITIVITY, -AIM_CLAMP, AIM_CLAMP);
        aimNDC.y = THREE.MathUtils.clamp(aimNDC.y - e.movementY * MOUSE_SENSITIVITY, -AIM_CLAMP, AIM_CLAMP);
        useGameStore.getState().setAimScreen(aimNDC.x, aimNDC.y);
      } else {
        yaw.current -= e.movementX * MOUSE_SENSITIVITY;
        pitch.current = THREE.MathUtils.clamp(
          pitch.current + e.movementY * MOUSE_SENSITIVITY,
          PITCH_MIN,
          PITCH_MAX
        );
      }
    };
    // Hold left click to aim (crosshair + arc), release to throw.
    const onMouseDown = (e) => {
      if (e.button === 0 && document.pointerLockElement === canvas) {
        aimNDC.set(0, 0);
        useGameStore.getState().setAimScreen(0, 0);
        useGameStore.getState().setAiming(true);
      }
    };
    const onMouseUp = (e) => {
      if (e.button !== 0) return;
      const state = useGameStore.getState();
      if (!state.aiming) return;
      state.setAiming(false);
      state.setAimScreen(0, 0);
      const sol = aimSolution.current;
      if (sol) throwWithVelocity(sol.weapon, sol.origin, sol.velocity);
      aimSolution.current = null;
      aimNDC.set(0, 0);
    };
    // E picks up, 1-4 switch weapons.
    const onKeyDown = (e) => {
      if (e.code === 'KeyE') tryPickup();
      const slot = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (slot >= 0) useGameStore.getState().setWeapon(WEAPON_ORDER[slot]);
    };
    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [gl]);

  // Dev-only hooks so gameplay can be exercised from the console / tests
  // (pointer lock can't be triggered by automation).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__walabean = {
      teleport: (x, z) => group.current?.position.set(x, ISLAND_HEIGHT, z),
      throwAt: (tx, ty, tz) => {
        const g = group.current;
        if (!g) return false;
        return throwActiveWeapon({
          x: tx - g.position.x,
          y: ty - (g.position.y + HAND_HEIGHT),
          z: tz - g.position.z,
        });
      },
      pickup: tryPickup,
      pos: () => (group.current ? { ...group.current.position } : null),
      obstacles: () => getObstacles(),
      look: (p, y) => {
        pitch.current = p;
        if (y !== undefined) yaw.current = y;
      },
      // Ballistic throw at a world point (mirrors the aim solver).
      throwArcAt: (tx, ty, tz) => {
        const g = group.current;
        if (!g) return false;
        const weapon = WEAPONS[useGameStore.getState().weapon];
        const origin = { x: g.position.x, y: g.position.y + HAND_HEIGHT, z: g.position.z };
        const gravity = PROJECTILES[weapon.projectile].gravity;
        const vel = solveThrow(origin, { x: tx, y: ty, z: tz }, weapon.speed, gravity);
        return throwWithVelocity(weapon, origin, vel);
      },
      // Simulate holding aim at a crosshair NDC position.
      setAimNDC: (x, y) => {
        aimNDC.set(x, y);
        useGameStore.getState().setAimScreen(x, y);
        useGameStore.getState().setAiming(true);
      },
      releaseAim: () => {
        const state = useGameStore.getState();
        state.setAiming(false);
        state.setAimScreen(0, 0);
        const sol = aimSolution.current;
        const ok = sol ? throwWithVelocity(sol.weapon, sol.origin, sol.velocity) : false;
        aimSolution.current = null;
        aimNDC.set(0, 0);
        return ok;
      },
      aimInfo: () => ({
        coreVisible: !!coreRef.current?.visible,
        glowVisible: !!glowRef.current?.visible,
        target: lastTarget.current ? { ...lastTarget.current } : null,
        solution: aimSolution.current
          ? { velocity: { ...aimSolution.current.velocity }, origin: { ...aimSolution.current.origin } }
          : null,
        tubeVerts: coreRef.current?.geometry?.attributes?.position?.count ?? 0,
      }),
    };
    return () => delete window.__walabean;
  }, []);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05); // avoid tunneling on tab-switch
    const store = useGameStore.getState();
    const aiming = store.aiming;
    const self = store.players.find((p) => p.id === store.selfId);

    // Reconcile only on large server corrections (e.g. respawn). Normal
    // movement stays client-authoritative so it never rubber-bands.
    if (self) {
      const rdx = self.position.x - g.position.x;
      const rdy = self.position.y - g.position.y;
      const rdz = self.position.z - g.position.z;
      if (rdx * rdx + rdy * rdy + rdz * rdz > RECONCILE_THRESHOLD * RECONCILE_THRESHOLD) {
        g.position.set(self.position.x, self.position.y, self.position.z);
        velocityY.current = 0;
      }
    }

    // Camera-relative movement on the XZ plane. Frozen while respawning,
    // eliminated, or after the game is over.
    const alive = store.phase === 'playing' && self && self.alive !== false;
    const forwardInput = alive ? (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0) : 0;
    const strafeInput = alive ? (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0) : 0;
    if (forwardInput || strafeInput) {
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      const move = new THREE.Vector3(
        -sin * forwardInput + cos * strafeInput,
        0,
        -cos * forwardInput - sin * strafeInput
      );
      move.normalize().multiplyScalar(MOVE_SPEED * delta);
      g.position.x += move.x;
      g.position.z += move.z;
    }

    // Push out of solid scenery (rocks, palm trunks) — can't walk through.
    for (const o of getObstacles()) {
      const ox = g.position.x - o.x;
      const oz = g.position.z - o.z;
      const minD = o.radius + CHAR_RADIUS;
      const d2 = ox * ox + oz * oz;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        g.position.x = o.x + (ox / d) * minD;
        g.position.z = o.z + (oz / d) * minD;
      }
    }

    // Keep the player on their island — no walking into the ocean.
    const dx = g.position.x - home.x;
    const dz = g.position.z - home.z;
    const dist = Math.hypot(dx, dz);
    const maxDist = ISLAND_RADIUS - EDGE_MARGIN;
    if (dist > maxDist) {
      g.position.x = home.x + (dx / dist) * maxDist;
      g.position.z = home.z + (dz / dist) * maxDist;
    }

    // Character faces where the camera looks.
    g.rotation.y = yaw.current + Math.PI;

    // Vertical: gravity + jumping on the island surface.
    const onGround = g.position.y <= ISLAND_HEIGHT + 0.01 && velocityY.current <= 0;
    if (onGround) {
      g.position.y = ISLAND_HEIGHT;
      velocityY.current = 0;
      if (alive && keys.current.jump) velocityY.current = JUMP_SPEED;
    } else {
      velocityY.current -= GRAVITY * delta;
    }
    g.position.y += velocityY.current * delta;

    // Third-person over-the-shoulder camera driven by mouse yaw/pitch. While
    // aiming the orientation is frozen (mouse moves the crosshair instead), so
    // the camera only tracks the player's position.
    const cosPitch = Math.cos(pitch.current);
    const target = new THREE.Vector3(
      g.position.x + Math.cos(yaw.current) * SHOULDER_OFFSET,
      g.position.y + HEAD_HEIGHT,
      g.position.z - Math.sin(yaw.current) * SHOULDER_OFFSET
    );
    camera.position.set(
      target.x + Math.sin(yaw.current) * cosPitch * CAM_DIST,
      target.y + Math.sin(pitch.current) * CAM_DIST,
      target.z + Math.cos(yaw.current) * cosPitch * CAM_DIST
    );
    camera.lookAt(target);

    // Find the closest pickable item underfoot for the E-to-pickup prompt.
    let nearest = null;
    let nearestDistSq = PICKUP_RADIUS * PICKUP_RADIUS;
    for (const item of store.items) {
      if (item.state !== 'ground') continue;
      const idx = item.position.x - g.position.x;
      const idz = item.position.z - g.position.z;
      const distSq = idx * idx + idz * idz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = item;
      }
    }
    if ((nearest?.id ?? null) !== (store.nearby?.id ?? null)) {
      store.setNearby(nearest ? { id: nearest.id, kind: nearest.kind } : null);
    }

    // Aim trajectory tube while the mouse button is held.
    const weapon = WEAPONS[store.weapon];
    const hasAmmo = (self?.inventory?.[weapon.ammo] ?? 0) > 0;
    if (aiming && hasAmmo && alive) {
      updateArc(weapon);
    } else {
      if (coreRef.current) coreRef.current.visible = false;
      if (glowRef.current) glowRef.current.visible = false;
      aimSolution.current = null;
    }

    // Throttled network updates. While dead, stop reporting so the server's
    // respawn teleport isn't immediately overwritten by our stale position.
    netTimer.current += delta;
    if (netTimer.current >= NET_INTERVAL && self?.alive !== false) {
      netTimer.current = 0;
      sendMove({ x: g.position.x, y: g.position.y, z: g.position.z }, g.rotation.y);
    }
  });

  return (
    <>
      {/* No `position` prop — the frame loop owns the local transform. Binding
          it to the (stale) server snapshot re-applied on every re-render and
          caused the movement jitter. Seeded once via useLayoutEffect. */}
      <group ref={group}>
        <Character color={player.color} name={player.name} showName={false} />
      </group>
      {/* Trajectory arc — geometry/visibility driven only from useFrame (no
          visible prop, which React would re-apply on every snapshot re-render
          and fight the frame loop). Excluded from the aim raycast. */}
      <mesh
        ref={(m) => {
          if (m) {
            m.raycast = () => {};
            coreRef.current = m;
          }
        }}
        material={coreMat}
      />
      <mesh
        ref={(m) => {
          if (m) {
            m.raycast = () => {};
            glowRef.current = m;
          }
        }}
        material={glowMat}
      />
    </>
  );
}

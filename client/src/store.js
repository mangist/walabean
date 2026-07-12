import { create } from 'zustand';

// Global game state fed by the socket layer and read by React/three components.
export const useGameStore = create((set) => ({
  phase: 'lobby', // lobby | connecting | playing | over
  gameCode: null, // 4-char room code once in a game
  winner: null, // {id, name} when the game is over
  joinError: null, // 'not_found' | 'full' | 'over' | null
  selfId: null,
  players: [], // latest server snapshot (includes self)
  pointerLocked: false,

  items: [], // world items: pickup rocks + coconuts (tree/ground/gone)
  weapon: 'bow', // active weapon key (we start holding the bow)
  nearby: null, // {id, kind} of the closest pickable item, or null
  aiming: false, // mouse held down — trajectory arc is showing
  aimScreen: { x: 0, y: 0 }, // crosshair offset in NDC (x right, y up); 0,0 = center
  projectiles: [], // in-flight throws (local + remote)
  effects: [], // transient visuals (explosions)

  setPhase: (phase) => set({ phase }),
  setSelfId: (selfId) => set({ selfId }),
  setPlayers: (players) => set({ players }),

  upsertPlayer: (player) =>
    set((state) => {
      const others = state.players.filter((p) => p.id !== player.id);
      return { players: [...others, player] };
    }),

  dropPlayer: (id) =>
    set((state) => ({ players: state.players.filter((p) => p.id !== id) })),

  setItems: (items) => set({ items }),

  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item;
        // A coconut leaving its tree remembers where it fell from so the
        // client can animate the drop.
        const dropFrom =
          item.state === 'tree' && patch.state === 'ground'
            ? { ...item.position }
            : item.dropFrom;
        return { ...item, ...patch, dropFrom };
      }),
    })),

  setWeapon: (weapon) => set({ weapon }),
  setNearby: (nearby) => set({ nearby }),
  setAiming: (aiming) => set({ aiming }),
  setAimScreen: (x, y) => set({ aimScreen: { x, y } }),

  upsertItem: (item) =>
    set((state) => {
      const others = state.items.filter((i) => i.id !== item.id);
      return { items: [...others, item] };
    }),

  addProjectile: (projectile) =>
    set((state) => ({ projectiles: [...state.projectiles, projectile] })),
  removeProjectile: (id) =>
    set((state) => ({ projectiles: state.projectiles.filter((p) => p.id !== id) })),

  addEffect: (effect) => set((state) => ({ effects: [...state.effects, effect] })),
  removeEffect: (id) =>
    set((state) => ({ effects: state.effects.filter((e) => e.id !== id) })),
}));

if (import.meta.env.DEV) {
  // Dev/test access from the console: __store.getState()
  window.__store = useGameStore;
}

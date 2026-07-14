import { io } from 'socket.io-client';
import { useGameStore } from '../store.js';
import { playSfx } from '../audio/sound.js';

// Where the Socket.IO server lives:
// - Production build (served by the Node server itself, e.g. on Render): the
//   client and server share one origin, so connect to window.location.origin.
// - Dev: the server is a separate process on port 3001 of the same host
//   (works for localhost and other devices on the LAN).
// - Override either with VITE_SERVER_URL.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.PROD ? window.location.origin : `http://${location.hostname}:3001`);

let socket = null;
let projectileCounter = 0;

// Per-tab identity so a refresh (F5) reattaches to the same player. session
// storage survives reload but not a new tab, which is exactly what we want.
function getToken() {
  let t = sessionStorage.getItem('walabean-token');
  if (!t) {
    t = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('walabean-token', t);
  }
  return t;
}

function codeFromUrl() {
  return new URLSearchParams(location.search).get('g');
}

// Establish the socket + all listeners. On connect, auto-rejoin if the URL
// carries a game code (refresh/deep-link); otherwise land in the lobby.
export function connect() {
  if (socket) return socket;

  // Start on HTTP long-polling (works anywhere the page loaded from) and let
  // socket.io upgrade to a websocket when it can. Websocket-only failed to
  // connect reliably across devices on the LAN (handshake/upgrade could be
  // blocked one direction), leaving joiners stuck on "connecting".
  socket = io(SERVER_URL, { transports: ['polling', 'websocket'] });

  socket.on('connect', () => {
    const code = codeFromUrl();
    if (code) {
      useGameStore.getState().setPhase('connecting');
      socket.emit('game:join', { code, token: getToken() });
    } else {
      useGameStore.getState().setPhase('lobby');
    }
  });

  socket.on('game:init', ({ selfId, code, players, items }) => {
    history.replaceState(null, '', `?g=${code}`);
    useGameStore.setState({
      phase: 'playing',
      gameCode: code,
      winner: null,
      joinError: null,
      selfId,
      players,
      items,
    });
  });

  socket.on('join:error', ({ reason }) => {
    // A failed auto-rejoin: drop the dead code from the URL and show the lobby.
    history.replaceState(null, '', location.pathname);
    useGameStore.setState({ phase: 'lobby', joinError: reason, gameCode: null });
  });

  socket.on('game:over', ({ winnerId, winnerName }) => {
    useGameStore.setState({ phase: 'over', winner: { id: winnerId, name: winnerName } });
  });

  socket.on('game:state', ({ players }) => {
    useGameStore.getState().setPlayers(players);
  });

  socket.on('player:joined', (player) => {
    useGameStore.getState().upsertPlayer(player);
  });

  socket.on('player:left', ({ id }) => {
    useGameStore.getState().dropPlayer(id);
  });

  socket.on('item:update', ({ id, state, position }) => {
    const patch = { state };
    if (position) patch.position = position;
    useGameStore.getState().updateItem(id, patch);
  });

  // A landed throw became a new pickup (possibly respawned onto an island).
  socket.on('item:spawned', (item) => {
    useGameStore.getState().upsertItem(item);
  });

  // Another player threw something — render it (local: false means this
  // client only simulates the visual, it doesn't report hits).
  socket.on('projectile:spawned', (projectile) => {
    useGameStore.getState().addProjectile({ ...projectile, local: false });
  });

  // Damage feedback: hurt sound if it's us, hit/kill sound if we dealt it.
  socket.on('player:damaged', ({ id, by, dead }) => {
    const selfId = useGameStore.getState().selfId;
    if (id === selfId) {
      playSfx(dead ? 'death' : 'hurt');
    } else if (by === selfId) {
      playSfx(dead ? 'kill' : 'hit');
    }
  });

  return socket;
}

export function hostGame() {
  useGameStore.setState({ phase: 'connecting', joinError: null });
  socket?.emit('game:host', { token: getToken() });
}

export function joinGame(code) {
  useGameStore.setState({ phase: 'connecting', joinError: null });
  socket?.emit('game:join', { code: (code || '').toUpperCase(), token: getToken() });
}

// Called from the local player's frame loop (throttled there).
export function sendMove(position, rotation) {
  if (socket?.connected) {
    socket.emit('player:move', { position, rotation });
  }
}

export function sendPickup(itemId) {
  if (socket?.connected) {
    socket.emit('item:pickup', { id: itemId });
  }
}

// Throw the active weapon's projectile: simulate locally right away and tell
// the server so other clients see it (and ammo is spent server-side).
export function throwProjectile(kind, origin, velocity) {
  if (!socket?.connected) return;
  const id = `${socket.id}-${projectileCounter++}`;
  useGameStore.getState().addProjectile({
    id,
    kind,
    origin,
    velocity,
    playerId: socket.id,
    local: true,
  });
  playSfx('throw', kind);
  socket.emit('projectile:throw', { id, kind, origin, velocity });
}

export function sendCoconutHit(itemId) {
  if (socket?.connected) {
    socket.emit('coconut:hit', { id: itemId });
  }
}

export function sendProjectileLanded(kind, position) {
  if (socket?.connected) {
    socket.emit('projectile:landed', { kind, position });
  }
}

// Thrower reports its projectile struck a player; the server applies damage.
export function sendPlayerHit(targetId, kind) {
  if (socket?.connected) {
    socket.emit('player:hit', { targetId, kind });
  }
}

// On hot module replacement, close the old socket so we don't leave a ghost
// player on the server.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket?.disconnect();
  });
}

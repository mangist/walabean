import { useState } from 'react';
import { useGameStore } from '../store.js';
import { WEAPONS, WEAPON_ORDER, MAX_HEALTH, MAX_LIVES } from '../game/constants.js';
import { toggleMute, isMuted, startAudio } from '../audio/sound.js';

function SoundToggle() {
  const [muted, setMuted] = useState(isMuted());
  return (
    <button
      className="sound-toggle"
      title={muted ? 'Unmute' : 'Mute'}
      onClick={() => {
        startAudio(); // ensure the context is running on this gesture
        setMuted(toggleMute());
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function healthColor(frac) {
  if (frac > 0.5) return '#57c04a';
  if (frac > 0.25) return '#e8b23a';
  return '#e14b3b';
}

// Lives as a row of hearts (filled = remaining).
function Lives({ lives }) {
  const n = lives ?? MAX_LIVES;
  return (
    <div className="lives">
      {Array.from({ length: MAX_LIVES }, (_, i) => (
        <span key={i} className={`life${i < n ? '' : ' lost'}`}>
          {i < n ? '❤' : '🖤'}
        </span>
      ))}
    </div>
  );
}

// Large health bar for the local player, centered at the top, with lives.
function BigHealth({ health, lives }) {
  const hp = Math.max(0, Math.ceil(health ?? MAX_HEALTH));
  const frac = Math.max(0, Math.min(1, hp / MAX_HEALTH));
  return (
    <div className="health-hud">
      <div className="health-hud-bar">
        <div
          className="health-hud-fill"
          style={{ width: `${frac * 100}%`, background: healthColor(frac) }}
        />
        <div className="health-hud-label">{hp} / {MAX_HEALTH}</div>
      </div>
      <Lives lives={lives} />
    </div>
  );
}

// Own component so crosshair moves (aimScreen updates every mousemove) without
// re-rendering the rest of the HUD.
function Crosshair() {
  const aiming = useGameStore((s) => s.aiming);
  const aim = useGameStore((s) => s.aimScreen);
  // NDC (x right, y up) -> screen percentage.
  const left = 50 + aim.x * 50;
  const top = 50 - aim.y * 50;
  const color = aiming ? '#ff4d4d' : '#ffffff';
  return (
    <svg
      className="crosshair"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <g stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.95">
        <line x1="14" y1="1" x2="14" y2="9" />
        <line x1="14" y1="19" x2="14" y2="27" />
        <line x1="1" y1="14" x2="9" y2="14" />
        <line x1="19" y1="14" x2="27" y2="14" />
      </g>
      <circle cx="14" cy="14" r="1.7" fill={color} opacity="0.95" />
    </svg>
  );
}

function WeaponLegend({ inventory, active }) {
  return (
    <div className="legend">
      {WEAPON_ORDER.map((key, i) => {
        const weapon = WEAPONS[key];
        const count = inventory?.[weapon.ammo] ?? 0;
        return (
          <div
            key={key}
            className={`slot${key === active ? ' active' : ''}${count === 0 ? ' empty' : ''}`}
          >
            <span className="slot-key">{i + 1}</span>
            <span className="slot-icon">{weapon.icon}</span>
            <span className="slot-label">{weapon.label}</span>
            <span className="slot-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Hud() {
  const phase = useGameStore((s) => s.phase);
  const gameCode = useGameStore((s) => s.gameCode);
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const pointerLocked = useGameStore((s) => s.pointerLocked);
  const weapon = useGameStore((s) => s.weapon);
  const nearby = useGameStore((s) => s.nearby);

  const campWarn = useGameStore((s) => s.campWarn);
  const self = players.find((p) => p.id === selfId);
  const eliminated = self && self.lives <= 0;

  return (
    <div className="hud">
      {phase === 'playing' && !eliminated && <Crosshair />}
      {phase === 'playing' && !pointerLocked && !eliminated && (
        <div className="hud-hint">Click to aim — Esc releases the mouse</div>
      )}
      {eliminated && phase === 'playing' && (
        <div className="pickup-label">You were eliminated — spectating…</div>
      )}
      {phase === 'playing' && !eliminated && campWarn !== null && (
        <div className={`camp-warn${campWarn === 0 ? ' draining' : ''}`}>
          {campWarn === 0
            ? '🩸 Camping! Losing 5 HP/s — MOVE!'
            : `⚠ Keep moving! Health drains in ${campWarn}s`}
        </div>
      )}
      {nearby && !eliminated && (
        <div className="pickup-label">
          Press <b>E</b> to pickup {nearby.kind}
        </div>
      )}
      {self && <BigHealth health={self.health} lives={self.lives} />}
      <div className="hud-top">
        <div className="hud-title">🏝️ walabean</div>
        <div className="hud-status">{players.length}/3 players</div>
        {gameCode && (
          <div className="hud-code">
            CODE <b>{gameCode}</b>
          </div>
        )}
      </div>
      <SoundToggle />
      <div className="hud-players">
        {players.map((p) => (
          <div key={p.id} className={`hud-player${p.lives <= 0 ? ' dead' : ''}`}>
            <span className="hud-player-dot" style={{ background: p.color }} />
            <span>
              {p.name}
              {p.id === selfId ? ' (you)' : ''}
            </span>
            <span className="hud-player-lives">
              {p.lives <= 0 ? '💀' : '❤'.repeat(p.lives)}
            </span>
          </div>
        ))}
      </div>
      <div className="hud-help">WASD move · Space jump · Hold click &amp; move mouse to aim, release to throw · E pickup · 1-4 weapons</div>
      {self && <WeaponLegend inventory={self?.inventory} active={weapon} />}
    </div>
  );
}

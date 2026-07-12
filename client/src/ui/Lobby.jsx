import { useState } from 'react';
import { useGameStore } from '../store.js';
import { hostGame, joinGame } from '../net/socket.js';
import { startAudio } from '../audio/sound.js';

const ERROR_TEXT = {
  not_found: "That game code doesn't exist.",
  full: 'That game is full (3 players max).',
  over: 'That game has already finished.',
};

export default function Lobby() {
  const phase = useGameStore((s) => s.phase);
  const joinError = useGameStore((s) => s.joinError);
  const [mode, setMode] = useState(null); // null | 'join'
  const [code, setCode] = useState('');

  const connecting = phase === 'connecting';

  const submitJoin = (e) => {
    e.preventDefault();
    if (code.trim().length !== 4) return;
    startAudio();
    joinGame(code.trim());
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-title">🏝️ walabean</div>
        <div className="lobby-sub">A 3-player island brawl. Last bean standing wins.</div>

        {connecting ? (
          <div className="lobby-connecting">Connecting…</div>
        ) : mode === 'join' ? (
          <form className="lobby-join" onSubmit={submitJoin}>
            <input
              className="lobby-input"
              autoFocus
              maxLength={4}
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button className="lobby-btn primary" type="submit" disabled={code.trim().length !== 4}>
              Join
            </button>
            <button className="lobby-btn ghost" type="button" onClick={() => setMode(null)}>
              Back
            </button>
          </form>
        ) : (
          <div className="lobby-actions">
            <button
              className="lobby-btn primary"
              onClick={() => {
                startAudio();
                hostGame();
              }}
            >
              Host Game
            </button>
            <button className="lobby-btn" onClick={() => setMode('join')}>
              Join Game
            </button>
          </div>
        )}

        {joinError && !connecting && <div className="lobby-error">{ERROR_TEXT[joinError] || 'Could not join.'}</div>}
      </div>
    </div>
  );
}

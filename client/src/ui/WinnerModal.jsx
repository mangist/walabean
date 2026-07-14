import { useGameStore } from '../store.js';
import { requestRestart } from '../net/socket.js';

// "Bean 1" | "Bean 1 and Bean 2" | "Bean 1, Bean 2 and Bean 3"
function formatList(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function WinnerModal() {
  const winner = useGameStore((s) => s.winner);
  const selfId = useGameStore((s) => s.selfId);
  const isHost = useGameStore((s) => s.isHost);
  if (!winner) return null;

  const youWon = winner.id && winner.id === selfId;
  const beaten = formatList(winner.defeated);

  const backToLobby = () => {
    window.location.href = window.location.pathname;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        {youWon ? (
          <>
            <div className="modal-emoji">👑</div>
            <div className="modal-title">Congratulations!</div>
            <div className="modal-text">
              {beaten ? `You beat ${beaten}!` : "You're the winner!"}
            </div>
          </>
        ) : (
          <>
            <div className="modal-emoji">🏝️</div>
            <div className="modal-title">Game over</div>
            <div className="modal-text">
              {winner.name ? `${winner.name} wins!` : 'No survivors.'}
            </div>
          </>
        )}

        <div className="modal-actions">
          {isHost && (
            <button className="lobby-btn primary" onClick={requestRestart}>
              Start a new game
            </button>
          )}
          <button className="lobby-btn ghost" onClick={backToLobby}>
            Back to lobby
          </button>
        </div>
        {!isHost && (
          <div className="modal-hint">Waiting for the host to start a new game…</div>
        )}
      </div>
    </div>
  );
}

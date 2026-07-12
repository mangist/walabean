import { useGameStore } from '../store.js';

export default function WinnerModal() {
  const winner = useGameStore((s) => s.winner);
  const selfId = useGameStore((s) => s.selfId);
  if (!winner) return null;

  const youWon = winner.id && winner.id === selfId;

  const backToLobby = () => {
    // Drop the game code and reload into a fresh lobby.
    window.location.href = window.location.pathname;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        {youWon ? (
          <>
            <div className="modal-emoji">🏆</div>
            <div className="modal-title">Congratulations!</div>
            <div className="modal-text">You're the winner!</div>
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
        <button className="lobby-btn primary" onClick={backToLobby}>
          Back to lobby
        </button>
      </div>
    </div>
  );
}

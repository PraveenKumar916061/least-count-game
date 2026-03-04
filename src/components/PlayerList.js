import React from "react";

function PlayerList({ players, turnOrder, currentTurn, playerId, hands }) {
  if (!players || !turnOrder) return null;

  return (
    <div className="player-list-game">
      {turnOrder.map((pid) => {
        const player = players[pid];
        if (!player) return null;

        const isMe = pid === playerId;
        const isCurrent = pid === currentTurn;
        const cardCount = hands?.[pid]?.length || 0;

        return (
          <div
            key={pid}
            className={`player-chip ${isCurrent ? "active-player" : ""} ${isMe ? "me" : ""}`}
          >
            <div className="player-avatar">
              {player.name.charAt(0).toUpperCase()}
            </div>
            <div className="player-info">
              <span className="player-chip-name">
                {player.name}
                {isMe && " (You)"}
                {player.isAI && " (AI)"}
              </span>
              <span className="player-chip-details">
                {cardCount} cards | Score: {player.score || 0}
              </span>
            </div>
            {isCurrent && <span className="turn-dot" />}
          </div>
        );
      })}
    </div>
  );
}

export default PlayerList;

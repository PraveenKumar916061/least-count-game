import React from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../hooks/useGame";
import { newRound, backToLobby } from "../utils/roomActions";
import Card from "./Card";

function GameOver() {
  const navigate = useNavigate();
  const { playerId, roomData, roomCode, leaveRoom } = useGame();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  if (!roomData) return null;

  const isHost = roomData.hostId === playerId;
  const players = roomData.players || {};
  const turnOrder = roomData.turnOrder || [];
  const roundScores = roomData.roundScores || {};
  const hands = roomData.hands || {};
  const declarer = roomData.declarer;
  const penalty = roomData.penalty || 0;

  const CARD_VALUES = {
    A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
  };

  // Sort players by round score for display
  const sortedPlayers = [...turnOrder].sort(
    (a, b) => (roundScores[a] || 0) - (roundScores[b] || 0)
  );

  // Overall leaderboard by cumulative score
  const leaderboard = [...turnOrder].sort(
    (a, b) => (players[a]?.score || 0) - (players[b]?.score || 0)
  );

  const handleNewRound = async () => {
    setLoading(true);
    setError("");
    try {
      await newRound(roomCode, playerId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLobby = async () => {
    setLoading(true);
    setError("");
    try {
      await backToLobby(roomCode, playerId);
      navigate(`/lobby/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    leaveRoom();
    navigate("/");
  };

  return (
    <div className="game-over-overlay">
      <div className="game-over-card">
        <h1 className="game-over-title">Round Over!</h1>

        <p className="declarer-info">
          <strong>{players[declarer]?.name || "Unknown"}</strong> declared Least Count!
          {penalty > 0 && (
            <span className="penalty-text"> But got a +{penalty} penalty!</span>
          )}
        </p>

        {/* Round Results */}
        <div className="round-results">
          <h3>Round Scores</h3>
          <div className="results-table">
            {sortedPlayers.map((pid, index) => {
              const player = players[pid];
              const hand = hands[pid] || [];
              const rawScore = hand.reduce((s, c) => s + (CARD_VALUES[c.rank] || 0), 0);
              const roundScore = roundScores[pid] || 0;
              const isDeclarer = pid === declarer;
              const isMe = pid === playerId;

              return (
                <div
                  key={pid}
                  className={`result-row ${index === 0 ? "winner" : ""} ${isMe ? "me" : ""} ${isDeclarer ? "declarer" : ""}`}
                >
                  <div className="result-rank">#{index + 1}</div>
                  <div className="result-player">
                    <span className="result-name">
                      {player?.name || "Unknown"}
                      {isDeclarer && <span className="declarer-badge">DECLARED</span>}
                      {isMe && <span className="you-badge-small">(You)</span>}
                    </span>
                    <div className="result-hand">
                      {hand.map((card) => (
                        <Card key={card.id} card={card} faceUp small />
                      ))}
                    </div>
                  </div>
                  <div className="result-score">
                    <span className="raw-score">{rawScore}</span>
                    {isDeclarer && penalty > 0 && (
                      <span className="penalty-badge">+{penalty}</span>
                    )}
                    <span className="final-round-score">= {roundScore}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Overall Leaderboard */}
        <div className="leaderboard">
          <h3>Overall Leaderboard</h3>
          <div className="leaderboard-table">
            {leaderboard.map((pid, index) => {
              const player = players[pid];
              return (
                <div
                  key={pid}
                  className={`leaderboard-row ${pid === playerId ? "me" : ""}`}
                >
                  <span className="lb-rank">#{index + 1}</span>
                  <span className="lb-name">{player?.name || "Unknown"}</span>
                  <span className="lb-score">{player?.score || 0} pts</span>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="game-over-actions">
          {isHost ? (
            <>
              <button className="btn btn-primary" onClick={handleNewRound} disabled={loading}>
                {loading ? "Starting..." : "Next Round"}
              </button>
              <button className="btn btn-secondary" onClick={handleBackToLobby} disabled={loading}>
                Back to Lobby
              </button>
            </>
          ) : (
            <p className="waiting-msg">Waiting for host to start next round...</p>
          )}
          <button className="btn btn-ghost" onClick={handleLeave}>Leave Game</button>
        </div>
      </div>
    </div>
  );
}

export default GameOver;

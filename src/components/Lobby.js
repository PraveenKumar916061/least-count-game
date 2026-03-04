import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGame } from "../hooks/useGame";
import { startGame } from "../utils/roomActions";

function Lobby() {
  const { roomCode: paramCode } = useParams();
  const navigate = useNavigate();
  const { playerId, roomData, roomCode, setRoomCode, leaveRoom } = useGame();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  // Sync route param
  useEffect(() => {
    if (paramCode && paramCode !== roomCode) {
      setRoomCode(paramCode);
    }
  }, [paramCode, roomCode, setRoomCode]);

  // Auto-navigate when game starts
  useEffect(() => {
    if (roomData?.status === "playing") {
      navigate(`/game/${roomCode}`);
    }
  }, [roomData?.status, roomCode, navigate]);

  const isHost = roomData?.hostId === playerId;
  const players = roomData?.players ? Object.entries(roomData.players) : [];
  const playerCount = players.length;

  const handleStart = async () => {
    if (!isHost) return;
    setLoading(true);
    setError("");
    try {
      await startGame(roomCode, playerId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = () => {
    leaveRoom();
    navigate("/");
  };

  if (!roomData) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h2>Loading room...</h2>
          <p>If this takes too long, the room may no longer exist.</p>
          <button className="btn btn-ghost" onClick={() => navigate("/")}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-card lobby-card">
        <h1>Game Lobby</h1>

        <div className="room-code-display">
          <span className="room-code-label">Room Code</span>
          <div className="room-code-value" onClick={handleCopyCode} title="Click to copy">
            {roomCode}
            <span className="copy-hint">{copied ? "Copied!" : "Click to copy"}</span>
          </div>
        </div>

        <p className="share-hint">Share this code with friends to join!</p>

        <div className="player-list-lobby">
          <h3>Players ({playerCount}/6)</h3>
          <ul>
            {players.map(([pid, player]) => (
              <li key={pid} className={pid === playerId ? "you" : ""}>
                <span className="player-name-lobby">
                  {player.name}
                  {pid === roomData.hostId && <span className="host-badge">HOST</span>}
                  {pid === playerId && <span className="you-badge">YOU</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="lobby-actions">
          {isHost ? (
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={loading || playerCount < 2}
            >
              {loading ? "Starting..." : playerCount < 2 ? "Need 2+ Players" : "Start Game"}
            </button>
          ) : (
            <p className="waiting-msg">Waiting for host to start the game...</p>
          )}
          <button className="btn btn-ghost" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}

export default Lobby;

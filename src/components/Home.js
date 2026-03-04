import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../hooks/useGame";
import { createRoom, joinRoom, createAIRoom, startAIRound } from "../utils/roomActions";

function Home() {
  const navigate = useNavigate();
  const { setPlayerId, setRoomCode, playerName, setPlayerName } = useGame();

  const [mode, setMode] = useState(null); // null | "create" | "join" | "ai"
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botCount, setBotCount] = useState(2);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { roomCode, playerId } = await createRoom(playerName.trim());
      setPlayerId(playerId);
      setRoomCode(roomCode);
      navigate(`/lobby/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!joinCode.trim()) {
      setError("Please enter a room code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { roomCode, playerId } = await joinRoom(joinCode.trim(), playerName.trim());
      setPlayerId(playerId);
      setRoomCode(roomCode);
      navigate(`/lobby/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAICreate = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { roomCode, playerId } = await createAIRoom(playerName.trim(), botCount);
      setPlayerId(playerId);
      setRoomCode(roomCode);
      await startAIRound(roomCode);
      navigate(`/game/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <div className="logo">
          <span className="logo-icon">&#9824;</span>
          <h1>Least Count</h1>
          <p className="subtitle">Multiplayer Card Game</p>
        </div>

        <div className="name-input-group">
          <label htmlFor="playerName">Your Name</label>
          <input
            id="playerName"
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={15}
            autoFocus
          />
        </div>

        {!mode && (
          <div className="home-buttons">
            <button className="btn btn-primary" onClick={() => setMode("create")} disabled={loading}>
              Create Room
            </button>
            <button className="btn btn-secondary" onClick={() => setMode("join")} disabled={loading}>
              Join Room
            </button>
            <button className="btn btn-ai" onClick={() => setMode("ai")} disabled={loading}>
              Play vs Computer
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="home-buttons">
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "Create & Enter Room"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setMode(null); setError(""); }}>
              Back
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="join-section">
            <div className="name-input-group">
              <label htmlFor="joinCode">Room Code</label>
              <input
                id="joinCode"
                type="text"
                placeholder="Enter 5-letter code..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5}
                className="room-code-input"
              />
            </div>
            <div className="home-buttons">
              <button className="btn btn-primary" onClick={handleJoin} disabled={loading}>
                {loading ? "Joining..." : "Join Room"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode(null); setError(""); }}>
                Back
              </button>
            </div>
          </div>
        )}

        {mode === "ai" && (
          <div className="ai-section">
            <div className="name-input-group">
              <label>Opponents</label>
              <div className="bot-count-selector">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    className={`bot-count-btn ${botCount === num ? "active" : ""}`}
                    onClick={() => setBotCount(num)}
                    disabled={loading}
                  >
                    {num} Bot{num > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div className="home-buttons">
              <button className="btn btn-ai" onClick={handleAICreate} disabled={loading}>
                {loading ? "Starting..." : "Start Game"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode(null); setError(""); }}>
                Back
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="rules-section">
          <details>
            <summary>How to Play</summary>
            <ul>
              <li>Each player gets <strong>7 cards</strong>. Goal: have the <strong>lowest total points</strong>.</li>
              <li>On your turn: first <strong>drop</strong> card(s), then <strong>pick</strong> a card from deck or discard pile.</li>
              <li>If you have multiple cards of the <strong>same rank</strong>, you can drop them all at once.</li>
              <li>You can <strong>swap</strong> a card from your hand with the top card of the discard pile.</li>
              <li>Card values: A=1, 2-10=face value, J=11, Q=12, K=13.</li>
              <li>When your hand value is <strong>below 7</strong>, you can call <strong>"Show"</strong> to declare.</li>
              <li>If you show but someone else has equal or lower points, you get a <strong>+10 penalty</strong>!</li>
              <li>Play multiple rounds. Lowest cumulative score wins.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

export default Home;

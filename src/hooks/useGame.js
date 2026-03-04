import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ref, onValue, off } from "firebase/database";
import { db } from "../utils/firebase";

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [playerId, setPlayerId] = useState(() => localStorage.getItem("lc_playerId") || null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("lc_playerName") || "");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("lc_roomCode") || null);
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persist to localStorage
  useEffect(() => {
    if (playerId) localStorage.setItem("lc_playerId", playerId);
    else localStorage.removeItem("lc_playerId");
  }, [playerId]);

  useEffect(() => {
    if (playerName) localStorage.setItem("lc_playerName", playerName);
  }, [playerName]);

  useEffect(() => {
    if (roomCode) localStorage.setItem("lc_roomCode", roomCode);
    else localStorage.removeItem("lc_roomCode");
  }, [roomCode]);

  // Subscribe to room data in real-time
  useEffect(() => {
    if (!roomCode) {
      setRoomData(null);
      return;
    }

    const roomRef = ref(db, `rooms/${roomCode}`);
    onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setRoomData(snapshot.val());
      } else {
        setRoomData(null);
      }
    }, (err) => {
      console.error("Room subscription error:", err);
      setError("Lost connection to game room");
    });

    return () => off(roomRef);
  }, [roomCode]);

  // Call a Cloud Function via REST (avoids needing firebase/functions SDK setup issues)
  const callFunction = useCallback(async (name, data) => {
    setLoading(true);
    setError(null);
    try {
      // Use the Firebase Functions callable endpoint
      // We use the Realtime Database directly instead for simpler deployment
      const response = await fetch(`/api/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Function call failed");
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const leaveRoom = useCallback(() => {
    setPlayerId(null);
    setRoomCode(null);
    setRoomData(null);
    localStorage.removeItem("lc_playerId");
    localStorage.removeItem("lc_roomCode");
  }, []);

  const value = {
    playerId, setPlayerId,
    playerName, setPlayerName,
    roomCode, setRoomCode,
    roomData,
    loading, error, setError,
    callFunction,
    leaveRoom,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within GameProvider");
  return context;
}

export default useGame;

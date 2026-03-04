import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Lobby from "./components/Lobby";
import Game from "./components/Game";
import { GameProvider } from "./hooks/useGame";

function App() {
  return (
    <GameProvider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lobby/:roomCode" element={<Lobby />} />
            <Route path="/game/:roomCode" element={<Game />} />
          </Routes>
        </div>
      </Router>
    </GameProvider>
  );
}

export default App;

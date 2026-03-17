import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGame } from "../hooks/useGame";
import { drawCard, discardCards, declare, triggerAIAction } from "../utils/roomActions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Card from "./Card";
import PlayerList from "./PlayerList";
import GameOver from "./GameOver";

function SortableCard({ card, isSelected, isDiscardable, isSwappable, sameRankAsSelected, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: isDiscardable || isSwappable ? "pointer" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`hand-card-wrapper ${isSelected ? "selected" : ""} ${
        isDiscardable || isSwappable ? "discardable" : ""
      } ${isDiscardable && sameRankAsSelected && !isSelected ? "same-rank-hint" : ""} ${
        isSwappable ? "swappable" : ""
      } ${isDragging ? "sortable-drag" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Card card={card} faceUp />
    </div>
  );
}

function Game() {
  const { roomCode: paramCode } = useParams();
  const navigate = useNavigate();
  const { playerId, roomData, roomCode, setRoomCode, leaveRoom } = useGame();

  const [selectedCards, setSelectedCards] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeclareConfirm, setShowDeclareConfirm] = useState(false);
  const [handOrder, setHandOrder] = useState([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [aiThinking, setAiThinking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const myHand = roomData?.hands?.[playerId] || [];
  const isMyTurn = roomData?.currentTurn === playerId;

  // Browser back button handler
  useEffect(() => {
    const handlePopState = (event) => {
      event.preventDefault();
      setShowExitConfirm(true);
    };
    
    window.history.pushState({ inGame: true }, '');
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Turn timer
  useEffect(() => {
    if (!isMyTurn || roomData?.status !== "playing") {
      setTimeLeft(30);
      return;
    }

    setTimeLeft(30);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [roomData?.currentTurn, isMyTurn, roomData?.status]);

  // Auto-action when timer expires - discard then draw
  useEffect(() => {
    if (!isMyTurn || timeLeft > 0 || roomData?.status !== "playing" || actionLoading) return;

    const handleTimeout = async () => {
      const currentPhase = roomData?.turnPhase;
      const currentHand = roomData?.hands?.[playerId] || [];
      setActionLoading(true);
      try {
        if (currentPhase === "discard" && currentHand.length > 0) {
          // Auto-discard a random card
          const randomCard = currentHand[Math.floor(Math.random() * currentHand.length)];
          await discardCards(roomCode, playerId, [randomCard.id]);
        } else if (currentPhase === "draw") {
          // Auto-draw from draw pile
          await drawCard(roomCode, playerId, "draw");
        }
      } catch (err) {
        console.error("Auto-action error:", err);
      } finally {
        setActionLoading(false);
      }
    };

    handleTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isMyTurn, roomData?.status]);

  useEffect(() => {
    if (paramCode && paramCode !== roomCode) {
      setRoomCode(paramCode);
    }
  }, [paramCode, roomCode, setRoomCode]);

  // Redirect to lobby if game hasn't started
  useEffect(() => {
    if (roomData?.status === "waiting") {
      navigate(`/lobby/${roomCode}`);
    }
  }, [roomData?.status, roomCode, navigate]);

  // Clear selections and sync hand order when turn changes
  useEffect(() => {
    setSelectedCards([]);
    setShowDeclareConfirm(false);
  }, [roomData?.currentTurn, roomData?.turnPhase]);

  // Sync hand order with myHand
  useEffect(() => {
    if (myHand && myHand.length > 0) {
      const currentOrder = handOrder.map((id) => myHand.find((c) => c.id === id)).filter(Boolean);
      const newCards = myHand.filter((c) => !handOrder.includes(c.id));
      setHandOrder([...currentOrder.map((c) => c.id), ...newCards.map((c) => c.id)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHand]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setHandOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    if (!roomData || roomData.status !== "playing") return;

    const currentPlayer = roomData.players?.[roomData.currentTurn];
    if (!currentPlayer?.isAI) return;
    if (aiThinking) return;

    const executeAITurn = async () => {
      setAiThinking(true);
      await new Promise(r => setTimeout(r, 1200));
      
      let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        try {
          const result = await triggerAIAction(roomCode);
          if (result.success) {
            success = true;
            console.log("AI action succeeded:", result.action);
          } else {
            console.log("AI action failed:", result.error, "attempt:", attempt + 1);
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (err) {
          console.error("AI action error:", err);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      setAiThinking(false);
    };

    executeAITurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.currentTurn]);

  if (!roomData || !roomData.hands) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h2>Loading game...</h2>
          <button className="btn btn-ghost" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const isFinished = roomData.status === "finished";
  const turnPhase = roomData.turnPhase; // "discard" (first) | "draw" (second)
  const discardPile = roomData.discardPile || [];
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const drawPileCount = roomData.drawPile ? roomData.drawPile.length : 0;
  const currentPlayerName = roomData.players?.[roomData.currentTurn]?.name || "...";
  const turnOrder = roomData.turnOrder || [];

  // Calculate my hand score
  const CARD_VALUES = {
    A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
  };
  const myScore = myHand.reduce((s, c) => s + (CARD_VALUES[c.rank] || 0), 0);

  // Can declare only if score < 7
  const canDeclare = myScore < 7;

  const handleDraw = async (source) => {
    if (!isMyTurn || turnPhase !== "draw") return;
    setActionLoading(true);
    setError("");
    try {
      await drawCard(roomCode, playerId, source);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!isMyTurn || turnPhase !== "discard" || selectedCards.length === 0) return;
    setActionLoading(true);
    setError("");
    try {
      await discardCards(roomCode, playerId, selectedCards.map((c) => c.id));
      setSelectedCards([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclare = async () => {
    if (!isMyTurn || turnPhase !== "discard") return;
    setActionLoading(true);
    setError("");
    try {
      await declare(roomCode, playerId);
      setShowDeclareConfirm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCardClick = (card) => {
    if (!isMyTurn) return;

    if (turnPhase === "discard") {
      const isAlreadySelected = selectedCards.some((c) => c.id === card.id);

      if (isAlreadySelected) {
        setSelectedCards(selectedCards.filter((c) => c.id !== card.id));
      } else {
        if (selectedCards.length === 0) {
          setSelectedCards([card]);
        } else {
          const firstCard = selectedCards[0];
          const sameRank = card.rank === firstCard.rank;
          const sameSuit = card.suit === firstCard.suit;
          
          const RANK_ORDER = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13 };
          const selectedRanks = selectedCards.map(c => RANK_ORDER[c.rank]).sort((a, b) => a - b);
          const cardRank = RANK_ORDER[card.rank];
          const isConsecutive = selectedRanks.every((r, i) => i === 0 || r === selectedRanks[i - 1] + 1);
          const isRun = sameSuit && isConsecutive && cardRank === selectedRanks[selectedRanks.length - 1] + 1;
          
          if (sameRank && sameSuit) {
            setSelectedCards([...selectedCards, card]);
          } else if (isRun) {
            setSelectedCards([...selectedCards, card]);
          } else {
            setSelectedCards([card]);
          }
        }
      }
    }
  };

  const getTurnInstruction = () => {
    if (!isMyTurn) return `${currentPlayerName}'s turn`;
    if (turnPhase === "discard") {
      return "Drop card(s) or show";
    }
    return "Pick a card from deck or discard pile";
  };

  // Show game over overlay
  if (isFinished) {
    return <GameOver />;
  }

  return (
    <div className="game-container">
      {/* Header */}
      <div className="game-header">
        <div className="game-header-left">
          <button className="btn btn-ghost btn-small" onClick={() => setShowExitConfirm(true)}>
            Exit
          </button>
          <span className="round-badge">Round {roomData.roundNumber || 1}</span>
          <span className="room-badge">{roomCode}</span>
        </div>
        <div className="game-header-center">
          {aiThinking ? (
            <span className="turn-indicator ai-thinking">
              {currentPlayerName} is thinking...
            </span>
          ) : isMyTurn ? (
            <div className="turn-with-timer">
              <span className="turn-indicator your-turn">{getTurnInstruction()}</span>
              <span className={`timer ${timeLeft <= 10 ? "timer-warning" : ""}`}>{timeLeft}s</span>
            </div>
          ) : (
            <span className="turn-indicator">{currentPlayerName}'s turn</span>
          )}
        </div>
        <div className="game-header-right">
          <span className="score-display">My Points: {myScore}</span>
        </div>
      </div>

      {/* Player List (opponents) */}
      <PlayerList
        players={roomData.players}
        turnOrder={turnOrder}
        currentTurn={roomData.currentTurn}
        playerId={playerId}
        hands={roomData.hands}
      />

      {/* Table Area */}
      <div className="table-area">
        {/* Draw Pile */}
        <div
          className={`pile draw-pile ${isMyTurn && turnPhase === "draw" ? "clickable" : ""}`}
          onClick={() => handleDraw("draw")}
        >
          <div className="card-back">
            <div className="card-back-inner">
              <span>{drawPileCount}</span>
            </div>
          </div>
          <span className="pile-label">Draw Pile</span>
        </div>

        {/* Discard Pile */}
        <div
          className={`pile discard-pile ${isMyTurn && turnPhase === "draw" ? "clickable" : ""}`}
          onClick={() => isMyTurn && turnPhase === "draw" && handleDraw("discard")}
        >
          {topDiscard ? (
            <Card card={topDiscard} faceUp />
          ) : (
            <div className="empty-pile">Empty</div>
          )}
          <span className="pile-label">Discard Pile</span>
        </div>
      </div>

      {/* Action Buttons - only on your turn during discard phase */}
      {isMyTurn && turnPhase === "discard" && (
        <div className="action-section">
          <div className="action-buttons">
            {/* Discard selected cards */}
            {selectedCards.length > 0 && (
              <button
                className="btn btn-danger"
                onClick={handleDiscard}
                disabled={actionLoading}
              >
                {actionLoading ? "Dropping..." : `Drop ${selectedCards.length} card${selectedCards.length > 1 ? "s" : ""}`}
              </button>
            )}

            {/* Show / Declare button - only when score < 7 */}
            {canDeclare && (
              <>
                {showDeclareConfirm ? (
                  <div className="declare-confirm">
                    <p>Show? If someone has equal or fewer points, you get +10 penalty!</p>
                    <div className="declare-confirm-buttons">
                      <button
                        className="btn btn-danger"
                        onClick={handleDeclare}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Showing..." : "Confirm Show"}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setShowDeclareConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-declare"
                    onClick={() => setShowDeclareConfirm(true)}
                    disabled={actionLoading}
                  >
                    Show ({myScore} pts)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* My Hand */}
      <div className="hand-section">
        <h3 className="hand-title">Your Hand ({myHand.length} cards - {myScore} pts)</h3>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={handOrder}
            strategy={horizontalListSortingStrategy}
          >
            <div className="hand">
              {handOrder.map((cardId) => {
                const card = myHand.find((c) => c.id === cardId);
                if (!card) return null;
                const isSelected = selectedCards.some((c) => c.id === card.id);
                const sameRankAsSelected = selectedCards.length > 0 && card.rank === selectedCards[0].rank && card.suit === selectedCards[0].suit;
                const isDiscardable = isMyTurn && turnPhase === "discard";

                return (
                  <SortableCard
                    key={card.id}
                    card={card}
                    isSelected={isSelected}
                    isDiscardable={isDiscardable}
                    isSwappable={false}
                    sameRankAsSelected={sameRankAsSelected}
                    onClick={() => handleCardClick(card)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {isMyTurn && turnPhase === "discard" && selectedCards.length === 0 && (
          <p className="hand-hint">Select same rank+suit OR consecutive same-suit cards to drop, or call Show</p>
        )}
        {isMyTurn && turnPhase === "discard" && selectedCards.length > 0 && (
          <p className="hand-hint">
            {`Click "Drop" to discard, or click a card to deselect`}
          </p>
        )}
        {isMyTurn && turnPhase === "draw" && (
          <p className="hand-hint">Now pick a card from the Draw Pile or Discard Pile</p>
        )}
      </div>

      {/* Error */}
      {error && <div className="game-error">{error}</div>}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Exit Game?</h3>
            <p>Are you sure you want to exit? Your progress will be lost.</p>
            <div className="modal-buttons">
              <button
                className="btn btn-danger"
                onClick={() => {
                  leaveRoom();
                  setTimeout(() => navigate("/"), 100);
                }}
              >
                Yes
              </button>
              <button className="btn btn-ghost" onClick={() => {
                setShowExitConfirm(false);
                window.history.pushState({ inGame: true }, '');
              }}>
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;

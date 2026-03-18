// src/utils/roomActions.js
// Direct Realtime Database operations (no Cloud Functions needed for simpler deploy)
import { ref, set, get, push, update, runTransaction } from "firebase/database";
import { db } from "./firebase";
import { createDeck, shuffleDeck } from "./gameLogic";
import { getAIDiscardDecision, getAIDrawDecision, getAISwapDecision, shouldAIDeclare, getAIRandomName } from "./aiLogic";

const CARD_VALUES = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

function getSuitColor(suit) {
  return suit === "♥" || suit === "♦" ? "red" : "black";
}

function handScore(hand) {
  if (!hand) return 0;
  return hand.reduce((s, c) => s + (CARD_VALUES[c.rank] || 0), 0);
}

// ── Create Room ───────────────────────────────────────
export async function createRoom(playerName) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";
  for (let i = 0; i < 5; i++) roomCode += chars[Math.floor(Math.random() * chars.length)];

  const playerId = push(ref(db)).key;

  const room = {
    code: roomCode,
    hostId: playerId,
    status: "waiting",
    createdAt: Date.now(),
    settings: { cardsPerPlayer: 7, maxPlayers: 6 },
    players: {
      [playerId]: { name: playerName, score: 0, connected: true, order: 0 },
    },
  };

  await set(ref(db, `rooms/${roomCode}`), room);
  return { roomCode, playerId };
}

// ── Join Room ─────────────────────────────────────────
export async function joinRoom(roomCode, playerName) {
  const upperCode = roomCode.toUpperCase().trim();
  const roomRef = ref(db, `rooms/${upperCode}`);
  const snap = await get(roomRef);

  if (!snap.exists()) throw new Error("Room not found. Check the code and try again.");

  const room = snap.val();
  if (room.status !== "waiting") throw new Error("Game already in progress.");

  const playerCount = room.players ? Object.keys(room.players).length : 0;
  if (playerCount >= (room.settings?.maxPlayers || 6)) throw new Error("Room is full.");

  const playerId = push(ref(db)).key;
  await set(ref(db, `rooms/${upperCode}/players/${playerId}`), {
    name: playerName,
    score: 0,
    connected: true,
    order: playerCount,
  });

  return { roomCode: upperCode, playerId };
}

// ── Start Game ────────────────────────────────────────
export async function startGame(roomCode, playerId) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room not found.");

  const room = snap.val();
  if (room.hostId !== playerId) throw new Error("Only the host can start the game.");
  if (room.status !== "waiting") throw new Error("Game already started.");

  const playerIds = Object.keys(room.players);
  if (playerIds.length < 2) throw new Error("Need at least 2 players to start.");

  playerIds.sort((a, b) => (room.players[a].order || 0) - (room.players[b].order || 0));

  const cardsPerPlayer = room.settings?.cardsPerPlayer || 7;
  const deck = shuffleDeck(createDeck());
  let idx = 0;

  const hands = {};
  for (const pid of playerIds) {
    hands[pid] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[pid].push(deck[idx++]);
    }
  }

  const discardPile = [deck[idx++]];
  const drawPile = deck.slice(idx);

  await update(roomRef, {
    status: "playing",
    hands,
    drawPile,
    discardPile,
    currentTurn: playerIds[0],
    turnOrder: playerIds,
    turnPhase: "discard",
    roundNumber: 1,
    lastAction: null,
    declarer: null,
  });

  return { success: true };
}

// ── Discard Cards (one or more of same rank OR same suit run) ──────────
export async function discardCards(roomCode, playerId, cardIds) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId || room.turnPhase !== "discard") return undefined;

    const hand = room.hands?.[playerId];
    if (!hand) return undefined;

    const idsArray = Array.isArray(cardIds) ? cardIds : [cardIds];
    if (idsArray.length === 0) return undefined;

    // Validate all cards exist in hand
    const cardsToDiscard = [];
    for (const cid of idsArray) {
      const found = hand.find((c) => c.id === cid);
      if (!found) return undefined;
      cardsToDiscard.push(found);
    }

    // Option 1: All cards must share the same rank AND same color (Set)
    const firstCard = cardsToDiscard[0];
    const firstColor = getSuitColor(firstCard.suit);
    const sameRankAndColor = cardsToDiscard.every(
      (c) => c.rank === firstCard.rank && getSuitColor(c.suit) === firstColor
    );
    
    // Option 2: Same suit consecutive run (e.g., 3♥ 4♥ 5♥)
    let isValidRun = false;
    if (cardsToDiscard.length >= 2) {
      const sameSuit = cardsToDiscard.every((c) => c.suit === firstCard.suit);
      if (sameSuit) {
        const RANK_ORDER = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13 };
        const ranks = cardsToDiscard.map(c => RANK_ORDER[c.rank]).sort((a, b) => a - b);
        let isConsecutive = true;
        for (let i = 1; i < ranks.length; i++) {
          if (ranks[i] !== ranks[i - 1] + 1) {
            isConsecutive = false;
            break;
          }
        }
        isValidRun = isConsecutive;
      }
    }

    // Valid if same rank AND same color (Set) OR valid run (consecutive same suit)
    if (!sameRankAndColor && !isValidRun) return undefined;

    // Remove from hand and add to discard pile
    if (!room.discardPile) room.discardPile = [];
    for (const cid of idsArray) {
      const idx = hand.findIndex((c) => c.id === cid);
      if (idx !== -1) {
        const [card] = hand.splice(idx, 1);
        room.discardPile.push(card);
      }
    }

    room.hands[playerId] = hand;
    room.turnPhase = "draw";
    room.lastAction = { type: "discard", player: playerId, count: idsArray.length, timestamp: Date.now() };

    return room;
  });

  return { success: true };
}

// ── Draw Card (after discarding, pick one card) ───────
export async function drawCard(roomCode, playerId, source) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId || room.turnPhase !== "draw") return undefined;

    let card;
    if (source === "discard" && room.discardPile && room.discardPile.length > 0) {
      card = room.discardPile.pop();
    } else {
      if (!room.drawPile || room.drawPile.length === 0) {
        if (room.discardPile && room.discardPile.length > 1) {
          const topDiscard = room.discardPile.pop();
          room.drawPile = shuffleDeck(room.discardPile);
          room.discardPile = [topDiscard];
        } else {
          return undefined;
        }
      }
      card = room.drawPile.pop();
    }

    if (!card) return undefined;

    if (!room.hands) room.hands = {};
    if (!room.hands[playerId]) room.hands[playerId] = [];
    room.hands[playerId].push(card);

    // Track if card was drawn from discard pile
    if (source === "discard") {
      room.lastDrawnDiscardCard = { rank: card.rank, suit: card.suit };
    } else {
      room.lastDrawnDiscardCard = null;
    }

    // After drawing, turn ends -- move to next player
    const turnOrder = room.turnOrder || [];
    const currentIdx = turnOrder.indexOf(playerId);
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    room.currentTurn = turnOrder[nextIdx];
    room.turnPhase = "discard";

    room.lastAction = { type: "draw", player: playerId, source, timestamp: Date.now() };

    return room;
  });

  return { success: true };
}

// ── Skip Turn (timer expired - move to next player) ────────
export async function skipTurn(roomCode, playerId) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId) return undefined;
    if (room.status !== "playing") return undefined;

    const turnOrder = room.turnOrder || [];
    const currentIdx = turnOrder.indexOf(playerId);
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    room.currentTurn = turnOrder[nextIdx];
    room.turnPhase = "discard";

    room.lastAction = { type: "skip", player: playerId, timestamp: Date.now() };

    return room;
  });

  return { success: true };
}

// ── Swap Card (exchange a hand card with top of discard pile) ──
export async function swapCard(roomCode, playerId, cardId) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    // Swap is available during the discard phase (start of turn)
    if (room.currentTurn !== playerId || room.turnPhase !== "discard") return undefined;

    const hand = room.hands?.[playerId];
    if (!hand) return undefined;
    if (!room.discardPile || room.discardPile.length === 0) return undefined;

    const cardIndex = hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return undefined;

    // Take card from hand, take top of discard, swap them
    const handCard = hand[cardIndex];
    const topDiscard = room.discardPile.pop();

    hand[cardIndex] = topDiscard;
    room.discardPile.push(handCard);
    room.hands[playerId] = hand;

    // Swap ends the turn
    const turnOrder = room.turnOrder || [];
    const currentIdx = turnOrder.indexOf(playerId);
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    room.currentTurn = turnOrder[nextIdx];
    room.turnPhase = "discard";

    room.lastAction = { type: "swap", player: playerId, timestamp: Date.now() };

    return room;
  });

  return { success: true };
}

// ── Declare ("Show") ──────────────────────────────────
export async function declare(roomCode, playerId) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return room;
    // Declare available at start of turn (discard phase) only
    if (room.currentTurn !== playerId || room.turnPhase !== "discard") return undefined;
    if (room.declarer) return undefined;

    // Hand score must be below 7 to declare
    const myScore = handScore(room.hands?.[playerId]);
    if (myScore >= 7) return undefined;

    const turnOrder = room.turnOrder || [];
    const scores = {};
    const declarerScore = myScore;
    let lowestOtherScore = Infinity;

    for (const pid of turnOrder) {
      const s = handScore(room.hands?.[pid]);
      scores[pid] = s;
      if (pid !== playerId && s < lowestOtherScore) {
        lowestOtherScore = s;
      }
    }

    // Penalty: if declarer doesn't have strictly lowest, +10
    let penalty = 0;
    if (declarerScore >= lowestOtherScore) {
      penalty = 10;
      scores[playerId] = declarerScore + penalty;
    }

    // Update cumulative scores
    for (const pid of turnOrder) {
      if (room.players?.[pid]) {
        room.players[pid].score = (room.players[pid].score || 0) + scores[pid];
      }
    }

    room.status = "finished";
    room.declarer = playerId;
    room.roundScores = scores;
    room.penalty = penalty;
    room.lastAction = { type: "declare", player: playerId, timestamp: Date.now() };

    return room;
  });

  return { success: true };
}

// ── New Round ─────────────────────────────────────────
export async function newRound(roomCode, playerId) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room not found.");

  const room = snap.val();
  if (room.hostId !== playerId) throw new Error("Only host can start new round.");

  const playerIds = room.turnOrder || Object.keys(room.players);
  const cardsPerPlayer = room.settings?.cardsPerPlayer || 7;
  const deck = shuffleDeck(createDeck());
  let idx = 0;

  const hands = {};
  for (const pid of playerIds) {
    hands[pid] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[pid].push(deck[idx++]);
    }
  }

  const discardPile = [deck[idx++]];
  const drawPile = deck.slice(idx);

  const roundNumber = (room.roundNumber || 1) + 1;
  const startIdx = (roundNumber - 1) % playerIds.length;

  await update(roomRef, {
    status: "playing",
    hands,
    drawPile,
    discardPile,
    currentTurn: playerIds[startIdx],
    turnPhase: "discard",
    roundNumber,
    lastAction: null,
    declarer: null,
    roundScores: null,
    penalty: null,
  });

  return { success: true };
}

// ── Reset / Back to Lobby ─────────────────────────────
export async function backToLobby(roomCode, playerId) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room not found.");

  const room = snap.val();
  if (room.hostId !== playerId) throw new Error("Only host can reset.");

  // Reset scores and status
  const players = room.players || {};
  for (const pid of Object.keys(players)) {
    players[pid].score = 0;
  }

  await update(roomRef, {
    status: "waiting",
    players,
    hands: null,
    drawPile: null,
    discardPile: null,
    currentTurn: null,
    turnOrder: null,
    turnPhase: null,
    roundNumber: null,
    lastAction: null,
    declarer: null,
    roundScores: null,
    penalty: null,
  });
}

// ── AI Player Creation ─────────────────────────────────
export function createAIPlayer(name) {
  return {
    name: name || getAIRandomName(),
    score: 0,
    connected: true,
    isAI: true,
    order: 0,
  };
}

// ── Create Single-Player Room with AI ─────────────────
export async function createAIRoom(playerName, numBots = 2) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";
  for (let i = 0; i < 5; i++) roomCode += chars[Math.floor(Math.random() * chars.length)];

  const playerId = push(ref(db)).key;

  const players = {
    [playerId]: { name: playerName, score: 0, connected: true, isAI: false, order: 0 },
  };

  const botNames = ["Bot Ace", "Bot King", "Bot Queen", "Bot Jack", "Bot Pro"];
  for (let i = 0; i < numBots; i++) {
    const botId = push(ref(db)).key;
    players[botId] = createAIPlayer(botNames[i]);
    players[botId].order = i + 1;
  }

  const room = {
    code: roomCode,
    hostId: playerId,
    status: "waiting",
    createdAt: Date.now(),
    settings: { cardsPerPlayer: 7, maxPlayers: 6, isSinglePlayer: true },
    players,
    isSinglePlayer: true,
  };

  await set(ref(db, `rooms/${roomCode}`), room);
  return { roomCode, playerId };
}

// ── Trigger AI Action ──────────────────────────────────
export async function triggerAIAction(roomCode) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  let snap = await get(roomRef);
  if (!snap.exists()) return { success: false, error: "Room not found" };

  let room = snap.val();
  if (room.status !== "playing") return { success: false, error: "Game not playing" };

  const currentPlayerId = room.currentTurn;
  const currentPlayer = room.players?.[currentPlayerId];

  if (!currentPlayer?.isAI) return { success: false, error: "Not AI turn" };

  snap = await get(roomRef);
  room = snap.val();
  const hand = room.hands?.[currentPlayerId] || [];
  const topDiscard = room.discardPile?.length > 0 ? room.discardPile[room.discardPile.length - 1] : null;
  const turnPhase = room.turnPhase;
  const roundNumber = room.roundNumber || 1;

  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700));

  if (turnPhase === "discard") {
    const shouldDeclare = shouldAIDeclare(hand, [], roundNumber);
    if (shouldDeclare) {
      await runTransaction(roomRef, (r) => {
        if (!r || r.currentTurn !== currentPlayerId || r.turnPhase !== "discard") return undefined;
        if (r.declarer) return undefined;

        const myScore = handScore(hand);
        if (myScore >= 7) return undefined;

        const turnOrder = r.turnOrder || [];
        const scores = {};
        const declarerScore = myScore;
        let lowestOtherScore = Infinity;

        for (const pid of turnOrder) {
          const s = handScore(r.hands?.[pid]);
          scores[pid] = s;
          if (pid !== currentPlayerId && s < lowestOtherScore) {
            lowestOtherScore = s;
          }
        }

        let penalty = 0;
        if (declarerScore >= lowestOtherScore) {
          penalty = 10;
          scores[currentPlayerId] = declarerScore + penalty;
        }

        for (const pid of turnOrder) {
          if (r.players?.[pid]) {
            r.players[pid].score = (r.players[pid].score || 0) + scores[pid];
          }
        }

        r.status = "finished";
        r.declarer = currentPlayerId;
        r.roundScores = scores;
        r.penalty = penalty;
        r.lastAction = { type: "declare", player: currentPlayerId, timestamp: Date.now() };

        return r;
      });
      return { success: true, action: "declare" };
    }

    const swapCardId = getAISwapDecision(hand, topDiscard);
    if (swapCardId && topDiscard) {
      await swapCard(roomCode, currentPlayerId, swapCardId);
      return { success: true, action: "swap" };
    }

    const { cards, skipDraw } = getAIDiscardDecision(hand, topDiscard, roundNumber);
    if (cards && cards.length > 0) {
      try {
        await discardCards(roomCode, currentPlayerId, cards.map((c) => c.id));

        if (skipDraw) {
          const roomSnap = await get(roomRef);
          const updatedRoom = roomSnap.val();
          const turnOrder = updatedRoom.turnOrder || [];
          const currentIdx = turnOrder.indexOf(currentPlayerId);
          const nextIdx = (currentIdx + 1) % turnOrder.length;
          await update(roomRef, {
            currentTurn: turnOrder[nextIdx],
            turnPhase: "discard",
          });
          return { success: true, action: "discard-skip-draw" };
        }

        // After discard, proceed to draw phase
        const roomSnap = await get(roomRef);
        const updatedRoom = roomSnap.val();
        const currentHand = updatedRoom.hands?.[currentPlayerId] || [];
        const newTopDiscard = updatedRoom.discardPile?.length > 0 
          ? updatedRoom.discardPile[updatedRoom.discardPile.length - 1] 
          : null;
        const drawSource = getAIDrawDecision(currentHand, newTopDiscard);
        await drawCard(roomCode, currentPlayerId, drawSource);
        return { success: true, action: "discard-then-draw", source: drawSource };
      } catch (err) {
        console.error("Discard failed:", err);
      }
    }

    const randomCard = hand[Math.floor(Math.random() * hand.length)];
    if (randomCard) {
      try {
        await discardCards(roomCode, currentPlayerId, [randomCard.id]);
        
        // After random discard, proceed to draw phase
        const roomSnap = await get(roomRef);
        const updatedRoom = roomSnap.val();
        const currentHand = updatedRoom.hands?.[currentPlayerId] || [];
        const newTopDiscard = updatedRoom.discardPile?.length > 0 
          ? updatedRoom.discardPile[updatedRoom.discardPile.length - 1] 
          : null;
        const drawSource = getAIDrawDecision(currentHand, newTopDiscard);
        await drawCard(roomCode, currentPlayerId, drawSource);
        return { success: true, action: "discard-random-then-draw", source: drawSource };
      } catch (err) {
        console.error("Random discard failed:", err);
      }
    }

    try {
      const turnOrder = room.turnOrder || [];
      const currentIdx = turnOrder.indexOf(currentPlayerId);
      const nextIdx = (currentIdx + 1) % turnOrder.length;
      await update(roomRef, {
        currentTurn: turnOrder[nextIdx],
        turnPhase: "discard",
      });
      return { success: true, action: "skip" };
    } catch (err) {
      console.error("Skip turn failed:", err);
    }

    return { success: false, error: "No valid action" };
  }

  if (turnPhase === "draw") {
    try {
      const drawSource = getAIDrawDecision(hand, topDiscard);
      await drawCard(roomCode, currentPlayerId, drawSource);
      return { success: true, action: "draw", source: drawSource };
    } catch (err) {
      console.error("AI draw error:", err);
      try {
        await drawCard(roomCode, currentPlayerId, "draw");
        return { success: true, action: "draw", source: "draw" };
      } catch (err2) {
        console.error("AI draw fallback error:", err2);
      }
    }
  }

  return { success: false, error: "Unknown phase" };
}

// ── Start Single-Player Game ────────────────────────────
export async function startAIRound(roomCode) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room not found.");

  const room = snap.val();
  if (!room.isSinglePlayer) throw new Error("Not a single-player room.");

  const playerIds = Object.keys(room.players).filter((pid) => room.players[pid]);
  if (playerIds.length < 2) throw new Error("Need at least 2 players.");

  playerIds.sort((a, b) => (room.players[a].order || 0) - (room.players[b].order || 0));

  const cardsPerPlayer = room.settings?.cardsPerPlayer || 7;
  const deck = shuffleDeck(createDeck());
  let idx = 0;

  const hands = {};
  for (const pid of playerIds) {
    hands[pid] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[pid].push(deck[idx++]);
    }
  }

  const discardPile = [deck[idx++]];
  const drawPile = deck.slice(idx);

  await update(roomRef, {
    status: "playing",
    hands,
    drawPile,
    discardPile,
    currentTurn: playerIds[0],
    turnOrder: playerIds,
    turnPhase: "discard",
    roundNumber: 1,
    lastAction: null,
    declarer: null,
  });

  return { success: true };
}

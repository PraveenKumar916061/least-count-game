const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.database();

// ── Deck helpers ──────────────────────────────────────
const SUITS = ["spade", "heart", "diamond", "club"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const CARD_VALUES = {A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13};

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, id: `${rank}_${suit}` });
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function handScore(hand) {
  if (!hand) return 0;
  return hand.reduce((s, c) => s + (CARD_VALUES[c.rank] || 0), 0);
}

// ── Create Room ───────────────────────────────────────
exports.createRoom = functions.https.onCall(async (data, context) => {
  const { playerName } = data;
  if (!playerName) throw new functions.https.HttpsError("invalid-argument", "Player name required");

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";
  for (let i = 0; i < 5; i++) roomCode += chars[Math.floor(Math.random() * chars.length)];

  const playerId = db.ref().push().key;

  const room = {
    code: roomCode,
    hostId: playerId,
    status: "waiting",       // waiting | playing | finished
    createdAt: admin.database.ServerValue.TIMESTAMP,
    settings: { cardsPerPlayer: 5, maxPlayers: 6 },
    players: {
      [playerId]: { name: playerName, score: 0, connected: true, order: 0 }
    }
  };

  await db.ref(`rooms/${roomCode}`).set(room);
  return { roomCode, playerId };
});

// ── Join Room ─────────────────────────────────────────
exports.joinRoom = functions.https.onCall(async (data, context) => {
  const { roomCode, playerName } = data;
  if (!roomCode || !playerName) throw new functions.https.HttpsError("invalid-argument", "Room code and name required");

  const roomRef = db.ref(`rooms/${roomCode}`);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found");

  const room = snap.val();
  if (room.status !== "waiting") throw new functions.https.HttpsError("failed-precondition", "Game already in progress");

  const playerCount = room.players ? Object.keys(room.players).length : 0;
  if (playerCount >= (room.settings?.maxPlayers || 6))
    throw new functions.https.HttpsError("resource-exhausted", "Room is full");

  const playerId = db.ref().push().key;
  await roomRef.child(`players/${playerId}`).set({
    name: playerName, score: 0, connected: true, order: playerCount
  });

  return { roomCode, playerId };
});

// ── Start Game ────────────────────────────────────────
exports.startGame = functions.https.onCall(async (data, context) => {
  const { roomCode, playerId } = data;
  const roomRef = db.ref(`rooms/${roomCode}`);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found");

  const room = snap.val();
  if (room.hostId !== playerId) throw new functions.https.HttpsError("permission-denied", "Only host can start");
  if (room.status !== "waiting") throw new functions.https.HttpsError("failed-precondition", "Game already started");

  const playerIds = Object.keys(room.players);
  if (playerIds.length < 2) throw new functions.https.HttpsError("failed-precondition", "Need at least 2 players");

  // Sort players by their join order
  playerIds.sort((a, b) => (room.players[a].order || 0) - (room.players[b].order || 0));

  const cardsPerPlayer = room.settings?.cardsPerPlayer || 5;
  const deck = shuffle(createDeck());
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

  await roomRef.update({
    status: "playing",
    hands,
    drawPile,
    discardPile,
    currentTurn: playerIds[0],
    turnOrder: playerIds,
    turnPhase: "draw",      // draw | discard
    roundNumber: 1,
    lastAction: null,
    declarer: null,
  });

  return { success: true };
});

// ── Draw Card (from draw pile or discard pile) ────────
exports.drawCard = functions.https.onCall(async (data, context) => {
  const { roomCode, playerId, source } = data; // source: "draw" | "discard"
  const roomRef = db.ref(`rooms/${roomCode}`);

  return db.ref().child(`rooms/${roomCode}`).transaction((room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId) return; // abort
    if (room.turnPhase !== "draw") return;

    let card;
    if (source === "discard" && room.discardPile && room.discardPile.length > 0) {
      card = room.discardPile.pop();
    } else {
      if (!room.drawPile || room.drawPile.length === 0) {
        // Reshuffle discard pile into draw pile
        const topDiscard = room.discardPile.pop();
        room.drawPile = shuffle(room.discardPile);
        room.discardPile = [topDiscard];
      }
      card = room.drawPile.pop();
    }

    if (!room.hands[playerId]) room.hands[playerId] = [];
    room.hands[playerId].push(card);
    room.turnPhase = "discard";
    room.lastAction = { type: "draw", player: playerId, source, timestamp: Date.now() };

    return room;
  }).then((result) => {
    if (!result.committed) throw new functions.https.HttpsError("failed-precondition", "Not your turn or wrong phase");
    return { success: true };
  });
});

// ── Discard Card ──────────────────────────────────────
exports.discardCard = functions.https.onCall(async (data, context) => {
  const { roomCode, playerId, cardId } = data;

  return db.ref().child(`rooms/${roomCode}`).transaction((room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId) return;
    if (room.turnPhase !== "discard") return;

    const hand = room.hands[playerId] || [];
    const cardIndex = hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return; // card not found, abort

    const [card] = hand.splice(cardIndex, 1);
    room.hands[playerId] = hand;
    if (!room.discardPile) room.discardPile = [];
    room.discardPile.push(card);

    // Move to next player
    const turnOrder = room.turnOrder || [];
    const currentIdx = turnOrder.indexOf(playerId);
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    room.currentTurn = turnOrder[nextIdx];
    room.turnPhase = "draw";

    room.lastAction = { type: "discard", player: playerId, card, timestamp: Date.now() };

    return room;
  }).then((result) => {
    if (!result.committed) throw new functions.https.HttpsError("failed-precondition", "Invalid action");
    return { success: true };
  });
});

// ── Declare (call "Least Count") ──────────────────────
exports.declare = functions.https.onCall(async (data, context) => {
  const { roomCode, playerId } = data;

  return db.ref().child(`rooms/${roomCode}`).transaction((room) => {
    if (!room) return room;
    if (room.currentTurn !== playerId) return;
    if (room.turnPhase !== "draw") return;  // Can only declare at start of turn
    if (room.declarer) return;              // Already declared

    // Calculate scores
    const scores = {};
    let declarerScore = handScore(room.hands[playerId]);
    let lowestOtherScore = Infinity;

    for (const pid of room.turnOrder) {
      const s = handScore(room.hands[pid]);
      scores[pid] = s;
      if (pid !== playerId && s < lowestOtherScore) {
        lowestOtherScore = s;
      }
    }

    // Penalty: if declarer doesn't have the lowest, they get +10 penalty
    let penalty = 0;
    if (declarerScore >= lowestOtherScore) {
      penalty = 10;
      scores[playerId] = declarerScore + penalty;
    }

    // Update cumulative scores
    for (const pid of room.turnOrder) {
      if (!room.players[pid]) continue;
      room.players[pid].score = (room.players[pid].score || 0) + scores[pid];
    }

    room.status = "finished";
    room.declarer = playerId;
    room.roundScores = scores;
    room.penalty = penalty;
    room.lastAction = { type: "declare", player: playerId, timestamp: Date.now() };

    return room;
  }).then((result) => {
    if (!result.committed) throw new functions.https.HttpsError("failed-precondition", "Cannot declare now");
    return { success: true };
  });
});

// ── New Round ─────────────────────────────────────────
exports.newRound = functions.https.onCall(async (data, context) => {
  const { roomCode, playerId } = data;
  const roomRef = db.ref(`rooms/${roomCode}`);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found");

  const room = snap.val();
  if (room.hostId !== playerId) throw new functions.https.HttpsError("permission-denied", "Only host can start new round");

  const playerIds = room.turnOrder || Object.keys(room.players);
  const cardsPerPlayer = room.settings?.cardsPerPlayer || 5;
  const deck = shuffle(createDeck());
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

  // Rotate starting player
  const roundNumber = (room.roundNumber || 1) + 1;
  const startIdx = (roundNumber - 1) % playerIds.length;

  await roomRef.update({
    status: "playing",
    hands,
    drawPile,
    discardPile,
    currentTurn: playerIds[startIdx],
    turnPhase: "draw",
    roundNumber,
    lastAction: null,
    declarer: null,
    roundScores: null,
    penalty: null,
  });

  return { success: true };
});

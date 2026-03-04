// src/utils/gameLogic.js
// Core game logic for Least Count card game

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Card point values for Least Count
const CARD_VALUES = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getCardValue(card) {
  return CARD_VALUES[card.rank] || 0;
}

export function calculateHandScore(hand) {
  if (!hand || hand.length === 0) return 0;
  return hand.reduce((sum, card) => sum + getCardValue(card), 0);
}

export function dealCards(playerIds, cardsPerPlayer = 5) {
  const deck = shuffleDeck(createDeck());
  const hands = {};
  let cardIndex = 0;

  for (const playerId of playerIds) {
    hands[playerId] = [];
    for (let i = 0; i < cardsPerPlayer; i++) {
      hands[playerId].push(deck[cardIndex]);
      cardIndex++;
    }
  }

  // The next card goes to the discard pile
  const discardPile = [deck[cardIndex]];
  cardIndex++;

  // The rest is the draw pile
  const drawPile = deck.slice(cardIndex);

  return { hands, discardPile, drawPile };
}

export function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getSuitColor(suit) {
  return suit === "♥" || suit === "♦" ? "red" : "black";
}

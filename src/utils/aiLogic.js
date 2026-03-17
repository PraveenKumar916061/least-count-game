const CARD_VALUES = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

const handScore = (hand) => {
  if (!hand) return 0;
  return hand.reduce((s, c) => s + (CARD_VALUES[c.rank] || 0), 0);
};

export function getAIDiscardDecision(hand, topDiscard, roundNumber = 1) {
  if (!hand || hand.length === 0) return { cards: [], skipDraw: false };

  const rankedGroups = {};
  for (const card of hand) {
    const key = card.rank;
    if (!rankedGroups[key]) rankedGroups[key] = [];
    rankedGroups[key].push(card);
  }

  const validDiscards = [];
  for (const rank in rankedGroups) {
    const group = rankedGroups[rank];
    if (group.length >= 1) {
      const remainingHand = hand.filter((c) => !group.some((gc) => gc.id === c.id));
      const newScore = handScore(remainingHand);
      validDiscards.push({
        cards: group,
        score: newScore,
        rank: rank,
      });
    }
  }

  if (validDiscards.length === 0) return { cards: [], skipDraw: false };

  validDiscards.sort((a, b) => a.score - b.score);

  const bestOption = validDiscards[0];
  const hasMatchWithDiscard = topDiscard && bestOption.cards.some(
    (c) => c.rank === topDiscard.rank && c.suit === topDiscard.suit
  );

  return {
    cards: bestOption.cards,
    skipDraw: hasMatchWithDiscard,
  };
}

export function getAIDrawDecision(hand, topDiscard) {
  if (!hand || hand.length === 0) return "draw";

  if (topDiscard) {
    const hasExactMatch = hand.some((c) => c.rank === topDiscard.rank && c.suit === topDiscard.suit);
    if (hasExactMatch) {
      return "discard";
    }
  }

  return "draw";
}

export function getAISwapDecision(hand, topDiscard) {
  if (!hand || !topDiscard || hand.length === 0) return null;

  let bestSwap = null;
  let bestScore = handScore(hand);

  for (const card of hand) {
    const swapScore = handScore(hand.filter((c) => c.id !== card.id)) + CARD_VALUES[topDiscard.rank];
    if (swapScore < bestScore - 1) {
      bestScore = swapScore;
      bestSwap = card.id;
    }
  }

  return bestSwap;
}

export function shouldAIDeclare(hand, otherScores = [], roundNumber = 1) {
  if (!hand) return false;

  const myScore = handScore(hand);
  if (myScore >= 7) return false;

  if (otherScores.length === 0) {
    return roundNumber >= 3;
  }

  const lowestOther = Math.min(...otherScores);
  return myScore < lowestOther;
}

export function getAIRandomName() {
  const adjectives = ["Swift", "Lucky", "Clever", "Bold", "Sharp", "Quick", "Wise"];
  const nouns = ["Ace", "King", "Queen", "Jack", "Pro", "Master", "Champ"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

export function calculateAIRoundScore(hand) {
  return handScore(hand);
}

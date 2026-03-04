import React from "react";

const SUIT_SYMBOLS = {
  spade: "\u2660",
  heart: "\u2665",
  diamond: "\u2666",
  club: "\u2663",
  "\u2660": "\u2660",
  "\u2665": "\u2665",
  "\u2666": "\u2666",
  "\u2663": "\u2663",
};

function Card({ card, faceUp = false, small = false }) {
  if (!card) return null;

  const suitSymbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const isRed = suitSymbol === "\u2665" || suitSymbol === "\u2666";

  if (!faceUp) {
    return (
      <div className={`card card-back-face ${small ? "card-small" : ""}`}>
        <div className="card-back-pattern" />
      </div>
    );
  }

  return (
    <div className={`card ${isRed ? "card-red" : "card-black"} ${small ? "card-small" : ""}`}>
      <div className="card-corner card-corner-top">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-large">{suitSymbol}</span>
      </div>
      <div className="card-corner card-corner-bottom">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
    </div>
  );
}

export default Card;

export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_TEXT = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const SUIT_TEXT = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffle(cards, rng = Math.random) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardText(card) {
  return `${RANK_TEXT[card.rank] ?? card.rank}${SUIT_TEXT[card.suit] ?? card.suit}`;
}

function evaluate5(cards) {
  if (cards.length !== 5) throw new Error('evaluate5 requires exactly five cards');
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5;
  }

  let category;
  let tiebreak;
  if (flush && straightHigh) {
    category = 8;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (flush) {
    category = 5;
    tiebreak = ranks;
  } else if (straightHigh) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    tiebreak = [groups[0].rank, groups[1].rank, groups[2].rank];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    tiebreak = [groups[0].rank, groups[1].rank, groups[2].rank];
  } else if (groups[0].count === 2) {
    category = 1;
    tiebreak = [groups[0].rank, groups[1].rank, groups[2].rank, groups[3].rank];
  } else {
    category = 0;
    tiebreak = ranks;
  }
  return { category, tiebreak, score: [category, ...tiebreak] };
}

export function compareScore(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function bestHand(cards) {
  if (cards.length < 5) throw new Error('bestHand requires at least five cards');
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const selected = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const result = evaluate5(selected);
            if (!best || compareScore(result.score, best.score) > 0) {
              best = { ...result, cards: selected };
            }
          }
        }
      }
    }
  }
  return best;
}

const CATEGORY_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

export function handName(score) {
  const category = score[0];
  if (category === 8 && score[1] === 14) return 'Royal Flush';
  return CATEGORY_NAMES[category] ?? 'Unknown';
}

import { bestHand } from './poker.js';

const STYLES = {
  tight: { raise: 0.20, call: 0.40, bluff: 0.02 },
  balanced: { raise: 0.30, call: 0.32, bluff: 0.05 },
  aggressive: { raise: 0.42, call: 0.25, bluff: 0.09 },
};

function preflopStrength(cards) {
  const [a, b] = [...cards].sort((x, y) => y.rank - x.rank);
  if (a.rank === b.rank) return Math.min(1, 0.54 + a.rank / 28);
  const suited = a.suit === b.suit;
  const gap = a.rank - b.rank;
  let strength = 0.20 + a.rank / 80 + b.rank / 110;
  if (suited) strength += 0.07;
  if (gap === 1) strength += 0.05;
  else if (gap === 2) strength += 0.02;
  return Math.max(0.05, Math.min(0.95, strength));
}

function postflopStrength(holeCards, board) {
  if (board.length < 3) return preflopStrength(holeCards);
  const hand = bestHand([...holeCards, ...board]);
  const category = hand.score[0];
  const tiebreak = hand.score.slice(1);
  const tieValue = tiebreak.reduce((sum, value, index) => sum + value / Math.pow(15, index + 1), 0);
  return Math.max(0.05, Math.min(0.99, category / 8 * 0.78 + tieValue * 0.22));
}

export function chooseBotAction(hand, playerId, style = 'balanced') {
  const legal = hand.legalActions(playerId);
  if (legal.length === 0) return null;
  const player = hand.players.find((item) => item.id === playerId);
  if (!player) return null;
  const profile = STYLES[style] ?? STYLES.balanced;
  const strength = hand.phase === 'preflop'
    ? preflopStrength(player.holeCards)
    : postflopStrength(player.holeCards, hand.board);
  const callAction = legal.find((action) => action.type === 'call');
  const checkAction = legal.find((action) => action.type === 'check');
  const raiseAction = legal.find((action) => action.type === 'raise');
  const random = Math.random();

  if (raiseAction && strength > 0.74 && random < profile.raise) {
    const base = hand.currentBet === 0 ? hand.bigBlind : hand.currentBet;
    const desired = Math.floor(base * (2.2 + Math.random() * 0.8));
    const target = Math.max(raiseAction.minTo, Math.min(raiseAction.maxTo, desired));
    return { type: 'raise', to: target };
  }
  if (raiseAction && strength > 0.62 && random < profile.raise * 0.55) {
    const target = Math.max(raiseAction.minTo, Math.min(raiseAction.maxTo, hand.currentBet + hand.bigBlind));
    return { type: 'raise', to: target };
  }
  if (raiseAction && strength < 0.25 && random < profile.bluff) {
    const target = Math.max(raiseAction.minTo, Math.min(raiseAction.maxTo, hand.currentBet + hand.bigBlind));
    return { type: 'raise', to: target };
  }

  if (callAction) {
    const potOdds = callAction.amount / Math.max(1, hand.pot + callAction.amount);
    const affordable = callAction.amount <= player.stack * 0.35;
    if (strength > 0.48 || (affordable && strength > potOdds + 0.08)) return { type: 'call' };
    if (callAction.amount <= hand.bigBlind && strength > 0.32) return { type: 'call' };
    return { type: 'fold' };
  }
  if (checkAction) return { type: 'check' };
  return { type: 'fold' };
}

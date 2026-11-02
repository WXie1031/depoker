import assert from 'node:assert/strict';
import test from 'node:test';
import { bestHand, handName } from '../src/poker.js';

const card = (rank, suit) => ({ rank, suit });

test('evaluates a royal flush', () => {
  const hand = bestHand([
    card(14, 's'), card(13, 's'), card(12, 's'), card(11, 's'), card(10, 's'),
  ]);
  assert.equal(handName(hand.score), 'Royal Flush');
});

test('evaluates a five-high straight', () => {
  const hand = bestHand([
    card(14, 'h'), card(5, 'c'), card(4, 'd'), card(3, 's'), card(2, 'h'),
  ]);
  assert.equal(handName(hand.score), 'Straight');
  assert.equal(hand.score[1], 5);
});

test('chooses the best five cards from seven', () => {
  const hand = bestHand([
    card(9, 'h'), card(9, 'd'), card(9, 'c'), card(8, 's'), card(8, 'h'),
    card(2, 'd'), card(7, 'c'),
  ]);
  assert.equal(handName(hand.score), 'Full House');
});

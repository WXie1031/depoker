import assert from 'node:assert/strict';
import test from 'node:test';
import { HoldemHand } from '../src/engine.js';

function players(...stacks) {
  return stacks.map((stack, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    stack,
  }));
}

test('posts blinds and starts preflop action', () => {
  const hand = new HoldemHand({ players: players(1000, 1000, 1000), buttonIndex: 0 });
  assert.equal(hand.phase, 'preflop');
  assert.equal(hand.pot, 30);
  assert.equal(hand.currentBet, 20);
  assert.equal(hand.turnPlayerId, 'p1');
  const actions = hand.legalActions('p1');
  assert.equal(actions.find((action) => action.type === 'call').amount, 20);
});

test('awards the pot when everyone else folds', () => {
  const hand = new HoldemHand({ players: players(1000, 1000), buttonIndex: 0 });
  hand.act('p1', { type: 'fold' });
  assert.equal(hand.phase, 'showdown');
  assert.equal(hand.pot, 0);
  assert.equal(hand.players[1].stack, 1010);
});

test('advances to the flop after the big blind checks', () => {
  const hand = new HoldemHand({ players: players(1000, 1000), buttonIndex: 0 });
  hand.act('p1', { type: 'call' });
  assert.equal(hand.phase, 'preflop');
  hand.act('p2', { type: 'check' });
  assert.equal(hand.phase, 'flop');
  assert.equal(hand.board.length, 3);
  assert.equal(hand.currentBet, 0);
});

test('creates side pots for unequal all-in contributions', () => {
  const hand = new HoldemHand({
    players: players(100, 50, 100),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
  });
  hand.act('p1', { type: 'raise', to: 100 });
  hand.act('p2', { type: 'call' });
  hand.act('p3', { type: 'call' });
  assert.equal(hand.phase, 'showdown');
  assert.deepEqual(hand.results.map((result) => result.amount).sort((a, b) => a - b), [100, 150]);
  assert.equal(hand.players.reduce((sum, player) => sum + player.stack, 0), 250);
});

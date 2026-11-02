import { bestHand, compareScore, createDeck, handName, shuffle } from './poker.js';

export class HoldemHand {
  constructor({
    players,
    buttonIndex = 0,
    smallBlind = 10,
    bigBlind = 20,
    deck,
    rng = Math.random,
  }) {
    if (!Array.isArray(players) || players.length < 2) throw new Error('A hand needs at least two players');
    if (smallBlind <= 0 || bigBlind < smallBlind) throw new Error('Invalid blinds');
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.rng = rng;
    this.deck = deck ?? shuffle(createDeck(), rng);
    this.players = players.map((player) => ({
      id: player.id,
      name: player.name,
      stack: player.stack,
      holeCards: [],
      folded: false,
      allIn: false,
      roundBet: 0,
      totalBet: 0,
      hasActed: false,
    }));
    this.buttonIndex = buttonIndex;
    this.board = [];
    this.pot = 0;
    this.phase = 'preflop';
    this.currentBet = 0;
    this.minRaise = bigBlind;
    this.lastAggressorIndex = null;
    this.turnIndex = -1;
    this.results = [];
    this.log = [];
    this.showdown = false;
    this.start();
  }

  start() {
    const active = this.players.filter((player) => player.stack > 0);
    if (active.length < 2) throw new Error('A hand needs at least two players with chips');
    const n = this.players.length;
    for (let round = 0; round < 2; round += 1) {
      for (let offset = 1; offset <= n; offset += 1) {
        const index = (this.buttonIndex + offset) % n;
        if (this.players[index].stack > 0) this.players[index].holeCards.push(this.deck.pop());
      }
    }

    let smallIndex;
    let bigIndex;
    if (n === 2) {
      smallIndex = this.buttonIndex;
      bigIndex = (this.buttonIndex + 1) % n;
    } else {
      smallIndex = (this.buttonIndex + 1) % n;
      bigIndex = (this.buttonIndex + 2) % n;
    }
    this.postBlind(smallIndex, this.smallBlind);
    this.postBlind(bigIndex, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.lastAggressorIndex = bigIndex;
    this.turnIndex = this.nextActorIndex(bigIndex);
    this.log.push(`Hand started. Button: ${this.players[this.buttonIndex].name}`);
  }

  postBlind(index, amount) {
    const player = this.players[index];
    const paid = Math.min(player.stack, amount);
    player.stack -= paid;
    player.roundBet += paid;
    player.totalBet += paid;
    this.pot += paid;
    if (player.stack === 0) player.allIn = true;
  }

  nextActorIndex(from) {
    const n = this.players.length;
    for (let offset = 1; offset <= n; offset += 1) {
      const index = (from + offset) % n;
      const player = this.players[index];
      if (!player.folded && !player.allIn && player.stack > 0) return index;
    }
    return -1;
  }

  isBettingRoundComplete() {
    const contenders = this.players.filter((player) => !player.folded);
    const actionable = contenders.filter((player) => !player.allIn && player.stack > 0);
    if (actionable.length === 0) return true;
    return actionable.every((player) => player.hasActed && player.roundBet === this.currentBet);
  }

  legalActions(playerId) {
    const index = this.players.findIndex((player) => player.id === playerId);
    if (index !== this.turnIndex || this.phase === 'showdown') return [];
    const player = this.players[index];
    if (!player || player.folded || player.allIn) return [];
    const toCall = this.currentBet - player.roundBet;
    const actions = [];
    if (toCall <= 0) actions.push({ type: 'check' });
    else actions.push({ type: 'call', amount: Math.min(toCall, player.stack) });

    const maxTo = player.roundBet + player.stack;
    if (maxTo > this.currentBet) {
      const minTo = this.currentBet === 0
        ? this.bigBlind
        : this.currentBet + this.minRaise;
      actions.push({
        type: 'raise',
        minTo: Math.min(minTo, maxTo),
        maxTo,
      });
    }
    actions.push({ type: 'fold' });
    return actions;
  }

  act(playerId, action) {
    const index = this.players.findIndex((player) => player.id === playerId);
    if (index !== this.turnIndex) throw new Error('It is not your turn');
    if (this.phase === 'showdown') throw new Error('The hand is over');
    const player = this.players[index];
    if (player.folded || player.allIn) throw new Error('You cannot act');
    const type = action?.type;

    if (type === 'fold') {
      player.folded = true;
      player.hasActed = true;
      this.log.push(`${player.name} folds`);
    } else if (type === 'check') {
      if (this.currentBet > player.roundBet) throw new Error('You must call or fold');
      player.hasActed = true;
      this.log.push(`${player.name} checks`);
    } else if (type === 'call') {
      const toCall = this.currentBet - player.roundBet;
      if (toCall <= 0) {
        player.hasActed = true;
        this.log.push(`${player.name} checks`);
      } else {
        const paid = Math.min(toCall, player.stack);
        player.stack -= paid;
        player.roundBet += paid;
        player.totalBet += paid;
        this.pot += paid;
        if (player.stack === 0) player.allIn = true;
        player.hasActed = true;
        this.log.push(`${player.name} calls ${paid}`);
      }
    } else if (type === 'raise') {
      const requested = Number(action.to);
      if (!Number.isFinite(requested)) throw new Error('Invalid raise amount');
      const maxTo = player.roundBet + player.stack;
      const minTo = this.currentBet === 0
        ? this.bigBlind
        : this.currentBet + this.minRaise;
      const target = Math.floor(Math.min(requested, maxTo));
      if (target <= this.currentBet) throw new Error('Raise must be larger than the current bet');
      if (target < minTo && target !== maxTo) throw new Error('Raise is smaller than the minimum');
      const paid = target - player.roundBet;
      if (paid > player.stack) throw new Error('Not enough chips');
      player.stack -= paid;
      player.roundBet = target;
      player.totalBet += paid;
      this.pot += paid;
      if (player.stack === 0) player.allIn = true;
      if (target > this.currentBet) {
        this.minRaise = Math.max(this.minRaise, target - this.currentBet);
        this.currentBet = target;
        this.lastAggressorIndex = index;
        this.players.forEach((other, otherIndex) => {
          if (otherIndex !== index) other.hasActed = false;
        });
      }
      player.hasActed = true;
      this.log.push(`${player.name} ${this.currentBet === target ? 'raises to' : 'bets'} ${target}`);
    } else {
      throw new Error('Unknown action');
    }

    this.afterAction();
  }

  forceFold(playerId) {
    const player = this.players.find((item) => item.id === playerId);
    if (!player || player.folded || this.phase === 'showdown') return;
    player.folded = true;
    player.hasActed = true;
    this.log.push(`${player.name} leaves the hand`);
    const index = this.players.findIndex((item) => item.id === playerId);
    if (index === this.turnIndex) this.afterAction();
    else if (this.players.filter((item) => !item.folded).length <= 1) this.finishHand();
  }

  afterAction() {
    if (this.players.filter((player) => !player.folded).length <= 1) {
      this.finishHand();
      return;
    }
    if (this.isBettingRoundComplete()) {
      this.nextPhase();
    } else {
      this.turnIndex = this.nextActorIndex(this.turnIndex);
    }
  }

  nextPhase() {
    do {
      if (this.phase === 'river') {
        this.finishHand();
        return;
      }
      if (this.phase === 'preflop') {
        this.phase = 'flop';
        this.dealBoard(3);
      } else if (this.phase === 'flop') {
        this.phase = 'turn';
        this.dealBoard(1);
      } else if (this.phase === 'turn') {
        this.phase = 'river';
        this.dealBoard(1);
      }
      this.players.forEach((player) => {
        player.roundBet = 0;
        player.hasActed = false;
      });
      this.currentBet = 0;
      this.minRaise = this.bigBlind;
      this.lastAggressorIndex = null;
      this.turnIndex = this.nextActorIndex(this.buttonIndex);
    } while (
      this.phase !== 'showdown'
      && this.players.filter((player) => !player.folded).length > 1
      && this.nextActorIndex(this.buttonIndex) === -1
    );
  }

  dealBoard(count) {
    for (let i = 0; i < count; i += 1) this.board.push(this.deck.pop());
  }

  finishHand() {
    this.phase = 'showdown';
    this.showdown = true;
    this.turnIndex = -1;
    const contenders = this.players.filter((player) => !player.folded);
    if (contenders.length <= 1) {
      const winner = contenders[0];
      if (winner) {
        winner.stack += this.pot;
        this.results = [{ amount: this.pot, winnerIds: [winner.id], hand: null }];
        this.log.push(`${winner.name} wins ${this.pot}`);
      }
      this.pot = 0;
      return;
    }

    const contributors = this.players.filter((player) => player.totalBet > 0);
    const levels = [...new Set(contributors.map((player) => player.totalBet))].sort((a, b) => a - b);
    let previous = 0;
    let deadCarry = 0;
    const pots = [];

    for (const level of levels) {
      let amount = deadCarry;
      deadCarry = 0;
      for (const player of contributors) {
        amount += Math.max(0, Math.min(player.totalBet, level) - Math.min(player.totalBet, previous));
      }
      const eligible = contenders.filter((player) => player.totalBet >= level);
      if (eligible.length === 0) {
        deadCarry = amount;
      } else {
        const evaluated = eligible.map((player) => ({
          player,
          hand: bestHand([...player.holeCards, ...this.board]),
        }));
        evaluated.sort((a, b) => compareScore(b.hand.score, a.hand.score));
        const best = evaluated[0].hand.score;
        const winners = evaluated.filter((item) => compareScore(item.hand.score, best) === 0);
        pots.push({ amount, winnerIds: winners.map((item) => item.player.id), hand: best });
      }
      previous = level;
    }
    if (deadCarry > 0 && pots.length > 0) pots[pots.length - 1].amount += deadCarry;

    for (const pot of pots) {
      const winners = pot.winnerIds
        .map((id) => this.players.find((player) => player.id === id))
        .filter(Boolean);
      if (winners.length === 0) continue;
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const winner of winners) {
        let award = share;
        if (remainder > 0) {
          award += 1;
          remainder -= 1;
        }
        winner.stack += award;
      }
      this.results.push({
        amount: pot.amount,
        winnerIds: pot.winnerIds,
        hand: pot.hand,
        handName: pot.hand ? handName(pot.hand) : null,
      });
      this.log.push(`${winners.map((winner) => winner.name).join(', ')} win ${pot.amount}${pot.hand ? ` with ${handName(pot.hand)}` : ''}`);
    }
    this.pot = 0;
  }

  get turnPlayerId() {
    return this.turnIndex >= 0 ? this.players[this.turnIndex].id : null;
  }
}

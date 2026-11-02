const $ = (id) => document.getElementById(id);

const landing = $('landing');
const lobby = $('lobby');
const game = $('game');
const joinForm = $('join-form');
const nameInput = $('name-input');
const roomInput = $('room-input');
const landingMessage = $('landing-message');
const configForm = $('config-form');
const toastEl = $('toast');

let state = null;
let token = sessionStorage.getItem('holdem-token') ?? null;
let eventSource = null;
let raiseValue = null;
let toastTimer = null;

const phaseText = {
  lobby: '大厅',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
  handover: '本局结束',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setView(view) {
  landing.classList.toggle('hidden', view !== 'landing');
  lobby.classList.toggle('hidden', view !== 'lobby');
  game.classList.toggle('hidden', view !== 'game');
}

function resetSession(showLanding = true) {
  token = null;
  state = null;
  raiseValue = null;
  sessionStorage.removeItem('holdem-token');
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (showLanding) setView('landing');
}

async function api(path, body, method = 'POST') {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) resetSession();
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

async function sendCommand(type, extra = {}) {
  if (!token) return;
  try {
    const next = await api('/api/action', { token, type, ...extra });
    updateState(next);
  } catch (error) {
    toast(error.message);
  }
}

function updateState(next) {
  state = next;
  if (!state?.viewer) {
    resetSession();
    landingMessage.textContent = '你已离开房间，可重新输入房间号加入。';
    return;
  }
  render();
}

function connectStream() {
  if (!token) return;
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener('state', (event) => {
    updateState(JSON.parse(event.data));
  });
  eventSource.onerror = () => {
    // EventSource retries automatically.
  };
}

function cardHtml(card, small = false) {
  if (!card) return `<div class="card empty ${small ? 'small' : ''}"></div>`;
  const rank = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card.rank] ?? card.rank;
  const suit = { s: '♠', h: '♥', d: '♦', c: '♣' }[card.suit] ?? '';
  const red = card.suit === 'h' || card.suit === 'd';
  return `<div class="card ${red ? 'red' : ''} ${small ? 'small' : ''}" title="${rank}${suit}">${rank}${suit}</div>`;
}

function playerTag(player) {
  const tags = [];
  if (player.isOwner) tags.push('<span class="tag gold">👑 房主</span>');
  if (player.isBot) tags.push('<span class="tag">🤖 机器人</span>');
  if (!player.connected && !player.isBot) tags.push('<span class="tag red">⚠️ 掉线</span>');
  if (player.waiting) tags.push('<span class="tag gray">⏳ 等待</span>');
  return tags.join('');
}

function renderLobby() {
  setView('lobby');
  $('lobby-room-code').textContent = state.roomCode;
  const playersEl = $('lobby-players');
  playersEl.innerHTML = state.players.map((player) => `
    <li class="player-row">
      <div class="player-name">
        <span>${escapeHtml(player.name)}</span>
        ${playerTag(player)}
      </div>
      <div class="player-actions">
        <span class="player-stack">💰 ${player.stack}</span>
        ${state.viewer.isOwner && player.id !== state.viewer.id
          ? `<button class="kick-button" data-command="kick" data-player-id="${player.id}" title="踢出玩家">✖</button>`
          : ''}
      </div>
    </li>
  `).join('');

  const botCount = state.players.filter((player) => player.isBot).length;
  $('bot-count').textContent = botCount;
  const isOwner = state.viewer.isOwner;
  document.querySelectorAll('.owner-controls button, .stepper button').forEach((button) => {
    button.disabled = !isOwner;
  });
  const startButton = document.querySelector('[data-command="start"]');
  startButton.disabled = !isOwner || state.players.length < 2;
  startButton.textContent = state.players.length < 2 ? '👥 至少需要 2 人' : '🎴 开始对局';

  const setIfIdle = (input, value) => {
    if (document.activeElement !== input) input.value = value;
  };
  setIfIdle($('starting-stack'), state.config.startingStack);
  setIfIdle($('small-blind'), state.config.smallBlind);
  setIfIdle($('big-blind'), state.config.bigBlind);
  if (document.activeElement !== $('bot-style')) $('bot-style').value = state.config.botStyle;
  document.querySelectorAll('#config-form input, #config-form select').forEach((input) => {
    input.disabled = !isOwner;
  });
  document.querySelector('#config-form button').disabled = !isOwner;
}

function seatStyle(index, total) {
  const angle = (-90 + (index * 360 / Math.max(total, 1))) * Math.PI / 180;
  const left = 50 + 42 * Math.cos(angle);
  const top = 50 + 44 * Math.sin(angle);
  return `left:${left}%;top:${top}%`;
}

function renderGame() {
  setView('game');
  const hand = state.hand;
  $('game-room-code').textContent = state.roomCode;
  const phase = state.status === 'handover' ? 'handover' : (hand?.phase ?? 'lobby');
  $('phase-chip').textContent = phaseText[phase] ?? '等待';
  $('pot-value').textContent = hand?.pot ?? 0;

  const board = hand?.board ?? [];
  $('board-cards').innerHTML = [0, 1, 2, 3, 4]
    .map((index) => cardHtml(board[index]))
    .join('');

  const handPlayers = new Map((hand?.players ?? []).map((player) => [player.id, player]));
  const seatLayer = $('seat-layer');
  seatLayer.innerHTML = state.players.map((player, index) => {
    const handPlayer = handPlayers.get(player.id);
    const active = hand?.turnPlayerId === player.id;
    const classes = [
      'seat',
      active ? 'active' : '',
      handPlayer?.folded ? 'folded' : '',
      player.waiting ? 'folded' : '',
    ].filter(Boolean).join(' ');
    const cards = handPlayer?.holeCards?.length
      ? handPlayer.holeCards.map((card) => cardHtml(card, true)).join('')
      : '<div class="card empty small"></div><div class="card empty small"></div>';
    const bet = handPlayer?.roundBet ? `<div class="seat-bet">${handPlayer.roundBet}</div>` : '';
    const dealer = hand?.buttonPlayerId === player.id ? '<div class="dealer-button">D</div>' : '';
    const status = handPlayer?.allIn
      ? '<span class="tag red">ALL IN</span>'
      : handPlayer?.folded
        ? '<span class="tag gray">弃牌</span>'
        : player.waiting
          ? '<span class="tag gray">等待</span>'
          : '';
    return `
      <div class="${classes}" style="${seatStyle(index, state.players.length)}">
        ${bet}
        ${dealer}
        <div class="seat-top">
          <span>${escapeHtml(player.name)}</span>
          ${player.isBot ? '<span title="机器人">🤖</span>' : ''}
        </div>
        <div class="seat-stack">💰 ${handPlayer?.stack ?? player.stack}</div>
        <div class="seat-cards">${cards}</div>
        <div>${status}</div>
      </div>
    `;
  }).join('');

  const logElement = $('hand-log');
  const previousScrollTop = logElement.scrollTop;
  logElement.innerHTML = (hand?.log ?? [])
    .slice()
    .reverse()
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('') || '<li>暂无记录</li>';
  logElement.scrollTop = previousScrollTop;

  const resultBanner = $('result-banner');
  if (state.status === 'handover' && hand?.results?.length) {
    resultBanner.classList.remove('hidden');
    resultBanner.innerHTML = hand.results.map((result) => `
      🏆 ${escapeHtml(result.winnerNames?.join('、') ?? '玩家')} 获得 ${result.amount}
      ${result.handName ? `· ${escapeHtml(result.handName)}` : ''}
    `).join('<br>');
  } else {
    resultBanner.classList.add('hidden');
  }

  renderActionBar();
}

function renderActionBar() {
  const hand = state.hand;
  const viewerId = state.viewer.id;
  const viewerHand = hand?.players.find((player) => player.id === viewerId);
  const statusEl = $('viewer-status');
  const buttonsEl = $('action-buttons');

  if (state.status === 'handover') {
    statusEl.textContent = '本局结束，可查看结果。';
    buttonsEl.innerHTML = state.viewer.isOwner
      ? '<button class="action-button primary" data-command="next">▶️ 开始下一局</button>'
      : '<span class="tag gray">等待房主开始下一局</span>';
    return;
  }

  if (!viewerHand) {
    statusEl.textContent = '你在本局外，等待下一局加入。';
    buttonsEl.innerHTML = '<span class="tag gray">⏳ 等待下一局</span>';
    return;
  }
  if (viewerHand.folded) {
    statusEl.textContent = '你已弃牌，等待本局结束。';
    buttonsEl.innerHTML = '<span class="tag gray">已弃牌</span>';
    return;
  }
  if (viewerHand.allIn) {
    statusEl.textContent = '你已经全下，等待摊牌。';
    buttonsEl.innerHTML = '<span class="tag red">ALL IN</span>';
    return;
  }

  const legal = hand?.legalActions ?? [];
  if (!legal.length) {
    statusEl.textContent = '等待其他玩家行动…';
    buttonsEl.innerHTML = '<span class="tag gray">⏳ 等待中</span>';
    return;
  }

  statusEl.textContent = `轮到你行动 · 当前下注 ${hand.currentBet}`;
  const parts = [];
  const fold = legal.find((action) => action.type === 'fold');
  const check = legal.find((action) => action.type === 'check');
  const call = legal.find((action) => action.type === 'call');
  const raise = legal.find((action) => action.type === 'raise');

  if (fold) parts.push('<button class="action-button danger" data-command="fold">🗑 弃牌</button>');
  if (check) parts.push('<button class="action-button" data-command="check">✅ 过牌</button>');
  if (call) parts.push(`<button class="action-button" data-command="call">📞 跟注 ${call.amount}</button>`);
  if (raise) {
    if (raiseValue == null || raiseValue < raise.minTo || raiseValue > raise.maxTo) {
      raiseValue = raise.minTo;
    }
    parts.push(`
      <div class="raise-control">
        <input id="raise-range" type="range" min="${raise.minTo}" max="${raise.maxTo}" step="1" value="${raiseValue}">
        <input id="raise-number" type="number" min="${raise.minTo}" max="${raise.maxTo}" step="1" value="${raiseValue}">
        <button class="action-button gold" data-command="raise">📈 ${hand.currentBet ? '加注到' : '下注'}</button>
      </div>
    `);
  }
  buttonsEl.innerHTML = parts.join('');

  const range = $('raise-range');
  const number = $('raise-number');
  if (range && number) {
    range.addEventListener('input', () => {
      raiseValue = Number(range.value);
      number.value = raiseValue;
    });
    number.addEventListener('input', () => {
      const value = Number(number.value);
      if (Number.isFinite(value)) raiseValue = value;
    });
  }
}

function render() {
  if (!state?.viewer) {
    setView('landing');
    return;
  }
  if (state.status === 'lobby') renderLobby();
  else renderGame();
}

async function resume() {
  if (!token) return;
  try {
    const next = await api('/api/state', undefined, 'GET');
    updateState(next);
    connectStream();
  } catch {
    resetSession(false);
  }
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  landingMessage.textContent = '';
  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim();
  if (!/^[0-9]{4}$/.test(roomCode)) {
    landingMessage.textContent = '房间号必须是 4 位数字。';
    return;
  }
  try {
    const result = await api('/api/join', { name, roomCode });
    token = result.token;
    sessionStorage.setItem('holdem-token', token);
    localStorage.setItem('holdem-name', name);
    updateState(result.state);
    connectStream();
  } catch (error) {
    landingMessage.textContent = error.message;
  }
});

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state?.viewer?.isOwner) return;
  await sendCommand('config', {
    config: {
      startingStack: Number($('starting-stack').value),
      smallBlind: Number($('small-blind').value),
      bigBlind: Number($('big-blind').value),
      botStyle: $('bot-style').value,
    },
  });
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-command]');
  if (!button || button.disabled) return;
  const command = button.dataset.command;
  if (command === 'kick') {
    await sendCommand('kick', { playerId: button.dataset.playerId });
    return;
  }
  if (command === 'bot-inc' || command === 'bot-dec') {
    const current = state.players.filter((player) => player.isBot).length;
    const next = command === 'bot-inc' ? current + 1 : current - 1;
    await sendCommand('setBots', { count: next });
    return;
  }
  if (command === 'raise') {
    const number = $('raise-number');
    const value = Number(number?.value ?? raiseValue);
    await sendCommand('raise', { to: value });
    return;
  }
  if (['fold', 'check', 'call', 'start', 'next', 'leave'].includes(command)) {
    await sendCommand(command);
  }
});

$('copy-room').addEventListener('click', async () => {
  const code = state?.roomCode ?? '';
  try {
    await navigator.clipboard.writeText(code);
    toast(`房间号 ${code} 已复制`);
  } catch {
    toast(`房间号：${code}`);
  }
});

const params = new URLSearchParams(location.search);
if (params.has('room')) roomInput.value = params.get('room').slice(0, 4);
const savedName = localStorage.getItem('holdem-name');
if (savedName) nameInput.value = savedName;

setView('landing');
resume();

function setupLogDrag() {
  const log = $('hand-log');
  let dragging = false;
  let lastY = 0;

  log.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    dragging = true;
    lastY = event.clientY;
    log.setPointerCapture(event.pointerId);
    log.classList.add('dragging');
    event.preventDefault();
  });

  log.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const deltaY = event.clientY - lastY;
    lastY = event.clientY;
    log.scrollTop -= deltaY;
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    log.classList.remove('dragging');
    if (event?.pointerId !== undefined) log.releasePointerCapture(event.pointerId);
  };

  log.addEventListener('pointerup', stopDragging);
  log.addEventListener('pointercancel', stopDragging);
  log.addEventListener('lostpointercapture', () => {
    dragging = false;
    log.classList.remove('dragging');
  });
}

setupLogDrag();

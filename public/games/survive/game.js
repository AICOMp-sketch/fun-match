const socket = io("https://fun-match-production.up.railway.app");

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting',
  players: [],           // Array of player objects
  hands: {},             // playerId -> array of cards
  deck: [],              // Draw pile
  discard: [],           // Discard pile
  currentPlayerIndex: 0,
  direction: 1,          // 1 = clockwise, -1 = counter-clockwise
  currentColor: null,    // Active color (for wild cards)
  isBotMode: false,
  pendingDraw: 0,        // For stacking draw cards
  waitingForColor: false // When wild is played
};

let LOCAL_PLAYER_ID = null;

// ════════ CARD DEFINITIONS ════════
const COLORS = ['red', 'blue', 'green', 'yellow'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTIONS = ['skip', 'reverse', 'draw2'];
const WILDS = ['wild', 'wild4'];

// ════════ DECK CREATION ════════
function createDeck() {
  const deck = [];

  COLORS.forEach(color => {
    // One 0 per color
    deck.push({ color, value: '0', type: 'number' });

    // Two of each 1-9 per color
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: String(i), type: 'number' });
      deck.push({ color, value: String(i), type: 'number' });
    }

    // Two of each action card per color
    ACTIONS.forEach(action => {
      deck.push({ color, value: action, type: 'action' });
      deck.push({ color, value: action, type: 'action' });
    });
  });

  // 4 Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ color: 'wild', value: 'wild4', type: 'wild' });
  }

  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ════════ GAME LOGIC ════════
function startGame() {
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  GAME.state = 'playing';
  GAME.deck = createDeck();
  GAME.discard = [];
  GAME.hands = {};
  GAME.currentPlayerIndex = 0;
  GAME.direction = 1;
  GAME.pendingDraw = 0;

  // Deal 7 cards to each player
  GAME.players.forEach(player => {
    GAME.hands[player.id] = [];
    for (let i = 0; i < 7; i++) {
      GAME.hands[player.id].push(GAME.deck.pop());
    }
  });

  // Flip first card (must be a number card)
  let firstCard;
  do {
    firstCard = GAME.deck.pop();
    if (firstCard.type !== 'number') {
      GAME.deck.unshift(firstCard); // Put back at bottom
    }
  } while (firstCard.type !== 'number');

  GAME.discard.push(firstCard);
  GAME.currentColor = firstCard.color;

  updateDisplay();
  sendHandsToPlayers();

  Sounds.turn();
  showAnnouncement("GAME START!");
}

function sendHandsToPlayers() {
  GAME.players.forEach(player => {
    if (!player.isBot) {
      socket.emit('uno-hand', {
        targetId: player.id,
        hand: GAME.hands[player.id],
        isMyTurn: player.id === getCurrentPlayer().id,
        currentColor: GAME.currentColor,
        topCard: GAME.discard[GAME.discard.length - 1]
      });
    }
  });
}

function getCurrentPlayer() {
  return GAME.players[GAME.currentPlayerIndex];
}

function isValidPlay(card, topCard, currentColor) {
  // Wild cards can always be played
  if (card.type === 'wild') return true;

  // Match color
  if (card.color === currentColor) return true;

  // Match value
  if (card.value === topCard.value) return true;

  return false;
}

function playCard(playerId, cardIndex, chosenColor = null) {
  const player = GAME.players.find(p => p.id === playerId);
  if (!player) return { success: false, reason: 'Player not found' };

  if (player.id !== getCurrentPlayer().id) {
    return { success: false, reason: 'Not your turn' };
  }

  const hand = GAME.hands[playerId];
  const card = hand[cardIndex];
  if (!card) return { success: false, reason: 'Invalid card' };

  const topCard = GAME.discard[GAME.discard.length - 1];

  if (!isValidPlay(card, topCard, GAME.currentColor)) {
    return { success: false, reason: 'Card does not match' };
  }

  // Remove card from hand
  hand.splice(cardIndex, 1);
  GAME.discard.push(card);

  // Update color
  if (card.type === 'wild') {
    if (chosenColor) {
      GAME.currentColor = chosenColor;
    } else {
      // Bot chooses color
      GAME.currentColor = chooseBestColor(hand);
    }
  } else {
    GAME.currentColor = card.color;
  }

  // Play sound
  if (card.value === 'skip') Sounds.skip();
  else if (card.value === 'reverse') Sounds.reverse();
  else if (card.value === 'draw2') Sounds.draw2();
  else if (card.value === 'wild') Sounds.wild();
  else if (card.value === 'wild4') Sounds.draw4();
  else Sounds.playCard();

  // Check for UNO
  if (hand.length === 1) {
    Sounds.uno();
    showAnnouncement(`${player.name} - UNO!`);
  }

  // Check for winner
  if (hand.length === 0) {
    endGame(player);
    return { success: true, winner: true };
  }

  // Apply card effects
  applyCardEffect(card);

  // Next turn
  nextTurn();

  updateDisplay();
  sendHandsToPlayers();

  return { success: true };
}

function chooseBestColor(hand) {
  // Bot AI: pick color with most cards
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  hand.forEach(c => {
    if (COLORS.includes(c.color)) counts[c.color]++;
  });
  let bestColor = 'red';
  let max = 0;
  for (const color in counts) {
    if (counts[color] > max) {
      max = counts[color];
      bestColor = color;
    }
  }
  return bestColor;
}

function applyCardEffect(card) {
  if (card.value === 'skip') {
    advanceTurn(); // Skip next player (extra advance)
  } else if (card.value === 'reverse') {
    GAME.direction *= -1;
    document.getElementById('direction').textContent = GAME.direction === 1 ? '→' : '←';
    if (GAME.players.length === 2) {
      advanceTurn(); // In 2-player, reverse acts like skip
    }
  } else if (card.value === 'draw2') {
    const nextPlayer = getNextPlayer();
    drawCards(nextPlayer.id, 2);
    advanceTurn(); // Skip them
  } else if (card.value === 'wild4') {
    const nextPlayer = getNextPlayer();
    drawCards(nextPlayer.id, 4);
    advanceTurn(); // Skip them
  }
}

function getNextPlayer() {
  const nextIndex = (GAME.currentPlayerIndex + GAME.direction + GAME.players.length) % GAME.players.length;
  return GAME.players[nextIndex];
}

function drawCards(playerId, count) {
  for (let i = 0; i < count; i++) {
    if (GAME.deck.length === 0) {
      reshuffleDiscard();
    }
    if (GAME.deck.length > 0) {
      GAME.hands[playerId].push(GAME.deck.pop());
    }
  }
}

function reshuffleDiscard() {
  if (GAME.discard.length <= 1) return;
  const topCard = GAME.discard.pop();
  GAME.deck = shuffle(GAME.discard);
  GAME.discard = [topCard];
}

function advanceTurn() {
  GAME.currentPlayerIndex = (GAME.currentPlayerIndex + GAME.direction + GAME.players.length) % GAME.players.length;
}

function nextTurn() {
  advanceTurn();
  Sounds.turn();

  // If bot's turn, make them play
  const current = getCurrentPlayer();
  if (current.isBot) {
    setTimeout(() => botPlayTurn(), 1500);
  }
}

function botPlayTurn() {
  const bot = getCurrentPlayer();
  if (!bot.isBot) return;

  const hand = GAME.hands[bot.id];
  const topCard = GAME.discard[GAME.discard.length - 1];

  // Find playable cards
  const playable = [];
  hand.forEach((card, index) => {
    if (isValidPlay(card, topCard, GAME.currentColor)) {
      playable.push({ card, index });
    }
  });

  if (playable.length === 0) {
    // Draw a card
    drawCards(bot.id, 1);
    Sounds.drawCard();
    updateDisplay();

    // Check if drawn card is playable
    const newCard = GAME.hands[bot.id][GAME.hands[bot.id].length - 1];
    if (isValidPlay(newCard, topCard, GAME.currentColor)) {
      setTimeout(() => {
        playCard(bot.id, GAME.hands[bot.id].length - 1);
      }, 1000);
    } else {
      setTimeout(() => {
        nextTurn();
        updateDisplay();
      }, 800);
    }
    return;
  }

  // Bot strategy: Prefer action cards, then match by color
  // Sort: wild4 > draw2 > skip > reverse > wild > numbers
  playable.sort((a, b) => {
    const priority = { wild4: 6, draw2: 5, skip: 4, reverse: 3, wild: 2 };
    return (priority[b.card.value] || 1) - (priority[a.card.value] || 1);
  });

  const chosen = playable[0];
  playCard(bot.id, chosen.index);
}

function endGame(winner) {
  GAME.state = 'gameOver';
  Sounds.win();

  setTimeout(() => {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('win-screen').classList.add('active');
    document.getElementById('win-title').textContent = winner.name.toUpperCase();

    // Stats
    const stats = document.getElementById('win-stats');
    const cardsLeft = GAME.players.map(p =>
      `<div class="stat-row"><span>${p.name}</span><span>${GAME.hands[p.id].length} cards</span></div>`
    ).join('');
    stats.innerHTML = cardsLeft;
  }, 2000);
}

// ════════ DISPLAY ════════
function updateDisplay() {
  // Update top card
  const topCard = GAME.discard[GAME.discard.length - 1];
  const topCardEl = document.getElementById('top-card');
  topCardEl.className = 'discard-card ' + (topCard.type === 'wild' ? 'wild' : GAME.currentColor);

  let displayValue = topCard.value;
  if (topCard.value === 'skip') displayValue = '⊘';
  else if (topCard.value === 'reverse') displayValue = '⟲';
  else if (topCard.value === 'draw2') displayValue = '+2';
  else if (topCard.value === 'wild') displayValue = 'W';
  else if (topCard.value === 'wild4') displayValue = '+4';

  topCardEl.querySelector('span').textContent = displayValue;

  // Update deck count
  document.getElementById('deck-count').textContent = GAME.deck.length;

  // Update current player
  const current = getCurrentPlayer();
  document.getElementById('current-player').textContent = current.name.toUpperCase();

  // Update opponent slots (show non-local players)
  const opponents = GAME.players.filter(p => p.id !== LOCAL_PLAYER_ID);
  const oppPositions = ['opp-left', 'opp-top', 'opp-right'];

  oppPositions.forEach((slotId, i) => {
    const slot = document.getElementById(slotId);
    if (opponents[i]) {
      const opp = opponents[i];
      slot.style.display = 'block';
      slot.querySelector('.opp-name').textContent = opp.name;
      slot.querySelector('.count').textContent = GAME.hands[opp.id].length;

      slot.classList.toggle('current-turn', opp.id === current.id);
    } else {
      slot.style.display = 'none';
    }
  });

  // Update local player
  const localPlayer = GAME.players.find(p => p.id === LOCAL_PLAYER_ID);
  if (localPlayer) {
    document.getElementById('local-name').textContent = localPlayer.name;
    const isYourTurn = current.id === LOCAL_PLAYER_ID;
    document.getElementById('local-player-display').classList.toggle('your-turn', isYourTurn);
    document.getElementById('local-status').textContent = isYourTurn
      ? `Your turn! (${GAME.hands[LOCAL_PLAYER_ID].length} cards)`
      : `Waiting... (${GAME.hands[LOCAL_PLAYER_ID].length} cards)`;
  }
}

function showAnnouncement(text) {
  const el = document.getElementById('announcement');
  document.getElementById('announcement-text').textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'announceShow 2s ease-out';
  setTimeout(() => el.classList.add('hidden'), 2000);
}

// ════════ SOCKET EVENTS ════════
socket.on("connect", () => {
  console.log("✅ Connected to server!");
  let roomCode = null;
  const configStr = sessionStorage.getItem('roomConfig');
  if (configStr) {
    try {
      const config = JSON.parse(configStr);
      roomCode = config.roomCode;
    } catch (e) { }
  }
  socket.emit("create-room", { roomCode });
});

socket.on("room-created", (data) => {
  document.getElementById("room-code").textContent = data.roomCode;
  renderLobbyQR(data.roomCode);
});

socket.on("player-joined", (player) => {
  if (GAME.isBotMode) return;
  if (GAME.players.length >= 4) return;

  const playerObj = {
    id: player.id,
    name: player.name.toUpperCase(),
    isBot: false
  };

  GAME.players.push(playerObj);

  if (!LOCAL_PLAYER_ID) LOCAL_PLAYER_ID = player.id;

  const slot = document.getElementById(`slot-${GAME.players.length}`);
  if (slot) {
    slot.classList.add('filled');
    slot.querySelector('.player-name').textContent = player.name.toUpperCase();
    slot.querySelector('.status').textContent = 'Ready!';
    setSlotAvatar(slot, player.avatarUrl); // no-op until server sends avatarUrl
  }

  if (GAME.players.length >= 2) {
    document.getElementById('start-game-btn').disabled = false;
  }
});

function setSlotAvatar(slotEl, avatarUrl) {
  if (!slotEl || !avatarUrl) return;
  const img = slotEl.querySelector('.bubble-avatar-img');
  if (img) img.src = avatarUrl;
}

// Phone plays a card
socket.on("uno-play", (data) => {
  const result = playCard(data.playerId, data.cardIndex, data.chosenColor);
  if (!result.success) {
    Sounds.error();
    // Send error back to player
    socket.emit('uno-error', { targetId: data.playerId, message: result.reason });
  }
});

// Phone draws a card
socket.on("uno-draw", (data) => {
  const player = GAME.players.find(p => p.id === data.playerId);
  if (!player || player.id !== getCurrentPlayer().id) return;

  drawCards(data.playerId, 1);
  Sounds.drawCard();

  const topCard = GAME.discard[GAME.discard.length - 1];
  const newCard = GAME.hands[data.playerId][GAME.hands[data.playerId].length - 1];

  updateDisplay();
  sendHandsToPlayers();

  // If drawn card can't be played, next turn
  if (!isValidPlay(newCard, topCard, GAME.currentColor)) {
    setTimeout(() => {
      nextTurn();
      updateDisplay();
    }, 1000);
  }
});

socket.on("player-left", (data) => {
  GAME.players = GAME.players.filter(p => p.id !== data.playerId);
});

// ════════ BOT MODE ════════
document.getElementById('bot-mode-btn').addEventListener('click', () => {
  GAME.isBotMode = true;
  GAME.players = [];

  const localPlayer = { id: 'local-player', name: 'YOU', isBot: false };
  GAME.players.push(localPlayer);
  LOCAL_PLAYER_ID = 'local-player';

  const botNames = ['ALEX', 'JAMIE', 'CASEY'];
  botNames.forEach((name, i) => {
    GAME.players.push({ id: `bot-${i}`, name, isBot: true });
  });

  document.querySelectorAll('.player-bubble').forEach((slot, i) => {
    if (GAME.players[i]) {
      slot.classList.add('filled');
      if (GAME.players[i].isBot) slot.classList.add('cpu');
      slot.querySelector('.player-name').textContent = GAME.players[i].name;
      slot.querySelector('.status').textContent = GAME.players[i].isBot ? 'CPU' : 'You!';
    }
  });

  setTimeout(startGame, 800);
});

// ════════ START MULTIPLAYER GAME ════════
document.getElementById('start-game-btn').addEventListener('click', () => {
  if (GAME.players.length < 2) {
    alert('Need at least 2 players!');
    return;
  }
  startGame();
});

// ════════ LOCAL PLAYER CARD DISPLAY (bot mode uses keyboard) ════════
// For bot mode, local player sees their cards displayed and clicks to play
// We'll add a card display for bot mode

function showLocalPlayerCards() {
  if (!GAME.isBotMode) return;

  // Create/update cards container for bot mode
  let container = document.getElementById('local-cards');
  if (!container) {
    container = document.createElement('div');
    container.id = 'local-cards';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 90vw;
      padding: 15px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 16px;
      border: 2px solid #00e0ff;
      z-index: 50;
    `;
    document.getElementById('game-screen').appendChild(container);
  }

  const hand = GAME.hands[LOCAL_PLAYER_ID] || [];
  const topCard = GAME.discard[GAME.discard.length - 1];
  const isMyTurn = getCurrentPlayer().id === LOCAL_PLAYER_ID;

  container.innerHTML = hand.map((card, i) => {
    const canPlay = isMyTurn && isValidPlay(card, topCard, GAME.currentColor);
    const bgColor = card.type === 'wild' ? 'linear-gradient(135deg, #ff3860 0%, #ffaa00 33%, #aaff00 66%, #00e0ff 100%)' :
      card.color === 'red' ? '#ff3860' :
        card.color === 'blue' ? '#00e0ff' :
          card.color === 'green' ? '#aaff00' :
            '#ffaa00';

    let displayValue = card.value;
    if (card.value === 'skip') displayValue = '⊘';
    else if (card.value === 'reverse') displayValue = '⟲';
    else if (card.value === 'draw2') displayValue = '+2';
    else if (card.value === 'wild') displayValue = 'W';
    else if (card.value === 'wild4') displayValue = '+4';

    return `
      <div class="mini-card" data-index="${i}" style="
        width: 60px;
        height: 85px;
        background: ${bgColor};
        border: 3px solid ${canPlay ? '#aaff00' : 'white'};
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: ${canPlay ? 'pointer' : 'not-allowed'};
        opacity: ${canPlay ? '1' : '0.5'};
        color: white;
        font-family: 'Press Start 2P', monospace;
        font-size: 1.2rem;
        text-shadow: 2px 2px 0 rgba(0,0,0,0.4);
        box-shadow: ${canPlay ? '0 0 15px rgba(170,255,0,0.6)' : '0 4px 10px rgba(0,0,0,0.5)'};
        transition: all 0.2s;
      ">${displayValue}</div>
    `;
  }).join('');

  // Add draw button
  if (isMyTurn) {
    container.innerHTML += `
      <button id="local-draw-btn" style="
        padding: 15px 25px;
        background: linear-gradient(135deg, #7c3aed, #ff3860);
        color: white;
        border: 3px solid white;
        border-radius: 12px;
        font-family: 'Press Start 2P', monospace;
        font-size: 0.8rem;
        cursor: pointer;
        margin-left: 15px;
      ">DRAW</button>
    `;

    document.getElementById('local-draw-btn').addEventListener('click', () => {
      drawCards(LOCAL_PLAYER_ID, 1);
      Sounds.drawCard();
      const newCard = GAME.hands[LOCAL_PLAYER_ID][GAME.hands[LOCAL_PLAYER_ID].length - 1];
      updateDisplay();
      showLocalPlayerCards();

      if (!isValidPlay(newCard, topCard, GAME.currentColor)) {
        setTimeout(() => {
          nextTurn();
          updateDisplay();
          showLocalPlayerCards();
        }, 800);
      }
    });
  }

  // Add click handlers to cards
  container.querySelectorAll('.mini-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      const index = parseInt(cardEl.dataset.index);
      const card = hand[index];
      if (!isValidPlay(card, topCard, GAME.currentColor)) return;

      // If wild, show color picker
      if (card.type === 'wild') {
        showColorPicker((color) => {
          playCard(LOCAL_PLAYER_ID, index, color);
          showLocalPlayerCards();
        });
      } else {
        playCard(LOCAL_PLAYER_ID, index);
        showLocalPlayerCards();
      }
    });
  });
}

function showColorPicker(callback) {
  const picker = document.getElementById('color-picker');
  picker.classList.remove('hidden');

  const handlers = {};
  picker.querySelectorAll('.color-btn').forEach(btn => {
    handlers[btn.dataset.color] = () => {
      picker.classList.add('hidden');
      picker.querySelectorAll('.color-btn').forEach(b => {
        b.removeEventListener('click', handlers[b.dataset.color]);
      });
      callback(btn.dataset.color);
    };
    btn.addEventListener('click', handlers[btn.dataset.color]);
  });
}

// Hook into updateDisplay for bot mode
const originalUpdateDisplay = updateDisplay;
updateDisplay = function () {
  originalUpdateDisplay();
  if (GAME.isBotMode) showLocalPlayerCards();
};

function toggleRoomInfo() {
  const popover = document.getElementById('room-info-popover');
  if (!popover) return;
  const willShow = popover.classList.contains('hidden');
  popover.classList.toggle('hidden');
  if (willShow) populateRoomInfo();
}

function populateRoomInfo() {
  const configStr = sessionStorage.getItem('roomConfig');
  if (!configStr) return;
  let config;
  try { config = JSON.parse(configStr); } catch (e) { return; }

  document.getElementById('info-room-name').textContent = config.roomName || '—';
  document.getElementById('info-privacy').textContent = config.privacy === 'private' ? 'Private 🔒' : 'Public 🌐';
  document.getElementById('info-mode').textContent = config.mode === 'survival' ? 'Survival' : 'Time Limit';
  document.getElementById('info-room-code').textContent = config.roomCode || '—';

  const maxPlayersRow = document.getElementById('info-max-players-row');
  maxPlayersRow.classList.remove('hidden');
  document.getElementById('info-max-players').textContent = config.maxPlayers || '—';
}

document.addEventListener('click', function (e) {
  const popover = document.getElementById('room-info-popover');
  const btn = document.getElementById('room-info-btn');
  if (!popover || popover.classList.contains('hidden')) return;
  if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    popover.classList.add('hidden');
  }
});

function renderLobbyQR(roomCode) {
  const qrEl = document.getElementById('lobby-qr-code');
  if (!qrEl || !roomCode) return;
  const joinUrl = window.location.origin + '/controller.html?room=' + roomCode;
  qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data='
    + encodeURIComponent(joinUrl)
    + '&bgcolor=ffffff&color=0a0e27&margin=0" alt="Scan to join room ' + roomCode + '">';
}
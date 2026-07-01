const socket = io("https://fun-match-production.up.railway.app");

const joinScreen = document.getElementById("join-screen");
const gameSelect = document.getElementById("game-select");
const surviveCtrl = document.getElementById("survive-controller");
const fighterCtrl = document.getElementById("fighter-controller");
const racerCtrl = document.getElementById("racer-controller");
const errorMsg = document.getElementById("error-msg");

const urlParams = new URLSearchParams(window.location.search);
const roomFromURL = urlParams.get("room");
if (roomFromURL) {
    document.getElementById("code-input").value = roomFromURL.toUpperCase();
}

document.getElementById("join-btn").addEventListener("click", () => {
    const name = document.getElementById("name-input").value.trim();
    const code = document.getElementById("code-input").value.trim().toUpperCase();

    if (!name) {
        errorMsg.textContent = "Please enter your name!";
        return;
    }
    if (code.length !== 4) {
        errorMsg.textContent = "Room code must be 4 letters!";
        return;
    }

    errorMsg.textContent = "";
    socket.emit("join-room", { roomCode: code, playerName: name });
});

socket.on("join-success", (data) => {
    joinScreen.classList.add("hidden");
    gameSelect.classList.remove("hidden");
    document.getElementById("welcome").textContent = `Hi ${data.playerName}!`;
    document.getElementById("fighter-welcome").textContent = `${data.playerName.toUpperCase()} FIGHTS!`;
    if (document.getElementById("racer-welcome")) {
        document.getElementById("racer-welcome").textContent = `${data.playerName.toUpperCase()} RACES!`;
    }
});

socket.on("join-error", (data) => {
    errorMsg.textContent = data.message;
});

document.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const game = btn.dataset.game;
        gameSelect.classList.add('hidden');

        if (game === 'survive') {
            document.getElementById('uno-controller').classList.remove('hidden');
        } else if (game === 'fighter') {
            fighterCtrl.classList.remove('hidden');
        } else if (game === 'racer' && racerCtrl) {
            racerCtrl.classList.remove('hidden');
        }
    });
});

// ════════ CONTINUOUS INPUT - FIXED ════════
// Send signal repeatedly while button is held (every 100ms)
const activeButtons = {};

function sendAction(direction) {
    socket.emit("move", { direction });
}

function startHolding(direction) {
    if (activeButtons[direction]) return;

    sendAction(direction);

    activeButtons[direction] = setInterval(() => {
        sendAction(direction);
    }, 100);
}

function stopHolding(direction) {
    if (activeButtons[direction]) {
        clearInterval(activeButtons[direction]);
        activeButtons[direction] = null;
    }
}

document.querySelectorAll('.ctrl-btn').forEach(btn => {
    const dir = btn.dataset.dir;

    // Touch events for phone
    btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        startHolding(dir);
    }, { passive: false });

    btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        stopHolding(dir);
    }, { passive: false });

    btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        stopHolding(dir);
    }, { passive: false });

    // Mouse events for testing
    btn.addEventListener("mousedown", () => startHolding(dir));
    btn.addEventListener("mouseup", () => stopHolding(dir));
    btn.addEventListener("mouseleave", () => stopHolding(dir));
});

// Stop all holds when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.keys(activeButtons).forEach(dir => stopHolding(dir));
    }
});

// ═══════ UNO CONTROLLER ═══════

let unoHand = [];
let unoTopCard = null;
let unoCurrentColor = null;
let unoMyTurn = false;
let pendingCardIndex = null;

// Receive hand from host
socket.on("uno-your-hand", (data) => {
    unoHand = data.hand;
    unoTopCard = data.topCard;
    unoCurrentColor = data.currentColor;
    unoMyTurn = data.isMyTurn;

    renderUnoHand();
    updateUnoStatus();
});

// Receive error
socket.on("uno-error-msg", (data) => {
    const errorEl = document.getElementById('uno-error');
    errorEl.textContent = data.message;
    setTimeout(() => errorEl.textContent = '', 2000);
});

function updateUnoStatus() {
    const statusEl = document.getElementById('uno-status');
    const drawBtn = document.getElementById('uno-draw-btn');

    if (unoMyTurn) {
        statusEl.textContent = '🎴 YOUR TURN!';
        statusEl.style.color = '#aaff00';
        drawBtn.disabled = false;
    } else {
        statusEl.textContent = 'Waiting for your turn...';
        statusEl.style.color = '#94a3b8';
        drawBtn.disabled = true;
    }

    // Update top card display
    if (unoTopCard) {
        const topCardEl = document.getElementById('uno-top-card');
        const isWild = unoTopCard.type === 'wild';
        topCardEl.className = 'uno-mini-card ' + (isWild ? 'wild' : unoCurrentColor);

        let displayValue = unoTopCard.value;
        if (unoTopCard.value === 'skip') displayValue = '⊘';
        else if (unoTopCard.value === 'reverse') displayValue = '⟲';
        else if (unoTopCard.value === 'draw2') displayValue = '+2';
        else if (unoTopCard.value === 'wild') displayValue = 'W';
        else if (unoTopCard.value === 'wild4') displayValue = '+4';

        topCardEl.querySelector('span').textContent = displayValue;

        document.getElementById('uno-current-color').textContent = unoCurrentColor || '-';
        document.getElementById('uno-current-color').style.color = getColorHex(unoCurrentColor);
    }
}

function getColorHex(color) {
    switch (color) {
        case 'red': return '#ff3860';
        case 'blue': return '#00e0ff';
        case 'green': return '#aaff00';
        case 'yellow': return '#ffaa00';
        default: return '#94a3b8';
    }
}

function isValidUnoPlay(card, topCard, currentColor) {
    if (card.type === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

function renderUnoHand() {
    const handEl = document.getElementById('uno-hand');

    if (unoHand.length === 0) {
        handEl.innerHTML = '<p class="no-cards">No cards yet...</p>';
        return;
    }

    handEl.innerHTML = unoHand.map((card, i) => {
        const isPlayable = unoMyTurn && unoTopCard && isValidUnoPlay(card, unoTopCard, unoCurrentColor);
        const isWild = card.type === 'wild';
        const colorClass = isWild ? 'wild' : card.color;
        const playableClass = isPlayable ? 'playable' : 'not-playable';

        let displayValue = card.value;
        if (card.value === 'skip') displayValue = '⊘';
        else if (card.value === 'reverse') displayValue = '⟲';
        else if (card.value === 'draw2') displayValue = '+2';
        else if (card.value === 'wild') displayValue = 'W';
        else if (card.value === 'wild4') displayValue = '+4';

        return `<div class="uno-card ${colorClass} ${playableClass}" data-index="${i}">${displayValue}</div>`;
    }).join('');

    // Add click handlers
    handEl.querySelectorAll('.uno-card.playable').forEach(cardEl => {
        cardEl.addEventListener('click', () => {
            const index = parseInt(cardEl.dataset.index);
            const card = unoHand[index];

            if (card.type === 'wild') {
                // Show color picker
                pendingCardIndex = index;
                document.getElementById('uno-color-picker').classList.remove('hidden');
            } else {
                // Play card immediately
                socket.emit('uno-play-card', { cardIndex: index });
            }
        });
    });
}

// Color picker for wild cards
document.querySelectorAll('.uno-color').forEach(colorBtn => {
    colorBtn.addEventListener('click', () => {
        const chosenColor = colorBtn.dataset.color;
        document.getElementById('uno-color-picker').classList.add('hidden');

        if (pendingCardIndex !== null) {
            socket.emit('uno-play-card', {
                cardIndex: pendingCardIndex,
                chosenColor: chosenColor
            });
            pendingCardIndex = null;
        }
    });
});

// Draw button
document.getElementById('uno-draw-btn').addEventListener('click', () => {
    socket.emit('uno-draw-card');
});
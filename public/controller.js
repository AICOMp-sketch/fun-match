const socket = previewGameParam() ? { emit: () => { }, on: () => { } } : io("https://fun-match-production.up.railway.app");

function previewGameParam() {
    return new URLSearchParams(window.location.search).get("preview");
}

const joinScreen = document.getElementById("join-screen");
const gameSelect = document.getElementById("game-select");
const fighterCtrl = document.getElementById("fighter-controller");
const racerCtrl = document.getElementById("racer-controller");
const errorMsg = document.getElementById("error-msg");

const urlParams = new URLSearchParams(window.location.search);
const roomFromURL = urlParams.get("room");
if (roomFromURL) {
    document.getElementById("code-input").value = roomFromURL.toUpperCase();
}

const previewGame = urlParams.get("preview");

if (previewGame) {
    // Preview mode: bypass join screen, game-select, and the socket connection
    // entirely — this is a pure UI showcase, not a real game session.
    joinScreen.classList.add("hidden");
    gameSelect.classList.add("hidden");

    if (previewGame === 'survive') {
        document.getElementById('uno-controller').classList.remove('hidden');
        // Feed in fake sample data so the fan of cards actually has something to show
        unoHand = [
            { type: 'number', color: 'red', value: '4' },
            { type: 'number', color: 'blue', value: '7' },
            { type: 'action', color: 'green', value: 'skip' },
            { type: 'number', color: 'yellow', value: '2' },
            { type: 'action', color: 'red', value: 'reverse' },
            { type: 'number', color: 'blue', value: '9' },
            { type: 'wild', color: null, value: 'wild4' }
        ];
        unoTopCard = { type: 'number', color: 'green', value: '5' };
        unoCurrentColor = 'green';
        unoMyTurn = true;
        renderUnoHand();
        updateUnoStatus();
    } else if (previewGame === 'fighter') {
        fighterCtrl?.classList.remove('hidden');
    } else if (previewGame === 'racer') {
        racerCtrl?.classList.remove('hidden');
    }
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

    // Null-safe: these elements may not all exist depending on which controller is active
    document.getElementById("uno-welcome")?.replaceChildren(document.createTextNode(`Hi ${data.playerName}!`));
    document.getElementById("fighter-welcome")?.replaceChildren(document.createTextNode(`${data.playerName.toUpperCase()} FIGHTS!`));
    document.getElementById("racer-welcome")?.replaceChildren(document.createTextNode(`${data.playerName.toUpperCase()} RACES!`));
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
            fighterCtrl?.classList.remove('hidden');
        } else if (game === 'racer') {
            racerCtrl?.classList.remove('hidden');
        }
    });
});

// ════════ CONTINUOUS INPUT (Fighter / Racer d-pad style buttons) ════════
const activeButtons = {};

function sendAction(direction) {
    socket.emit("move", { direction });
}

function startHolding(direction) {
    if (activeButtons[direction]) return;
    sendAction(direction);
    activeButtons[direction] = setInterval(() => sendAction(direction), 100);
}

function stopHolding(direction) {
    if (activeButtons[direction]) {
        clearInterval(activeButtons[direction]);
        activeButtons[direction] = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.keys(activeButtons).forEach(dir => stopHolding(dir));
    }
});

// ═══════════════ FIGHTER: DRAGGABLE JOYSTICK ═══════════════
(function setupDpad() {
    const ring = document.getElementById('dpad-ring');
    const knob = document.getElementById('dpad-knob');
    if (!ring || !knob) return;

    const MAX_RADIUS = 46; // how far the knob can travel from center
    let activeDir = null;
    let tracking = false;

    function getCenter() {
        const rect = ring.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function resolveDirection(dx, dy) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const deadzone = 12;

        if (absX < deadzone && absY < deadzone) return null;

        if (absX > absY) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy < 0 ? 'up' : 'down';
        }
    }

    function setDirectionVisual(dir) {
        ring.classList.remove('dir-up', 'dir-down', 'dir-left', 'dir-right');
        if (dir) ring.classList.add('dir-' + dir);
    }

    function updateFromPoint(clientX, clientY) {
        const center = getCenter();
        let dx = clientX - center.x;
        let dy = clientY - center.y;

        const dist = Math.min(MAX_RADIUS, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx);
        const knobX = Math.cos(angle) * dist;
        const knobY = Math.sin(angle) * dist;

        knob.style.transform = `translate(${knobX}px, ${knobY}px)`;

        const dir = resolveDirection(dx, dy);
        setDirectionVisual(dir);

        if (dir !== activeDir) {
            if (activeDir) stopHolding(activeDir);
            if (dir && dir !== 'down') startHolding(dir); // fighter has no "down" input server-side
            activeDir = dir;
        }
    }

    function reset() {
        tracking = false;
        ring.classList.remove('dragging');
        setDirectionVisual(null);
        knob.style.transform = 'translate(0, 0)';
        if (activeDir) stopHolding(activeDir);
        activeDir = null;
    }

    ring.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tracking = true;
        ring.classList.add('dragging');
        const t = e.touches[0];
        updateFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    ring.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        e.preventDefault();
        const t = e.touches[0];
        updateFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    ring.addEventListener('touchend', reset);
    ring.addEventListener('touchcancel', reset);

    // Mouse fallback for desktop testing
    ring.addEventListener('mousedown', (e) => {
        tracking = true;
        ring.classList.add('dragging');
        updateFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
        if (!tracking) return;
        updateFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
        if (tracking) reset();
    });
})();

// ═══════════════ FIGHTER: ACTION BUTTONS (A1 / A2 / A3 / JMP) ═══════════════
document.querySelectorAll('.action-circle').forEach(btn => {
    const dir = btn.dataset.dir;

    function press() {
        btn.classList.add('pressed');
        socket.emit('move', { direction: dir });
    }

    function release() {
        btn.classList.remove('pressed');
    }

    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        press();
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        release();
    }, { passive: false });

    btn.addEventListener('touchcancel', release);

    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
});


// ═══════════════ UNO CONTROLLER (FANNED HAND) ═══════════════

let unoHand = [];
let unoTopCard = null;
let unoCurrentColor = null;
let unoMyTurn = false;
let pendingCardIndex = null;
let raisedCardIndex = null;

socket.on("uno-your-hand", (data) => {
    unoHand = data.hand;
    unoTopCard = data.topCard;
    unoCurrentColor = data.currentColor;
    unoMyTurn = data.isMyTurn;

    renderUnoHand();
    updateUnoStatus();
});

socket.on("uno-error-msg", (data) => {
    const errorEl = document.getElementById('uno-error');
    errorEl.textContent = data.message;
    setTimeout(() => { errorEl.textContent = ''; }, 2000);
});

function updateUnoStatus() {
    const statusEl = document.getElementById('uno-status');

    if (unoMyTurn) {
        statusEl.textContent = '🎴 YOUR TURN!';
        statusEl.style.color = '#aaff00';
    } else {
        statusEl.textContent = 'Waiting for your turn...';
        statusEl.style.color = '#94a3b8';
    }

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
    const fanEl = document.getElementById('uno-hand');
    raisedCardIndex = null;

    if (unoHand.length === 0) {
        fanEl.innerHTML = '<p class="no-cards">No cards yet...</p>';
        return;
    }

    fanEl.innerHTML = '';

    const count = unoHand.length;
    const spread = Math.min(56, count * 8);
    const step = count > 1 ? spread / (count - 1) : 0;
    const start = -spread / 2;

    unoHand.forEach((card, i) => {
        const isPlayable = unoMyTurn && unoTopCard && isValidUnoPlay(card, unoTopCard, unoCurrentColor);
        const isWild = card.type === 'wild';
        const colorClass = isWild ? 'wild' : card.color;

        const angle = start + step * i;
        const lift = Math.abs(angle) * 1.1;

        let displayValue = card.value;
        if (card.value === 'skip') displayValue = '⊘';
        else if (card.value === 'reverse') displayValue = '⟲';
        else if (card.value === 'draw2') displayValue = '+2';
        else if (card.value === 'wild') displayValue = 'W';
        else if (card.value === 'wild4') displayValue = '+4';

        const cardEl = document.createElement('div');
        cardEl.className = `uno-fan-card ${colorClass} ${isPlayable ? 'playable' : 'not-playable'}`;
        cardEl.dataset.index = i;
        cardEl.style.zIndex = i;
        cardEl.innerHTML = `<span>${displayValue}</span>`;

        const fanTransform = `translateX(-50%) rotate(${angle}deg) translateY(${lift}px)`;
        cardEl.dataset.fanTransform = fanTransform;
        cardEl.style.transform = fanTransform;

        attachCardGestures(cardEl, i, isPlayable);
        fanEl.appendChild(cardEl);
    });
}

function attachCardGestures(cardEl, index, isPlayable) {
    let startX = 0, startY = 0, dragging = false, moved = false, usedTouch = false;

    function onStart(x, y) {
        startX = x;
        startY = y;
        dragging = true;
        moved = false;
    }

    function onMove(x, y) {
        if (!dragging) return;
        const dx = x - startX;
        const dy = y - startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;

        if (dy < -20) {
            const lift = Math.min(80, -dy);
            cardEl.style.transform = `${cardEl.dataset.fanTransform} translateY(-${lift}px)`;
        }
    }

    function onEnd(x, y) {
        if (!dragging) return;
        dragging = false;
        const dy = y - startY;

        if (dy < -50) {
            attemptPlay(cardEl, index, isPlayable);
        } else if (!moved) {
            toggleRaised(cardEl, index);
        } else {
            cardEl.style.transform = cardEl.dataset.fanTransform;
        }
    }

    cardEl.addEventListener('touchstart', (e) => {
        usedTouch = true;
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
    }, { passive: true });

    cardEl.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
    }, { passive: true });

    cardEl.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        onEnd(t.clientX, t.clientY);
    });

    // Mouse fallback for desktop testing — ignored if touch already handled this interaction
    cardEl.addEventListener('mousedown', (e) => { if (!usedTouch) onStart(e.clientX, e.clientY); });
    cardEl.addEventListener('mousemove', (e) => { if (!usedTouch) onMove(e.clientX, e.clientY); });
    cardEl.addEventListener('mouseup', (e) => { if (!usedTouch) onEnd(e.clientX, e.clientY); });
}

function toggleRaised(cardEl, index) {
    const fan = document.getElementById('uno-hand');

    if (raisedCardIndex === index) {
        cardEl.classList.remove('raised');
        cardEl.style.transform = cardEl.dataset.fanTransform;
        raisedCardIndex = null;
        return;
    }

    fan.querySelectorAll('.uno-fan-card.raised').forEach(el => {
        el.classList.remove('raised');
        el.style.transform = el.dataset.fanTransform;
    });

    cardEl.classList.add('raised');
    cardEl.style.transform = `${cardEl.dataset.fanTransform} translateY(-45px) scale(1.15)`;
    raisedCardIndex = index;
}

function attemptPlay(cardEl, index, isPlayable) {
    if (!isPlayable) {
        cardEl.classList.add('shake');
        cardEl.style.transform = cardEl.dataset.fanTransform;
        setTimeout(() => cardEl.classList.remove('shake'), 300);
        return;
    }

    const card = unoHand[index];
    cardEl.classList.add('flying-play');

    if (card.type === 'wild') {
        pendingCardIndex = index;
        document.getElementById('uno-color-picker').classList.remove('hidden');
    } else {
        socket.emit('uno-play-card', { cardIndex: index });
    }
}

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

// ═══════════════ DRAW PILE — swipe up or tap to draw ═══════════════
(function setupDrawPile() {
    const pile = document.getElementById('uno-draw-pile');
    if (!pile) return;

    let startY = 0;

    pile.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        pile.classList.add('pulled');
    }, { passive: true });

    pile.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - startY;
        if (dy < -20) pile.classList.add('pulled');
    }, { passive: true });

    pile.addEventListener('touchend', (e) => {
        const dy = e.changedTouches[0].clientY - startY;
        pile.classList.remove('pulled');
        if (dy < -40) triggerDraw();
    });

    pile.addEventListener('click', () => triggerDraw());

    function triggerDraw() {
        if (!unoMyTurn) return;
        pile.classList.add('drawing');
        socket.emit('uno-draw-card');
        setTimeout(() => pile.classList.remove('drawing'), 500);
    }
})();

// ═══════════════ RACER: STEERING WHEEL (rotate + steer left/right) ═══════════════
(function setupWheel() {
    const zone = document.getElementById('wheel-zone');
    const svg = document.getElementById('wheel-svg');
    if (!zone || !svg) return;

    const MAX_ANGLE = 90; // degrees of wheel rotation each direction
    const STEER_DEADZONE = 12; // degrees before we start emitting steer input
    let dragging = false;
    let startAngle = 0;
    let currentRotation = 0;
    let activeSteer = null;

    function getCenter() {
        const rect = zone.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function angleFromCenter(clientX, clientY) {
        const c = getCenter();
        return Math.atan2(clientY - c.y, clientX - c.x) * (180 / Math.PI);
    }

    function applyRotation(deg) {
        currentRotation = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, deg));
        svg.style.transform = `rotate(${currentRotation}deg)`;

        const steer = currentRotation > STEER_DEADZONE ? 'right'
            : currentRotation < -STEER_DEADZONE ? 'left'
                : null;

        if (steer !== activeSteer) {
            if (activeSteer) stopHolding(activeSteer);
            if (steer) startHolding(steer);
            activeSteer = steer;
        }
    }

    function onStart(clientX, clientY) {
        dragging = true;
        zone.classList.add('dragging');
        startAngle = angleFromCenter(clientX, clientY) - currentRotation;
    }

    function onMove(clientX, clientY) {
        if (!dragging) return;
        const raw = angleFromCenter(clientX, clientY) - startAngle;
        applyRotation(raw);
    }

    function onEnd() {
        dragging = false;
        zone.classList.remove('dragging');
        applyRotation(0); // spring back to center
    }

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
    }, { passive: false });

    zone.addEventListener('touchend', onEnd);
    zone.addEventListener('touchcancel', onEnd);

    zone.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => { if (dragging) onEnd(); });
})();

// ═══════════════ RACER: THROTTLE / BRAKE VERTICAL SLIDERS ═══════════════
// Swiping up on a bar increases its fill (0-100%); at any fill > 0 we hold-emit
// the matching action ('punch' for gas, 'kick' for brake), same directions the
// original gas/brake buttons used — so no server-side changes are needed.

let racerSpeed = 0;
let racerGear = 1;

function setupPedalBar(barId, fillId, holdDirection) {
    const bar = document.getElementById(barId);
    const fill = document.getElementById(fillId);
    if (!bar || !fill) return;

    let level = 0; // 0 to 100
    let isHolding = false;

    function setLevel(newLevel) {
        level = Math.max(0, Math.min(100, newLevel));
        fill.style.height = level + '%';
        bar.classList.toggle('active', level > 0);

        if (level > 0 && !isHolding) {
            startHolding(holdDirection);
            isHolding = true;
        } else if (level === 0 && isHolding) {
            stopHolding(holdDirection);
            isHolding = false;
        }

        if (holdDirection === 'punch') updateSpeedFromThrottle(level);
    }

    function levelFromPoint(clientY) {
        const rect = bar.querySelector('.pedal-bar-track').getBoundingClientRect();
        const ratio = (rect.bottom - clientY) / rect.height;
        return ratio * 100;
    }

    function onStart(clientY) { setLevel(levelFromPoint(clientY)); }
    function onMove(clientY) { setLevel(levelFromPoint(clientY)); }
    function onEnd() { setLevel(0); } // release resets to 0 — swipe up again to reapply

    bar.addEventListener('touchstart', (e) => {
        e.preventDefault();
        onStart(e.touches[0].clientY);
    }, { passive: false });

    bar.addEventListener('touchmove', (e) => {
        e.preventDefault();
        onMove(e.touches[0].clientY);
    }, { passive: false });

    bar.addEventListener('touchend', onEnd);
    bar.addEventListener('touchcancel', onEnd);

    bar.addEventListener('mousedown', (e) => onStart(e.clientY));
    window.addEventListener('mousemove', (e) => { if (e.buttons === 1) onMove(e.clientY); });
    bar.addEventListener('mouseup', onEnd);
}

// Purely visual speed/gear simulation driven by throttle level, since actual
// speed/gear should come from the host game's socket state once that event
// exists (e.g. socket.on('racer-state', ...)) — wire that in to replace this.
function updateSpeedFromThrottle(throttleLevel) {
    const brakeLevel = parseFloat(document.getElementById('brake-fill').style.height) || 0;
    const targetSpeed = Math.max(0, (throttleLevel * 2.2) - (brakeLevel * 3));

    racerSpeed += (targetSpeed - racerSpeed) * 0.15;
    if (racerSpeed < 0.5) racerSpeed = 0;

    racerGear = Math.min(6, Math.max(1, Math.floor(racerSpeed / 35) + 1));

    document.getElementById('racer-speed').textContent = Math.round(racerSpeed);
    document.getElementById('racer-gear').textContent = racerGear;
    document.getElementById('racer-gear-mid').textContent = racerGear;

    const arcFill = document.getElementById('hud-arc-fill');
    const pct = Math.min(1, racerSpeed / 220);
    arcFill.style.strokeDashoffset = 283 - (283 * pct);
}

setupPedalBar('throttle-bar', 'throttle-fill', 'punch');
setupPedalBar('brake-bar', 'brake-fill', 'kick');

// Keep speed decaying / recalculating even while only brake is held (no throttle)
setInterval(() => {
    const throttleLevel = parseFloat(document.getElementById('throttle-fill').style.height) || 0;
    if (throttleLevel === 0 && racerSpeed > 0) updateSpeedFromThrottle(0);
}, 100);

// ═══════════════ RACER: BOOST BUTTON ═══════════════
(function setupBoost() {
    const btn = document.getElementById('boost-btn');
    if (!btn) return;

    function press() {
        btn.classList.add('pressed');
        socket.emit('move', { direction: 'special' });
    }
    function release() {
        btn.classList.remove('pressed');
    }

    btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('touchcancel', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
})();
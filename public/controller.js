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
            surviveCtrl.classList.remove('hidden');
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
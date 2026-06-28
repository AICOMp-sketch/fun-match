const socket = io("https://fun-match-production.up.railway.app");

const joinScreen = document.getElementById("join-screen");
const gameSelect = document.getElementById("game-select");
const surviveCtrl = document.getElementById("survive-controller");
const fighterCtrl = document.getElementById("fighter-controller");
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
});

socket.on("join-error", (data) => {
    errorMsg.textContent = data.message;
});

// Game type selection
document.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const game = btn.dataset.game;
        gameSelect.classList.add('hidden');

        if (game === 'survive') {
            surviveCtrl.classList.remove('hidden');
        } else if (game === 'fighter') {
            fighterCtrl.classList.remove('hidden');
        } else if (game === 'racer') {
            document.getElementById('racer-controller').classList.remove('hidden');
        }
    });
});

// Button controls
let movementInterval = null;

function sendAction(direction, hold = false) {
    socket.emit("move", { direction });

    if (hold) {
        movementInterval = setInterval(() => {
            socket.emit("move", { direction });
        }, 50);
    }
}

function stopMoving() {
    if (movementInterval) {
        clearInterval(movementInterval);
        movementInterval = null;
    }
}

document.querySelectorAll('.ctrl-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    const isMovement = ['up', 'down', 'left', 'right'].includes(dir);
    const isHoldable = btn.classList.contains('dpad-btn') || btn.classList.contains('fight-dpad');

    btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        sendAction(dir, isHoldable && isMovement);
    });

    btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        stopMoving();
    });

    btn.addEventListener("mousedown", () => sendAction(dir, isHoldable && isMovement));
    btn.addEventListener("mouseup", stopMoving);
    btn.addEventListener("mouseleave", stopMoving);
});
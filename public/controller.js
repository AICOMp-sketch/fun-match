const socket = io("https://fun-match-production.up.railway.app");

const joinScreen = document.getElementById("join-screen");
const controllerScreen = document.getElementById("controller-screen");
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
  controllerScreen.classList.remove("hidden");
  document.getElementById("welcome").textContent = `Hi ${data.playerName}! 🎮`;
});

socket.on("join-error", (data) => {
  errorMsg.textContent = data.message;
});

let movementInterval = null;

function startMoving(direction) {
  socket.emit("move", { direction });
  movementInterval = setInterval(() => {
    socket.emit("move", { direction });
  }, 50);
}

function stopMoving() {
  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }
}

document.querySelectorAll(".btn").forEach(btn => {
  const direction = btn.dataset.dir;

  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startMoving(direction);
  });

  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopMoving();
  });

  btn.addEventListener("mousedown", () => startMoving(direction));
  btn.addEventListener("mouseup", stopMoving);
  btn.addEventListener("mouseleave", stopMoving);
});
const socket = io("https://fun-match-production.up.railway.app");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const PLAYER_SIZE = 22;
const BOT_SIZE = 18;
const MOVE_SPEED = 6;
const BOT_SPEED = 2;

const players = {};
const bots = [];

let gameRunning = false;
let startTime = 0;
let elapsedTime = 0;

// ─── Socket Events ─────────────────────────

socket.on("connect", () => {
  console.log("✅ Connected to server!");
  socket.emit("create-room");
});

socket.on("room-created", (data) => {
  document.getElementById("room-code").textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  player.alive = true;
  players[player.id] = player;
  updatePlayersList();

  // Start game when first player joins
  if (!gameRunning) {
    startGame();
  }
});

socket.on("player-moved", (data) => {
  const player = players[data.playerId];
  if (!player || !player.alive) return;

  switch (data.direction) {
    case "up":    player.y -= MOVE_SPEED; break;
    case "down":  player.y += MOVE_SPEED; break;
    case "left":  player.x -= MOVE_SPEED; break;
    case "right": player.x += MOVE_SPEED; break;
  }

  player.x = Math.max(PLAYER_SIZE, Math.min(canvas.width - PLAYER_SIZE, player.x));
  player.y = Math.max(PLAYER_SIZE, Math.min(canvas.height - PLAYER_SIZE, player.y));
});

socket.on("player-left", (data) => {
  delete players[data.playerId];
  updatePlayersList();
});

// ─── Game Logic ─────────────────────────

function startGame() {
  gameRunning = true;
  startTime = Date.now();
  bots.length = 0;
  document.getElementById("game-over").classList.add("hidden");

  // Spawn first bot
  spawnBot();

  // Spawn a new bot every 8 seconds
  spawnInterval = setInterval(() => {
    if (gameRunning) spawnBot();
  }, 8000);
}

function spawnBot() {
  // Spawn from random edge
  const edge = Math.floor(Math.random() * 4);
  let x, y;

  switch (edge) {
    case 0: x = 0; y = Math.random() * canvas.height; break;
    case 1: x = canvas.width; y = Math.random() * canvas.height; break;
    case 2: x = Math.random() * canvas.width; y = 0; break;
    case 3: x = Math.random() * canvas.width; y = canvas.height; break;
  }

  bots.push({ x, y });
  document.getElementById("bot-count").textContent = bots.length;
}

function updateBots() {
  bots.forEach(bot => {
    // Find nearest alive player
    let nearestPlayer = null;
    let nearestDistance = Infinity;

    for (const id in players) {
      const player = players[id];
      if (!player.alive) continue;

      const dx = player.x - bot.x;
      const dy = player.y - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }

    if (!nearestPlayer) return;

    // Move toward player
    const dx = nearestPlayer.x - bot.x;
    const dy = nearestPlayer.y - bot.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      bot.x += (dx / distance) * BOT_SPEED;
      bot.y += (dy / distance) * BOT_SPEED;
    }

    // Check collision
    if (distance < PLAYER_SIZE + BOT_SIZE) {
      nearestPlayer.alive = false;
      checkGameOver();
    }
  });
}

function checkGameOver() {
  updatePlayersList();

  const alivePlayers = Object.values(players).filter(p => p.alive);
  if (alivePlayers.length === 0 && Object.keys(players).length > 0) {
    endGame();
  }
}

function endGame() {
  gameRunning = false;
  clearInterval(spawnInterval);

  document.getElementById("final-score").textContent = 
    `You survived for ${elapsedTime} seconds`;
  document.getElementById("game-over").classList.remove("hidden");
}

function updatePlayersList() {
  const list = document.getElementById("players-list");
  list.innerHTML = "";

  for (const id in players) {
    const player = players[id];
    const li = document.createElement("li");
    if (!player.alive) li.classList.add("dead");
    li.innerHTML = `
      <span class="player-dot" style="background:${player.color}"></span>
      <span>${player.name}</span>
    `;
    list.appendChild(li);
  }
}

// ─── Restart Button ─────────────────────────

document.getElementById("restart-btn").addEventListener("click", () => {
  // Revive all players
  for (const id in players) {
    players[id].alive = true;
    players[id].x = 400;
    players[id].y = 250;
  }
  startGame();
});

// ─── Drawing ─────────────────────────

let spawnInterval = null;

function draw() {
  // Background
  ctx.fillStyle = "#16213e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Update bots
  if (gameRunning) {
    updateBots();
    elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("timer").textContent = elapsedTime;
  }

  // Draw bots
  bots.forEach(bot => {
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, BOT_SIZE, 0, Math.PI * 2);
    ctx.fillStyle = "#e94560";
    ctx.fill();
    ctx.strokeStyle = "#ff0044";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(bot.x - 5, bot.y - 3, 3, 0, Math.PI * 2);
    ctx.arc(bot.x + 5, bot.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw players
  for (const id in players) {
    const player = players[id];

    ctx.globalAlpha = player.alive ? 1 : 0.3;

    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_SIZE, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(player.name, player.x, player.y - PLAYER_SIZE - 8);

    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(draw);
}

draw();
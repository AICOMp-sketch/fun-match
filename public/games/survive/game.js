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
let spawnInterval = null;

socket.on("connect", () => {
  console.log("✅ Connected!");
  socket.emit("create-room");
});

socket.on("room-created", (data) => {
  document.getElementById("room-code").textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  player.alive = true;
  players[player.id] = player;
  updatePlayersList();
  if (!gameRunning) startGame();
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

function startGame() {
  gameRunning = true;
  startTime = Date.now();
  bots.length = 0;
  document.getElementById("game-over").classList.add("hidden");

  spawnBot();
  spawnInterval = setInterval(() => {
    if (gameRunning) spawnBot();
  }, 8000);
}

function spawnBot() {
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

    const dx = nearestPlayer.x - bot.x;
    const dy = nearestPlayer.y - bot.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      bot.x += (dx / distance) * BOT_SPEED;
      bot.y += (dy / distance) * BOT_SPEED;
    }

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

  // Save stats
  const highScore = parseInt(localStorage.getItem('highScore') || 0);
  if (elapsedTime > highScore) {
    localStorage.setItem('highScore', elapsedTime);
  }
  const games = parseInt(localStorage.getItem('gamesPlayed') || 0);
  localStorage.setItem('gamesPlayed', games + 1);
  const totalTime = parseInt(localStorage.getItem('totalTime') || 0);
  localStorage.setItem('totalTime', totalTime + elapsedTime);

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

document.getElementById("restart-btn").addEventListener("click", () => {
  for (const id in players) {
    players[id].alive = true;
    players[id].x = 400;
    players[id].y = 250;
  }
  startGame();
});

function draw() {
  ctx.fillStyle = "#151b3d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  if (gameRunning) {
    updateBots();
    elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("timer").textContent = elapsedTime;
  }

  bots.forEach(bot => {
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, BOT_SIZE, 0, Math.PI * 2);
    ctx.fillStyle = "#e94560";
    ctx.fill();
    ctx.strokeStyle = "#ff0044";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(bot.x - 5, bot.y - 3, 3, 0, Math.PI * 2);
    ctx.arc(bot.x + 5, bot.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  });

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
    ctx.font = "bold 14px Poppins";
    ctx.textAlign = "center";
    ctx.fillText(player.name, player.x, player.y - PLAYER_SIZE - 8);

    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(draw);
}

draw();
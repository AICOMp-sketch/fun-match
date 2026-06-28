const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  console.log('📐 Canvas resized:', canvas.width, 'x', canvas.height);
}
window.addEventListener('resize', resizeCanvas);

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting',
  totalLaps: 3,
  raceTime: 0,
  raceStartTime: 0,
  isBotMode: false,
  particles: [],
  skidMarks: []
};

const camera = { x: 0, y: 0 };

// ════════ TRACK ════════
const TRACK = {
  cx: 900,
  cy: 600,
  outerRX: 700,
  outerRY: 480,
  innerRX: 380,
  innerRY: 250
};

// ════════ CARS ════════
const COLORS = ['#00e0ff', '#ff7b00', '#aaff00', '#ff3860'];
const cars = {};
let LOCAL_PLAYER_ID = null;

class Car {
  constructor(id, name, colorIndex, isBot = false) {
    this.id = id;
    this.name = name;
    this.color = COLORS[colorIndex % COLORS.length];
    this.colorIndex = colorIndex;
    this.isBot = isBot;

    const startSpacing = 50;
    this.x = TRACK.cx - 75 + (colorIndex * startSpacing);
    this.y = TRACK.cy - (TRACK.outerRY + TRACK.innerRY) / 2;
    this.angle = 0;

    this.speed = 0;
    this.maxSpeed = 4.5;
    this.acceleration = 0.15;
    this.friction = 0.97;
    this.turnSpeed = 0.05;

    this.input = { accel: false, brake: false, left: false, right: false };

    this.lap = 0;
    this.checkpoint = 3;
    this.lapTimes = [];
    this.lastLapStart = 0;
    this.finished = false;
    this.finishTime = 0;
    this.position = 1;

    this.boostFuel = 100;
    this.boosting = false;
    this.crashed = false;
    this.crashTimer = 0;

    console.log(`🚗 Car created: ${name} (${isBot ? 'BOT' : 'PLAYER'}) at (${this.x.toFixed(0)}, ${this.y.toFixed(0)})`);
  }

  update() {
    if (this.finished) {
      this.speed *= 0.92;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
      return;
    }

    if (this.crashed) {
      this.crashTimer--;
      if (this.crashTimer <= 0) this.crashed = false;
      this.speed *= 0.85;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
      return;
    }

    if (this.isBot && GAME.state === 'racing') {
      this.botThink();
    }

    let currentMaxSpeed = this.maxSpeed;
    if (this.boosting && this.boostFuel > 0) {
      currentMaxSpeed = this.maxSpeed * 1.6;
      this.boostFuel -= 0.8;
      if (this.boostFuel <= 0) {
        this.boostFuel = 0;
        this.boosting = false;
      }
      if (Math.random() < 0.5) {
        GAME.particles.push({
          x: this.x - Math.cos(this.angle) * 20,
          y: this.y - Math.sin(this.angle) * 20,
          vx: -Math.cos(this.angle) * 3 + (Math.random() - 0.5) * 2,
          vy: -Math.sin(this.angle) * 3 + (Math.random() - 0.5) * 2,
          life: 20,
          color: this.color,
          size: Math.random() * 4 + 3
        });
      }
    }

    if (this.input.accel) {
      this.speed += this.acceleration;
    }
    if (this.input.brake) {
      this.speed -= this.acceleration * 1.5;
    }

    this.speed = Math.max(-1.5, Math.min(currentMaxSpeed, this.speed));
    this.speed *= this.friction;

    if (Math.abs(this.speed) > 0.3) {
      const turnAmount = this.turnSpeed * (this.speed / this.maxSpeed);
      if (this.input.left) this.angle -= turnAmount;
      if (this.input.right) this.angle += turnAmount;
    }

    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    this.checkTrackCollision();
    this.checkCheckpoints();

    if (Math.abs(this.speed) > 2 && (this.input.left || this.input.right)) {
      if (Math.random() < 0.4) {
        GAME.skidMarks.push({
          x: this.x - Math.cos(this.angle) * 12,
          y: this.y - Math.sin(this.angle) * 12,
          life: 300
        });
      }
    }
  }

  botThink() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const angleToCenter = Math.atan2(dy, dx);
    const targetAngle = angleToCenter + Math.PI / 2;

    let angleDiff = targetAngle - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    this.input.left = angleDiff < -0.05;
    this.input.right = angleDiff > 0.05;
    this.input.accel = true;
    this.input.brake = false;

    if (this.boostFuel > 60 && Math.random() < 0.005) {
      this.boosting = true;
      setTimeout(() => this.boosting = false, 1200);
    }
  }

  checkTrackCollision() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const outerDist = (dx * dx) / (TRACK.outerRX * TRACK.outerRX) + (dy * dy) / (TRACK.outerRY * TRACK.outerRY);
    const innerDist = (dx * dx) / (TRACK.innerRX * TRACK.innerRX) + (dy * dy) / (TRACK.innerRY * TRACK.innerRY);

    let hitWall = false;

    if (outerDist > 0.98) {
      const factor = Math.sqrt(0.98 / outerDist);
      this.x = TRACK.cx + dx * factor;
      this.y = TRACK.cy + dy * factor;
      hitWall = true;
    }

    if (innerDist < 1.05 && innerDist > 0) {
      const factor = Math.sqrt(1.05 / innerDist);
      this.x = TRACK.cx + dx * factor;
      this.y = TRACK.cy + dy * factor;
      hitWall = true;
    }

    if (hitWall) {
      this.speed *= 0.5;
      if (Math.abs(this.speed) > 1.8 && !this.crashed) {
        if (this.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.crash();
        this.crashed = true;
        this.crashTimer = 15;
        for (let i = 0; i < 8; i++) {
          GAME.particles.push({
            x: this.x, y: this.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 25,
            color: '#ffaa00',
            size: Math.random() * 4 + 2
          });
        }
      }
    }
  }

  checkCheckpoints() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const angle = Math.atan2(dy, dx);

    let currentZone;
    if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) currentZone = 0;
    else if (angle >= -Math.PI / 4 && angle < Math.PI / 4) currentZone = 1;
    else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) currentZone = 2;
    else currentZone = 3;

    const expectedNext = (this.checkpoint + 1) % 4;

    if (currentZone === expectedNext) {
      this.checkpoint = currentZone;

      if (currentZone === 0) {
        this.lap++;
        console.log(`🏁 ${this.name} lap ${this.lap}`);

        if (this.lap > 1) {
          const lapTime = (Date.now() - this.lastLapStart) / 1000;
          this.lapTimes.push(lapTime);
          if (this.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.lap();
        }

        this.lastLapStart = Date.now();

        if (this.lap > GAME.totalLaps) {
          this.finishRace();
        }
      }
    }
  }

  finishRace() {
    if (this.finished) return;
    this.finished = true;
    this.finishTime = (Date.now() - GAME.raceStartTime) / 1000;
    console.log(`🏆 ${this.name} finished in ${this.finishTime.toFixed(2)}s`);
    if (this.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.finish();
    checkRaceEnd();
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-18, -10, 36, 24);

    if (this.boosting) {
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(-22, -6);
      ctx.lineTo(-32 + Math.random() * 4, 0);
      ctx.lineTo(-22, 6);
      ctx.fill();

      ctx.fillStyle = '#ff7b00';
      ctx.beginPath();
      ctx.moveTo(-22, -4);
      ctx.lineTo(-28 + Math.random() * 3, 0);
      ctx.lineTo(-22, 4);
      ctx.fill();
    }

    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.color;
    ctx.fillRect(-20, -12, 40, 24);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-12, -10, 18, 20);

    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(16, -10, 4, 4);
    ctx.fillRect(16, 6, 4, 4);

    ctx.fillStyle = this.color;
    ctx.fillRect(-22, -14, 4, 28);

    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x, this.y - 25);
  }
}

function drawTrack() {
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(camera.x - 200, camera.y - 200, canvas.width + 400, canvas.height + 400);

  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRX, TRACK.outerRY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0d4a1a';
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX, TRACK.innerRY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  GAME.skidMarks.forEach(s => {
    ctx.globalAlpha = (s.life / 300) * 0.6;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRX, TRACK.outerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX, TRACK.innerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 6;
  const segments = 50;
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? '#ff3860' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX + 4, TRACK.innerRY + 4, 0, a1, a2);
    ctx.stroke();
  }

  const lineY = TRACK.cy - (TRACK.outerRY + TRACK.innerRY) / 2;
  const lineX1 = TRACK.cx - 150;
  const lineLen = 300;
  const checkerSize = 12;

  for (let i = 0; i < lineLen / checkerSize; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(lineX1 + (i * checkerSize), lineY - checkerSize + (j * checkerSize), checkerSize, checkerSize);
    }
  }

  GAME.particles.forEach(p => {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function updateCamera() {
  const localCar = cars[LOCAL_PLAYER_ID];
  if (localCar) {
    const targetX = localCar.x - canvas.width / 2;
    const targetY = localCar.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.15;
    camera.y += (targetY - camera.y) * 0.15;
  } else {
    camera.x = TRACK.cx - canvas.width / 2;
    camera.y = TRACK.cy - canvas.height / 2;
  }
}

function updateLeaderboard() {
  const sorted = Object.values(cars).sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.checkpoint - a.checkpoint;
  });

  sorted.forEach((car, i) => car.position = i + 1);

  const lb = document.getElementById('leaderboard');
  lb.innerHTML = sorted.map((car, i) => `
    <div class="leaderboard-row">
      <span class="lb-pos">${i + 1}</span>
      <span class="lb-color" style="background:${car.color}"></span>
      <span class="lb-name">${car.name}</span>
      <span class="lb-lap">L${Math.min(Math.max(car.lap, 0), GAME.totalLaps)}</span>
    </div>
  `).join('');

  const localCar = cars[LOCAL_PLAYER_ID];
  if (localCar) {
    document.getElementById('position').textContent = '#' + localCar.position;
    document.getElementById('current-lap').textContent = Math.min(Math.max(localCar.lap, 1), GAME.totalLaps);
  }
}

function updateRaceTime() {
  if (GAME.state !== 'racing') return;
  const elapsed = (Date.now() - GAME.raceStartTime) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  document.getElementById('race-time').textContent =
    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startCountdown() {
  console.log('🏁 Starting countdown...');
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('race-screen').classList.add('active');

  // Resize canvas AFTER race screen is visible
  setTimeout(() => {
    resizeCanvas();
  }, 50);

  GAME.state = 'countdown';

  // Reset all cars to starting positions
  let idx = 0;
  Object.values(cars).forEach(car => {
    car.x = TRACK.cx - 75 + (idx * 50);
    car.y = TRACK.cy - (TRACK.outerRY + TRACK.innerRY) / 2;
    car.angle = 0;
    car.speed = 0;
    car.lap = 0;
    car.checkpoint = 3;
    car.lapTimes = [];
    car.finished = false;
    car.crashed = false;
    car.boostFuel = 100;
    idx++;
  });

  if (typeof startEngine === 'function') startEngine();

  const countdownEl = document.getElementById('countdown');
  const countdownText = document.getElementById('countdown-text');

  let count = 3;
  countdownEl.classList.remove('hidden');
  countdownText.textContent = count;
  if (typeof Sounds !== 'undefined') Sounds.countdown();

  const interval = setInterval(() => {
    count--;
    console.log('Countdown:', count);
    if (count > 0) {
      countdownText.textContent = count;
      if (typeof Sounds !== 'undefined') Sounds.countdown();
      const h1 = countdownEl.querySelector('h1');
      h1.style.animation = 'none';
      void h1.offsetWidth;
      h1.style.animation = 'countdownPop 1s ease-out';
    } else if (count === 0) {
      countdownText.textContent = 'GO!';
      if (typeof Sounds !== 'undefined') Sounds.go();
      const h1 = countdownEl.querySelector('h1');
      h1.style.animation = 'none';
      void h1.offsetWidth;
      h1.style.animation = 'countdownPop 1s ease-out';
    } else {
      countdownEl.classList.add('hidden');
      clearInterval(interval);
      GAME.state = 'racing';
      GAME.raceStartTime = Date.now();
      Object.values(cars).forEach(c => c.lastLapStart = Date.now());
      console.log('🏎️ RACE STARTED! State:', GAME.state);
      console.log('Local Player ID:', LOCAL_PLAYER_ID);
      console.log('Cars:', Object.keys(cars));
    }
  }, 1000);
}

function checkRaceEnd() {
  const localCar = cars[LOCAL_PLAYER_ID];
  if (localCar && localCar.finished) {
    setTimeout(showFinishScreen, 2500);
  }
}

function showFinishScreen() {
  if (GAME.state === 'finished') return;
  GAME.state = 'finished';
  if (typeof stopEngine === 'function') stopEngine();

  const sorted = Object.values(cars).sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    return 0;
  });

  document.getElementById('race-screen').classList.remove('active');
  document.getElementById('finish-screen').classList.add('active');

  if (sorted[0]) document.getElementById('place-1').textContent = sorted[0].name;
  if (sorted[1]) document.getElementById('place-2').textContent = sorted[1].name;
  if (sorted[2]) document.getElementById('place-3').textContent = sorted[2].name;

  const localCar = cars[LOCAL_PLAYER_ID];
  const stats = document.getElementById('finish-stats');
  if (localCar) {
    const bestLap = localCar.lapTimes.length > 0 ? Math.min(...localCar.lapTimes).toFixed(2) : 'N/A';
    stats.innerHTML = `
      <div class="stat-row">
        <span class="label">Your Position</span>
        <span class="value">#${localCar.position}</span>
      </div>
      <div class="stat-row">
        <span class="label">Total Time</span>
        <span class="value">${localCar.finished ? localCar.finishTime.toFixed(2) + 's' : 'DNF'}</span>
      </div>
      <div class="stat-row">
        <span class="label">Best Lap</span>
        <span class="value">${bestLap}${bestLap !== 'N/A' ? 's' : ''}</span>
      </div>
      <div class="stat-row">
        <span class="label">Laps Completed</span>
        <span class="value">${Math.min(localCar.lap, GAME.totalLaps)}/${GAME.totalLaps}</span>
      </div>
    `;
  }
}

// ════════ SOCKET EVENTS ════════
socket.on("connect", () => {
  console.log("✅ Connected to server!");
  // Only create room if not already in bot mode
  if (!GAME.isBotMode) {
    socket.emit("create-room");
  }
});

socket.on("room-created", (data) => {
  console.log("🏠 Room created:", data.roomCode);
  const roomEl = document.getElementById("room-code");
  if (roomEl) roomEl.textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  // Don't accept players if in bot mode
  if (GAME.isBotMode) {
    console.log("Bot mode active, ignoring player");
    return;
  }

  if (Object.keys(cars).length >= 4) return;

  const colorIndex = Object.keys(cars).length;
  const car = new Car(player.id, player.name.toUpperCase(), colorIndex, false);
  cars[player.id] = car;

  if (!LOCAL_PLAYER_ID) LOCAL_PLAYER_ID = player.id;

  const slot = document.getElementById(`slot-${colorIndex + 1}`);
  if (slot) {
    slot.classList.add('filled');
    slot.querySelector('p').textContent = player.name;
    slot.querySelector('.status').textContent = 'Ready';
  }

  if (Object.keys(cars).length >= 2) {
    document.getElementById('start-race-btn').disabled = false;
  }
});

socket.on("player-moved", (data) => {
  const car = cars[data.playerId];
  if (!car) return;

  switch (data.direction) {
    case "left":
      car.input.left = true;
      setTimeout(() => car.input.left = false, 120);
      break;
    case "right":
      car.input.right = true;
      setTimeout(() => car.input.right = false, 120);
      break;
    case "punch":
      car.input.accel = true;
      setTimeout(() => car.input.accel = false, 250);
      break;
    case "kick":
      car.input.brake = true;
      setTimeout(() => car.input.brake = false, 250);
      break;
    case "special":
      if (car.boostFuel >= 30 && !car.boosting) {
        car.boosting = true;
        if (car.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.boost();
        setTimeout(() => car.boosting = false, 1500);
      }
      break;
  }
});

socket.on("player-left", (data) => {
  if (cars[data.playerId]) delete cars[data.playerId];
});

// ════════ START BUTTONS ════════
document.getElementById('bot-race-btn').addEventListener('click', () => {
  console.log('🤖 Starting BOT RACE');

  // Clear cars
  Object.keys(cars).forEach(id => delete cars[id]);

  GAME.isBotMode = true;

  // Create local player FIRST
  const localCar = new Car('local-player', 'YOU', 0, false);
  cars['local-player'] = localCar;
  LOCAL_PLAYER_ID = 'local-player';
  console.log('👤 Local player ID set to:', LOCAL_PLAYER_ID);

  // Create 3 bots
  for (let i = 1; i <= 3; i++) {
    const bot = new Car(`bot-${i}`, `BOT ${i}`, i, true);
    cars[`bot-${i}`] = bot;
  }

  console.log('✅ All cars created:', Object.keys(cars));

  document.querySelectorAll('.racer-slot').forEach((slot, i) => {
    slot.classList.add('filled');
    slot.querySelector('p').textContent = i === 0 ? 'YOU' : `Bot ${i}`;
    slot.querySelector('.status').textContent = 'Ready';
  });

  setTimeout(startCountdown, 800);
});

document.getElementById('start-race-btn').addEventListener('click', () => {
  console.log('▶️ Starting multiplayer race');
  if (Object.keys(cars).length >= 2) {
    startCountdown();
  }
});

// ════════ KEYBOARD CONTROLS ════════
const keys = {};

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === ' ') {
    e.preventDefault();
    const car = cars[LOCAL_PLAYER_ID];
    if (car && car.boostFuel >= 30 && !car.boosting) {
      car.boosting = true;
      if (typeof Sounds !== 'undefined') Sounds.boost();
      setTimeout(() => car.boosting = false, 1500);
    }
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function applyKeyboardInput() {
  const car = cars[LOCAL_PLAYER_ID];
  if (!car || car.isBot) return;

  car.input.accel = keys['w'] || keys['arrowup'];
  car.input.brake = keys['s'] || keys['arrowdown'];
  car.input.left = keys['a'] || keys['arrowleft'];
  car.input.right = keys['d'] || keys['arrowright'];
}

// ════════ GAME LOOP ════════
function gameLoop() {
  Object.values(cars).forEach(c => {
    if (c.boostFuel < 100 && !c.boosting) c.boostFuel += 0.2;
  });

  if (GAME.state === 'racing') {
    applyKeyboardInput();
    Object.values(cars).forEach(c => c.update());
    updateLeaderboard();
    updateRaceTime();

    const local = cars[LOCAL_PLAYER_ID];
    if (local && typeof updateEngine === 'function') {
      updateEngine(Math.abs(local.speed) / local.maxSpeed);
    }
  }

  GAME.particles = GAME.particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life--;
    return p.life > 0;
  });

  GAME.skidMarks = GAME.skidMarks.filter(s => {
    s.life--;
    return s.life > 0;
  });

  updateCamera();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawTrack();
  Object.values(cars).forEach(c => c.draw());

  ctx.restore();

  requestAnimationFrame(gameLoop);
}
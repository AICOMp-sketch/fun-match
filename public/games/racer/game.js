const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || window.innerWidth;
  canvas.height = rect.height || window.innerHeight - 100;
}

const GAME = {
  state: 'waiting',
  totalLaps: 3,
  raceStartTime: 0,
  isBotMode: false,
  particles: [],
  skidMarks: []
};

const camera = { x: 0, y: 0 };

const TRACK = {
  cx: 1000,
  cy: 700,
  outerRX: 800,
  outerRY: 550,
  innerRX: 450,
  innerRY: 300
};

const COLORS = ['#00e0ff', '#ff7b00', '#aaff00', '#ff3860'];
const cars = {};
let LOCAL_PLAYER_ID = null;

class Car {
  constructor(id, name, colorIndex, isBot = false) {
    this.id = id;
    this.name = name;
    this.color = COLORS[colorIndex];
    this.colorIndex = colorIndex;
    this.isBot = isBot;

    const startX = TRACK.cx + (colorIndex - 1.5) * 60;
    this.x = startX;
    this.y = TRACK.cy - TRACK.outerRY + 100;
    this.angle = 0;

    this.speed = 0;
    this.maxSpeed = 4;
    this.acceleration = 0.12;
    this.friction = 0.96;
    this.turnSpeed = 0.06;

    this.input = { accel: false, brake: false, left: false, right: false };
    this.inputTimers = { accel: 0, brake: 0, left: 0, right: 0 };

    this.lap = 0;
    this.checkpoint = 0;
    this.lapTimes = [];
    this.lastLapStart = 0;
    this.finished = false;
    this.finishTime = 0;
    this.position = 1;

    this.boostFuel = 100;
    this.boosting = false;
    this.crashed = false;
    this.crashTimer = 0;
    this.stuckTimer = 0;

    console.log(`🚗 Created car: ${name} (id: ${id}, bot: ${isBot}, color: ${this.color})`);
  }

  resetForRace() {
    const startX = TRACK.cx + (this.colorIndex - 1.5) * 60;
    this.x = startX;
    this.y = TRACK.cy - TRACK.outerRY + 100;
    this.angle = 0;
    this.speed = 0;
    this.lap = 0;
    this.checkpoint = 0;
    this.lapTimes = [];
    this.finished = false;
    this.crashed = false;
    this.boostFuel = 100;
    this.boosting = false;
    this.stuckTimer = 0;
    this.input = { accel: false, brake: false, left: false, right: false };
    this.inputTimers = { accel: 0, brake: 0, left: 0, right: 0 };
  }

  update() {
    // Decrement input timers
    Object.keys(this.inputTimers).forEach(k => {
      if (this.inputTimers[k] > 0) {
        this.inputTimers[k]--;
        if (this.inputTimers[k] === 0) this.input[k] = false;
      }
    });

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

    if (this.input.accel) this.speed += this.acceleration;
    if (this.input.brake) this.speed -= this.acceleration * 1.5;

    this.speed = Math.max(-1, Math.min(currentMaxSpeed, this.speed));
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
      if (Math.random() < 0.5) {
        GAME.skidMarks.push({
          x: this.x - Math.cos(this.angle) * 12,
          y: this.y - Math.sin(this.angle) * 12,
          life: 200
        });
      }
    }
  }

  botThink() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const angleFromCenter = Math.atan2(dy, dx);
    const lookAhead = angleFromCenter + 0.3;

    const idealRX = (TRACK.outerRX + TRACK.innerRX) / 2;
    const idealRY = (TRACK.outerRY + TRACK.innerRY) / 2;

    const targetX = TRACK.cx + Math.cos(lookAhead) * idealRX;
    const targetY = TRACK.cy + Math.sin(lookAhead) * idealRY;

    const angleToTarget = Math.atan2(targetY - this.y, targetX - this.x);
    let angleDiff = angleToTarget - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    this.input.left = angleDiff < -0.05;
    this.input.right = angleDiff > 0.05;

    if (Math.abs(angleDiff) > 1.2) {
      this.input.accel = false;
      this.input.brake = true;
    } else {
      this.input.accel = true;
      this.input.brake = false;
    }

    if (Math.abs(this.speed) < 0.5) {
      this.stuckTimer++;
      if (this.stuckTimer > 60) {
        this.input.left = Math.random() > 0.5;
        this.input.right = !this.input.left;
        this.input.accel = true;
        this.input.brake = false;
        if (this.boostFuel > 30 && !this.boosting) {
          this.boosting = true;
          setTimeout(() => this.boosting = false, 1000);
        }
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }

    if (Math.abs(angleDiff) < 0.2 && this.boostFuel > 70 && Math.random() < 0.01 && !this.boosting) {
      this.boosting = true;
      setTimeout(() => this.boosting = false, 1500);
    }
  }

  checkTrackCollision() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const outerDist = (dx * dx) / (TRACK.outerRX * TRACK.outerRX) + (dy * dy) / (TRACK.outerRY * TRACK.outerRY);
    const innerDist = (dx * dx) / (TRACK.innerRX * TRACK.innerRX) + (dy * dy) / (TRACK.innerRY * TRACK.innerRY);

    let hitWall = false;

    if (outerDist > 0.98) {
      const factor = 0.98 / outerDist;
      this.x = TRACK.cx + dx * Math.sqrt(factor);
      this.y = TRACK.cy + dy * Math.sqrt(factor);
      hitWall = true;
    }

    if (innerDist < 1.02 && innerDist > 0) {
      const factor = 1.02 / innerDist;
      this.x = TRACK.cx + dx * Math.sqrt(factor);
      this.y = TRACK.cy + dy * Math.sqrt(factor);
      hitWall = true;
    }

    if (hitWall) {
      this.speed *= 0.5;
      if (Math.abs(this.speed) > 1.5 && !this.crashed) {
        if (this.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.crash();
        this.crashed = true;
        this.crashTimer = 20;
        for (let i = 0; i < 10; i++) {
          GAME.particles.push({
            x: this.x, y: this.y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 30,
            color: '#ffaa00',
            size: Math.random() * 5 + 2
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
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) currentZone = 1;
    else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) currentZone = 2;
    else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) currentZone = 0;
    else currentZone = 3;

    const expectedNext = (this.checkpoint + 1) % 4;
    if (currentZone === expectedNext) {
      this.checkpoint = currentZone;

      if (currentZone === 0 && this.lap > 0) {
        const lapTime = (Date.now() - this.lastLapStart) / 1000;
        this.lapTimes.push(lapTime);
        this.lastLapStart = Date.now();

        if (this.id === LOCAL_PLAYER_ID && typeof Sounds !== 'undefined') Sounds.lap();

        if (this.lap >= GAME.totalLaps) {
          this.finishRace();
        }
      }

      if (currentZone === 0) {
        this.lap++;
        if (this.lap === 1) this.lastLapStart = Date.now();
      }
    }
  }

  finishRace() {
    this.finished = true;
    this.finishTime = (Date.now() - GAME.raceStartTime) / 1000;
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
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.color;
    ctx.fillRect(-20, -12, 40, 24);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
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
    ctx.fillText(this.name, this.x, this.y - 30);
  }
}

function drawTrack() {
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(camera.x - 500, camera.y - 500, canvas.width + 1000, canvas.height + 1000);

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
    ctx.globalAlpha = (s.life / 200) * 0.6;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRX, TRACK.outerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX, TRACK.innerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 8;
  for (let i = 0; i < 60; i++) {
    const a1 = (i / 60) * Math.PI * 2;
    const a2 = ((i + 1) / 60) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? '#ff3860' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX + 6, TRACK.innerRY + 6, 0, a1, a2);
    ctx.stroke();
  }

  const lineY = TRACK.cy - TRACK.outerRY + 50;
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? 'white' : '#1f2937';
      ctx.fillRect(TRACK.cx - 175 + (i * 30), lineY + (j * 15), 30, 15);
    }
  }

  GAME.particles.forEach(p => {
    ctx.globalAlpha = p.life / 30;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// Add zoom to camera object
if (!camera.zoom) camera.zoom = 1;

function updateCamera() {
  const allCars = Object.values(cars).filter(c => !c.finished);

  // If no cars or not racing, center on track
  if (allCars.length === 0 || GAME.state !== 'racing') {
    const targetZoom = 1;
    camera.zoom += (targetZoom - camera.zoom) * 0.1;
    camera.x = TRACK.cx - (canvas.width / 2) / camera.zoom;
    camera.y = TRACK.cy - (canvas.height / 2) / camera.zoom;
    return;
  }

  // Find bounding box of all active cars
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  allCars.forEach(car => {
    if (car.x < minX) minX = car.x;
    if (car.x > maxX) maxX = car.x;
    if (car.y < minY) minY = car.y;
    if (car.y > maxY) maxY = car.y;
  });

  // Add padding around cars so they're not at the edge
  const padding = 200;
  const boxWidth = (maxX - minX) + padding * 2;
  const boxHeight = (maxY - minY) + padding * 2;

  // Center of the bounding box
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Calculate zoom needed to fit all cars
  const zoomX = canvas.width / boxWidth;
  const zoomY = canvas.height / boxHeight;
  let targetZoom = Math.min(zoomX, zoomY);

  // Clamp zoom (don't zoom in too much, don't zoom out too much)
  targetZoom = Math.max(0.4, Math.min(1.2, targetZoom));

  // Smooth zoom transition
  camera.zoom += (targetZoom - camera.zoom) * 0.05;

  // Calculate camera position (centered on all cars)
  const targetX = centerX - (canvas.width / 2) / camera.zoom;
  const targetY = centerY - (canvas.height / 2) / camera.zoom;

  // Smooth camera movement
  camera.x += (targetX - camera.x) * 0.1;
  camera.y += (targetY - camera.y) * 0.1;
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
  if (lb) {
    lb.innerHTML = sorted.map((car, i) => `
      <div class="leaderboard-row">
        <span class="lb-pos">${i + 1}</span>
        <span class="lb-color" style="background:${car.color}"></span>
        <span class="lb-name">${car.name}</span>
        <span class="lb-lap">L${Math.min(car.lap, GAME.totalLaps)}</span>
      </div>
    `).join('');
  }

  const localCar = cars[LOCAL_PLAYER_ID];
  if (localCar) {
    document.getElementById('position').textContent = '#' + localCar.position;
    document.getElementById('current-lap').textContent = Math.min(localCar.lap + 1, GAME.totalLaps);
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
  console.log('🏁 Starting countdown. Cars:', Object.keys(cars), 'Local:', LOCAL_PLAYER_ID);

  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('race-screen').classList.add('active');

  setTimeout(() => resizeCanvas(), 100);

  GAME.state = 'countdown';

  // IMPORTANT: Reset ALL cars to start positions
  Object.values(cars).forEach(car => car.resetForRace());

  if (typeof startEngine === 'function') startEngine();

  const countdownEl = document.getElementById('countdown');
  const countdownText = document.getElementById('countdown-text');

  let count = 3;
  countdownEl.classList.remove('hidden');
  countdownText.textContent = count;
  if (typeof Sounds !== 'undefined') Sounds.countdown();

  const interval = setInterval(() => {
    count--;
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
      console.log('🏎️ RACE STARTED! Cars:', Object.keys(cars).map(id => `${cars[id].name}(${id})`));
    }
  }, 1000);
}

function checkRaceEnd() {
  const localFinished = cars[LOCAL_PLAYER_ID] && cars[LOCAL_PLAYER_ID].finished;
  if (localFinished) {
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
      <div class="stat-row"><span class="label">Your Position</span><span class="value">#${localCar.position}</span></div>
      <div class="stat-row"><span class="label">Total Time</span><span class="value">${localCar.finished ? localCar.finishTime.toFixed(2) + 's' : 'DNF'}</span></div>
      <div class="stat-row"><span class="label">Best Lap</span><span class="value">${bestLap}${bestLap !== 'N/A' ? 's' : ''}</span></div>
      <div class="stat-row"><span class="label">Laps Completed</span><span class="value">${Math.min(localCar.lap, GAME.totalLaps)}/${GAME.totalLaps}</span></div>
    `;
  }
}

// ════════ SOCKET EVENTS ════════
socket.on("connect", () => {
  console.log("✅ Connected to server!");
  socket.emit("create-room");
});

socket.on("room-created", (data) => {
  console.log("🏠 Room:", data.roomCode);
  document.getElementById("room-code").textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  console.log("👤 Player joined:", player.name, player.id);

  if (GAME.isBotMode) {
    console.log("⚠️ Bot mode active - ignoring");
    return;
  }

  const colorIndex = Object.keys(cars).length;
  if (colorIndex >= 4) return;

  const car = new Car(player.id, player.name.toUpperCase(), colorIndex, false);
  cars[player.id] = car;

  // First player joining IS the player (sets local player)
  if (!LOCAL_PLAYER_ID) {
    LOCAL_PLAYER_ID = player.id;
    console.log("🎯 Set LOCAL_PLAYER_ID =", LOCAL_PLAYER_ID);
  }

  const slot = document.getElementById(`slot-${colorIndex + 1}`);
  if (slot) {
    slot.classList.add('filled');
    slot.querySelector('p').textContent = player.name;
    slot.querySelector('.status').textContent = 'Ready';
  }

  // Enable start button when at least 1 player joined
  document.getElementById('start-race-btn').disabled = false;
});

// ════════ PHONE/PLAYER CONTROLS ════════
socket.on("player-moved", (data) => {
  const car = cars[data.playerId];
  if (!car) {
    console.log("⚠️ No car for player:", data.playerId);
    return;
  }

  const HOLD_FRAMES = 15;

  console.log(`🎮 ${car.name} input: ${data.direction}`);

  switch (data.direction) {
    case "up":
    case "punch":
      car.input.accel = true;
      car.inputTimers.accel = HOLD_FRAMES;
      break;

    case "down":
    case "kick":
      car.input.brake = true;
      car.inputTimers.brake = HOLD_FRAMES;
      break;

    case "left":
      car.input.left = true;
      car.inputTimers.left = HOLD_FRAMES;
      break;

    case "right":
      car.input.right = true;
      car.inputTimers.right = HOLD_FRAMES;
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

// ════════ BOT RACE BUTTON ════════
document.getElementById('bot-race-btn').addEventListener('click', () => {
  console.log('🤖 BOT RACE clicked');

  // Clear all cars
  Object.keys(cars).forEach(id => delete cars[id]);

  GAME.isBotMode = true;

  // Create local player car
  const localCar = new Car('local-player', 'YOU', 0, false);
  cars['local-player'] = localCar;
  LOCAL_PLAYER_ID = 'local-player';

  // Create 3 bots
  for (let i = 1; i <= 3; i++) {
    cars[`bot-${i}`] = new Car(`bot-${i}`, `BOT ${i}`, i, true);
  }

  document.querySelectorAll('.racer-slot').forEach((slot, i) => {
    slot.classList.add('filled');
    slot.querySelector('p').textContent = i === 0 ? 'YOU' : `Bot ${i}`;
    slot.querySelector('.status').textContent = 'Ready';
  });

  setTimeout(startCountdown, 800);
});

// ════════ START MULTIPLAYER RACE ════════
document.getElementById('start-race-btn').addEventListener('click', () => {
  console.log('▶️ START RACE clicked. Cars:', Object.keys(cars).length);

  if (Object.keys(cars).length === 0) {
    alert('Need at least 1 player to start!');
    return;
  }

  // If only 1 player, fill remaining slots with bots
  const playerCount = Object.keys(cars).length;
  if (playerCount < 4) {
    const startIdx = playerCount;
    for (let i = startIdx; i < 4; i++) {
      const botId = `bot-fill-${i}`;
      cars[botId] = new Car(botId, `BOT ${i}`, i, true);
    }
    console.log('🤖 Added bots to fill slots');
  }

  startCountdown();
});

// ════════ KEYBOARD ════════
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') {
    e.preventDefault();
    const car = cars[LOCAL_PLAYER_ID];
    if (car && car.boostFuel >= 30) {
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

  if (keys['w'] || keys['arrowup']) { car.input.accel = true; car.inputTimers.accel = 2; }
  if (keys['s'] || keys['arrowdown']) { car.input.brake = true; car.inputTimers.brake = 2; }
  if (keys['a'] || keys['arrowleft']) { car.input.left = true; car.inputTimers.left = 2; }
  if (keys['d'] || keys['arrowright']) { car.input.right = true; car.inputTimers.right = 2; }
}

// ════════ GAME LOOP ════════
function gameLoop() {
  Object.values(cars).forEach(c => {
    if (c.boostFuel < 100 && !c.boosting) c.boostFuel += 0.15;
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
  
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawTrack();
  Object.values(cars).forEach(c => c.draw());

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

resizeCanvas();
window.addEventListener('resize', () => {
  if (GAME.state === 'racing' || GAME.state === 'countdown') resizeCanvas();
});

requestAnimationFrame(gameLoop);
console.log('🎮 Racing game loaded');
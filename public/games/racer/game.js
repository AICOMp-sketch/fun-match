const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
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

// Camera follows the local player
const camera = { x: 0, y: 0, scale: 1 };

// ════════ TRACK ════════
const TRACK = {
  cx: 1000,
  cy: 700,
  outerRX: 800,
  outerRY: 550,
  innerRX: 450,
  innerRY: 300,
  startLine: { x1: 1000, y1: 150, x2: 1000, y2: 400 }
};

// ════════ CARS ════════
const COLORS = ['#00e0ff', '#ff7b00', '#aaff00', '#ff3860'];
const cars = {};

class Car {
  constructor(id, name, colorIndex, isBot = false) {
    this.id = id;
    this.name = name;
    this.color = COLORS[colorIndex];
    this.colorIndex = colorIndex;
    this.isBot = isBot;

    // Starting position on start line
    const startX = TRACK.cx + (colorIndex - 1.5) * 60;
    this.x = startX;
    this.y = TRACK.cy - TRACK.outerRY + 100;
    this.angle = 0; // facing right initially

    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.maxSpeed = 4;
    this.acceleration = 0.12;
    this.friction = 0.96;
    this.turnSpeed = 0.06;

    this.input = { accel: false, brake: false, left: false, right: false, boost: false };

    this.lap = 0;
    this.checkpoint = 0; // 0 = top, 1 = right, 2 = bottom, 3 = left
    this.lapTimes = [];
    this.lastLapStart = 0;
    this.finished = false;
    this.finishTime = 0;
    this.position = 1;

    this.boostFuel = 0; // 0-100
    this.boosting = false;
    this.crashed = false;
    this.crashTimer = 0;
  }

  update() {
    if (this.finished) {
      this.speed *= 0.9;
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

    // Bot AI
    if (this.isBot && GAME.state === 'racing') {
      this.botThink();
    }

    // Apply input
    let currentMaxSpeed = this.maxSpeed;
    if (this.boosting && this.boostFuel > 0) {
      currentMaxSpeed = this.maxSpeed * 1.6;
      this.boostFuel -= 0.8;
      if (this.boostFuel <= 0) {
        this.boostFuel = 0;
        this.boosting = false;
      }
      // Boost particles
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

    this.speed = Math.max(-1, Math.min(currentMaxSpeed, this.speed));
    this.speed *= this.friction;

    // Steering (only when moving)
    if (Math.abs(this.speed) > 0.3) {
      const turnAmount = this.turnSpeed * (this.speed / this.maxSpeed);
      if (this.input.left) this.angle -= turnAmount;
      if (this.input.right) this.angle += turnAmount;
    }

    // Move
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    // Track collision
    this.checkTrackCollision();

    // Checkpoint detection
    this.checkCheckpoints();

    // Skid marks when turning hard
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
    // Simple AI: follow track in oval pattern
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;
    const angleToCenter = Math.atan2(dy, dx);

    // Target angle is perpendicular to center direction (counter-clockwise)
    const targetAngle = angleToCenter + Math.PI / 2;

    let angleDiff = targetAngle - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    this.input.left = angleDiff < -0.1;
    this.input.right = angleDiff > 0.1;
    this.input.accel = true;

    // Use boost randomly when available
    if (this.boostFuel > 50 && Math.random() < 0.01) {
      this.boosting = true;
    }
  }

  checkTrackCollision() {
    const dx = this.x - TRACK.cx;
    const dy = this.y - TRACK.cy;

    // Check outer boundary
    const outerDist = (dx * dx) / (TRACK.outerRX * TRACK.outerRX) + (dy * dy) / (TRACK.outerRY * TRACK.outerRY);
    // Check inner boundary
    const innerDist = (dx * dx) / (TRACK.innerRX * TRACK.innerRX) + (dy * dy) / (TRACK.innerRY * TRACK.innerRY);

    let hitWall = false;

    if (outerDist > 0.98) {
      // Push back from outer wall
      const factor = 0.98 / outerDist;
      const newX = TRACK.cx + dx * Math.sqrt(factor);
      const newY = TRACK.cy + dy * Math.sqrt(factor);
      this.x = newX;
      this.y = newY;
      hitWall = true;
    }

    if (innerDist < 1.02 && innerDist > 0) {
      const factor = 1.02 / innerDist;
      const newX = TRACK.cx + dx * Math.sqrt(factor);
      const newY = TRACK.cy + dy * Math.sqrt(factor);
      this.x = newX;
      this.y = newY;
      hitWall = true;
    }

    if (hitWall) {
      this.speed *= 0.5;
      if (Math.abs(this.speed) > 1.5 && !this.crashed) {
        Sounds.crash();
        this.crashed = true;
        this.crashTimer = 20;
        // Crash particles
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
    const angle = Math.atan2(dy, dx); // -PI to PI

    // 4 checkpoints around the track
    let currentZone;
    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) currentZone = 1; // right
    else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) currentZone = 2; // bottom
    else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) currentZone = 0; // top
    else currentZone = 3; // left

    // Must hit checkpoints in order: 0 -> 1 -> 2 -> 3 -> 0 (= lap complete)
    const expectedNext = (this.checkpoint + 1) % 4;
    if (currentZone === expectedNext) {
      this.checkpoint = currentZone;

      // Completed full lap (went 0 -> 1 -> 2 -> 3 -> 0)
      if (currentZone === 0 && this.lap > 0) {
        // Lap complete
        const lapTime = (Date.now() - this.lastLapStart) / 1000;
        this.lapTimes.push(lapTime);
        this.lastLapStart = Date.now();

        if (this.id === LOCAL_PLAYER_ID) Sounds.lap();

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
    if (this.id === LOCAL_PLAYER_ID) Sounds.finish();
    checkRaceEnd();
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-18, -10, 36, 24);

    // Boost flames
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

    // Car body
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.color;
    ctx.fillRect(-20, -12, 40, 24);

    // Body details
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-12, -10, 18, 20); // windshield area

    // Headlights
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(16, -10, 4, 4);
    ctx.fillRect(16, 6, 4, 4);

    // Spoiler
    ctx.fillStyle = this.color;
    ctx.fillRect(-22, -14, 4, 28);

    ctx.restore();

    // Player name
    if (!this.isBot || this.id === LOCAL_PLAYER_ID) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, this.x, this.y - 30);
    }
  }
}

let LOCAL_PLAYER_ID = null;

// ════════ TRACK DRAWING ════════
function drawTrack() {
  // Grass background
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(camera.x - 100, camera.y - 100, canvas.width + 200, canvas.height + 200);

  // Outer track boundary (asphalt)
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRX, TRACK.outerRY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner grass area
  ctx.fillStyle = '#0d4a1a';
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX, TRACK.innerRY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Track edges (white lines)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.outerRX, TRACK.outerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX, TRACK.innerRY, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Red/white kerbs on inner edge
  ctx.lineWidth = 8;
  const segments = 60;
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? '#ff3860' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.innerRX + 6, TRACK.innerRY + 6, 0, a1, a2);
    ctx.stroke();
  }

  // Start/Finish line (checkered)
  const lineY = TRACK.cy - TRACK.outerRY + 50;
  ctx.fillStyle = 'white';
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillStyle = 'white';
      } else {
        ctx.fillStyle = '#1f2937';
      }
      ctx.fillRect(TRACK.cx - 175 + (i * 30), lineY + (j * 15), 30, 15);
    }
  }

  // Skid marks
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  GAME.skidMarks.forEach(s => {
    ctx.globalAlpha = (s.life / 200) * 0.6;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;

  // Particles
  GAME.particles.forEach(p => {
    ctx.globalAlpha = p.life / 30;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ════════ CAMERA ════════
function updateCamera() {
  const localCar = cars[LOCAL_PLAYER_ID];
  if (localCar) {
    // Smooth camera follow
    const targetX = localCar.x - canvas.width / 2;
    const targetY = localCar.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
  } else {
    // Center on track
    camera.x = TRACK.cx - canvas.width / 2;
    camera.y = TRACK.cy - canvas.height / 2;
  }
}

// ════════ UI UPDATES ════════
function updateLeaderboard() {
  const sorted = Object.values(cars).sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.lap !== b.lap) return b.lap - a.lap;
    // Same lap - check progress around track
    const distA = (a.checkpoint + 1) % 4;
    const distB = (b.checkpoint + 1) % 4;
    return distB - distA;
  });

  sorted.forEach((car, i) => car.position = i + 1);

  const lb = document.getElementById('leaderboard');
  lb.innerHTML = sorted.map((car, i) => `
    <div class="leaderboard-row">
      <span class="lb-pos">${i + 1}</span>
      <span class="lb-color" style="background:${car.color}; color:${car.color}"></span>
      <span class="lb-name">${car.name}</span>
      <span class="lb-lap">L${Math.min(car.lap, GAME.totalLaps)}</span>
    </div>
  `).join('');

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

// ════════ RACE FLOW ════════
function startCountdown() {
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('race-screen').classList.add('active');
  resizeCanvas();
  GAME.state = 'countdown';

  startEngine();

  const countdownEl = document.getElementById('countdown');
  const countdownText = document.getElementById('countdown-text');

  let count = 3;
  countdownEl.classList.remove('hidden');
  countdownText.textContent = count;
  Sounds.countdown();

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownText.textContent = count;
      Sounds.countdown();
      // Restart animation
      countdownEl.style.animation = 'none';
      void countdownEl.offsetWidth;
      countdownEl.style.animation = '';
      const h1 = countdownEl.querySelector('h1');
      h1.style.animation = 'none';
      void h1.offsetWidth;
      h1.style.animation = 'countdownPop 1s ease-out';
    } else if (count === 0) {
      countdownText.textContent = 'GO!';
      Sounds.go();
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
    }
  }, 1000);
}

function checkRaceEnd() {
  const allFinished = Object.values(cars).every(c => c.finished);
  const localFinished = cars[LOCAL_PLAYER_ID] && cars[LOCAL_PLAYER_ID].finished;

  if (allFinished || localFinished) {
    setTimeout(showFinishScreen, 2000);
  }
}

function showFinishScreen() {
  if (GAME.state === 'finished') return;
  GAME.state = 'finished';
  stopEngine();

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

  // Stats
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
  console.log("✅ Connected!");
  socket.emit("create-room");
});

socket.on("room-created", (data) => {
  document.getElementById("room-code").textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  const colorIndex = Object.keys(cars).length;
  if (colorIndex >= 4) return;

  const car = new Car(player.id, player.name.toUpperCase(), colorIndex, false);
  cars[player.id] = car;

  // First real player becomes local
  if (!LOCAL_PLAYER_ID) LOCAL_PLAYER_ID = player.id;

  // Update slot UI
  const slot = document.getElementById(`slot-${colorIndex + 1}`);
  slot.classList.add('filled');
  slot.querySelector('p').textContent = player.name;
  slot.querySelector('.status').textContent = 'Ready';

  if (Object.keys(cars).length >= 2) {
    document.getElementById('start-race-btn').disabled = false;
  }
});

socket.on("player-moved", (data) => {
  const car = cars[data.playerId];
  if (!car || GAME.state !== 'racing') return;

  switch (data.direction) {
    case "up":     car.input.accel = true; setTimeout(() => car.input.accel = false, 200); break;
    case "down":   car.input.brake = true; setTimeout(() => car.input.brake = false, 200); break;
    case "left":   car.input.left = true; setTimeout(() => car.input.left = false, 100); break;
    case "right":  car.input.right = true; setTimeout(() => car.input.right = false, 100); break;
    case "punch":  // GAS (hold)
      car.input.accel = true; setTimeout(() => car.input.accel = false, 300); break;
    case "kick":   // BRAKE
      car.input.brake = true; setTimeout(() => car.input.brake = false, 300); break;
    case "special": // BOOST
      if (car.boostFuel >= 30) {
        car.boosting = true;
        Sounds.boost();
        setTimeout(() => car.boosting = false, 1500);
      }
      break;
  }
});

// ════════ START BUTTONS ════════
document.getElementById('bot-race-btn').addEventListener('click', () => {
  GAME.isBotMode = true;

  // Create local player car
  const localCar = new Car('local-player', 'YOU', 0, false);
  cars['local-player'] = localCar;
  LOCAL_PLAYER_ID = 'local-player';

  // Create 3 bots
  for (let i = 1; i <= 3; i++) {
    const bot = new Car(`bot-${i}`, `BOT ${i}`, i, true);
    cars[`bot-${i}`] = bot;
  }

  // Fill slots
  document.querySelectorAll('.racer-slot').forEach((slot, i) => {
    slot.classList.add('filled');
    slot.querySelector('p').textContent = i === 0 ? 'YOU' : `Bot ${i}`;
    slot.querySelector('.status').textContent = 'Ready';
  });

  setTimeout(startCountdown, 800);
});

document.getElementById('start-race-btn').addEventListener('click', () => {
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
    if (car && car.boostFuel >= 30) {
      car.boosting = true;
      Sounds.boost();
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
  // Always slowly regenerate boost
  Object.values(cars).forEach(c => {
    if (c.boostFuel < 100 && !c.boosting) c.boostFuel += 0.15;
  });

  if (GAME.state === 'racing') {
    applyKeyboardInput();
    Object.values(cars).forEach(c => c.update());
    updateLeaderboard();
    updateRaceTime();

    // Update engine sound based on local car
    const local = cars[LOCAL_PLAYER_ID];
    if (local) {
      updateEngine(Math.abs(local.speed) / local.maxSpeed);
    }
  }

  // Update particles
  GAME.particles = GAME.particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life--;
    return p.life > 0;
  });

  // Update skid marks
  GAME.skidMarks = GAME.skidMarks.filter(s => {
    s.life--;
    return s.life > 0;
  });

  updateCamera();

  // Render
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawTrack();
  Object.values(cars).forEach(c => c.draw());

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

resizeCanvas();
requestAnimationFrame(gameLoop);
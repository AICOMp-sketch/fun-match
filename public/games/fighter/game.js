const socket = io("https://fun-match.onrender.com");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Set canvas to actual display size
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting', // waiting, countdown, fighting, roundEnd, gameOver
  round: 1,
  maxRounds: 3,
  timer: 99,
  timerInterval: null,
  particles: [],
  isBotMode: false
};

const GROUND_Y = () => canvas.height - 100;

// ════════ FIGHTER CLASS ════════
class Fighter {
  constructor(id, name, side) {
    this.id = id;
    this.name = name;
    this.side = side; // 'left' or 'right'
    this.x = side === 'left' ? 200 : canvas.width - 200;
    this.y = GROUND_Y();
    this.vx = 0;
    this.vy = 0;
    this.width = 60;
    this.height = 100;

    this.hp = 100;
    this.maxHp = 100;
    this.roundsWon = 0;

    this.facing = side === 'left' ? 1 : -1; // 1 = right, -1 = left
    this.state = 'idle'; // idle, walk, jump, punch, kick, special, block, hurt
    this.stateTimer = 0;

    this.onGround = true;
    this.isBlocking = false;
    this.specialCooldown = 0;
    this.invulnerable = 0;

    this.color = side === 'left' ? '#00e0ff' : '#ff7b00';
    this.glowColor = side === 'left' ? 'rgba(0, 224, 255, 0.6)' : 'rgba(255, 123, 0, 0.6)';

    // Animation
    this.animFrame = 0;
    this.animTimer = 0;
  }

  update(dt, opponent) {
    // Physics
    this.vy += 0.8; // gravity
    this.x += this.vx;
    this.y += this.vy;

    // Ground collision
    if (this.y >= GROUND_Y()) {
      this.y = GROUND_Y();
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump') this.setState('idle');
    } else {
      this.onGround = false;
    }

    // Wall bounds
    this.x = Math.max(this.width/2, Math.min(canvas.width - this.width/2, this.x));

    // Face opponent
    if (opponent) {
      this.facing = opponent.x > this.x ? 1 : -1;
    }

    // Friction
    this.vx *= 0.8;

    // Cooldowns
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.invulnerable > 0) this.invulnerable--;

    // State timer
    if (this.stateTimer > 0) {
      this.stateTimer--;
      if (this.stateTimer === 0) {
        this.setState('idle');
      }
    }

    // Animation
    this.animTimer++;
    if (this.animTimer > 8) {
      this.animFrame = (this.animFrame + 1) % 4;
      this.animTimer = 0;
    }
  }

  setState(state, duration = 0) {
    this.state = state;
    this.stateTimer = duration;
  }

  move(dir) {
    if (this.state === 'idle' || this.state === 'walk') {
      this.vx = dir * 5;
      this.setState('walk');
    }
  }

  jump() {
    if (this.onGround && this.state !== 'punch' && this.state !== 'kick') {
      this.vy = -16;
      this.setState('jump');
      Sounds.jump();
    }
  }

  punch(opponent) {
    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('punch', 15);
      Sounds.punch();
      this.checkHit(opponent, 8, 80);
    }
  }

  kick(opponent) {
    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('kick', 20);
      Sounds.kick();
      this.checkHit(opponent, 12, 100);
    }
  }

  special(opponent) {
    if (this.specialCooldown > 0) return;
    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('special', 30);
      this.specialCooldown = 180; // 3 seconds
      Sounds.special();

      // Create special effect particles
      for (let i = 0; i < 20; i++) {
        GAME.particles.push({
          x: this.x + (this.facing * 50),
          y: this.y - 50,
          vx: (Math.random() - 0.5) * 8 + (this.facing * 4),
          vy: (Math.random() - 0.5) * 8,
          life: 30,
          color: this.color,
          size: Math.random() * 6 + 3
        });
      }

      this.checkHit(opponent, 20, 150);
    }
  }

  block() {
    this.isBlocking = true;
    this.setState('block', 10);
    Sounds.block();
  }

  checkHit(opponent, damage, range) {
    if (!opponent || opponent.invulnerable > 0) return;

    const dx = opponent.x - this.x;
    const distance = Math.abs(dx);
    const sameDirection = (dx > 0 && this.facing === 1) || (dx < 0 && this.facing === -1);

    if (distance < range && sameDirection) {
      setTimeout(() => {
        if (opponent.isBlocking) {
          opponent.hp -= damage * 0.2;
          createHitParticles(opponent.x, opponent.y - 50, '#94a3b8', 5);
        } else {
          opponent.hp -= damage;
          opponent.vx = this.facing * 8;
          opponent.setState('hurt', 15);
          opponent.invulnerable = 20;
          createHitParticles(opponent.x, opponent.y - 50, '#ff3860', 15);
          screenShake();
          Sounds.hit();
        }

        opponent.hp = Math.max(0, opponent.hp);
        updateHpBars();

        if (opponent.hp <= 0) {
          endRound(this);
        }
      }, 100);
    }
  }

  draw() {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(this.x, GROUND_Y() + 5, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Invulnerability flash
    if (this.invulnerable > 0 && Math.floor(this.invulnerable / 3) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    this.drawPixelFighter();

    ctx.restore();

    // Special cooldown bar
    if (this.specialCooldown > 0) {
      const barW = 50;
      const barH = 4;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(this.x - barW/2, this.y - this.height - 15, barW, barH);
      ctx.fillStyle = '#aaff00';
      ctx.fillRect(this.x - barW/2, this.y - this.height - 15, barW * (1 - this.specialCooldown/180), barH);
    }
  }

  drawPixelFighter() {
    const px = this.x;
    const py = this.y;
    const f = this.facing;
    const s = 6; // pixel size

    // Determine pose based on state
    let pose = this.getPose();

    // Glow effect
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 20;

    // Draw pixel art
    ctx.fillStyle = this.color;

    pose.forEach(([dx, dy, w, h]) => {
      ctx.fillRect(
        px + (dx * f * s) - (s/2),
        py + (dy * s) - 100,
        w * s,
        h * s
      );
    });

    // Eyes (white)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    if (this.state !== 'hurt') {
      ctx.fillRect(px + (-2 * f * s) - 2, py - 80, 4, 4);
      ctx.fillRect(px + (1 * f * s) - 2, py - 80, 4, 4);
    } else {
      // X eyes when hurt
      ctx.fillStyle = '#ff3860';
      ctx.fillText('x x', px - 10, py - 75);
    }
  }

  getPose() {
    // Pixel poses [x, y, width, height] relative to center
    // Default standing pose
    const standing = [
      [-2, 0, 4, 3],    // head
      [-3, 3, 6, 6],    // torso
      [-3, 9, 2, 5],    // left leg
      [1, 9, 2, 5],     // right leg
      [-5, 4, 2, 4],    // left arm
      [3, 4, 2, 4],     // right arm
    ];

    const punching = [
      [-2, 0, 4, 3],    // head
      [-3, 3, 6, 6],    // torso
      [-3, 9, 2, 5],    // left leg
      [1, 9, 2, 5],     // right leg
      [-5, 4, 2, 4],    // left arm
      [3, 4, 6, 2],     // right arm extended (punch)
    ];

    const kicking = [
      [-2, 0, 4, 3],    // head
      [-3, 3, 6, 6],    // torso
      [-3, 9, 2, 5],    // left leg
      [1, 7, 7, 2],     // right leg extended (kick)
      [-5, 4, 2, 4],    // left arm
      [3, 4, 2, 4],     // right arm
    ];

    const jumping = [
      [-2, 0, 4, 3],    // head
      [-3, 3, 6, 6],    // torso
      [-3, 9, 2, 3],    // left leg tucked
      [1, 9, 2, 3],     // right leg tucked
      [-5, 2, 2, 4],    // left arm up
      [3, 2, 2, 4],     // right arm up
    ];

    const blocking = [
      [-2, 0, 4, 3],    // head
      [-3, 3, 6, 6],    // torso
      [-3, 9, 2, 5],    // left leg
      [1, 9, 2, 5],     // right leg
      [-4, 2, 2, 6],    // left arm guard
      [2, 2, 2, 6],     // right arm guard
    ];

    const special = [
      [-2, 0, 4, 3],    // head
      [-4, 3, 8, 6],    // bigger torso
      [-3, 9, 2, 5],    // left leg
      [1, 9, 2, 5],     // right leg
      [-6, 4, 8, 3],    // both arms forward
      [-2, 6, 6, 2],
    ];

    const hurt = [
      [-2, 1, 4, 3],    // head tilted
      [-3, 4, 6, 6],    // torso
      [-3, 10, 2, 4],   // left leg
      [1, 10, 2, 4],    // right leg
      [-5, 5, 2, 4],    // left arm
      [3, 5, 2, 4],     // right arm
    ];

    const walking = [
      [-2, 0, 4, 3],
      [-3, 3, 6, 6],
      [-3, 9, 2, 5 + Math.sin(this.animFrame) * 0.5],
      [1, 9, 2, 5 + Math.cos(this.animFrame) * 0.5],
      [-5, 4, 2, 4],
      [3, 4, 2, 4],
    ];

    switch (this.state) {
      case 'punch': return punching;
      case 'kick': return kicking;
      case 'jump': return jumping;
      case 'block': return blocking;
      case 'special': return special;
      case 'hurt': return hurt;
      case 'walk': return walking;
      default: return standing;
    }
  }
}

// ════════ PARTICLES ════════
function createHitParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    GAME.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10 - 3,
      life: 20 + Math.random() * 20,
      color,
      size: Math.random() * 4 + 2
    });
  }
}

function updateParticles() {
  GAME.particles = GAME.particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.3;
    p.life--;
    return p.life > 0;
  });
}

function drawParticles() {
  GAME.particles.forEach(p => {
    ctx.globalAlpha = p.life / 40;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ════════ SCREEN EFFECTS ════════
function screenShake() {
  document.getElementById('gameCanvas').classList.add('shake');
  setTimeout(() => {
    document.getElementById('gameCanvas').classList.remove('shake');
  }, 300);
}

function showAnnouncement(text, duration = 2000) {
  const el = document.getElementById('announcement');
  const txt = document.getElementById('announcement-text');
  txt.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // force reflow
  el.classList.add('show');
}

// ════════ GAME FLOW ════════
let player1 = null;
let player2 = null;

function updateHpBars() {
  if (player1) {
    const hp1 = (player1.hp / player1.maxHp) * 100;
    const bar1 = document.getElementById('p1-hp');
    bar1.style.width = hp1 + '%';
    bar1.classList.toggle('low', hp1 < 30);
  }
  if (player2) {
    const hp2 = (player2.hp / player2.maxHp) * 100;
    const bar2 = document.getElementById('p2-hp');
    bar2.style.width = hp2 + '%';
    bar2.classList.toggle('low', hp2 < 30);
  }
}

function updateRoundDots() {
  if (player1) {
    document.querySelectorAll('#p1-rounds .round-dot').forEach((dot, i) => {
      dot.classList.toggle('won', i < player1.roundsWon);
    });
  }
  if (player2) {
    document.querySelectorAll('#p2-rounds .round-dot').forEach((dot, i) => {
      dot.classList.toggle('won', i < player2.roundsWon);
    });
  }
}

function startMatch() {
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('fight-screen').classList.add('active');
  resizeCanvas();

  GAME.round = 1;
  player1.roundsWon = 0;
  player2.roundsWon = 0;
  updateRoundDots();

  startRound();
}

function startRound() {
  GAME.state = 'countdown';
  GAME.timer = 99;
  player1.hp = player1.maxHp;
  player2.hp = player2.maxHp;
  player1.x = 200;
  player2.x = canvas.width - 200;
  updateHpBars();

  document.getElementById('round-text').textContent = `ROUND ${GAME.round}`;

  Sounds.round();
  showAnnouncement(`ROUND ${GAME.round}`);

  setTimeout(() => {
    showAnnouncement('FIGHT!');
    GAME.state = 'fighting';
    startTimer();
  }, 2000);
}

function startTimer() {
  if (GAME.timerInterval) clearInterval(GAME.timerInterval);
  GAME.timerInterval = setInterval(() => {
    if (GAME.state !== 'fighting') return;
    GAME.timer--;
    const timerEl = document.getElementById('timer');
    timerEl.textContent = GAME.timer;
    timerEl.classList.toggle('warning', GAME.timer <= 10);

    if (GAME.timer <= 0) {
      clearInterval(GAME.timerInterval);
      // Determine winner by HP
      if (player1.hp > player2.hp) endRound(player1);
      else if (player2.hp > player1.hp) endRound(player2);
      else endRound(null); // draw
    }
  }, 1000);
}

function endRound(winner) {
  if (GAME.state !== 'fighting') return;
  GAME.state = 'roundEnd';
  clearInterval(GAME.timerInterval);

  if (winner) {
    winner.roundsWon++;
    updateRoundDots();
    Sounds.ko();
    showAnnouncement('K.O.!');
  } else {
    showAnnouncement('DRAW!');
  }

  setTimeout(() => {
    if (player1.roundsWon >= 2 || player2.roundsWon >= 2) {
      endMatch();
    } else {
      GAME.round++;
      startRound();
    }
  }, 3000);
}

function endMatch() {
  GAME.state = 'gameOver';
  Sounds.win();

  const winner = player1.roundsWon > player2.roundsWon ? player1 : player2;

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.innerHTML = `
    <h1>${winner.name} WINS!</h1>
    <p>Final Score: ${player1.roundsWon} - ${player2.roundsWon}</p>
    <div class="game-over-buttons">
      <button class="go-btn primary" onclick="location.reload()">REMATCH</button>
      <a href="../../" class="go-btn secondary">BACK TO HUB</a>
    </div>
  `;
  document.querySelector('.arena').appendChild(overlay);
}

// ════════ BOT AI ════════
function botThink() {
  if (GAME.state !== 'fighting' || !player2) return;

  const dx = player1.x - player2.x;
  const distance = Math.abs(dx);

  // Random actions with simple AI
  const action = Math.random();

  if (distance > 200) {
    // Move toward player
    player2.move(dx > 0 ? 1 : -1);
  } else if (distance < 120) {
    // Attack
    if (action < 0.3) player2.punch(player1);
    else if (action < 0.5) player2.kick(player1);
    else if (action < 0.6 && player2.specialCooldown === 0) player2.special(player1);
    else if (action < 0.75) player2.block();
    else if (action < 0.85) player2.jump();
    else player2.move(dx > 0 ? -1 : 1); // back off
  } else {
    // Mid range - mix it up
    if (action < 0.4) player2.move(dx > 0 ? 1 : -1);
    else if (action < 0.6) player2.kick(player1);
    else if (action < 0.7 && player2.specialCooldown === 0) player2.special(player1);
    else player2.jump();
  }
}

setInterval(botThink, 600);

// ════════ SOCKET EVENTS ════════
socket.on("connect", () => {
  console.log("✅ Connected to server!");
  socket.emit("create-room");
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err);
  document.getElementById("room-code").textContent = "ERR!";
});

socket.on("room-created", (data) => {
  console.log("🏠 Room created:", data.roomCode);
  const roomEl = document.getElementById("room-code");
  if (roomEl) {
    roomEl.textContent = data.roomCode;
  }
});

socket.on("player-joined", (player) => {
  if (!player1) {
    player1 = new Fighter(player.id, player.name.toUpperCase(), 'left');
    document.getElementById('p1-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-1').classList.add('filled');
    document.getElementById('slot-1').querySelector('.slot-icon').textContent = player.name[0].toUpperCase();
    document.getElementById('slot-1').querySelector('p').textContent = player.name;
  } else if (!player2 && !GAME.isBotMode) {
    player2 = new Fighter(player.id, player.name.toUpperCase(), 'right');
    document.getElementById('p2-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-2').classList.add('filled');
    document.getElementById('slot-2').querySelector('.slot-icon').textContent = player.name[0].toUpperCase();
    document.getElementById('slot-2').querySelector('p').textContent = player.name;

    setTimeout(startMatch, 1500);
  }
});

socket.on("player-moved", (data) => {
  const p = player1 && player1.id === data.playerId ? player1 : (player2 && player2.id === data.playerId ? player2 : null);
  if (!p || GAME.state !== 'fighting') return;

  const opponent = p === player1 ? player2 : player1;

  switch (data.direction) {
    case "left":  p.move(-1); break;
    case "right": p.move(1); break;
    case "up":    p.jump(); break;
    case "down":  p.block(); break;
    case "punch": p.punch(opponent); break;
    case "kick":  p.kick(opponent); break;
    case "special": p.special(opponent); break;
    case "block": p.block(); break;
  }
});

// Bot mode button
document.getElementById('bot-mode-btn').addEventListener('click', () => {
  GAME.isBotMode = true;
  if (!player1) {
    // Create dummy player 1 for testing
    player1 = new Fighter('dummy1', 'YOU', 'left');
    document.getElementById('p1-name').textContent = 'YOU';
  }
  player2 = new Fighter('bot', 'BOT', 'right');
  document.getElementById('p2-name').textContent = 'BOT';
  document.getElementById('slot-2').classList.add('filled');
  document.getElementById('slot-2').querySelector('.slot-icon').textContent = 'B';
  document.getElementById('slot-2').querySelector('p').textContent = 'Bot';
  setTimeout(startMatch, 800);
});

// ════════ GAME LOOP ════════
let lastTime = 0;
function gameLoop(currentTime) {
  const dt = (currentTime - lastTime) / 16.67;
  lastTime = currentTime;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw ground line
  ctx.strokeStyle = 'rgba(0, 224, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y() + 8);
  ctx.lineTo(canvas.width, GROUND_Y() + 8);
  ctx.stroke();

  if (player1 && player2) {
    player1.update(dt, player2);
    player2.update(dt, player1);

    player1.draw();
    player2.draw();
  }

  updateParticles();
  drawParticles();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Keyboard fallback for testing
document.addEventListener('keydown', (e) => {
  if (GAME.state !== 'fighting' || !player1) return;
  const opp = player2;

  switch(e.key.toLowerCase()) {
    case 'a': player1.move(-1); break;
    case 'd': player1.move(1); break;
    case 'w': player1.jump(); break;
    case 's': player1.block(); break;
    case 'j': player1.punch(opp); break;
    case 'k': player1.kick(opp); break;
    case 'l': player1.special(opp); break;
  }
});
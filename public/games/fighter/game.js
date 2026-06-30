const socket = io("https://fun-match-production.up.railway.app");
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
    this.x = Math.max(this.width / 2, Math.min(canvas.width - this.width / 2, this.x));

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
      ctx.fillRect(this.x - barW / 2, this.y - this.height - 15, barW, barH);
      ctx.fillStyle = '#aaff00';
      ctx.fillRect(this.x - barW / 2, this.y - this.height - 15, barW * (1 - this.specialCooldown / 180), barH);
    }
  }

  drawPixelFighter() {
    const px = this.x;
    const py = this.y;
    const f = this.facing;

    // Get current pose based on state
    const pose = this.getStickmanPose();

    // Apply glow effect
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 15;

    // Draw shadow on ground first
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + 5, 35, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Re-apply glow for stickman
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 15;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calculate body positions (all relative to feet position)
    const hipY = py - 50;
    const shoulderY = py - 80;
    const neckY = py - 95;

    // ═══ LEGS ═══
    // Left leg
    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.leftKnee.x * f, hipY + pose.leftKnee.y);
    ctx.lineTo(px + pose.leftFoot.x * f, hipY + pose.leftFoot.y);
    ctx.stroke();

    // Right leg
    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.rightKnee.x * f, hipY + pose.rightKnee.y);
    ctx.lineTo(px + pose.rightFoot.x * f, hipY + pose.rightFoot.y);
    ctx.stroke();

    // ═══ BODY/SPINE ═══
    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.spine.x * f, shoulderY + pose.spine.y);
    ctx.stroke();

    const shoulderX = px + pose.spine.x * f;
    const finalShoulderY = shoulderY + pose.spine.y;

    // ═══ ARMS ═══
    // Left arm
    ctx.beginPath();
    ctx.moveTo(shoulderX, finalShoulderY);
    ctx.lineTo(shoulderX + pose.leftElbow.x * f, finalShoulderY + pose.leftElbow.y);
    ctx.lineTo(shoulderX + pose.leftHand.x * f, finalShoulderY + pose.leftHand.y);
    ctx.stroke();

    // Right arm
    ctx.beginPath();
    ctx.moveTo(shoulderX, finalShoulderY);
    ctx.lineTo(shoulderX + pose.rightElbow.x * f, finalShoulderY + pose.rightElbow.y);
    ctx.lineTo(shoulderX + pose.rightHand.x * f, finalShoulderY + pose.rightHand.y);
    ctx.stroke();

    // ═══ HEAD ═══
    const headX = shoulderX + pose.head.x * f;
    const headY = finalShoulderY + pose.head.y;

    // Head circle
    ctx.beginPath();
    ctx.arc(headX, headY, 14, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // ═══ FACE DETAILS ═══
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#050810';

    if (this.state === 'hurt') {
      // X eyes when hurt
      ctx.strokeStyle = '#ff3860';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX - 7 * f, headY - 3);
      ctx.lineTo(headX - 3 * f, headY + 1);
      ctx.moveTo(headX - 3 * f, headY - 3);
      ctx.lineTo(headX - 7 * f, headY + 1);
      ctx.moveTo(headX + 3 * f, headY - 3);
      ctx.lineTo(headX + 7 * f, headY + 1);
      ctx.moveTo(headX + 7 * f, headY - 3);
      ctx.lineTo(headX + 3 * f, headY + 1);
      ctx.stroke();
    } else if (this.state === 'block') {
      // Closed eyes (focused)
      ctx.strokeStyle = '#050810';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX - 7 * f, headY - 2);
      ctx.lineTo(headX - 3 * f, headY - 2);
      ctx.moveTo(headX + 3 * f, headY - 2);
      ctx.lineTo(headX + 7 * f, headY - 2);
      ctx.stroke();
    } else {
      // Normal eyes
      ctx.beginPath();
      ctx.arc(headX - 5 * f, headY - 2, 2, 0, Math.PI * 2);
      ctx.arc(headX + 5 * f, headY - 2, 2, 0, Math.PI * 2);
      ctx.fill();

      // Angry eyebrows (looking forward / facing opponent)
      ctx.strokeStyle = '#050810';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(headX - 8 * f, headY - 6);
      ctx.lineTo(headX - 2 * f, headY - 4);
      ctx.moveTo(headX + 2 * f, headY - 4);
      ctx.lineTo(headX + 8 * f, headY - 6);
      ctx.stroke();
    }

    // ═══ MOTION TRAILS FOR ATTACKS ═══
    if (this.state === 'punch') {
      // Punch trail
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(shoulderX + 15 * f, finalShoulderY + 5);
      ctx.lineTo(shoulderX + pose.rightHand.x * f, finalShoulderY + pose.rightHand.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Impact star at fist
      const fistX = shoulderX + pose.rightHand.x * f;
      const fistY = finalShoulderY + pose.rightHand.y;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = i % 2 === 0 ? 8 : 4;
        const x = fistX + Math.cos(angle) * r;
        const y = fistY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (this.state === 'kick') {
      // Kick trail
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(px + 10 * f, hipY + 20);
      ctx.lineTo(px + pose.rightFoot.x * f, hipY + pose.rightFoot.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.state === 'special') {
      // Special energy aura
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 30;

      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.3 - (i * 0.1);
        ctx.lineWidth = 4 + i * 3;
        ctx.beginPath();
        ctx.arc(px, py - 50, 40 + i * 10 + Math.random() * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
  }

  getStickmanPose() {
    // All positions are relative offsets
    // x: horizontal offset (will be multiplied by facing)
    // y: vertical offset

    const poses = {
      idle: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -8, y: 20 },
        leftFoot: { x: -10, y: 45 },
        rightKnee: { x: 8, y: 20 },
        rightFoot: { x: 10, y: 45 },
        leftElbow: { x: -15, y: 10 },
        leftHand: { x: -18, y: 25 },
        rightElbow: { x: 15, y: 10 },
        rightHand: { x: 18, y: 25 }
      },

      walk: {
        head: { x: 0, y: -15 },
        spine: { x: 2, y: 15 },
        leftKnee: { x: -5, y: 15 + Math.sin(this.animFrame * 0.8) * 5 },
        leftFoot: { x: -15, y: 45 },
        rightKnee: { x: 5, y: 15 - Math.sin(this.animFrame * 0.8) * 5 },
        rightFoot: { x: 15, y: 45 },
        leftElbow: { x: -15, y: 10 + Math.sin(this.animFrame * 0.8) * 3 },
        leftHand: { x: -18, y: 25 },
        rightElbow: { x: 15, y: 10 - Math.sin(this.animFrame * 0.8) * 3 },
        rightHand: { x: 18, y: 25 }
      },

      punch: {
        head: { x: 5, y: -15 },
        spine: { x: 3, y: 15 },
        leftKnee: { x: -10, y: 20 },
        leftFoot: { x: -15, y: 45 },
        rightKnee: { x: 5, y: 20 },
        rightFoot: { x: 12, y: 45 },
        leftElbow: { x: -10, y: 15 },
        leftHand: { x: -5, y: 20 },
        rightElbow: { x: 25, y: 5 },
        rightHand: { x: 50, y: 0 }  // Extended punch
      },

      kick: {
        head: { x: -5, y: -10 },
        spine: { x: -8, y: 15 },
        leftKnee: { x: -15, y: 25 },
        leftFoot: { x: -20, y: 50 },
        rightKnee: { x: 20, y: 0 },
        rightFoot: { x: 55, y: 5 },  // Extended kick
        leftElbow: { x: -20, y: 0 },
        leftHand: { x: -25, y: 10 },
        rightElbow: { x: 5, y: 5 },
        rightHand: { x: 10, y: 20 }
      },

      jump: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -10, y: 5 },   // Knees up
        leftFoot: { x: -15, y: 20 },
        rightKnee: { x: 10, y: 5 },
        rightFoot: { x: 15, y: 20 },
        leftElbow: { x: -20, y: -5 },  // Arms up
        leftHand: { x: -25, y: -20 },
        rightElbow: { x: 20, y: -5 },
        rightHand: { x: 25, y: -20 }
      },

      block: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -8, y: 20 },
        leftFoot: { x: -15, y: 45 },
        rightKnee: { x: 8, y: 20 },
        rightFoot: { x: 15, y: 45 },
        leftElbow: { x: -5, y: -5 },   // Arms crossed in front
        leftHand: { x: 10, y: -10 },
        rightElbow: { x: 5, y: -5 },
        rightHand: { x: -10, y: -10 }
      },

      special: {
        head: { x: 0, y: -20 },   // Head back
        spine: { x: 0, y: 10 },
        leftKnee: { x: -15, y: 20 },
        leftFoot: { x: -25, y: 45 },
        rightKnee: { x: 15, y: 20 },
        rightFoot: { x: 25, y: 45 },
        leftElbow: { x: -25, y: -5 },  // Power pose - arms out
        leftHand: { x: -35, y: 5 },
        rightElbow: { x: 25, y: -5 },
        rightHand: { x: 35, y: 5 }
      },

      hurt: {
        head: { x: -5, y: -10 },  // Head back from impact
        spine: { x: -5, y: 15 },
        leftKnee: { x: -12, y: 22 },
        leftFoot: { x: -18, y: 45 },
        rightKnee: { x: 8, y: 22 },
        rightFoot: { x: 12, y: 45 },
        leftElbow: { x: -20, y: 10 },
        leftHand: { x: -25, y: 20 },
        rightElbow: { x: 10, y: 10 },
        rightHand: { x: 15, y: 20 }
      }
    };

    return poses[this.state] || poses.idle;
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
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
    case "left": p.move(-1); break;
    case "right": p.move(1); break;
    case "up": p.jump(); break;
    case "down": p.block(); break;
    case "punch": p.punch(opponent); break;
    case "kick": p.kick(opponent); break;
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

  switch (e.key.toLowerCase()) {
    case 'a': player1.move(-1); break;
    case 'd': player1.move(1); break;
    case 'w': player1.jump(); break;
    case 's': player1.block(); break;
    case 'j': player1.punch(opp); break;
    case 'k': player1.kick(opp); break;
    case 'l': player1.special(opp); break;
  }
});
const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ════════ SIZE CONFIG ════════
const SCALE = 1.4;  // Change this to resize fighters: 1.0=small, 1.4=medium, 1.8=huge

// Set canvas to actual display size
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting',
  round: 1,
  maxRounds: 3,
  timer: 99,
  timerInterval: null,
  particles: [],
  isBotMode: false
};

const GROUND_Y = () => canvas.height - 100;

class Fighter {
  constructor(id, name, side) {
    this.id = id;
    this.name = name;
    this.side = side;
    this.x = side === 'left' ? 200 : canvas.width - 200;
    this.y = GROUND_Y();
    this.vx = 0;
    this.vy = 0;
    this.width = 60 * SCALE;
    this.height = 100 * SCALE;

    this.hp = 100;
    this.maxHp = 100;
    this.roundsWon = 0;

    this.facing = side === 'left' ? 1 : -1;
    this.state = 'idle';
    this.stateTimer = 0;

    this.onGround = true;
    this.isBlocking = false;
    this.specialCooldown = 0;
    this.invulnerable = 0;

    this.color = side === 'left' ? '#00e0ff' : '#ff7b00';
    this.glowColor = side === 'left' ? 'rgba(0, 224, 255, 0.6)' : 'rgba(255, 123, 0, 0.6)';

    this.animFrame = 0;
    this.animTimer = 0;

    this.crouching = false;
    this.spinAngle = 0;
    this.flipAngle = 0;

    // Death animation
    this.dying = false;
    this.deathTimer = 0;
    this.deathRotation = 0;
    this.deathBounce = 0;
    this.dead = false;
  }

  update(dt, opponent) {
    // Handle death animation
    if (this.dying) {
      this.vy += 0.8;
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.92;
      this.updateDeathAnimation();
      return;
    }

    // Physics
    this.vy += 0.8;
    this.x += this.vx;
    this.y += this.vy;

    // Ground collision
    if (this.y >= GROUND_Y()) {
      this.y = GROUND_Y();
      this.vy = 0;
      this.onGround = true;
      if (this.state === 'jump' || this.state === 'jumpPunch' || this.state === 'jumpKick' || this.state === 'backflip') {
        this.setState('idle');
        this.spinAngle = 0;
        this.flipAngle = 0;
      }
    } else {
      this.onGround = false;
    }

    // Wall bounds
    this.x = Math.max(this.width / 2, Math.min(canvas.width - this.width / 2, this.x));

    // Face opponent
    if (opponent && this.onGround && this.state !== 'roundhouse' && this.state !== 'backflip') {
      this.facing = opponent.x > this.x ? 1 : -1;
    }

    // Friction
    this.vx *= 0.8;

    // Cooldowns
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.invulnerable > 0) this.invulnerable--;

    // Spin animation
    if (this.state === 'roundhouse') {
      this.spinAngle += 0.3;
    }

    // Flip animation
    if (this.state === 'backflip') {
      this.flipAngle += 0.25;
    }

    // State timer
    if (this.stateTimer > 0) {
      this.stateTimer--;
      if (this.stateTimer === 0) {
        if (this.onGround) {
          this.setState('idle');
          this.spinAngle = 0;
          this.flipAngle = 0;
        }
      }
    }

    // Animation
    this.animTimer++;
    const animSpeed = this.state === 'walk' ? 3 : 8;
    if (this.animTimer > animSpeed) {
      this.animFrame = (this.animFrame + 1) % 8;
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
    if (this.onGround && this.state !== 'punch' && this.state !== 'kick' && this.state !== 'crouch' && this.state !== 'roundhouse') {
      this.vy = -16;
      this.setState('jump');
      Sounds.jump();
    }
  }

  crouch() {
    if (this.onGround && (this.state === 'idle' || this.state === 'walk')) {
      this.crouching = true;
      this.setState('crouch', 8);
    }
  }

  punch(opponent) {
    if (!this.onGround && this.state !== 'jumpPunch') {
      this.setState('jumpPunch', 25);
      Sounds.punch();
      this.checkHit(opponent, 10, 90 * SCALE);
      return;
    }

    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('punch', 15);
      Sounds.punch();
      this.checkHit(opponent, 8, 80 * SCALE);
    }
  }

  kick(opponent) {
    if (this.crouching || this.state === 'crouch') {
      this.setState('roundhouse', 30);
      this.spinAngle = 0;
      Sounds.kick();
      this.checkHit(opponent, 15, 110 * SCALE);
      setTimeout(() => {
        if (this.state === 'roundhouse') this.checkHit(opponent, 15, 110 * SCALE);
      }, 200);
      this.crouching = false;
      return;
    }

    if (!this.onGround && this.state !== 'jumpKick') {
      this.setState('jumpKick', 25);
      Sounds.kick();
      this.checkHit(opponent, 14, 110 * SCALE);
      return;
    }

    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('kick', 20);
      Sounds.kick();
      this.checkHit(opponent, 12, 100 * SCALE);
    }
  }

  special(opponent) {
    if (this.specialCooldown > 0) return;

    if (this.crouching || this.state === 'crouch') {
      this.setState('backflip', 40);
      this.flipAngle = 0;
      this.vx = -this.facing * 8;
      this.vy = -14;
      this.invulnerable = 40;
      this.specialCooldown = 120;
      this.crouching = false;
      Sounds.jump();
      return;
    }

    if (this.state === 'idle' || this.state === 'walk') {
      this.setState('special', 30);
      this.specialCooldown = 180;
      Sounds.special();

      for (let i = 0; i < 20; i++) {
        GAME.particles.push({
          x: this.x + (this.facing * 50),
          y: this.y - 50 * SCALE,
          vx: (Math.random() - 0.5) * 8 + (this.facing * 4),
          vy: (Math.random() - 0.5) * 8,
          life: 30,
          color: this.color,
          size: Math.random() * 6 + 3
        });
      }

      this.checkHit(opponent, 20, 150 * SCALE);
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
          createHitParticles(opponent.x, opponent.y - 50 * SCALE, '#94a3b8', 5);
        } else {
          opponent.hp -= damage;
          opponent.vx = this.facing * 8;
          opponent.setState('hurt', 15);
          opponent.invulnerable = 20;
          createHitParticles(opponent.x, opponent.y - 50 * SCALE, '#ff3860', 15);
          screenShake();
          Sounds.hit();
        }

        opponent.hp = Math.max(0, opponent.hp);
        updateHpBars();

        if (opponent.hp <= 0 && !opponent.dying) {
          opponent.startDying(this);
        }
      }, 100);
    }
  }

  startDying(killer) {
    this.dying = true;
    this.deathTimer = 90;
    this.invulnerable = 200;
    this.setState('dying', 90);

    const dir = killer.facing;
    this.vx = dir * 12;
    this.vy = -8;

    Sounds.ko();

    for (let i = 0; i < 30; i++) {
      GAME.particles.push({
        x: this.x,
        y: this.y - 50 * SCALE,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15 - 5,
        life: 50,
        color: '#ff3860',
        size: Math.random() * 6 + 3
      });
    }

    screenShake();
    setTimeout(() => screenShake(), 200);
    setTimeout(() => screenShake(), 400);
  }

  updateDeathAnimation() {
    if (!this.dying) return;

    this.deathTimer--;
    this.deathRotation += 0.3 * this.facing;

    if (this.y >= GROUND_Y()) {
      if (Math.abs(this.vy) > 2) {
        this.vy = -Math.abs(this.vy) * 0.5;
        this.deathBounce++;

        for (let i = 0; i < 10; i++) {
          GAME.particles.push({
            x: this.x,
            y: GROUND_Y(),
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 5,
            life: 30,
            color: '#ff7b00',
            size: Math.random() * 4 + 2
          });
        }

        screenShake();
      } else {
        this.vy = 0;
        this.y = GROUND_Y();
      }
    }

    if (this.deathTimer <= 0 && !this.dead) {
      this.dead = true;
      endRound(this === player1 ? player2 : player1);
    }
  }

  draw() {
    ctx.save();

    // Bigger shadow for bigger character
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(this.x, GROUND_Y() + 5, 50 * SCALE, 10 * SCALE, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.invulnerable > 0 && Math.floor(this.invulnerable / 3) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    this.drawStickman();

    ctx.restore();

    // Special cooldown bar
    if (this.specialCooldown > 0) {
      const barW = 60 * SCALE;
      const barH = 5;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(this.x - barW / 2, this.y - this.height - 20, barW, barH);
      ctx.fillStyle = '#aaff00';
      ctx.fillRect(this.x - barW / 2, this.y - this.height - 20, barW * (1 - this.specialCooldown / 180), barH);
    }
  }

  drawStickman() {
    const px = this.x;
    const py = this.y;
    const f = this.facing;

    ctx.save();
    if (this.state === 'roundhouse') {
      ctx.translate(px, py - 50 * SCALE);
      ctx.rotate(this.spinAngle);
      ctx.translate(-px, -(py - 50 * SCALE));
    } else if (this.state === 'backflip') {
      ctx.translate(px, py - 50 * SCALE);
      ctx.rotate(-this.flipAngle * this.facing);
      ctx.translate(-px, -(py - 50 * SCALE));
    } else if (this.dying) {
      ctx.translate(px, py - 50 * SCALE);
      ctx.rotate(this.deathRotation);
      ctx.translate(-px, -(py - 50 * SCALE));
    }

    const pose = this.getStickmanPose();

    // Death effect: flash red and dim
    let drawColor = this.color;
    let drawGlow = this.glowColor;

    if (this.dying) {
      if (Math.floor(this.deathTimer / 5) % 2 === 0) {
        drawColor = '#ff3860';
        drawGlow = 'rgba(255, 56, 96, 0.8)';
      }

      if (this.deathTimer < 30) {
        ctx.globalAlpha = this.deathTimer / 30;
      }
    }

    ctx.shadowColor = drawGlow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 6 * SCALE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const hipY = py - (50 * SCALE) + ((pose.crouchOffset || 0) * SCALE);
    const shoulderY = py - (80 * SCALE) + ((pose.crouchOffset || 0) * SCALE);

    // Legs
    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.leftKnee.x * f * SCALE, hipY + pose.leftKnee.y * SCALE);
    ctx.lineTo(px + pose.leftFoot.x * f * SCALE, hipY + pose.leftFoot.y * SCALE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.rightKnee.x * f * SCALE, hipY + pose.rightKnee.y * SCALE);
    ctx.lineTo(px + pose.rightFoot.x * f * SCALE, hipY + pose.rightFoot.y * SCALE);
    ctx.stroke();

    // Spine
    ctx.beginPath();
    ctx.moveTo(px, hipY);
    ctx.lineTo(px + pose.spine.x * f * SCALE, shoulderY + pose.spine.y * SCALE);
    ctx.stroke();

    const shoulderX = px + pose.spine.x * f * SCALE;
    const finalShoulderY = shoulderY + pose.spine.y * SCALE;

    // Arms
    ctx.beginPath();
    ctx.moveTo(shoulderX, finalShoulderY);
    ctx.lineTo(shoulderX + pose.leftElbow.x * f * SCALE, finalShoulderY + pose.leftElbow.y * SCALE);
    ctx.lineTo(shoulderX + pose.leftHand.x * f * SCALE, finalShoulderY + pose.leftHand.y * SCALE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(shoulderX, finalShoulderY);
    ctx.lineTo(shoulderX + pose.rightElbow.x * f * SCALE, finalShoulderY + pose.rightElbow.y * SCALE);
    ctx.lineTo(shoulderX + pose.rightHand.x * f * SCALE, finalShoulderY + pose.rightHand.y * SCALE);
    ctx.stroke();

    // Head (bigger)
    const headX = shoulderX + pose.head.x * f * SCALE;
    const headY = finalShoulderY + pose.head.y * SCALE;
    const headRadius = 14 * SCALE;

    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = drawColor;
    ctx.fill();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3 * SCALE;
    ctx.stroke();

    // Face
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#050810';

    if (this.state === 'hurt' || this.dying) {
      ctx.strokeStyle = '#ff3860';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.beginPath();
      ctx.moveTo(headX - 7 * f * SCALE, headY - 3 * SCALE);
      ctx.lineTo(headX - 3 * f * SCALE, headY + 1 * SCALE);
      ctx.moveTo(headX - 3 * f * SCALE, headY - 3 * SCALE);
      ctx.lineTo(headX - 7 * f * SCALE, headY + 1 * SCALE);
      ctx.moveTo(headX + 3 * f * SCALE, headY - 3 * SCALE);
      ctx.lineTo(headX + 7 * f * SCALE, headY + 1 * SCALE);
      ctx.moveTo(headX + 7 * f * SCALE, headY - 3 * SCALE);
      ctx.lineTo(headX + 3 * f * SCALE, headY + 1 * SCALE);
      ctx.stroke();
    } else if (this.state === 'block') {
      ctx.strokeStyle = '#050810';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.beginPath();
      ctx.moveTo(headX - 7 * f * SCALE, headY - 2 * SCALE);
      ctx.lineTo(headX - 3 * f * SCALE, headY - 2 * SCALE);
      ctx.moveTo(headX + 3 * f * SCALE, headY - 2 * SCALE);
      ctx.lineTo(headX + 7 * f * SCALE, headY - 2 * SCALE);
      ctx.stroke();
    } else {
      // Eyes
      ctx.beginPath();
      ctx.arc(headX - 5 * f * SCALE, headY - 2 * SCALE, 2.5 * SCALE, 0, Math.PI * 2);
      ctx.arc(headX + 5 * f * SCALE, headY - 2 * SCALE, 2.5 * SCALE, 0, Math.PI * 2);
      ctx.fill();

      // Angry eyebrows
      ctx.strokeStyle = '#050810';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.beginPath();
      ctx.moveTo(headX - 8 * f * SCALE, headY - 6 * SCALE);
      ctx.lineTo(headX - 2 * f * SCALE, headY - 4 * SCALE);
      ctx.moveTo(headX + 2 * f * SCALE, headY - 4 * SCALE);
      ctx.lineTo(headX + 8 * f * SCALE, headY - 6 * SCALE);
      ctx.stroke();
    }

    ctx.restore();

    // Motion trails
    if (this.state === 'punch' || this.state === 'jumpPunch') {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 10 * SCALE;
      ctx.beginPath();
      ctx.moveTo(shoulderX + 15 * f * SCALE, finalShoulderY + 5 * SCALE);
      ctx.lineTo(shoulderX + pose.rightHand.x * f * SCALE, finalShoulderY + pose.rightHand.y * SCALE);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const fistX = shoulderX + pose.rightHand.x * f * SCALE;
      const fistY = finalShoulderY + pose.rightHand.y * SCALE;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 25;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = (i % 2 === 0 ? 10 : 5) * SCALE;
        const x = fistX + Math.cos(angle) * r;
        const y = fistY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (this.state === 'kick' || this.state === 'jumpKick') {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 10 * SCALE;
      ctx.beginPath();
      ctx.moveTo(px + 10 * f * SCALE, hipY + 20 * SCALE);
      ctx.lineTo(px + pose.rightFoot.x * f * SCALE, hipY + pose.rightFoot.y * SCALE);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Roundhouse trail
    if (this.state === 'roundhouse') {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 8 * SCALE;
      ctx.beginPath();
      ctx.arc(px, py - 50 * SCALE, 80 * SCALE, this.spinAngle - 0.5, this.spinAngle + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2 * SCALE;
      for (let i = 0; i < 3; i++) {
        const a = this.spinAngle - 0.3 - (i * 0.2);
        ctx.beginPath();
        ctx.arc(px, py - 50 * SCALE, (70 + i * 5) * SCALE, a, a + 0.1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Backflip trail
    if (this.state === 'backflip') {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 5 * SCALE;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(px + i * 5 * this.facing, py - 50 * SCALE, 60 * SCALE, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (this.state === 'special') {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 35;

      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.3 - (i * 0.1);
        ctx.lineWidth = (4 + i * 3) * SCALE;
        ctx.beginPath();
        ctx.arc(px, py - 50 * SCALE, (50 + i * 12 + Math.random() * 5) * SCALE, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
  }

  getStickmanPose() {
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
        head: { x: 0, y: -15 + Math.sin(this.animFrame * 0.8) * 2 },
        spine: { x: Math.sin(this.animFrame * 0.4) * 2, y: 15 },
        leftKnee: { x: -5 + Math.sin(this.animFrame * 0.8) * 8, y: 18 + Math.abs(Math.sin(this.animFrame * 0.8)) * 4 },
        leftFoot: { x: -10 + Math.sin(this.animFrame * 0.8) * 15, y: 45 - Math.abs(Math.sin(this.animFrame * 0.8)) * 8 },
        rightKnee: { x: 5 - Math.sin(this.animFrame * 0.8) * 8, y: 18 + Math.abs(Math.cos(this.animFrame * 0.8)) * 4 },
        rightFoot: { x: 10 - Math.sin(this.animFrame * 0.8) * 15, y: 45 - Math.abs(Math.cos(this.animFrame * 0.8)) * 8 },
        leftElbow: { x: -15, y: 10 - Math.sin(this.animFrame * 0.8) * 4 },
        leftHand: { x: -18 - Math.sin(this.animFrame * 0.8) * 5, y: 25 - Math.sin(this.animFrame * 0.8) * 3 },
        rightElbow: { x: 15, y: 10 + Math.sin(this.animFrame * 0.8) * 4 },
        rightHand: { x: 18 + Math.sin(this.animFrame * 0.8) * 5, y: 25 + Math.sin(this.animFrame * 0.8) * 3 }
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
        rightHand: { x: 50, y: 0 }
      },

      kick: {
        head: { x: -5, y: -10 },
        spine: { x: -8, y: 15 },
        leftKnee: { x: -15, y: 25 },
        leftFoot: { x: -20, y: 50 },
        rightKnee: { x: 20, y: 0 },
        rightFoot: { x: 55, y: 5 },
        leftElbow: { x: -20, y: 0 },
        leftHand: { x: -25, y: 10 },
        rightElbow: { x: 5, y: 5 },
        rightHand: { x: 10, y: 20 }
      },

      crouch: {
        crouchOffset: 25,
        head: { x: 0, y: -10 },
        spine: { x: 0, y: 10 },
        leftKnee: { x: -20, y: 5 },
        leftFoot: { x: -25, y: 20 },
        rightKnee: { x: 20, y: 5 },
        rightFoot: { x: 25, y: 20 },
        leftElbow: { x: -15, y: 5 },
        leftHand: { x: -10, y: 15 },
        rightElbow: { x: 15, y: 5 },
        rightHand: { x: 10, y: 15 }
      },

      roundhouse: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: 0, y: 25 },
        leftFoot: { x: 0, y: 50 },
        rightKnee: { x: 30, y: 0 },
        rightFoot: { x: 60, y: 0 },
        leftElbow: { x: -25, y: 5 },
        leftHand: { x: -35, y: 15 },
        rightElbow: { x: 20, y: 10 },
        rightHand: { x: 30, y: 20 }
      },

      backflip: {
        head: { x: 0, y: -10 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -8, y: 10 },
        leftFoot: { x: -12, y: 20 },
        rightKnee: { x: 8, y: 10 },
        rightFoot: { x: 12, y: 20 },
        leftElbow: { x: -18, y: -5 },
        leftHand: { x: -22, y: -15 },
        rightElbow: { x: 18, y: -5 },
        rightHand: { x: 22, y: -15 }
      },

      jump: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -10, y: 5 },
        leftFoot: { x: -15, y: 20 },
        rightKnee: { x: 10, y: 5 },
        rightFoot: { x: 15, y: 20 },
        leftElbow: { x: -20, y: -5 },
        leftHand: { x: -25, y: -20 },
        rightElbow: { x: 20, y: -5 },
        rightHand: { x: 25, y: -20 }
      },

      jumpPunch: {
        head: { x: 5, y: -10 },
        spine: { x: 3, y: 12 },
        leftKnee: { x: -8, y: 8 },
        leftFoot: { x: -12, y: 25 },
        rightKnee: { x: 5, y: 8 },
        rightFoot: { x: 10, y: 22 },
        leftElbow: { x: -10, y: 0 },
        leftHand: { x: -5, y: -10 },
        rightElbow: { x: 25, y: 0 },
        rightHand: { x: 50, y: -5 }
      },

      jumpKick: {
        head: { x: -5, y: -10 },
        spine: { x: -5, y: 12 },
        leftKnee: { x: -10, y: 15 },
        leftFoot: { x: -15, y: 30 },
        rightKnee: { x: 20, y: 5 },
        rightFoot: { x: 55, y: 0 },
        leftElbow: { x: -20, y: -5 },
        leftHand: { x: -25, y: -15 },
        rightElbow: { x: 10, y: 0 },
        rightHand: { x: 15, y: 10 }
      },

      block: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -8, y: 20 },
        leftFoot: { x: -15, y: 45 },
        rightKnee: { x: 8, y: 20 },
        rightFoot: { x: 15, y: 45 },
        leftElbow: { x: -5, y: -5 },
        leftHand: { x: 10, y: -10 },
        rightElbow: { x: 5, y: -5 },
        rightHand: { x: -10, y: -10 }
      },

      special: {
        head: { x: 0, y: -20 },
        spine: { x: 0, y: 10 },
        leftKnee: { x: -15, y: 20 },
        leftFoot: { x: -25, y: 45 },
        rightKnee: { x: 15, y: 20 },
        rightFoot: { x: 25, y: 45 },
        leftElbow: { x: -25, y: -5 },
        leftHand: { x: -35, y: 5 },
        rightElbow: { x: 25, y: -5 },
        rightHand: { x: 35, y: 5 }
      },

      hurt: {
        head: { x: -5, y: -10 },
        spine: { x: -5, y: 15 },
        leftKnee: { x: -12, y: 22 },
        leftFoot: { x: -18, y: 45 },
        rightKnee: { x: 8, y: 22 },
        rightFoot: { x: 12, y: 45 },
        leftElbow: { x: -20, y: 10 },
        leftHand: { x: -25, y: 20 },
        rightElbow: { x: 10, y: 10 },
        rightHand: { x: 15, y: 20 }
      },

      dying: {
        head: { x: 0, y: -15 },
        spine: { x: 0, y: 15 },
        leftKnee: { x: -15, y: 20 },
        leftFoot: { x: -25, y: 45 },
        rightKnee: { x: 15, y: 20 },
        rightFoot: { x: 25, y: 45 },
        leftElbow: { x: -25, y: 0 },
        leftHand: { x: -35, y: -15 },
        rightElbow: { x: 25, y: 0 },
        rightHand: { x: 35, y: -15 }
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
  void el.offsetWidth;
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

  // Reset death state for new round
  player1.dying = false;
  player1.dead = false;
  player1.deathTimer = 0;
  player1.deathRotation = 0;
  player1.setState('idle');

  player2.dying = false;
  player2.dead = false;
  player2.deathTimer = 0;
  player2.deathRotation = 0;
  player2.setState('idle');

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
      if (player1.hp > player2.hp) endRound(player1);
      else if (player2.hp > player1.hp) endRound(player2);
      else endRound(null);
    }
  }, 1000);
}

function endRound(winner) {
  if (GAME.state !== 'fighting' && GAME.state !== 'roundEnd') return;
  GAME.state = 'roundEnd';
  clearInterval(GAME.timerInterval);

  if (winner) {
    winner.roundsWon++;
    updateRoundDots();
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
  if (GAME.state !== 'fighting' || !player2 || player2.dying) return;

  const dx = player1.x - player2.x;
  const distance = Math.abs(dx);
  const action = Math.random();

  if (distance > 200) {
    player2.move(dx > 0 ? 1 : -1);
  } else if (distance < 120) {
    if (action < 0.25) player2.punch(player1);
    else if (action < 0.45) player2.kick(player1);
    else if (action < 0.55 && player2.specialCooldown === 0) player2.special(player1);
    else if (action < 0.7) player2.block();
    else if (action < 0.8) player2.jump();
    else if (action < 0.9) {
      // Try roundhouse
      player2.crouch();
      setTimeout(() => player2.kick(player1), 100);
    } else player2.move(dx > 0 ? -1 : 1);
  } else {
    if (action < 0.35) player2.move(dx > 0 ? 1 : -1);
    else if (action < 0.55) player2.kick(player1);
    else if (action < 0.65 && player2.specialCooldown === 0) player2.special(player1);
    else if (action < 0.8) {
      player2.jump();
      setTimeout(() => player2.kick(player1), 200);
    } else player2.jump();
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
  if (!p || GAME.state !== 'fighting' || p.dying) return;

  const opponent = p === player1 ? player2 : player1;

  switch (data.direction) {
    case "left": p.move(-1); break;
    case "right": p.move(1); break;
    case "up": p.jump(); break;
    case "down": p.crouch(); break;
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
  if (GAME.state !== 'fighting' || !player1 || player1.dying) return;
  const opp = player2;

  switch (e.key.toLowerCase()) {
    case 'a': player1.move(-1); break;
    case 'd': player1.move(1); break;
    case 'w': player1.jump(); break;
    case 's': player1.crouch(); break;
    case 'j': player1.punch(opp); break;
    case 'k': player1.kick(opp); break;
    case 'l': player1.special(opp); break;
    case 'i': player1.block(); break;
  }
});
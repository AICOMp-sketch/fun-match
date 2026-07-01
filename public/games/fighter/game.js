const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const c = canvas.getContext("2d");
const CW = canvas.width;
const CH = canvas.height;

// ════════ CONSTANTS ════════
const GRAVITY = 0.7;
const SPEED = 5;
const JUMP_V = -18;
const FLOOR_Y = 330;
const CDN = "https://cdn.jsdelivr.net/gh/chriscourses/fighting-game@main/img/";

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting', // waiting, countdown, fighting, roundEnd, gameOver
  round: 1,
  maxRounds: 3,
  timer: 60,
  timerInterval: null,
  isBotMode: false,
  lastTime: performance.now()
};

// ════════ SPRITE CLASS (backgrounds) ════════
class Sprite {
  constructor({ position, imageSrc, scale = 1, framesMax = 1, offset = {x:0, y:0} }) {
    this.position = position;
    this.scale = scale;
    this.framesMax = framesMax;
    this.offset = offset;
    this.image = new Image();
    this.image.src = encodeURI(imageSrc);
    this.framesCurrent = 0;
    this.framesElapsed = 0;
    this.framesHold = 8;
  }

  draw() {
    if (!this.image.complete || !this.image.naturalWidth) return;
    const fw = this.image.width / this.framesMax;
    c.drawImage(
      this.image,
      this.framesCurrent * fw, 0, fw, this.image.height,
      this.position.x - this.offset.x, this.position.y - this.offset.y,
      fw * this.scale, this.image.height * this.scale
    );
  }

  animate() {
    if (++this.framesElapsed % this.framesHold === 0) {
      this.framesCurrent = (this.framesCurrent + 1) % this.framesMax;
    }
  }

  update() {
    this.draw();
    this.animate();
  }
}

// ════════ FIGHTER CLASS ════════
class Fighter {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.startX = config.startX;
    this.defaultFacing = config.defaultFacing;
    this.scale = config.scale;
    this.drawOffset = config.offset;
    this.hitFrame = config.hitFrame;
    this.width = 50;
    this.height = 150;
    this.attackBox = { x: 0, y: 0, width: 160, height: 50, innerGap: 12, yOff: 50 };
    this.sprites = config.sprites;
    this.isCPU = false;

    // Load all sprite images
    for (const key in this.sprites) {
      this.sprites[key].image = new Image();
      this.sprites[key].image.src = encodeURI(this.sprites[key].src);
    }

    this.roundsWon = 0;
    this.reset();
  }

  reset() {
    this.position = { x: this.startX, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;
    this.isAttacking = false;
    this._applied = false;
    this.onGround = false;
    this.facing = this.defaultFacing;
    this.lastKey = null;
    this.aiTimer = 0;
    this.aiJump = 0;
    this.aiAtk = 0;
    this.image = this.sprites.idle.image;
    this.framesMax = this.sprites.idle.framesMax;
    this.framesCurrent = 0;
    this.framesElapsed = 0;
    this.framesHold = 6;
  }

  get cx() { return this.position.x + this.width / 2; }

  draw() {
    if (!this.image.complete || !this.image.naturalWidth) return;
    const fw = this.image.width / this.framesMax;
    const dx = this.position.x - this.drawOffset.x;
    const dy = this.position.y - this.drawOffset.y;
    const dw = fw * this.scale;
    const dh = this.image.height * this.scale;
    const flip = this.facing !== this.defaultFacing;

    c.save();
    if (flip) {
      c.translate(dx + dw / 2, 0);
      c.scale(-1, 1);
      c.translate(-(dx + dw / 2), 0);
    }
    c.drawImage(this.image, this.framesCurrent * fw, 0, fw, this.image.height, dx, dy, dw, dh);
    c.restore();
  }

  animate() {
    if (this.dead && this.image === this.sprites.death.image
        && this.framesCurrent === this.sprites.death.framesMax - 1) return;
    if (++this.framesElapsed % this.framesHold === 0) {
      if (this.framesCurrent < this.framesMax - 1) this.framesCurrent++;
      else if (!(this.image === this.sprites.death.image)) this.framesCurrent = 0;
    }
  }

  updateAttackBox() {
    const cx = this.cx;
    const b = this.attackBox;
    b.x = this.facing === 1 ? cx + b.innerGap : cx - b.innerGap - b.width;
    b.y = this.position.y + b.yOff;
  }

  physics() {
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.position.x = Math.max(-30, Math.min(CW - this.width + 30, this.position.x));
    if (this.position.y + this.height + this.velocity.y >= CH - 96) {
      this.velocity.y = 0;
      this.position.y = FLOOR_Y;
      this.onGround = true;
    } else {
      this.velocity.y += GRAVITY;
      this.onGround = false;
    }
  }

  setAnim(name) {
    const s = this.sprites[name];
    if (this.image === this.sprites.death.image) return;
    if (this.image === this.sprites.attack1.image &&
        this.framesCurrent < this.sprites.attack1.framesMax - 1) return;
    if (this.image === this.sprites.takeHit.image &&
        this.framesCurrent < this.sprites.takeHit.framesMax - 1) return;
    if (this.image !== s.image) {
      this.image = s.image;
      this.framesMax = s.framesMax;
      this.framesCurrent = 0;
    }
  }

  attack() {
    if (this.dead) return;
    if (this.image === this.sprites.attack1.image &&
        this.framesCurrent < this.sprites.attack1.framesMax - 1) return;
    if (this.image === this.sprites.takeHit.image &&
        this.framesCurrent < this.sprites.takeHit.framesMax - 1) return;

    this.image = this.sprites.attack1.image;
    this.framesMax = this.sprites.attack1.framesMax;
    this.framesCurrent = 0;
    this.isAttacking = true;
    this._applied = false;

    if (typeof Sounds !== 'undefined') Sounds.kick();
  }

  jump() {
    if (this.onGround && !this.dead) {
      this.velocity.y = JUMP_V;
      if (typeof Sounds !== 'undefined') Sounds.jump();
    }
  }

  takeHit() {
    this.health = Math.max(0, this.health - 15);
    this.isAttacking = false;
    if (typeof Sounds !== 'undefined') Sounds.hit();
    screenShake();

    if (this.health <= 0) {
      this.dead = true;
      this.image = this.sprites.death.image;
      this.framesMax = this.sprites.death.framesMax;
      this.framesCurrent = 0;
      if (typeof Sounds !== 'undefined') Sounds.ko();
    } else {
      this.image = this.sprites.takeHit.image;
      this.framesMax = this.sprites.takeHit.framesMax;
      this.framesCurrent = 0;
    }
  }
}

// ════════ ASSETS ════════
const background = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: CDN + "background.png"
});

const shop = new Sprite({
  position: { x: 600, y: 128 },
  imageSrc: CDN + "shop.png",
  scale: 2.75,
  framesMax: 6
});

// ════════ CREATE FIGHTERS ════════
let player1 = null;
let player2 = null;

function createPlayer1(id, name) {
  return new Fighter({
    id,
    name,
    startX: 200,
    defaultFacing: 1,
    scale: 2.5,
    offset: { x: 215, y: 157 },
    hitFrame: 4,
    sprites: {
      idle:    { src: CDN + "samuraiMack/Idle.png",    framesMax: 8 },
      run:     { src: CDN + "samuraiMack/Run.png",     framesMax: 8 },
      jump:    { src: CDN + "samuraiMack/Jump.png",    framesMax: 2 },
      fall:    { src: CDN + "samuraiMack/Fall.png",    framesMax: 2 },
      attack1: { src: CDN + "samuraiMack/Attack1.png", framesMax: 6 },
      takeHit: { src: CDN + "samuraiMack/Take Hit - white silhouette.png", framesMax: 4 },
      death:   { src: CDN + "samuraiMack/Death.png",   framesMax: 6 }
    }
  });
}

function createPlayer2(id, name) {
  return new Fighter({
    id,
    name,
    startX: 760,
    defaultFacing: -1,
    scale: 2.5,
    offset: { x: 215, y: 167 },
    hitFrame: 2,
    sprites: {
      idle:    { src: CDN + "kenji/Idle.png",    framesMax: 4 },
      run:     { src: CDN + "kenji/Run.png",     framesMax: 8 },
      jump:    { src: CDN + "kenji/Jump.png",    framesMax: 2 },
      fall:    { src: CDN + "kenji/Fall.png",    framesMax: 2 },
      attack1: { src: CDN + "kenji/Attack1.png", framesMax: 4 },
      takeHit: { src: CDN + "kenji/Take hit.png", framesMax: 3 },
      death:   { src: CDN + "kenji/Death.png",   framesMax: 7 }
    }
  });
}

// ════════ SCREEN EFFECTS ════════
function screenShake() {
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 300);
}

function showAnnouncement(text) {
  const el = document.getElementById('announcement');
  document.getElementById('announcement-text').textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ════════ GAME FLOW ════════
function updateHpBars() {
  if (player1) {
    const hp1 = (player1.health / player1.maxHealth) * 100;
    const bar1 = document.getElementById('p1-hp');
    bar1.style.width = hp1 + '%';
    bar1.classList.toggle('low', hp1 < 30);
  }
  if (player2) {
    const hp2 = (player2.health / player2.maxHealth) * 100;
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

  GAME.round = 1;
  player1.roundsWon = 0;
  player2.roundsWon = 0;
  updateRoundDots();

  startRound();
}

function startRound() {
  GAME.state = 'countdown';
  GAME.timer = 60;
  player1.reset();
  player2.reset();
  player2.isCPU = GAME.isBotMode;
  updateHpBars();

  document.getElementById('round-text').textContent = `ROUND ${GAME.round}`;
  document.getElementById('p1-name').textContent = player1.name.toUpperCase();
  document.getElementById('p2-name').textContent = player2.name.toUpperCase();

  if (typeof Sounds !== 'undefined') Sounds.round();
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
      if (player1.health > player2.health) endRound(player1);
      else if (player2.health > player1.health) endRound(player2);
      else endRound(null);
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
  if (typeof Sounds !== 'undefined') Sounds.win();

  const winner = player1.roundsWon > player2.roundsWon ? player1 : player2;

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.innerHTML = `
    <h1>${winner.name.toUpperCase()} WINS!</h1>
    <p>Final Score: ${player1.roundsWon} - ${player2.roundsWon}</p>
    <div class="game-over-buttons">
      <button class="go-btn primary" onclick="location.reload()">REMATCH</button>
      <a href="../../" class="go-btn secondary">BACK TO HUB</a>
    </div>
  `;
  document.querySelector('.arena').appendChild(overlay);
}

// ════════ BOT AI ════════
function runAI(dt) {
  if (!player2 || player2.dead || player1.dead) {
    if (player2) player2.velocity.x = 0;
    return;
  }

  const dx = player1.cx - player2.cx;
  const adist = Math.abs(dx);
  const dir = dx >= 0 ? 1 : -1;
  const want = 165;

  if (adist > want + 45) player2.velocity.x = dir * SPEED;
  else if (adist < want - 45) player2.velocity.x = -dir * SPEED;
  else player2.velocity.x = 0;

  player2.aiJump -= dt;
  if (player2.aiJump <= 0) {
    if (player2.onGround && adist > 250 && Math.random() < 0.4) {
      player2.velocity.y = JUMP_V;
    }
    player2.aiJump = 0.8 + Math.random() * 1.2;
  }

  player2.aiAtk -= dt;
  if (player2.aiAtk <= 0 && adist < 210 && player2.onGround) {
    player2.attack();
    player2.aiAtk = 0.7 + Math.random() * 0.8;
  }
}

// ════════ MAIN LOOP ════════
function chooseSprite(f) {
  if (f.velocity.y < 0) f.setAnim("jump");
  else if (f.velocity.y > 0) f.setAnim("fall");
  else if (f.velocity.x !== 0) f.setAnim("run");
  else f.setAnim("idle");
}

function resolveHit(atk, def) {
  if (!atk.isAttacking) { atk._applied = false; return; }
  if (atk.image === atk.sprites.attack1.image &&
      atk.framesCurrent === atk.hitFrame && !atk._applied) {
    atk._applied = true;
    atk.isAttacking = false;
    if (!def.dead && collides(atk, def)) {
      def.takeHit();
      updateHpBars();
      if (def.health <= 0) {
        setTimeout(() => endRound(atk === player1 ? player1 : player2), 1500);
      }
    }
  }
}

function collides(a, d) {
  const b = a.attackBox;
  return b.x + b.width >= d.position.x &&
         b.x <= d.position.x + d.width &&
         b.y + b.height >= d.position.y &&
         b.y <= d.position.y + d.height;
}

// Input state
const keys = { a: false, d: false };

function frame(now) {
  const dt = Math.min(0.05, (now - GAME.lastTime) / 1000);
  GAME.lastTime = now;
  requestAnimationFrame(frame);

  // Background
  c.fillStyle = "#000";
  c.fillRect(0, 0, CW, CH);

  background.update();
  shop.update();

  c.fillStyle = "rgba(255, 255, 255, 0.12)";
  c.fillRect(0, 0, CW, CH);

  if (!player1 || !player2) return;

  const active = GAME.state === 'fighting';

  // Input
  if (active && !player1.dead) {
    player1.velocity.x = 0;
    if (keys.a && player1.lastKey === "a") player1.velocity.x = -SPEED;
    else if (keys.d && player1.lastKey === "d") player1.velocity.x = SPEED;
  } else {
    player1.velocity.x = 0;
  }

  if (active && !player2.dead) {
    if (GAME.isBotMode) {
      runAI(dt);
    }
  } else {
    player2.velocity.x = 0;
  }

  // Facing
  if (!player1.dead) player1.facing = player1.cx <= player2.cx ? 1 : -1;
  if (!player2.dead) player2.facing = player2.cx <= player1.cx ? 1 : -1;

  // Physics
  player1.physics();
  player2.physics();
  player1.updateAttackBox();
  player2.updateAttackBox();

  // Animation
  if (active) {
    chooseSprite(player1);
    chooseSprite(player2);
  }

  // Draw fighters
  player1.draw();
  player1.animate();
  player2.draw();
  player2.animate();

  // Hit resolution
  resolveHit(player1, player2);
  resolveHit(player2, player1);
}

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
  document.getElementById("room-code").textContent = data.roomCode;
});

socket.on("player-joined", (player) => {
  if (!player1) {
    player1 = createPlayer1(player.id, player.name);
    document.getElementById('slot-1').classList.add('filled');
    document.getElementById('slot-1').querySelector('.player-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-1').querySelector('.status').textContent = 'Ready!';
  } else if (!player2 && !GAME.isBotMode) {
    player2 = createPlayer2(player.id, player.name);
    document.getElementById('slot-2').classList.add('filled');
    document.getElementById('slot-2').querySelector('.player-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-2').querySelector('.status').textContent = 'Ready!';

    setTimeout(startMatch, 1500);
  }
});

socket.on("player-moved", (data) => {
  if (GAME.state !== 'fighting') return;

  const p = player1 && player1.id === data.playerId ? player1 : 
            (player2 && player2.id === data.playerId ? player2 : null);
  if (!p || p.dead) return;

  switch (data.direction) {
    case "left":
      p.velocity.x = -SPEED;
      p.lastKey = 'a';
      break;
    case "right":
      p.velocity.x = SPEED;
      p.lastKey = 'd';
      break;
    case "up":
    case "jump":
      p.jump();
      break;
    case "punch":
    case "kick":
    case "special":
      p.attack();
      break;
  }
});

// ════════ BOT MODE ════════
document.getElementById('bot-mode-btn').addEventListener('click', () => {
  GAME.isBotMode = true;
  if (!player1) {
    player1 = createPlayer1('local-p1', 'SAMURAI');
    document.getElementById('slot-1').classList.add('filled');
    document.getElementById('slot-1').querySelector('.status').textContent = 'Ready!';
  }
  player2 = createPlayer2('bot', 'KENJI');
  player2.isCPU = true;
  document.getElementById('slot-2').classList.add('filled');
  document.getElementById('slot-2').querySelector('.status').textContent = 'CPU';

  setTimeout(startMatch, 800);
});

// ════════ KEYBOARD CONTROLS ════════
const PREVENT = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);

document.addEventListener("keydown", (e) => {
  if (PREVENT.has(e.key)) e.preventDefault();
  if (GAME.state !== 'fighting' || !player1 || player1.dead) return;

  switch (e.key.toLowerCase()) {
    case 'a':
      keys.a = true;
      player1.lastKey = 'a';
      break;
    case 'd':
      keys.d = true;
      player1.lastKey = 'd';
      break;
    case 'w':
      if (player1.onGround) player1.jump();
      break;
    case 'j':
    case ' ':
      player1.attack();
      break;
    case 'k':
      player1.attack(); // Special = same as attack for now
      break;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === 'a') keys.a = false;
  if (e.key === 'd') keys.d = false;
});

// ════════ START GAME LOOP ════════
requestAnimationFrame(frame);
console.log('⚔️ Samurai Showdown loaded!');
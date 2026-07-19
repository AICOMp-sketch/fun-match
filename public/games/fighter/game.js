const socket = io("https://fun-match-production.up.railway.app");
const canvas = document.getElementById("gameCanvas");
const c = canvas.getContext("2d");
const CW = canvas.width;
const CH = canvas.height;

// ════════ CONSTANTS ════════
const GRAVITY = 0.7;
const SPEED = 5;
const JUMP_V = -18;

const SPRITES = {
  backgrounds: {
    mist: {
      src: "https://i.ibb.co/tpY259PV/Mist-Trees.png",
      floorY: 420,
      name: "Mist Trees",
      description: "Ancient misty forest"
    },
    bloomer: {
      src: "https://i.ibb.co/TMdBW5dr/Bloomer-Trees.png",
      floorY: 380,
      name: "Bloomer Trees",
      description: "Cherry blossom garden"
    },
    palace: {
      src: "https://i.ibb.co/7xpJGJym/Palace.png",
      floorY: 420,
      name: "Palace",
      description: "Beautiful arena"
    }
  },
  dread: {
    idle: { src: "https://i.ibb.co/RGBKkbjg/Idle.png", framesMax: 10 },
    run: { src: "https://i.ibb.co/S7s7GHTb/Run.png", framesMax: 8 },
    jump: { src: "https://i.ibb.co/DDwY1ng7/Jump.png", framesMax: 3 },
    fall: { src: "https://i.ibb.co/n8MxfhkC/Fall.png", framesMax: 3 },
    attack1: { src: "https://i.ibb.co/8LrX2HzP/Attack1.png", framesMax: 7 },
    attack2: { src: "https://i.ibb.co/v6FdbMQh/Attack2.png", framesMax: 7 },
    attack3: { src: "https://i.ibb.co/QvVnnNfN/Attack3.png", framesMax: 8 },
    takeHit: { src: "https://i.ibb.co/5ggJMyWv/Take-hit.png", framesMax: 3 },
    death: { src: "https://i.ibb.co/rGBF8MVG/Death.png", framesMax: 7 }
  },
  kunglao: {
    idle: { src: "https://i.ibb.co/8n67DFYH/Idle.png", framesMax: 10 },
    run: { src: "https://i.ibb.co/DxpYf2X/Run.png", framesMax: 8 },
    jump: { src: "https://i.ibb.co/d0Pc68N2/Going-Up.png", framesMax: 3 },
    fall: { src: "https://i.ibb.co/HDWN7NJH/Going-Down.png", framesMax: 3 },
    attack1: { src: "https://i.ibb.co/zTbSDPqP/Attack1.png", framesMax: 7 },
    attack2: { src: "https://i.ibb.co/pBQqx9QS/Attack2.png", framesMax: 6 },
    attack3: { src: "https://i.ibb.co/B24V8kwK/Attack3.png", framesMax: 9 },
    takeHit: { src: "https://i.ibb.co/d0ZHd4Jh/Take-Hit.png", framesMax: 3 },
    death: { src: "https://i.ibb.co/JFdvPZ8c/Death.png", framesMax: 11 }
  },
  ninja: {
    idle: { src: "https://i.ibb.co/Fv2JnPn/Idle.png", framesMax: 4 },
    run: { src: "https://i.ibb.co/Q7mn9Qrf/Run.png", framesMax: 8 },
    jump: { src: "https://i.ibb.co/vxS6VBfX/Jump.png", framesMax: 2 },
    fall: { src: "https://i.ibb.co/svC1PFQq/Fall.png", framesMax: 2 },
    attack1: { src: "https://i.ibb.co/84sdTLHZ/Attack1.png", framesMax: 4 },
    attack2: { src: "https://i.ibb.co/yFH9xzy5/Attack2.png", framesMax: 4 },
    attack3: { src: "https://i.ibb.co/84sdTLHZ/Attack1.png", framesMax: 4 },
    takeHit: { src: "https://i.ibb.co/3ZnvL9g/Take-hit.png", framesMax: 3 },
    death: { src: "https://i.ibb.co/DHb8ct2t/Death.png", framesMax: 7 }
  }
};

// Character metadata for select screen
const CHARACTERS = {
  dread: {
    name: "DREAD",
    subtitle: "The Warrior",
    description: "Balanced fighter with sword combos",
    color: "#f2c14e"
  },
  kunglao: {
    name: "KUNG LAO",
    subtitle: "The Monk",
    description: "Fast strikes with hat weapon",
    color: "#ff3860"
  },
  ninja: {
    name: "NINJA",
    subtitle: "The Shadow",
    description: "Quick and stealthy assassin",
    color: "#00e0ff"
  }
};

// ════════ GAME STATE ════════
const GAME = {
  state: 'waiting', // waiting, mapSelect, countdown, fighting, roundEnd, gameOver
  round: 1,
  maxRounds: 3,
  timer: 60,
  timerInterval: null,
  isBotMode: false,
  lastTime: performance.now(),
  selectedMap: null,
  currentFloorY: 420, // ← ADD THIS 
  player1Character: null,  // NEW
  player2Character: null   // NEW
};

// ════════ BACKGROUND SPRITE ════════
class Background {
  constructor(mapData) {
    this.image = new Image();
    this.image.src = mapData.src;
    this.floorY = mapData.floorY;
  }

  draw() {
    if (!this.image.complete || !this.image.naturalWidth) return;
    c.drawImage(this.image, 0, 0, CW, CH);
  }
}

let background = null;

// ════════ FIGHTER CLASS ════════
class Fighter {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.startX = config.startX;
    this.defaultFacing = config.defaultFacing;
    this.scale = config.scale || 2.5;
    this.drawOffset = config.offset || { x: 200, y: 150 };
    this.hitFrame = config.hitFrame || 3;
    this.width = 60;
    this.height = 160;
    this.attackBox = { x: 0, y: 0, width: 180, height: 60, innerGap: 12, yOff: 50 };
    this.sprites = config.sprites;
    this.isCPU = false;
    this.characterType = config.characterType; // 'dread' or 'kunglao'

    // Load all sprite images
    for (const key in this.sprites) {
      this.sprites[key].image = new Image();
      this.sprites[key].image.src = this.sprites[key].src;
    }

    this.roundsWon = 0;
    this.reset();
  }

  reset() {
    this.position = { x: this.startX, y: GAME.currentFloorY };
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
    this.currentAttack = null;
    this.image = this.sprites.idle.image;
    this.framesMax = this.sprites.idle.framesMax;
    this.framesCurrent = 0;
    this.framesElapsed = 0;
    this.framesHold = 6;
    this.phoneLeft = 0;
    this.phoneRight = 0;
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
      this.position.y = GAME.currentFloorY;  // ← NEW - uses map's floor
      this.onGround = true;
    } else {
      this.velocity.y += GRAVITY;
      this.onGround = false;
    }
  }

  isInAttackAnimation() {
    return (this.image === this.sprites.attack1.image ||
      this.image === this.sprites.attack2.image ||
      this.image === this.sprites.attack3.image) &&
      this.framesCurrent < this.framesMax - 1;
  }

  setAnim(name) {
    const s = this.sprites[name];
    if (!s) return;
    if (this.image === this.sprites.death.image) return;
    if (this.isInAttackAnimation()) return;
    if (this.image === this.sprites.takeHit.image &&
      this.framesCurrent < this.sprites.takeHit.framesMax - 1) return;
    if (this.image !== s.image) {
      this.image = s.image;
      this.framesMax = s.framesMax;
      this.framesCurrent = 0;
    }
  }

  doAttack(attackName, damage, hitFrame) {
    if (this.dead) return;
    if (this.isInAttackAnimation()) return;
    if (this.image === this.sprites.takeHit.image &&
      this.framesCurrent < this.sprites.takeHit.framesMax - 1) return;

    const s = this.sprites[attackName];
    if (!s) return;

    this.image = s.image;
    this.framesMax = s.framesMax;
    this.framesCurrent = 0;
    this.isAttacking = true;
    this.currentAttack = attackName;
    this.currentDamage = damage;
    this.currentHitFrame = hitFrame;
    this._applied = false;

    if (typeof Sounds !== 'undefined') {
      if (attackName === 'attack1') Sounds.punch();
      else if (attackName === 'attack2') Sounds.kick();
      else if (attackName === 'attack3') Sounds.special();
    }
  }

  attack1() { this.doAttack('attack1', 8, 3); }
  attack2() { this.doAttack('attack2', 12, 3); }
  attack3() { this.doAttack('attack3', 18, 4); }

  jump() {
    if (this.onGround && !this.dead) {
      this.velocity.y = JUMP_V;
      if (typeof Sounds !== 'undefined') Sounds.jump();
    }
  }

  takeHit(damage) {
    this.health = Math.max(0, this.health - damage);
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

// ════════ CREATE FIGHTERS ════════
let player1 = null;
let player2 = null;

function createFighter(id, name, side, characterType) {
  const spriteSet = SPRITES[characterType];
  if (!spriteSet) {
    console.error(`Character type "${characterType}" not found!`);
    return null;
  }

  // Custom offsets per character (adjust if needed)
  const offsets = {
    dread: { x: 200, y: 150 },
    kunglao: { x: 200, y: 100 },
    ninja: { x: 200, y: 120 }
  };

  return new Fighter({
    id,
    name,
    characterType,
    startX: side === 'left' ? 200 : 760,
    defaultFacing: 1,
    scale: 2.5,
    offset: offsets[characterType] || { x: 200, y: 150 },
    hitFrame: characterType === 'dread' ? 4 : 3,
    sprites: JSON.parse(JSON.stringify(spriteSet))
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

function showMapSelect() {
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('map-select-screen').classList.add('active');
}

function startMatch() {
  document.getElementById('map-select-screen').classList.remove('active');
  document.getElementById('fight-screen').classList.add('active');

  const mapData = SPRITES.backgrounds[GAME.selectedMap];
  background = new Background(mapData);
  GAME.currentFloorY = mapData.floorY;  // ← ADD THIS LINE;

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
  if (player2.aiAtk <= 0 && adist < 220 && player2.onGround) {
    const roll = Math.random();
    if (roll < 0.4) player2.attack1();
    else if (roll < 0.75) player2.attack2();
    else player2.attack3();
    player2.aiAtk = 0.9 + Math.random() * 0.9;
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

  const isAttackSprite = atk.image === atk.sprites.attack1.image ||
    atk.image === atk.sprites.attack2.image ||
    atk.image === atk.sprites.attack3.image;

  if (isAttackSprite && atk.framesCurrent === atk.currentHitFrame && !atk._applied) {
    atk._applied = true;
    atk.isAttacking = false;
    if (!def.dead && collides(atk, def)) {
      def.takeHit(atk.currentDamage);
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

const keys = { a: false, d: false };

function applyPlayerInput(player) {
  player.velocity.x = 0;

  if (player === player1) {
    if (keys.a && player.lastKey === "a") player.velocity.x = -SPEED;
    else if (keys.d && player.lastKey === "d") player.velocity.x = SPEED;
  }

  if (player.phoneLeft > 0) {
    player.velocity.x = -SPEED;
    player.phoneLeft--;
  }
  if (player.phoneRight > 0) {
    player.velocity.x = SPEED;
    player.phoneRight--;
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - GAME.lastTime) / 1000);
  GAME.lastTime = now;
  requestAnimationFrame(frame);

  // Draw background
  c.fillStyle = "#000";
  c.fillRect(0, 0, CW, CH);

  if (background) {
    background.draw();
    c.fillStyle = "rgba(0, 0, 0, 0.25)";
    c.fillRect(0, 0, CW, CH);
  }

  if (!player1 || !player2) return;

  const active = GAME.state === 'fighting';

  if (active && !player1.dead) {
    applyPlayerInput(player1);
  } else {
    player1.velocity.x = 0;
  }

  if (active && !player2.dead) {
    if (GAME.isBotMode && player2.isCPU) {
      runAI(dt);
    } else {
      applyPlayerInput(player2);
    }
  } else {
    player2.velocity.x = 0;
  }

  if (!player1.dead) player1.facing = player1.cx <= player2.cx ? 1 : -1;
  if (!player2.dead) player2.facing = player2.cx <= player1.cx ? 1 : -1;

  player1.physics();
  player2.physics();
  player1.updateAttackBox();
  player2.updateAttackBox();

  if (active) {
    chooseSprite(player1);
    chooseSprite(player2);
  }

  player1.draw();
  player1.animate();
  player2.draw();
  player2.animate();

  resolveHit(player1, player2);
  resolveHit(player2, player1);
}

function renderLobbyQR(roomCode) {
  const qrEl = document.getElementById('lobby-qr-code');
  if (!qrEl || !roomCode) return;

  const joinUrl = window.location.origin + '/controller.html?room=' + roomCode;
  qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data='
    + encodeURIComponent(joinUrl)
    + '&bgcolor=ffffff&color=0c0a12&margin=0" alt="Scan to join room ' + roomCode + '">';
}

// Store player info for multiplayer
let multiplayerPlayer1 = null;
let multiplayerPlayer2 = null;

socket.on("player-joined", (player) => {
  console.log("👤 Player joined:", player.name, player.id);
  if (GAME.isBotMode) return;

  if (!multiplayerPlayer1) {
    multiplayerPlayer1 = { id: player.id, name: player.name };
    document.getElementById('slot-1').classList.add('filled');
    document.getElementById('slot-1').querySelector('.player-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-1').querySelector('.status').textContent = 'Ready!';
    setSlotAvatar('slot-1', player.avatarUrl); // ← NEW (no-op if server doesn't send it yet)
  } else if (!multiplayerPlayer2) {
    multiplayerPlayer2 = { id: player.id, name: player.name };
    document.getElementById('slot-2').classList.add('filled');
    document.getElementById('slot-2').querySelector('.player-name').textContent = player.name.toUpperCase();
    document.getElementById('slot-2').querySelector('.status').textContent = 'Ready!';
    setSlotAvatar('slot-2', player.avatarUrl); // ← NEW

    setTimeout(showCharacterSelect, 1500);
  }
});

socket.on("player-moved", (data) => {
  if (GAME.state !== 'fighting') return;

  const p = player1 && player1.id === data.playerId ? player1 :
    (player2 && player2.id === data.playerId ? player2 : null);
  if (!p || p.dead) return;

  const HOLD_FRAMES = 15;

  switch (data.direction) {
    case "left":
      p.phoneLeft = HOLD_FRAMES;
      p.lastKey = 'a';
      break;
    case "right":
      p.phoneRight = HOLD_FRAMES;
      p.lastKey = 'd';
      break;
    case "up":
    case "jump":
      if (p.onGround) p.jump();
      break;
    case "punch":
      p.attack1();
      break;
    case "kick":
      p.attack2();
      break;
    case "special":
      p.attack3();
      break;
    case "block":
      // Not used
      break;
  }
});

// ════════ BOT MODE ════════
function activateBotMode() {
  GAME.isBotMode = true;

  document.getElementById('slot-1').classList.add('filled');
  document.getElementById('slot-1').querySelector('.status').textContent = 'You!';
  document.getElementById('slot-2').classList.add('filled', 'cpu');
  document.getElementById('slot-2').querySelector('.status').textContent = 'CPU';

  setTimeout(showCharacterSelect, 800);
}

const botModeBtn = document.getElementById('bot-mode-btn');
if (botModeBtn) {
  botModeBtn.addEventListener('click', activateBotMode);
}

function showCharacterSelect() {
  document.getElementById('waiting-screen').classList.remove('active');
  document.getElementById('character-select-screen').classList.add('active');

  // Reset selections
  GAME.player1Character = null;
  GAME.player2Character = null;
  updateCharacterSelectUI();
}

function updateCharacterSelectUI() {
  // Update selected names
  document.getElementById('p1-selected-name').textContent =
    GAME.player1Character ? CHARACTERS[GAME.player1Character].name : '-';
  document.getElementById('p2-selected-name').textContent =
    GAME.player2Character ? CHARACTERS[GAME.player2Character].name : '-';

  // Update card highlights
  document.querySelectorAll('.character-card').forEach(card => {
    const type = card.dataset.character;
    card.classList.remove('selected-p1', 'selected-p2', 'selected-both');

    if (type === GAME.player1Character && type === GAME.player2Character) {
      card.classList.add('selected-both');
    } else if (type === GAME.player1Character) {
      card.classList.add('selected-p1');
    } else if (type === GAME.player2Character) {
      card.classList.add('selected-p2');
    }
  });

  // Update title
  const title = document.getElementById('char-select-title');
  if (!GAME.player1Character) {
    title.textContent = 'PLAYER 1 - CHOOSE YOUR FIGHTER';
  } else if (!GAME.player2Character) {
    title.textContent = 'PLAYER 2 - CHOOSE YOUR FIGHTER';
  } else {
    title.textContent = 'READY TO FIGHT!';
  }

  // Enable confirm when both selected
  document.getElementById('confirm-chars-btn').disabled =
    !GAME.player1Character || !GAME.player2Character;
}

// Character selection handlers
document.querySelectorAll('.character-card').forEach(card => {
  card.addEventListener('click', () => {
    const character = card.dataset.character;

    if (!GAME.player1Character) {
      GAME.player1Character = character;
    } else if (!GAME.player2Character) {
      GAME.player2Character = character;
    } else {
      // Both selected - clicking resets both to allow re-picking
      GAME.player1Character = character;
      GAME.player2Character = null;
    }

    updateCharacterSelectUI();
  });
});

// Confirm characters button
document.getElementById('confirm-chars-btn').addEventListener('click', () => {
  if (!GAME.player1Character || !GAME.player2Character) return;

  // Create fighters based on mode
  if (GAME.isBotMode) {
    player1 = createFighter('local-p1',
      CHARACTERS[GAME.player1Character].name,
      'left',
      GAME.player1Character);

    player2 = createFighter('bot',
      CHARACTERS[GAME.player2Character].name,
      'right',
      GAME.player2Character);

    player2.isCPU = true;
  } else {
    // Multiplayer - use socket IDs
    player1 = createFighter(multiplayerPlayer1.id,
      multiplayerPlayer1.name.toUpperCase(),
      'left',
      GAME.player1Character);

    player2 = createFighter(multiplayerPlayer2.id,
      multiplayerPlayer2.name.toUpperCase(),
      'right',
      GAME.player2Character);
  }

  // Go to map select
  document.getElementById('character-select-screen').classList.remove('active');
  document.getElementById('map-select-screen').classList.add('active');
});

// ════════ MAP SELECT ════════
document.querySelectorAll('.map-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    GAME.selectedMap = card.dataset.map;
    document.getElementById('start-fight-btn').disabled = false;
  });
});

document.getElementById('start-fight-btn').addEventListener('click', () => {
  if (GAME.selectedMap) {
    startMatch();
  }
});

// ════════ KEYBOARD ════════
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
      player1.attack1();
      break;
    case 'k':
      player1.attack2();
      break;
    case 'l':
      player1.attack3();
      break;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === 'a') keys.a = false;
  if (e.key === 'd') keys.d = false;
});

// Helper: drop a player's avatar image into their bubble
function setSlotAvatar(slotId, avatarUrl) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const img = slot.querySelector('.bubble-avatar-img');
  const url = avatarUrl || '../../images/default-avatar.png';
  img.src = url;
  img.onerror = () => { img.style.display = 'none'; }; // falls back to the SVG placeholder underneath
  img.onload = () => { img.style.display = 'block'; };
}

setSlotAvatar('slot-1', null);
setSlotAvatar('slot-2', null);

function toggleRoomInfo() {
  const popover = document.getElementById('room-info-popover');
  if (!popover) return;

  const willShow = popover.classList.contains('hidden');
  popover.classList.toggle('hidden');

  if (willShow) populateRoomInfo();
}

function populateRoomInfo() {
  const configStr = sessionStorage.getItem('roomConfig');
  if (!configStr) return;

  let config;
  try {
    config = JSON.parse(configStr);
  } catch (e) {
    return;
  }

  document.getElementById('info-room-name').textContent = config.roomName || '—';
  document.getElementById('info-privacy').textContent =
    config.privacy === 'private' ? 'Private 🔒' : 'Public 🌐';
  document.getElementById('info-mode').textContent =
    config.mode === 'survival' ? 'Survival' : 'Time Limit';
  document.getElementById('info-room-code').textContent = config.roomCode || '—';

  // Fighter is a fixed 2-player game — hide the Max Players row entirely
  const maxPlayersRow = document.getElementById('info-max-players-row');
  if (config.game === 'fighter') {
    maxPlayersRow.classList.add('hidden');
  } else {
    maxPlayersRow.classList.remove('hidden');
    document.getElementById('info-max-players').textContent = config.maxPlayers || '—';
  }
}

// Close popover when clicking outside it
document.addEventListener('click', function (e) {
  const popover = document.getElementById('room-info-popover');
  const btn = document.getElementById('room-info-btn');
  if (!popover || popover.classList.contains('hidden')) return;
  if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    popover.classList.add('hidden');
  }
});

let currentRoomCode = null;
let currentSessionId = null;
let pendingRoomConfig = null;

socket.on("connect", () => {
  console.log("✅ Connected!");
  let roomCode = null;
  const configStr = sessionStorage.getItem('roomConfig');
  if (configStr) {
    try {
      pendingRoomConfig = JSON.parse(configStr);
      roomCode = pendingRoomConfig.roomCode;
    } catch (e) { }
  }
  socket.emit("create-room", { roomCode });
});

socket.on("room-created", async (data) => {
  console.log("🏠 Room:", data.roomCode);
  currentRoomCode = data.roomCode;
  document.getElementById("room-code").textContent = data.roomCode;

  console.log('📝 Attempting to create game session...');
  const result = await createGameSession({
    gameType: 'fighter',
    roomCode: data.roomCode,
    privacy: pendingRoomConfig ? pendingRoomConfig.privacy : 'public',
    mode: pendingRoomConfig ? pendingRoomConfig.mode : 'time_limit',
    maxPlayers: pendingRoomConfig ? pendingRoomConfig.maxPlayers : 2
  });

  console.log('📝 createGameSession result:', result);

  if (result.data) {
    currentSessionId = result.data.id;
    console.log('✅ Session created with id:', currentSessionId);
  } else {
    console.error('❌ Could not create game session:', result.error);
  }
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('bot') === '1') {
  activateBotMode();
}

async function exitLobbyAndCleanup() {
  const btn = document.getElementById('lobby-close-btn');
  const confirmLeave = confirm('Leave this room? The room will be deleted for everyone.');
  if (!confirmLeave) return;

  console.log('🗑️ Exit clicked. currentSessionId is:', currentSessionId);

  if (btn) btn.disabled = true;

  try {
    if (currentSessionId) {
      const result = await deleteGameSession(currentSessionId);
      console.log('🗑️ deleteGameSession result:', result);
      if (result.error) {
        console.error('❌ Session cleanup error:', result.error);
      } else {
        console.log('✅ Session deleted successfully');
      }
    } else {
      console.warn('⚠️ No currentSessionId set — nothing to delete. Session was likely never created.');
    }
  } catch (err) {
    console.error('❌ Unexpected error during exit cleanup:', err);
  } finally {
    if (btn) btn.disabled = false;
  }

  // window.location.href = '../../';
}

// ════════ START ════════
requestAnimationFrame(frame);
console.log('⚔️ Mortal Arena loaded!');
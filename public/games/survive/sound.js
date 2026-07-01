const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playTone(freq, duration, type = 'sine', volume = 0.2) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playSweep(startFreq, endFreq, duration, type = 'sawtooth', volume = 0.2) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const Sounds = {
  playCard: () => {
    playSweep(800, 400, 0.15, 'square', 0.15);
  },

  drawCard: () => {
    playTone(300, 0.08, 'square', 0.15);
    setTimeout(() => playTone(400, 0.1, 'sine', 0.1), 50);
  },

  skip: () => {
    playSweep(600, 200, 0.2, 'sawtooth', 0.2);
  },

  reverse: () => {
    playSweep(400, 800, 0.15, 'square', 0.15);
    setTimeout(() => playSweep(800, 400, 0.15, 'square', 0.15), 100);
  },

  draw2: () => {
    playTone(500, 0.1, 'square', 0.2);
    setTimeout(() => playTone(500, 0.1, 'square', 0.2), 120);
  },

  wild: () => {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.1, 'sine', 0.15), i * 60);
    });
  },

  draw4: () => {
    [880, 700, 500, 300].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'sawtooth', 0.2), i * 80);
    });
  },

  uno: () => {
    playTone(1046, 0.15, 'square', 0.25);
    setTimeout(() => playTone(1318, 0.15, 'square', 0.25), 100);
    setTimeout(() => playTone(1568, 0.3, 'square', 0.3), 200);
  },

  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'square', 0.25), i * 120);
    });
  },

  turn: () => {
    playTone(600, 0.1, 'sine', 0.15);
  },

  error: () => {
    playSweep(200, 100, 0.2, 'square', 0.2);
  }
};
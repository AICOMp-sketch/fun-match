// Sound effects using Web Audio API (no files needed!)
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
  punch: () => {
    playSweep(200, 80, 0.1, 'square', 0.3);
  },

  kick: () => {
    playSweep(150, 50, 0.15, 'sawtooth', 0.35);
  },

  special: () => {
    playSweep(100, 800, 0.3, 'sine', 0.3);
    setTimeout(() => playSweep(800, 200, 0.2, 'square', 0.25), 100);
  },

  block: () => {
    playTone(400, 0.05, 'square', 0.15);
  },

  hit: () => {
    playTone(80, 0.1, 'square', 0.4);
    setTimeout(() => playTone(60, 0.15, 'sawtooth', 0.3), 30);
  },

  jump: () => {
    playSweep(300, 600, 0.1, 'sine', 0.15);
  },

  ko: () => {
    playSweep(800, 100, 0.5, 'sawtooth', 0.4);
    setTimeout(() => playSweep(200, 50, 0.5, 'square', 0.35), 200);
  },

  round: () => {
    playTone(523, 0.15, 'square', 0.2);
    setTimeout(() => playTone(659, 0.15, 'square', 0.2), 150);
    setTimeout(() => playTone(784, 0.3, 'square', 0.25), 300);
  },

  win: () => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'square', 0.25), i * 100);
    });
  }
};
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

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

function startEngine() {
  initAudio();
  if (engineOsc) return;

  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();

  engineOsc.type = 'sawtooth';
  engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime);

  engineGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

  // Add lowpass filter for nicer engine sound
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, audioCtx.currentTime);

  engineOsc.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();
}

function updateEngine(speed) {
  if (!engineOsc) return;
  const freq = 60 + (speed * 40); // 60Hz idle, up to 260Hz at full speed
  engineOsc.frequency.linearRampToValueAtTime(freq, audioCtx.currentTime + 0.1);
  engineGain.gain.linearRampToValueAtTime(0.03 + (speed * 0.04), audioCtx.currentTime + 0.1);
}

function stopEngine() {
  if (engineOsc) {
    engineOsc.stop();
    engineOsc = null;
  }
}

const Sounds = {
  countdown: () => playTone(440, 0.2, 'square', 0.3),
  go: () => {
    playTone(880, 0.1, 'square', 0.3);
    setTimeout(() => playTone(1100, 0.3, 'square', 0.3), 100);
  },
  boost: () => {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  },
  crash: () => {
    initAudio();
    const noise = audioCtx.createBufferSource();
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    noise.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
  },
  lap: () => {
    [600, 800, 1000].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'square', 0.2), i * 100);
    });
  },
  finish: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'square', 0.25), i * 120);
    });
  }
};
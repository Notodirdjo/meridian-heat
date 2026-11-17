// MERIDIAN HEAT — audio.js: all sound is synthesized with WebAudio.
// No audio files, no network. SFX are short oscillator/noise bursts; the
// music is a synthwave loop (bassline + pads) driven by a lookahead
// scheduler, plus a two-tone siren and an engine hum while wanted/driving.

import { G } from './config.js';

let ac = null;
let master = null;
let musicTimer = null;
let step = 0;
let nextStepTime = 0;
let sirenOsc = null, sirenGain = null, sirenAlt = false;
let engineOsc = null, engineGain = null;
let started = false;

// Bassline: A minor synthwave, 16 steps a bar, 112 BPM.
const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
const PAD_CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 220, 261.63]];

export function initAudio() {
  if (started) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    started = true;
    startMusic();
  } catch (e) {
    started = false; // audio is optional; the game plays without it
  }
}

function noiseBuffer(seconds) {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseHit(dur, vol, filterFreq) {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  shoot() { noiseHit(0.09, 0.5, 3200); blip(220, 0.08, 'square', 0.22, 60); },
  enemyShoot() { noiseHit(0.07, 0.25, 2400); },
  punch() { noiseHit(0.08, 0.4, 700); blip(120, 0.1, 'sine', 0.4, 50); },
  explosion() {
    noiseHit(0.7, 0.9, 900);
    blip(90, 0.6, 'sine', 0.7, 28);
  },
  pickup() { blip(660, 0.09, 'sine', 0.3); setTimeout(() => blip(990, 0.12, 'sine', 0.3), 80); },
  cash() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.28), i * 70)); },
  missionStart() { [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.3), i * 90)); },
  missionFail() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'sawtooth', 0.18), i * 110)); },
  carEnter() { blip(180, 0.12, 'square', 0.2, 320); },
  crash() { noiseHit(0.18, 0.5, 500); },
  arrest() { blip(440, 0.3, 'sawtooth', 0.25, 220); },
  click() { blip(880, 0.05, 'square', 0.15); },
  reload() { blip(300, 0.07, 'square', 0.2); setTimeout(() => blip(420, 0.07, 'square', 0.2), 120); },
  hurt() { blip(140, 0.15, 'sawtooth', 0.3, 70); },
  health() { blip(520, 0.1, 'sine', 0.3); setTimeout(() => blip(780, 0.15, 'sine', 0.3), 90); },
};

// ---- music scheduler ---------------------------------------------------
function scheduleStep(s, t) {
  const bass = BASS[s % 16];
  if (bass) {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = bass;
    f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.25);
  }
  if (s % 16 === 0) {
    const chord = PAD_CHORDS[Math.floor(s / 16) % PAD_CHORDS.length];
    for (const freq of chord) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + 3.6);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 3.7);
    }
  }
  if (s % 8 === 4) { // sparkle arp note
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = 880 * (s % 32 === 4 ? 1 : 1.5);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.32);
  }
}

function startMusic() {
  if (!ac || musicTimer) return;
  step = 0;
  nextStepTime = ac.currentTime + 0.1;
  const stepDur = 60 / 112 / 2; // eighth notes at 112 BPM
  musicTimer = setInterval(() => {
    if (!ac) return;
    while (nextStepTime < ac.currentTime + 0.25) {
      scheduleStep(step, nextStepTime);
      step++;
      nextStepTime += stepDur;
    }
  }, 60);
}

// ---- siren + engine, updated every frame -------------------------------
export function updateAudio() {
  if (!ac) return;
  const wanted = G.wanted > 0 && (G.state === 'playing');
  if (wanted && !sirenOsc) {
    sirenOsc = ac.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 750;
    sirenGain = ac.createGain(); sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start();
    sirenAlt = false;
  }
  if (sirenOsc) {
    sirenGain.gain.setTargetAtTime(wanted ? 0.035 : 0, ac.currentTime, 0.2);
    if (wanted) {
      sirenAlt = !sirenAlt;
      sirenOsc.frequency.setTargetAtTime(sirenAlt ? 950 : 700, ac.currentTime, 0.08);
    }
  }
  const driving = G.state === 'playing' && G.player && G.player.car;
  if (driving && !engineOsc) {
    engineOsc = ac.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
    engineGain = ac.createGain(); engineGain.gain.value = 0.0;
    engineOsc.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  if (engineOsc) {
    const sp = driving ? Math.abs(G.player.car.speed) : 0;
    engineGain.gain.setTargetAtTime(driving ? 0.03 + sp / 470 * 0.03 : 0, ac.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(42 + sp * 0.22, ac.currentTime, 0.1);
  }
}

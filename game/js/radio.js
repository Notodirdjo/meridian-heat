import { G } from './config.js';

export const STATIONS = [
  null,
  { name: 'SUNSET FM 89.1', label: 'Synthwave', bpm: 100, root: 55, bassType: 'sawtooth',
    bass: '0...0...3...0...5...3...0...7..', pad: '0...8...3...10..', lead: '12......10......7.......5......',
    kick: 'x...x...x...x...', hat: '..x...x...x...x.' },
  { name: 'MERIDIAN HEAT 104.7', label: 'Phonk', bpm: 130, root: 41, bassType: 'sine',
    bass: '0.0.....0.12....0.0.....7.5....', pad: '0...............', lead: '............12......10..7..',
    kick: 'x.....x.......x.....x.......', hat: 'x.x.x.x.x.x.x.x.' },
  { name: 'KORAL JAZZ 92.5', label: 'Jazz', bpm: 90, root: 65, bassType: 'triangle',
    bass: '0...3...5...7...8...7...5...3..', pad: '0...5...3...7...', lead: '7.......5.......3.......0......',
    kick: 'x.......x.......', hat: '..x...x...x...x.' },
];

let ctx = null, master = null, noiseBuf = null, timer = null, step = 0, nextT = 0;

function ensureCtx() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = G.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch (e) { return false; }
}

function noteAt(freq, t, dur, type, vol, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseAt(t, dur, vol, freq) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'highpass'; f.frequency.value = freq || 6000;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

function semi(ch) {
  if (ch === '.') return -1;
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  return ch.charCodeAt(0) - 87;
}

function scheduleStep(st, s, t) {
  const spb = 60 / st.bpm / 4;
  const b = semi(st.bass[s]);
  if (b >= 0) noteAt(st.root * Math.pow(2, b / 12), t, spb * 1.8, st.bassType, 0.22);
  const l = semi(st.lead[s]);
  if (l >= 0) noteAt(st.root * 4 * Math.pow(2, l / 12), t, spb * 2, 'square', 0.05);
  if (s % 4 === 0) {
    const p = semi(st.pad[s]);
    if (p >= 0) {
      for (const iv of [0, 4, 7]) noteAt(st.root * 2 * Math.pow(2, (p + iv) / 12), t, spb * 4, 'sawtooth', 0.03);
    }
  }
  if (st.kick[s] === 'x') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
  }
  if (st.hat[s] === 'x') noiseAt(t, 0.04, 0.08, 7000);
}

function tick() {
  if (!ctx || G.radioStation === 0) return;
  const st = STATIONS[G.radioStation];
  const spb = 60 / st.bpm / 4;
  while (nextT < ctx.currentTime + 0.25) {
    scheduleStep(st, step % 16, nextT);
    nextT += spb;
    step++;
  }
}

export function initRadio() {
  if (!ensureCtx()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (G.radioStation === 0) G.radioStation = 1;
  step = 0;
  nextT = ctx.currentTime + 0.1;
  if (!timer) timer = setInterval(tick, 90);
}

export function resumeRadio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setStation(n) {
  G.radioStation = n;
  step = 0;
  if (ctx) nextT = ctx.currentTime + 0.1;
}

export function cycleStation() {
  setStation((G.radioStation + 1) % 4);
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx) return;
  noteAt(freq, ctx.currentTime + when, dur, type || 'sine', vol || 0.15);
}

export const sfx = {
  pickup() { blip(660, 0.09); blip(990, 0.12, 'sine', 0.15, 0.08); },
  cash() { blip(880, 0.08); blip(1174, 0.08, 'sine', 0.15, 0.07); blip(1568, 0.14, 'sine', 0.15, 0.14); },
  missionStart() { blip(392, 0.12, 'triangle', 0.2); blip(523, 0.12, 'triangle', 0.2, 0.1); blip(659, 0.2, 'triangle', 0.2, 0.2); },
  missionFail() { blip(330, 0.15, 'sawtooth', 0.12); blip(247, 0.25, 'sawtooth', 0.12, 0.14); },
  shoot() { if (ctx) noiseAt(ctx.currentTime, 0.07, 0.25, 2000); },
  punch() { blip(90, 0.1, 'sine', 0.3); },
  explosion() {
    if (!ctx) return;
    noiseAt(ctx.currentTime, 0.5, 0.4, 300);
    blip(60, 0.4, 'sine', 0.3);
  },
  rankUp() { blip(523, 0.1, 'triangle', 0.2); blip(659, 0.1, 'triangle', 0.2, 0.09); blip(784, 0.18, 'triangle', 0.2, 0.18); },
};

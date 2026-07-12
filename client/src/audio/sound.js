// Procedural audio engine (Web Audio API) — no asset files. Synthesizes an
// aggressive, high-energy metal loop for background music plus one-shot SFX
// for gameplay actions. Everything is generated with oscillators + noise +
// distortion so it stays self-contained.

let ctx = null;
let master = null; // mute gate
let musicGain = null;
let sfxGain = null;
let noiseBuffer = null;
let muted = false;

let musicOn = false;
let schedulerId = null;
let step = 0;
let nextNoteTime = 0;

const BPM = 100; // mellow synthwave tempo
const SIXTEENTH = 60 / BPM / 4;
const STEPS = 64; // 4-bar loop
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

function ensureCtx() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.32;
  musicGain.connect(master);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);

  // 1s of white noise, reused for drums/whooshes/explosions.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// Harsh clipping curve for the distorted guitar tone.
function makeDistortionCurve(amount) {
  const n = 8192;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
let distCurve = null;

function noiseSource() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

// --- Music voices (mellow synthwave) ----------------------------------------

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12); // MIDI note -> Hz

// 4-bar progression in A minor: Am – F – C – G. Each bar has a sustained pad
// triad (MIDI, octave 3-4) and a bass root an octave+ below.
const PROG = [
  { pad: [57, 60, 64], bass: 45 }, // Am
  { pad: [53, 57, 60], bass: 41 }, // F
  { pad: [60, 64, 67], bass: 48 }, // C
  { pad: [55, 59, 62], bass: 43 }, // G
];

// Warm detuned-saw pad with a slow filter sweep and soft attack/release.
function pad(time, midis, dur) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(650, time);
  lp.frequency.linearRampToValueAtTime(1600, time + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(700, time + dur);
  lp.Q.value = 4;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.16, time + 0.3); // slow swell
  g.gain.setValueAtTime(0.16, time + dur - 0.35);
  g.gain.linearRampToValueAtTime(0.0001, time + dur);
  lp.connect(g);
  g.connect(musicGain);

  for (const m of midis) {
    const f = mtof(m);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det; // slight detune = analog warmth/width
      o.connect(lp);
      o.start(time);
      o.stop(time + dur + 0.05);
    }
  }
}

// Round synth bass (saw through a low lowpass).
function bass(time, freq, dur) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  lp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.3, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(musicGain);
  o.start(time);
  o.stop(time + dur + 0.02);
}

// Bright plucky arpeggio note.
function arp(time, freq, dur) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.12, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(musicGain);
  o.start(time);
  o.stop(time + dur + 0.02);
}

// Soft four-on-the-floor drums.
function kick(time) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, time);
  o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
  g.gain.setValueAtTime(0.6, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  o.connect(g);
  g.connect(musicGain);
  o.start(time);
  o.stop(time + 0.24);
}

function snare(time) {
  const n = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.26, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
  n.connect(bp);
  bp.connect(g);
  g.connect(musicGain);
  n.start(time);
  n.stop(time + 0.2);
}

function hat(time) {
  const n = noiseSource();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.07, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
  n.connect(hp);
  hp.connect(g);
  g.connect(musicGain);
  n.start(time);
  n.stop(time + 0.04);
}

function scheduleStep(s, time) {
  const bar = Math.floor(s / 16) % 4;
  const chord = PROG[bar];
  const b16 = s % 16;

  // Sustained pad for the whole bar.
  if (b16 === 0) pad(time, chord.pad, SIXTEENTH * 16 * 0.98);

  // Bass + arp pulse on 8th notes.
  if (b16 % 2 === 0) {
    bass(time, mtof(chord.bass), SIXTEENTH * 2 * 0.9);
    const seq = [chord.pad[0], chord.pad[1], chord.pad[2], chord.pad[1]];
    const note = seq[(b16 / 2) % seq.length] + 12; // an octave up for shimmer
    arp(time, mtof(note), SIXTEENTH * 2 * 0.85);
  }

  // Gentle four-on-the-floor with backbeat snare and offbeat hats.
  if (b16 % 4 === 0) kick(time);
  if (b16 === 4 || b16 === 12) snare(time);
  if (b16 % 4 === 2) hat(time);
}

function scheduler() {
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += SIXTEENTH;
    step = (step + 1) % STEPS;
  }
}

function startMusic() {
  if (musicOn || !ctx) return;
  musicOn = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.08;
  schedulerId = setInterval(scheduler, LOOKAHEAD_MS);
}

export function stopMusic() {
  musicOn = false;
  if (schedulerId) clearInterval(schedulerId);
  schedulerId = null;
}

// --- One-shot SFX -----------------------------------------------------------

function tone(time, { type = 'square', from, to, dur, gain = 0.5, dist = false }) {
  const o = ctx.createOscillator();
  o.type = type;
  const g = ctx.createGain();
  o.frequency.setValueAtTime(from, time);
  if (to && to !== from) o.frequency.exponentialRampToValueAtTime(to, time + dur);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  let node = o;
  if (dist) {
    if (!distCurve) distCurve = makeDistortionCurve(60);
    const shaper = ctx.createWaveShaper();
    shaper.curve = distCurve;
    o.connect(shaper);
    node = shaper;
  }
  node.connect(g);
  g.connect(sfxGain);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function noiseHit(time, { freq = 1000, type = 'bandpass', q = 1, dur = 0.2, gain = 0.6, sweepTo }) {
  const n = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, time);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  n.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  n.start(time);
  n.stop(time + dur + 0.02);
}

const SFX = {
  pickup(t) {
    tone(t, { type: 'square', from: 520, to: 880, dur: 0.09, gain: 0.28 });
    tone(t + 0.05, { type: 'square', from: 880, to: 1100, dur: 0.07, gain: 0.2 });
  },
  throw(t, kind) {
    if (kind === 'arrow') {
      tone(t, { type: 'triangle', from: 900, to: 220, dur: 0.16, gain: 0.35 });
      noiseHit(t, { type: 'highpass', freq: 3000, dur: 0.1, gain: 0.2 });
    } else {
      // whoosh
      noiseHit(t, { type: 'bandpass', freq: 1200, sweepTo: 300, q: 0.7, dur: 0.22, gain: 0.4 });
      tone(t, { type: 'sine', from: 260, to: 120, dur: 0.14, gain: 0.2 });
    }
  },
  hit(t) {
    // landing a hit on someone — punchy, slightly bright
    tone(t, { type: 'square', from: 320, to: 160, dur: 0.12, gain: 0.4, dist: true });
    noiseHit(t, { type: 'bandpass', freq: 2400, q: 1.2, dur: 0.09, gain: 0.35 });
  },
  hurt(t) {
    // taking damage — harsher, lower
    tone(t, { type: 'sawtooth', from: 200, to: 80, dur: 0.28, gain: 0.45, dist: true });
    noiseHit(t, { type: 'lowpass', freq: 1600, sweepTo: 400, dur: 0.18, gain: 0.4 });
  },
  bomb(t) {
    // explosion — noise blast + low boom
    noiseHit(t, { type: 'lowpass', freq: 2600, sweepTo: 90, q: 0.6, dur: 0.7, gain: 1.0 });
    tone(t, { type: 'sine', from: 90, to: 32, dur: 0.6, gain: 0.9 });
    tone(t + 0.01, { type: 'sawtooth', from: 120, to: 40, dur: 0.4, gain: 0.4, dist: true });
  },
  death(t) {
    // downward heavy stinger
    tone(t, { type: 'sawtooth', from: 240, to: 45, dur: 0.85, gain: 0.5, dist: true });
    tone(t + 0.02, { type: 'square', from: 180, to: 40, dur: 0.85, gain: 0.3, dist: true });
    noiseHit(t, { type: 'lowpass', freq: 1200, sweepTo: 200, dur: 0.6, gain: 0.4 });
  },
  kill(t) {
    // you eliminated someone — short aggressive rising power stab
    tone(t, { type: 'sawtooth', from: 220, to: 330, dur: 0.12, gain: 0.4, dist: true });
    tone(t + 0.1, { type: 'sawtooth', from: 330, to: 494, dur: 0.18, gain: 0.45, dist: true });
    noiseHit(t + 0.1, { type: 'highpass', freq: 5000, dur: 0.12, gain: 0.25 });
  },
};

export function playSfx(name, kind) {
  if (!ctx || muted) return;
  if (ctx.state === 'suspended') ctx.resume();
  const fn = SFX[name];
  if (fn) fn(ctx.currentTime + 0.001, kind);
}

// --- Control ----------------------------------------------------------------

// Call on a user gesture (browser autoplay policy). Starts the context + music.
export function startAudio() {
  ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!muted) startMusic();
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
  if (m) {
    stopMusic();
  } else {
    ensureCtx();
    if (ctx?.state === 'suspended') ctx.resume();
    startMusic();
  }
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

if (import.meta.env.DEV) {
  window.__audio = {
    start: startAudio,
    sfx: (n, k) => playSfx(n, k),
    state: () => ({
      ctx: ctx ? ctx.state : 'none',
      sampleRate: ctx ? ctx.sampleRate : null,
      musicOn,
      muted,
      scheduling: nextNoteTime,
    }),
  };
}

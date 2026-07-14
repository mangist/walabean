// Audio engine: background music from an mp3 track, plus procedurally
// synthesized one-shot SFX for gameplay actions (Web Audio API). The music
// element is routed through the same gain graph as the SFX so the mute toggle
// controls everything.

import musicUrl from './music/the_mountain-game-game-music-508018.mp3';

let ctx = null;
let master = null; // mute gate
let musicGain = null;
let sfxGain = null;
let noiseBuffer = null;
let muted = false;

let musicEl = null; // HTMLAudioElement for the background track
let musicSource = null; // MediaElementSourceNode feeding the graph

function ensureCtx() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.6;
  musicGain.connect(master);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);

  // Looping background track, routed through the graph so mute/volume apply.
  musicEl = new Audio(musicUrl);
  musicEl.loop = true;
  musicEl.preload = 'auto';
  musicSource = ctx.createMediaElementSource(musicEl);
  musicSource.connect(musicGain);

  // 1s of white noise, reused by the noise-based SFX.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// Harsh clipping curve for the distorted SFX tones.
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

// --- Background music (mp3) --------------------------------------------------

function startMusic() {
  if (!musicEl || muted) return;
  const p = musicEl.play();
  if (p && p.catch) p.catch(() => {}); // ignore autoplay rejections
}

export function stopMusic() {
  if (musicEl) musicEl.pause();
}

// --- One-shot SFX ------------------------------------------------------------

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
      muted,
      musicPlaying: !!musicEl && !musicEl.paused,
      musicTime: musicEl ? musicEl.currentTime : null,
    }),
  };
}

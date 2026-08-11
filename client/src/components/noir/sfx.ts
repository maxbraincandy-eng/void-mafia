// ── ნუარი — sound ─────────────────────────────────────────────────────
// Synthesised, no audio files: the whole city is oscillators and filtered
// noise, so it costs nothing to download and nothing to cache.
//
// WHY NOT lib/audioEngine
// The app's shared SFX bus deliberately low-passes everything at 400 Hz and
// keeps tones between 60-160 Hz — a soft, muffled palette that is right for
// buttons and wrong for rain, a gunshot, or a ringing phone. This module runs
// its own context and its own voice, while still obeying the app's sfxEnabled
// setting so one mute switch covers everything.
//
// The real atmosphere is the AMBIENT BED: each backdrop gets a continuous loop
// (rain, bar murmur, harbour wind, engine hum) that cross-fades when the scene
// changes. That is what makes a text screen feel like a place.
import { useSettingsStore } from '@/store/settingsStore';
import type { Backdrop } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Long-lived nodes for the current ambient bed, torn down on change. */
let ambient: { nodes: AudioNode[]; gain: GainNode; kind: Backdrop } | null = null;
let noiseBuf: AudioBuffer | null = null;
let lastTick = 0;

const on = () => {
  try { return useSettingsStore.getState().sfxEnabled !== false; } catch { return true; }
};

function boot(): AudioContext | null {
  if (!on()) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Two seconds of white noise, reused by every wind/rain/hiss voice. */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

interface ToneOpts {
  freq: number; to?: number; type?: OscillatorType;
  dur?: number; vol?: number; at?: number; attack?: number;
}
function tone(o: ToneOpts) {
  const c = boot(); if (!c || !master) return;
  const { freq, to, type = 'sine', dur = 0.2, vol = 0.2, at = 0, attack = 0.006 } = o;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

/** A filtered noise burst — impacts, breath, rain hits. */
function hiss(o: { dur?: number; vol?: number; freq?: number; q?: number; type?: BiquadFilterType; at?: number }) {
  const c = boot(); if (!c || !master) return;
  const { dur = 0.2, vol = 0.2, freq = 1200, q = 0.8, type = 'lowpass', at = 0 } = o;
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

// ── ambient beds ──────────────────────────────────────────────────────
/** Build the continuous voice for a place. Returns nodes to tear down later. */
function buildBed(c: AudioContext, kind: Backdrop, out: GainNode): AudioNode[] {
  const nodes: AudioNode[] = [];
  const loopNoise = (freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass') => {
    const src = c.createBufferSource();
    src.buffer = noise(c); src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(out);
    src.start();
    nodes.push(src, f, g);
    return { f, g };
  };
  const drone = (freq: number, vol: number, type: OscillatorType = 'sine') => {
    const osc = c.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    osc.connect(g); g.connect(out); osc.start();
    nodes.push(osc, g);
    return osc;
  };

  switch (kind) {
    case 'rain_street':
    case 'alley':
      // Rain is bandpassed noise; the low bed underneath is the city.
      loopNoise(2600, 0.6, 0.075, 'bandpass');
      loopNoise(420, 0.5, 0.05);
      drone(52, 0.018);
      break;
    case 'bar':
      // Murmur: heavily low-passed noise reads as a room full of voices.
      loopNoise(300, 0.4, 0.055);
      drone(84, 0.02, 'triangle');
      break;
    case 'docks': {
      // Wind, and a foghorn every ~14s.
      loopNoise(700, 0.35, 0.06);
      drone(44, 0.022);
      const horn = () => { tone({ freq: 96, type: 'sine', dur: 1.9, vol: 0.10, attack: 0.4 }); };
      const iv = window.setInterval(horn, 14000);
      hornTimers.push(iv);
      break;
    }
    case 'car':
      // Engine: two close low saws beating against each other.
      drone(58, 0.03, 'sawtooth');
      drone(61, 0.022, 'sawtooth');
      loopNoise(900, 0.4, 0.03);
      break;
    case 'office':
    case 'room':
      loopNoise(240, 0.4, 0.028);
      drone(66, 0.016);
      break;
    case 'interrogation':
      // Fluorescent hum sits at mains frequency and its octave.
      drone(50, 0.03, 'triangle');
      drone(100, 0.014, 'triangle');
      loopNoise(1800, 1.2, 0.014, 'bandpass');
      break;
  }
  return nodes;
}

const hornTimers: number[] = [];
const clearHorns = () => { while (hornTimers.length) window.clearInterval(hornTimers.pop()!); };

export const NoirAudio = {
  /** Call from the first real gesture — browsers block audio before one. */
  unlock() { boot(); },

  /** Cross-fade the ambient bed to a new place. No-op if already there. */
  setAmbient(kind: Backdrop | null) {
    const c = boot();
    if (!c || !master) return;
    if (ambient && ambient.kind === kind) return;

    if (ambient) {
      // Fade the old bed out, then stop it — a hard cut is audible as a click.
      const old = ambient;
      old.gain.gain.cancelScheduledValues(c.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value, c.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
      window.setTimeout(() => {
        for (const n of old.nodes) { try { (n as any).stop?.(); n.disconnect(); } catch { /* already gone */ } }
        try { old.gain.disconnect(); } catch { /* already gone */ }
      }, 700);
      ambient = null;
      clearHorns();
    }
    if (!kind) return;

    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const nodes = buildBed(c, kind, gain);
    gain.gain.linearRampToValueAtTime(1, c.currentTime + 0.9);
    ambient = { nodes, gain, kind };
  },

  stopAll() {
    clearHorns();
    if (ambient && ctx) {
      for (const n of ambient.nodes) { try { (n as any).stop?.(); n.disconnect(); } catch { /* noop */ } }
      try { ambient.gain.disconnect(); } catch { /* noop */ }
      ambient = null;
    }
  },

  /** Typewriter key. Rate-limited: one per 55ms however fast text arrives. */
  tick() {
    const now = Date.now();
    if (now - lastTick < 55) return;
    lastTick = now;
    hiss({ dur: 0.02, vol: 0.045, freq: 2600, q: 1.4, type: 'bandpass' });
  },

  /** A choice is committed — the sound says what kind of choice it was. */
  choose(beat: 'calm' | 'tense' | 'violent' | 'clever') {
    switch (beat) {
      case 'violent':
        hiss({ dur: 0.16, vol: 0.34, freq: 900, q: 0.5 });
        tone({ freq: 150, to: 42, type: 'triangle', dur: 0.26, vol: 0.3 });
        break;
      case 'clever':
        tone({ freq: 520, to: 780, type: 'sine', dur: 0.16, vol: 0.13 });
        tone({ freq: 780, type: 'sine', dur: 0.12, vol: 0.09, at: 0.1 });
        break;
      case 'tense':
        tone({ freq: 180, to: 120, type: 'triangle', dur: 0.24, vol: 0.16 });
        break;
      default:
        tone({ freq: 300, type: 'sine', dur: 0.1, vol: 0.1 });
    }
  },

  /** A stat moved the wrong way — short warning blip. */
  warn() { tone({ freq: 300, to: 180, type: 'square', dur: 0.14, vol: 0.07 }); },

  gunshot() {
    hiss({ dur: 0.3, vol: 0.5, freq: 1600, q: 0.4 });
    tone({ freq: 90, to: 34, type: 'square', dur: 0.22, vol: 0.34 });
  },
  door() {
    tone({ freq: 120, to: 70, type: 'triangle', dur: 0.3, vol: 0.16 });
    hiss({ dur: 0.14, vol: 0.1, freq: 700, q: 0.7, at: 0.02 });
  },
  phone() {
    for (let i = 0; i < 2; i++) {
      tone({ freq: 620, type: 'sine', dur: 0.16, vol: 0.11, at: i * 0.22 });
      tone({ freq: 780, type: 'sine', dur: 0.16, vol: 0.08, at: i * 0.22 });
    }
  },
  /** One beat of a heart — driven by the countdown, faster as time runs out. */
  heart(strong = false) {
    tone({ freq: strong ? 62 : 54, to: 34, type: 'sine', dur: 0.16, vol: strong ? 0.22 : 0.15, attack: 0.004 });
  },
  /** Tick of a countdown ring. */
  clock() { hiss({ dur: 0.03, vol: 0.06, freq: 3200, q: 2, type: 'bandpass' }); },

  success() {
    tone({ freq: 330, type: 'sine', dur: 0.16, vol: 0.15 });
    tone({ freq: 494, type: 'sine', dur: 0.2, vol: 0.14, at: 0.12 });
    tone({ freq: 660, type: 'sine', dur: 0.26, vol: 0.12, at: 0.26 });
  },
  failure() {
    tone({ freq: 220, to: 110, type: 'triangle', dur: 0.4, vol: 0.2 });
    hiss({ dur: 0.3, vol: 0.1, freq: 500, q: 0.6 });
  },
  /** The run is over — tone follows the ending's mood. */
  ending(tone_: 'triumph' | 'survival' | 'ruin' | 'death') {
    if (tone_ === 'triumph') {
      [262, 330, 392, 523].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.13, at: i * 0.18 }));
    } else if (tone_ === 'survival') {
      [262, 349, 440].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.11, at: i * 0.22 }));
    } else if (tone_ === 'ruin') {
      [220, 208, 196].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.7, vol: 0.12, at: i * 0.3 }));
    } else {
      tone({ freq: 110, to: 42, type: 'sine', dur: 1.6, vol: 0.2, attack: 0.05 });
      hiss({ dur: 1.2, vol: 0.07, freq: 320, q: 0.5 });
    }
  },
};

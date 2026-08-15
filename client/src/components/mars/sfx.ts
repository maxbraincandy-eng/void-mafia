/**
 * M.A.R.S. — terminal sound.
 *
 * Synthesised, no files: a key click, a beep, a glitch burst and a low room
 * hum are all oscillators and filtered noise, so the whole soundscape costs
 * zero bytes to download.
 *
 * Own AudioContext for the same reason the noir module has one: the shared SFX
 * bus low-passes everything at 400 Hz, which is right for soft UI taps and
 * wrong for a dry mechanical keyboard tick. It still obeys the app's single
 * sfxEnabled switch, so one mute covers everything.
 */
import { useSettingsStore } from '@/store/settingsStore';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let noiseBuf: AudioBuffer | null = null;
/** Key clicks fire per keystroke; a fast typist must not stack 20 voices. */
let lastClick = 0;

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
    master.gain.value = 0.75;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** A short filtered-noise burst — the body of every mechanical sound here. */
function burst(c: AudioContext, opts: { freq: number; q: number; dur: number; vol: number; type?: BiquadFilterType }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.playbackRate.value = 1 + Math.random() * 0.2;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq;
  f.Q.value = opts.q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(opts.vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
  src.stop(t + opts.dur + 0.02);
}

function tone(c: AudioContext, freq: number, dur: number, vol: number, type: OscillatorType = 'square') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** One keyswitch. Pitch varies slightly so a sentence doesn't sound like a machine gun. */
export function key(): void {
  const c = boot();
  if (!c) return;
  const now = performance.now();
  if (now - lastClick < 22) return;      // hard floor on voice count
  lastClick = now;
  burst(c, { freq: 1700 + Math.random() * 900, q: 2.4, dur: 0.028, vol: 0.16 });
}

/** The character-appeared tick used while text types itself out. */
export function tick(): void {
  const c = boot();
  if (!c) return;
  const now = performance.now();
  if (now - lastClick < 18) return;
  lastClick = now;
  burst(c, { freq: 2400 + Math.random() * 700, q: 3, dur: 0.016, vol: 0.07 });
}

/** Confirmation beep. */
export function beep(hz = 880): void {
  const c = boot();
  if (!c) return;
  tone(c, hz, 0.09, 0.1);
}

/** Two-tone accept. */
export function accept(): void {
  const c = boot();
  if (!c) return;
  tone(c, 660, 0.07, 0.09);
  setTimeout(() => { const cc = boot(); if (cc) tone(cc, 990, 0.11, 0.09); }, 80);
}

/** Descending reject. */
export function reject(): void {
  const c = boot();
  if (!c) return;
  tone(c, 300, 0.1, 0.11, 'sawtooth');
  setTimeout(() => { const cc = boot(); if (cc) tone(cc, 180, 0.16, 0.1, 'sawtooth'); }, 90);
}

/** Data-corruption stutter, used on glitch frames. */
export function glitch(): void {
  const c = boot();
  if (!c) return;
  burst(c, { freq: 400 + Math.random() * 2600, q: 0.7, dur: 0.09, vol: 0.13 });
  tone(c, 90 + Math.random() * 60, 0.06, 0.07, 'square');
}

/** Long sweep for the boot sequence. */
export function bootSweep(): void {
  const c = boot();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  const t = c.currentTime;
  o.frequency.setValueAtTime(60, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 1.1);
  f.frequency.setValueAtTime(200, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  o.connect(f).connect(g).connect(master!);
  o.start(t);
  o.stop(t + 1.35);
}

/** Continuous room tone. Two detuned oscillators + filtered noise. */
export function startHum(): void {
  const c = boot();
  if (!c || hum) return;
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.5);
  g.connect(master!);

  const oscs: OscillatorNode[] = [];
  for (const f of [55, 55.4, 110]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = f > 100 ? 0.25 : 1;
    o.connect(og).connect(g);
    o.start();
    oscs.push(o);
  }
  // A whisper of air so the hum isn't a pure, fatiguing sine pad.
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 340;
  nf.Q.value = 0.6;
  const ng = c.createGain();
  ng.gain.value = 0.12;
  src.connect(nf).connect(ng).connect(g);
  src.start();

  hum = { osc: oscs, gain: g };
}

export function stopHum(): void {
  if (!hum || !ctx) return;
  const t = ctx.currentTime;
  try {
    hum.gain.gain.cancelScheduledValues(t);
    hum.gain.gain.setValueAtTime(Math.max(0.0001, hum.gain.gain.value), t);
    hum.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  } catch { /* context already gone */ }
  const dying = hum;
  hum = null;
  setTimeout(() => {
    for (const o of dying.osc) { try { o.stop(); } catch { /* already stopped */ } }
    try { dying.gain.disconnect(); } catch { /* already gone */ }
  }, 700);
}

/** Called on unmount — leaves the context alive for the next visit. */
export function shutdown(): void { stopHum(); }

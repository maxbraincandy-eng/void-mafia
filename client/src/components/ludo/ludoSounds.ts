let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try { _ctx = new AudioContext(); } catch { return null; }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08) {
  const c = ctx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.start(); o.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 0.1) {
  const c = ctx(); if (!c) return;
  const sz = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, sz, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const g = c.createGain();
  s.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  s.start();
}

export function sfxDiceRoll()   { noise(0.09, 0.13); setTimeout(() => noise(0.07, 0.11), 90); setTimeout(() => noise(0.05, 0.09), 180); }
export function sfxStep()       { tone(640, 0.055, 'square', 0.045); }
export function sfxCapture()    { tone(220, 0.07, 'sawtooth', 0.1); setTimeout(() => tone(160, 0.12, 'sawtooth', 0.07), 70); }
export function sfxPieceHome()  { tone(880, 0.07); setTimeout(() => tone(1100, 0.09), 80); setTimeout(() => tone(1320, 0.14, 'sine', 0.12), 170); }
export function sfxVictory()    {
  [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
    setTimeout(() => tone(f, 0.4, 'sine', 0.11), i * 130)
  );
}

let _on = true;
try { _on = localStorage.getItem('ludo:sound') !== 'off'; } catch {}

export const isSoundOn  = () => _on;
export const setSoundOn = (v: boolean) => {
  _on = v;
  try { localStorage.setItem('ludo:sound', v ? 'on' : 'off'); } catch {}
};
export const play = (fn: () => void) => { if (_on) fn(); };
export const vibrate = (ms: number) => { try { navigator.vibrate?.(ms); } catch {} };

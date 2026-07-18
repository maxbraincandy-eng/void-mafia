// განაბ სიმულატორი — minimal per-phase ambient drone via Web Audio.
// Very quiet; each phase shifts the base pitch and filter to match the mood:
//   1 უბანი — warm A2   2 სხოდკა — tenser, tighter
//   3 ზონა — cold, low D2   4 კურთხევა — solemn, open fifth
// Self-contained: no assets, no external deps.

interface Voice { osc: OscillatorNode; gain: GainNode }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let voices: Voice[] = [];
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let enabled = false;

const PHASE_TUNING: Record<number, { freqs: number[]; cutoff: number; gain: number }> = {
  1: { freqs: [110, 165], cutoff: 520, gain: 0.05 },      // A2 + E3 (open fifth, warm)
  2: { freqs: [98, 104], cutoff: 420, gain: 0.055 },      // G2 + slight beat (tense)
  3: { freqs: [73.4, 87.3], cutoff: 300, gain: 0.06 },    // D2 + F2 (cold minor)
  4: { freqs: [65.4, 98, 130.8], cutoff: 640, gain: 0.05 }, // C2 + G2 + C3 (solemn, open)
};

function ensure(): boolean {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    filter.connect(master);
    master.connect(ctx.destination);
    // Slow LFO gently modulates the filter for a "breathing" feel.
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    return true;
  } catch { ctx = null; return false; }
}

function rebuildVoices(freqs: number[]): void {
  if (!ctx || !filter) return;
  for (const v of voices) { try { v.osc.stop(); } catch { /* noop */ } }
  voices = freqs.map((f, i) => {
    const osc = ctx!.createOscillator();
    osc.type = i === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.value = f;
    osc.detune.value = (i - 1) * 4; // slight chorus
    const gain = ctx!.createGain();
    gain.gain.value = i === 0 ? 0.6 : 0.35;
    osc.connect(gain);
    gain.connect(filter!);
    osc.start();
    return { osc, gain };
  });
}

export function setAmbientEnabled(on: boolean): void {
  enabled = on;
  if (!on) { fadeMaster(0); return; }
}

export function startAmbient(phase: number): void {
  if (!enabled) return;
  if (!ensure()) return;
  if (ctx!.state === 'suspended') ctx!.resume().catch(() => { /* noop */ });
  const t = PHASE_TUNING[phase] ?? PHASE_TUNING[1]!;
  rebuildVoices(t.freqs);
  if (filter) filter.frequency.setTargetAtTime(t.cutoff, ctx!.currentTime, 1.5);
  fadeMaster(t.gain);
}

export function updateAmbientPhase(phase: number): void {
  if (!enabled || !ctx) return;
  startAmbient(phase);
}

function fadeMaster(to: number): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(to, ctx.currentTime, 0.8);
}

export function stopAmbient(): void {
  fadeMaster(0);
}

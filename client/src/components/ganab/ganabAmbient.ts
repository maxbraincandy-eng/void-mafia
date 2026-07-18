// განაბ სიმულატორი — minimal per-phase ambient pad via Web Audio.
// Pitched into the mid range so phone speakers (weak below ~300Hz) can
// actually reproduce it. Each phase shifts pitch + filter for mood:
//   1 უბანი — warm A3   2 სხოდკა — tenser G3 beat
//   3 ზონა — cold D3/F3   4 კურთხევა — solemn open C3/G3/C4
// Self-contained: no assets, no external deps.

interface Voice { osc: OscillatorNode; gain: GainNode }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let voices: Voice[] = [];
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let enabled = false;
let currentPhase = -1;

const PHASE_TUNING: Record<number, { freqs: number[]; cutoff: number; gain: number }> = {
  1: { freqs: [220, 330], cutoff: 1100, gain: 0.09 },        // A3 + E4 (warm fifth)
  2: { freqs: [196, 208], cutoff: 950, gain: 0.10 },         // G3 + slow beat (tense)
  3: { freqs: [146.8, 174.6], cutoff: 820, gain: 0.11 },     // D3 + F3 (cold minor)
  4: { freqs: [130.8, 196, 261.6], cutoff: 1300, gain: 0.09 }, // C3 + G3 + C4 (solemn, open)
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
    filter.frequency.value = 1000;
    filter.Q.value = 0.8;
    filter.connect(master);
    master.connect(ctx.destination);
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
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
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = f;
    osc.detune.value = (i - 1) * 5; // gentle chorus
    const gain = ctx!.createGain();
    gain.gain.value = i === 0 ? 0.7 : 0.45;
    osc.connect(gain);
    gain.connect(filter!);
    osc.start();
    return { osc, gain };
  });
}

function fadeMaster(to: number): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(to, ctx.currentTime, 0.6);
}

export function setAmbientEnabled(on: boolean): void {
  enabled = on;
  if (!on) fadeMaster(0);
}

/**
 * Ensure the context, resume it (must be reachable from a user gesture on
 * iOS/Android), tune to the phase, and fade in. Safe to call repeatedly —
 * only rebuilds voices when the phase actually changes.
 */
export function startAmbient(phase: number): void {
  if (!enabled) return;
  if (!ensure()) return;
  if (ctx!.state === 'suspended') ctx!.resume().catch(() => { /* noop */ });
  const t = PHASE_TUNING[phase] ?? PHASE_TUNING[1]!;
  if (phase !== currentPhase) {
    currentPhase = phase;
    rebuildVoices(t.freqs);
    filter?.frequency.setTargetAtTime(t.cutoff, ctx!.currentTime, 1.2);
  }
  fadeMaster(t.gain);
}

export const updateAmbientPhase = startAmbient;

export function stopAmbient(): void {
  fadeMaster(0);
}

/**
 * Voice effects for a RECORDING — pick a different voice before you send it.
 *
 * WHY OFFLINE AND NOT DURING RECORDING
 * ────────────────────────────────────
 * Processing while recording gives you one take of one voice. Processing the
 * finished clip means the same recording can be tried as five different voices
 * in a couple of seconds, and the original is never lost — which is the whole
 * point of a voice changer. An OfflineAudioContext renders far faster than
 * real time, so tapping a voice is instant rather than a wait the length of the
 * clip.
 *
 * THE SHIFTER IS THE ONE THAT ALREADY EXISTS
 * ──────────────────────────────────────────
 * The granular pitch-shift worklet in lib/voiceMask was tuned by measurement —
 * grain size and head count were swept against a voice-like harmonic stack
 * because short grains cannot hold a full cycle of an 85 Hz fundamental. That
 * work is not repeated here; this module loads the same worklet.
 *
 * WHY THE RESULT IS WAV
 * ─────────────────────
 * There is no Opus encoder available to a page without shipping a WebAssembly
 * one, and re-encoding through MediaRecorder happens in real time — a 30-second
 * clip would take 30 seconds per voice tried. WAV is written instantly. The
 * sample rate is chosen from the clip's own length so the result always fits
 * the server's limit, and only CHANGED voices pay that cost: choosing the
 * original sends the untouched original recording.
 */
import { ensurePitchWorklet, PITCH_NODE } from './voiceMask';

export type VoiceFx = 'none' | 'deep' | 'high' | 'ghost' | 'robot' | 'radio' | 'giant' | 'echo';

export interface VoiceFxInfo { id: VoiceFx; label: string; icon: string }

/** In the order they are offered. "None" first, because it is the honest one. */
export const VOICE_FX: VoiceFxInfo[] = [
  { id: 'none',  label: 'ორიგინალი', icon: '🎙' },
  { id: 'deep',  label: 'ღრმა',      icon: '🐻' },
  { id: 'high',  label: 'მაღალი',    icon: '🐿' },
  { id: 'giant', label: 'გიგანტი',   icon: '🗿' },
  { id: 'ghost', label: 'აჩრდილი',   icon: '👻' },
  { id: 'robot', label: 'რობოტი',    icon: '🤖' },
  { id: 'radio', label: 'რადიო',     icon: '📻' },
  { id: 'echo',  label: 'ექო',       icon: '🌌' },
];

export const FX_LABEL: Record<VoiceFx, string> =
  Object.fromEntries(VOICE_FX.map(f => [f.id, f.label])) as Record<VoiceFx, string>;

/** Pitch ratios. Below 1 lowers the voice, above 1 raises it. */
const RATIO: Partial<Record<VoiceFx, number>> = {
  deep: 0.72,
  high: 1.42,
  giant: 0.58,
  ghost: 0.86,
  robot: 0.92,
};

const WORK_RATE = 48_000;      // the rate the shifter was tuned at
const MAX_OUT_RATE = 24_000;   // plenty for speech; keeps files small
const MIN_OUT_RATE = 12_000;

function decodeCtx(): AudioContext {
  const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  return new AC();
}

/** Soft saturation for the radio voice — warm rather than crackly. */
function driveCurve(amount = 8, points = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(points * 4));
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount) * 0.9;
  }
  return curve;
}

/** Build the effect graph between `src` and the context destination. */
function buildGraph(ctx: OfflineAudioContext, src: AudioNode, fx: VoiceFx): void {
  const ratio = RATIO[fx];
  let node: AudioNode = src;

  if (ratio) {
    const shifter = new AudioWorkletNode(ctx, PITCH_NODE, {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    });
    const p = shifter.parameters;
    p.get('ratio')!.value = ratio;
    // The ghost is a small shift plus a slow detune wobble — uncanny rather
    // than comic, which is a different thing from simply being lower.
    p.get('wobbleHz')!.value = fx === 'ghost' ? 0.9 : 0;
    p.get('wobbleDepth')!.value = fx === 'ghost' ? 0.055 : 0;
    node.connect(shifter);
    node = shifter;
  }

  if (fx === 'robot') {
    // Ring modulation: the signal multiplied by a low tone. A GainNode whose
    // gain is DRIVEN by an oscillator is that multiplication.
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 42;
    osc.connect(ring.gain);
    osc.start();

    // Keep some of the shifted voice, or the words stop being words.
    const dry = ctx.createGain(); dry.gain.value = 0.45;
    const wet = ctx.createGain(); wet.gain.value = 0.75;
    node.connect(ring); ring.connect(wet);
    node.connect(dry);
    const mix = ctx.createGain();
    wet.connect(mix); dry.connect(mix);
    node = mix;
  }

  if (fx === 'radio') {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.9;
    const drive = ctx.createWaveShaper();
    drive.curve = driveCurve(); drive.oversample = '4x';
    node.connect(band); band.connect(drive);
    node = drive;
  }

  if (fx === 'giant') {
    // Below the shift, a little low shelf so it feels big rather than just low.
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowshelf'; shelf.frequency.value = 220; shelf.gain.value = 5;
    node.connect(shelf);
    node = shelf;
  }

  if (fx === 'echo') {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.19;
    const feedback = ctx.createGain(); feedback.gain.value = 0.36;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    delay.connect(feedback); feedback.connect(delay);
    node.connect(delay); delay.connect(wet);
    const mix = ctx.createGain();
    node.connect(mix); wet.connect(mix);
    node = mix;
  }

  // A shared ceiling, so no effect can hand back something that clips.
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -2; out.knee.value = 0; out.ratio.value = 20;
  out.attack.value = 0.002; out.release.value = 0.1;
  node.connect(out);
  out.connect(ctx.destination);
}

/** 16-bit PCM WAV. Written by hand because the browser cannot encode one. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);     // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export interface RenderedVoice {
  blob: Blob;
  /** Ready to hand to <audio> or to the server. */
  dataUrl: string;
  durationMs: number;
  fx: VoiceFx;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('ვერ წაიკითხა'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Apply an effect to a recording.
 *
 * `maxChars` is the server's limit for this destination; the output rate is
 * chosen from it and the clip's length, so a long recording quietly gets a
 * lower rate rather than being refused after the fact.
 */
export async function renderVoiceFx(
  source: Blob, fx: VoiceFx, maxChars = 2_400_000,
): Promise<RenderedVoice> {
  if (fx === 'none') {
    return { blob: source, dataUrl: await blobToDataUrl(source), durationMs: 0, fx };
  }

  const dec = decodeCtx();
  let input: AudioBuffer;
  try {
    input = await dec.decodeAudioData(await source.arrayBuffer());
  } finally {
    void dec.close();
  }

  // Pass one: the effect itself, at the rate the shifter was tuned for.
  const seconds = input.duration;
  const work = new OfflineAudioContext(1, Math.ceil(seconds * WORK_RATE), WORK_RATE);
  if (RATIO[fx]) await ensurePitchWorklet(work);
  const src = work.createBufferSource();
  src.buffer = input;
  buildGraph(work, src, fx);
  src.start();
  const rendered = await work.startRendering();

  // Pass two: down to the delivery rate, chosen so the result always fits.
  const budget = Math.floor(((maxChars * 3) / 4 - 64) / (2 * Math.max(seconds, 0.1)));
  const rate = Math.max(MIN_OUT_RATE, Math.min(MAX_OUT_RATE, budget));
  const down = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const play = down.createBufferSource();
  play.buffer = rendered;
  play.connect(down.destination);
  play.start();
  const final = await down.startRendering();

  const blob = encodeWav(final.getChannelData(0), rate);
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    durationMs: Math.round(final.duration * 1000),
    fx,
  };
}

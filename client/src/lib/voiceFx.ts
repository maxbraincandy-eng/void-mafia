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

export type VoiceFx =
  | 'none' | 'deep' | 'high' | 'ghost' | 'robot' | 'radio' | 'giant' | 'echo'
  | 'detective' | 'anonymous';

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
  // The two built to be convincing rather than funny — see buildGraph.
  { id: 'detective', label: 'L',          icon: '🕵' },
  { id: 'anonymous', label: 'ანონიმუსი',  icon: '👤' },
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
  // Only a little down. The character of these two comes from what happens
  // AFTER the shift, not from the shift itself — a voice dropped far enough to
  // be unrecognisable is also unintelligible, which is the mistake that makes
  // most voice changers sound like toys.
  detective: 0.90,
  anonymous: 0.80,
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


// ── building blocks, for the profiles that need more than a pitch shift ──

/**
 * A short synthetic room.
 *
 * A ConvolverNode needs an impulse response and there is no file to ship one
 * in, so it is generated: noise under an exponential decay, slightly darker as
 * it fades, which is what a real small room does. This is the difference
 * between a voice that sounds pasted on and one that sounds like it is coming
 * out of a speaker somewhere.
 */
function roomImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 20260817;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const white = (seed / 0x7fffffff) * 2 - 1;
    // One-pole low pass that closes as the tail decays: high frequencies die
    // first in any real space.
    const t = i / n;
    lp += (white - lp) * (0.55 - 0.35 * t);
    d[i] = lp * Math.pow(1 - t, decay);
  }
  return buf;
}

/** Wet/dry around any effect, so nothing is ever all-or-nothing. */
function mixed(ctx: OfflineAudioContext, input: AudioNode, wetChain: AudioNode, wetEnd: AudioNode, wet: number): AudioNode {
  const dryGain = ctx.createGain(); dryGain.gain.value = 1 - wet;
  const wetGain = ctx.createGain(); wetGain.gain.value = wet;
  const out = ctx.createGain();
  input.connect(dryGain); dryGain.connect(out);
  input.connect(wetChain);
  wetEnd.connect(wetGain); wetGain.connect(out);
  return out;
}

/** A very short feedback delay: the metallic ring of a small enclosure. */
function comb(ctx: OfflineAudioContext, input: AudioNode, ms: number, feedback: number, wet: number): AudioNode {
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = ms / 1000;
  const fb = ctx.createGain(); fb.gain.value = feedback;
  delay.connect(fb); fb.connect(delay);
  return mixed(ctx, input, delay, delay, wet);
}

/** Two slightly detuned, slightly delayed copies — a voice that is not one voice. */
function chorus(ctx: OfflineAudioContext, input: AudioNode, wet: number): AudioNode {
  const sum = ctx.createGain();
  for (const [ms, rate, depth] of [[14, 0.23, 0.0022], [21, 0.17, 0.0031]] as const) {
    const d = ctx.createDelay(0.2);
    d.delayTime.value = ms / 1000;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    lfo.connect(amt); amt.connect(d.delayTime);
    lfo.start();
    input.connect(d); d.connect(sum);
  }
  return mixed(ctx, input, sum, sum, wet);
}

/** Amplitude modulation by a tone: the classic electronic edge. */
function ringMod(ctx: OfflineAudioContext, input: AudioNode, hz: number, wet: number): AudioNode {
  const ring = ctx.createGain();
  ring.gain.value = 0;                 // driven entirely by the oscillator
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = hz;
  osc.connect(ring.gain);
  osc.start();
  input.connect(ring);
  return mixed(ctx, input, ring, ring, wet);
}

function band(ctx: OfflineAudioContext, input: AudioNode, lowHz: number, highHz: number, poles = 2): AudioNode {
  let node: AudioNode = input;
  for (let i = 0; i < poles; i++) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = lowHz; hp.Q.value = 0.707;
    node.connect(hp); node = hp;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = highHz; lp.Q.value = 0.707;
    node.connect(lp); node = lp;
  }
  return node;
}

function saturate(ctx: OfflineAudioContext, input: AudioNode, amount: number): AudioNode {
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(amount);
  shaper.oversample = '4x';
  input.connect(shaper);
  return shaper;
}

function reverb(ctx: OfflineAudioContext, input: AudioNode, seconds: number, decay: number, wet: number): AudioNode {
  const conv = ctx.createConvolver();
  conv.buffer = roomImpulse(ctx, seconds, decay);
  return mixed(ctx, input, conv, conv, wet);
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

  /*
   * L.
   *
   * Not a pitch trick: the voice from Death Note is a BROADCAST. It arrives
   * through a public-address speaker, so it is band-limited the way a speaker
   * is, driven a little too hard, ringing slightly with the box it comes out
   * of, and sitting in the room it is played into. Each of those is a separate
   * stage here, and the pitch barely moves — an announcement you cannot make
   * out is not menacing, it is just noise.
   */
  if (fx === 'detective') {
    node = band(ctx, node, 320, 3400, 2);          // the speaker's own limits
    node = comb(ctx, node, 1.4, 0.55, 0.35);       // metal box resonance
    node = ringMod(ctx, node, 24, 0.22);           // a faint electronic edge
    node = saturate(ctx, node, 6);                 // pushed through the amp
    const presence = ctx.createBiquadFilter();     // the harshness of a PA horn
    presence.type = 'peaking';
    presence.frequency.value = 2100;
    presence.Q.value = 1.1;
    presence.gain.value = 7;
    node.connect(presence);
    node = presence;
    node = reverb(ctx, node, 0.42, 2.6, 0.24);     // the room it plays into
  }

  /*
   * Anonymous.
   *
   * The voice from those videos is a machine speaking, not a person disguised:
   * lowered, thickened into several copies of itself so no single larynx is
   * audible, given a synthetic edge, and left oddly flat and roomy. Fully
   * intelligible on purpose — the whole point of that voice is that it is
   * making a statement.
   */
  if (fx === 'anonymous') {
    node = chorus(ctx, node, 0.5);                 // no longer one voice
    node = ringMod(ctx, node, 47, 0.28);           // machine, not person
    node = band(ctx, node, 140, 5200, 2);
    const body = ctx.createBiquadFilter();         // weight where a chest would be
    body.type = 'lowshelf';
    body.frequency.value = 260;
    body.gain.value = 4;
    node.connect(body);
    node = body;
    node = saturate(ctx, node, 4);
    node = reverb(ctx, node, 0.75, 2.2, 0.28);     // the empty room they film in
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

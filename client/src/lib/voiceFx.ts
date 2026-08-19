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
import { normalise } from './voiceMaster';

export type VoiceFx =
  | 'none' | 'deep' | 'high' | 'ghost' | 'robot' | 'radio' | 'giant' | 'echo'
  | 'detective' | 'anonymous'
  // Verified only. See the VIP block in buildGraph.
  | 'demon' | 'alien' | 'stadium' | 'hologram';

export interface VoiceFxInfo { id: VoiceFx; label: string; icon: string; vip?: boolean }

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
  // ── Verified only ─────────────────────────────────────────────────────
  // Added for VIP rather than taken from free: every voice above is still
  // available to everyone, exactly as it was.
  { id: 'demon',    label: 'დემონი',     icon: '😈', vip: true },
  { id: 'alien',    label: 'უცხოპლანეტელი', icon: '👽', vip: true },
  { id: 'stadium',  label: 'სტადიონი',   icon: '📢', vip: true },
  { id: 'hologram', label: 'ჰოლოგრამა',  icon: '🛸', vip: true },
];

/** The ids a free account may send. */
export const FREE_VOICE_FX = new Set(VOICE_FX.filter(f => !f.vip).map(f => f.id));

export const FX_LABEL: Record<VoiceFx, string> =
  Object.fromEntries(VOICE_FX.map(f => [f.id, f.label])) as Record<VoiceFx, string>;

/** Pitch ratios. Below 1 lowers the voice, above 1 raises it. */
const RATIO: Partial<Record<VoiceFx, number>> = {
  deep: 0.72,
  high: 1.42,
  giant: 0.58,
  ghost: 0.86,
  robot: 0.92,
  // Anonymous is lowered a fifth and then thickened; L is not pitch-shifted at
  // all, because its voice comes from a vocoder's carrier rather than from the
  // speaker's own larynx — see buildGraph.
  anonymous: 0.80,
  // VIP
  demon: 0.62,
  alien: 1.18,
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


/**
 * A channel vocoder — the thing that actually replaces a voice.
 *
 * WHY FILTERING WAS NOT ENOUGH
 * ────────────────────────────
 * The first attempt at L band-limited the voice, drove it, and rang it like a
 * speaker. It sounded like a broadcast — of the SAME PERSON. Identity does not
 * live in the frequency range; it lives in the pitch and the shape of the
 * larynx, and no amount of filtering removes either.
 *
 * A vocoder removes both. The recording is split into bands; each band's
 * loudness over time is measured; and those loudness curves are used to open
 * and close the matching bands of a completely different sound — here a buzzing
 * synthetic tone at a fixed pitch, plus a little noise so consonants survive.
 * What comes out has the WORDS of the recording and the VOICE of the machine.
 * That is why it is what every "computer speaking" effect is built from, and
 * why the person underneath is gone.
 *
 * Sixteen bands, spaced logarithmically the way hearing is: enough for speech
 * to stay legible, few enough that it still sounds like a machine.
 */
function vocoder(
  ctx: OfflineAudioContext,
  input: AudioNode,
  { carrierHz = 105, bands = 16, noise = 0.16, lo = 160, hi = 5200 } = {},
): AudioNode {
  // The bands SUM into this node; its gain multiplies that sum. Setting it to
  // zero — as this first did — silences the whole vocoder no matter how many
  // bands feed it. Summing and gain are not the same thing.
  const out = ctx.createGain();
  out.gain.value = 1;

  // ── the machine's own voice ────────────────────────────────────────
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';          // rich in harmonics: a vocoder needs material
  saw.frequency.value = carrierHz;
  // A trace of drift, so it reads as a machine rather than a test tone.
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.13;
  const driftAmt = ctx.createGain();
  driftAmt.gain.value = carrierHz * 0.012;
  drift.connect(driftAmt);
  driftAmt.connect(saw.frequency);
  saw.start(); drift.start();

  // Noise carries the consonants; without it every "s" disappears.
  const noiseBuf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 2)), ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  let seed = 1337;
  for (let i = 0; i < nd.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    nd[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;
  noiseSrc.start();
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = noise;
  noiseSrc.connect(noiseGain);

  const carrier = ctx.createGain();
  saw.connect(carrier);
  noiseGain.connect(carrier);

  // Rectifier curve: |x|, which turns a band into its own loudness curve.
  // One curve, shared by value; each band gets its own shaper, because a
  // shared node would sum every band into one meaningless envelope.
  const RECT_N = 2048;
  const rectCurve = new Float32Array(new ArrayBuffer(RECT_N * 4));
  for (let i = 0; i < RECT_N; i++) rectCurve[i] = Math.abs((i / (RECT_N - 1)) * 2 - 1);

  for (let b = 0; b < bands; b++) {
    const centre = lo * Math.pow(hi / lo, b / (bands - 1));
    const q = 4.5;

    // What the speech is doing in this band…
    const mod = ctx.createBiquadFilter();
    mod.type = 'bandpass'; mod.frequency.value = centre; mod.Q.value = q;
    input.connect(mod);
    // …smoothed into an envelope. 18 Hz keeps syllables and drops the pitch.
    const env = ctx.createBiquadFilter();
    env.type = 'lowpass'; env.frequency.value = 18; env.Q.value = 0.707;
    // Each band needs its own rectifier path, or they all share one signal.
    const bandRect = ctx.createWaveShaper();
    bandRect.curve = rectCurve;
    bandRect.oversample = '2x';
    mod.connect(bandRect);
    bandRect.connect(env);

    const amount = ctx.createGain();
    amount.gain.value = 9;         // envelopes are small; open the gate properly
    env.connect(amount);

    // …applied to the same band of the machine's voice.
    const car = ctx.createBiquadFilter();
    car.type = 'bandpass'; car.frequency.value = centre; car.Q.value = q;
    carrier.connect(car);
    const vca = ctx.createGain();
    vca.gain.value = 0;            // driven entirely by the envelope
    amount.connect(vca.gain);
    car.connect(vca);
    vca.connect(out);
  }

  const trim = ctx.createGain();
  trim.gain.value = 0.5;
  out.connect(trim);
  return trim;
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
    // The vocoder does the disguising; everything after it is the broadcast.
    node = vocoder(ctx, node, { carrierHz: 98, bands: 16, noise: 0.18 });
    node = band(ctx, node, 300, 3600, 2);          // the speaker's own limits
    node = comb(ctx, node, 1.4, 0.45, 0.25);       // metal box resonance
    node = saturate(ctx, node, 5);                 // pushed through the amp
    const presence = ctx.createBiquadFilter();     // the harshness of a PA horn
    presence.type = 'peaking';
    presence.frequency.value = 2000;
    presence.Q.value = 1.1;
    presence.gain.value = 6;
    node.connect(presence);
    node = presence;
    node = reverb(ctx, node, 0.38, 2.8, 0.20);     // the room it plays into
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

  /*
   * ── Verified voices ─────────────────────────────────────────────────
   *
   * Built from the same blocks as the ones above — no new DSP was written to
   * make these worth paying for, because a paywall is not a reason to ship a
   * second, worse pitch shifter. What separates them is the arrangement.
   */

  /* A larynx too big for the body: shifted far down, rung at a frequency low
   * enough to be felt rather than heard, and put in a space with no walls. */
  if (fx === 'demon') {
    node = ringMod(ctx, node, 31, 0.22);
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowshelf'; chest.frequency.value = 180; chest.gain.value = 6;
    node.connect(chest); node = chest;
    node = saturate(ctx, node, 6);
    node = reverb(ctx, node, 1.1, 2.4, 0.30);
  }

  /* Raised slightly, then ring-modulated well inside the speech band so the
   * harmonics land where no human throat puts them, and combed short enough to
   * sound like it is arriving through something. */
  if (fx === 'alien') {
    node = ringMod(ctx, node, 168, 0.35);
    node = chorus(ctx, node, 0.4);
    node = band(ctx, node, 300, 6000, 2);
    node = comb(ctx, node, 3.2, 0.40, 0.20);
  }

  /* The tannoy at the far end of a full stadium: narrowed, pushed, and mostly
   * the room. Deliberately more reverb than the L broadcast — that one is in a
   * corridor, this one is in a bowl. */
  if (fx === 'stadium') {
    node = band(ctx, node, 260, 4200, 2);
    node = saturate(ctx, node, 5);
    const horn = ctx.createBiquadFilter();
    horn.type = 'peaking'; horn.frequency.value = 1800; horn.Q.value = 1.0; horn.gain.value = 5;
    node.connect(horn); node = horn;
    node = comb(ctx, node, 2.1, 0.35, 0.20);
    node = reverb(ctx, node, 1.6, 1.9, 0.42);
  }

  /* The same vocoder that erases the speaker for L, but carried by a tone a
   * third higher and widened afterwards — machine speech that is transmitted
   * rather than announced. */
  if (fx === 'hologram') {
    node = vocoder(ctx, node, { carrierHz: 132, bands: 18, noise: 0.12 });
    node = chorus(ctx, node, 0.45);
    node = band(ctx, node, 220, 6200, 2);
    node = reverb(ctx, node, 0.5, 2.5, 0.22);
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

  // Every voice arrives at the same loudness. A vocoder's output depends on how
  // loud the input was, so without this the machine voices land quieter than
  // the recording they replaced — which reads as "the effect broke it".
  const levelled = normalise(final.getChannelData(0) as Float32Array<ArrayBuffer>, final.sampleRate);
  const blob = encodeWav(levelled.data, rate);
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    durationMs: Math.round(final.duration * 1000),
    fx,
  };
}

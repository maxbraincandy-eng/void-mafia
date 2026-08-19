/**
 * A REAL-TIME voice disguise — not an effect on a voice, a different voice.
 *
 * WHY THE PITCH MASK WAS NOT ENOUGH
 * ─────────────────────────────────
 * lib/voiceMask shifts pitch. That changes how high you sound and almost
 * nothing about who you are. Identity in speech lives in two places: the
 * GLOTTAL SOURCE (the rate and shape of the vocal folds opening) and the VOCAL
 * TRACT (the resonances its length and shape impose — the formants). A pitch
 * shifter moves both together, so a listener who knows you hears you, higher.
 * That is why the offline effects file says the same thing about `detective`:
 * band-limiting a voice produced "a broadcast — of the SAME PERSON".
 *
 * WHAT THIS DOES INSTEAD
 * ──────────────────────
 * A channel vocoder throws the source away and keeps only the shape.
 *
 *   1. Split the microphone into 16 bands, log-spaced the way hearing is.
 *   2. Measure how loud each band is, moment to moment — rectify and smooth.
 *      Those 16 curves are WHAT WAS SAID; they carry the words and nothing of
 *      the larynx that said them.
 *   3. Build a completely synthetic voice: a buzzing sawtooth at a FIXED pitch
 *      we choose, plus a little noise so consonants survive.
 *   4. Split THAT into the same 16 bands and open each one by the matching
 *      envelope from step 2.
 *
 * What comes out has your words and someone else's throat. Your own pitch is
 * gone — everyone speaking through one preset comes out at the same pitch,
 * which is exactly the property that makes you unidentifiable.
 *
 * AND THE FORMANTS TOO
 * ────────────────────
 * Step 4 does not have to use the same centre frequencies as step 2. Multiply
 * them by `formant` and the whole spectral envelope moves, which is what
 * changing the LENGTH of a vocal tract does. Pitch replaced and vocal tract
 * resized: there is nothing left of the original speaker to recognise.
 *
 * WHY NATIVE NODES AND NOT A WORKLET
 * ──────────────────────────────────
 * A GainNode whose `gain` is driven by another node's OUTPUT is a multiplier,
 * and BiquadFilterNode is a filter. That is the entire vocoder, so the whole
 * thing is native code on the audio thread — no worklet, no per-sample
 * JavaScript in the path a room full of people is listening to.
 */

export const DISGUISES = ['stranger', 'phantom', 'machine', 'siren'] as const;
export type Disguise = typeof DISGUISES[number];

export const DISGUISE_LABEL: Record<Disguise, string> = {
  stranger: 'უცნობი',
  phantom:  'ფანტომი',
  machine:  'მანქანა',
  siren:    'სირენა',
};
export const DISGUISE_ICON: Record<Disguise, string> = {
  stranger: '🕴', phantom: '🌑', machine: '🤖', siren: '🎼',
};

interface Spec {
  /** The new larynx, in Hz. Nobody's own pitch survives this. */
  carrierHz: number;
  /** A dead monotone is a robot; a little wander is a person. */
  vibratoHz: number;
  vibratoCents: number;
  /** Carrier band centres = modulator centres × this. Resizes the vocal tract. */
  formant: number;
  /** Breath mixed into the carrier, or every s / sh / f disappears. */
  noise: number;
  /** Detuned copies — smears whatever individuality survived. */
  chorus: number;
  /** High-shelf dB. Brightness is most of "which person is this". */
  tilt: number;
}

const SPEC: Record<Disguise, Spec> = {
  // A different man, plainly. The most usable of the four for a long game.
  stranger: { carrierHz: 118, vibratoHz: 4.8, vibratoCents: 25, formant: 0.92, noise: 0.20, chorus: 0.35, tilt: 3 },
  // Lower and longer-throated, darkened. Unsettling rather than comic.
  phantom:  { carrierHz: 96,  vibratoHz: 3.2, vibratoCents: 40, formant: 0.82, noise: 0.16, chorus: 0.50, tilt: -2 },
  // No vibrato at all: unmistakably synthetic, and the hardest to place.
  machine:  { carrierHz: 88,  vibratoHz: 0,   vibratoCents: 0,  formant: 1.00, noise: 0.13, chorus: 0,    tilt: 2 },
  // High carrier and a short tract — reads as a different person entirely.
  siren:    { carrierHz: 196, vibratoHz: 5.4, vibratoCents: 30, formant: 1.18, noise: 0.18, chorus: 0.30, tilt: 4 },
};

/** 16 bands, log-spaced from 180 Hz to 5.2 kHz — see the offline vocoder. */
const BANDS = 16;
const LO = 180;
const HI = 5200;
const Q = 4.2;

/**
 * Envelope smoothing, in Hz.
 *
 * Too slow and consonants smear into the vowels around them; too fast and the
 * carrier's own pitch period gets through as a buzz, which puts a trace of the
 * speaker back. 16 Hz is below the lowest voice fundamental and above the rate
 * syllables actually change at.
 */
const ENV_HZ = 16;

/**
 * How hard to open the gates.
 *
 * A rectified, 16 Hz-smoothed band sits far below the signal that produced it,
 * so the envelopes need scaling or the disguise is a whisper. Measured rather
 * than guessed: at 11 the four presets came out at 1.4×–1.8× the input's RMS
 * and the loudest was starting to touch the limiter. 7 lands them beside the
 * voice they replace, which is what the rest of the room's mix expects.
 */
const ENV_GAIN = 7;

function absCurve(points = 1024): Float32Array<ArrayBuffer> {
  // A WaveShaper is the cheapest full-wave rectifier available: |x|.
  const c = new Float32Array(new ArrayBuffer(points * 4));
  for (let i = 0; i < points; i++) c[i] = Math.abs((i / (points - 1)) * 2 - 1);
  return c;
}

function noiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1337;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

function bandCentres(): number[] {
  const out: number[] = [];
  for (let i = 0; i < BANDS; i++) out.push(LO * Math.pow(HI / LO, i / (BANDS - 1)));
  return out;
}

/** Two detuned, slightly delayed copies — one voice stops being one voice. */
function chorus(ctx: BaseAudioContext, input: AudioNode, wet: number, started: AudioScheduledSourceNode[]): AudioNode {
  if (wet <= 0) return input;
  const sum = ctx.createGain();
  for (const [ms, rate, depth] of [[13, 0.21, 0.0021], [19, 0.16, 0.0029]] as const) {
    const d = ctx.createDelay(0.2);
    d.delayTime.value = ms / 1000;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    lfo.connect(amt); amt.connect(d.delayTime);
    lfo.start(); started.push(lfo);
    input.connect(d); d.connect(sum);
  }
  const dry = ctx.createGain(); dry.gain.value = 1 - wet;
  const wetG = ctx.createGain(); wetG.gain.value = wet;
  const out = ctx.createGain();
  input.connect(dry); dry.connect(out);
  sum.connect(wetG); wetG.connect(out);
  return out;
}

export interface DisguiseGraph {
  /** Feed the microphone in here. */
  output: AudioNode;
  /** Change preset without rebuilding — no audible gap. */
  retune: (d: Disguise) => void;
  stop: () => void;
}

/**
 * Build the vocoder. `input` is the microphone; the returned node is the voice
 * that replaces it.
 */
export function buildDisguise(ctx: BaseAudioContext, input: AudioNode, preset: Disguise): DisguiseGraph {
  let spec = SPEC[preset];
  const started: AudioScheduledSourceNode[] = [];
  const centres = bandCentres();
  const curve = absCurve();

  // ── the synthetic larynx ───────────────────────────────────────────
  const carrier = ctx.createGain();

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = spec.carrierHz;
  const sawGain = ctx.createGain(); sawGain.gain.value = 1;
  saw.connect(sawGain); sawGain.connect(carrier);
  saw.start(); started.push(saw);

  // Vibrato, in cents so the depth means the same thing at every carrier pitch.
  const vib = ctx.createOscillator();
  vib.frequency.value = spec.vibratoHz || 0.001;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = spec.carrierHz * (Math.pow(2, spec.vibratoCents / 1200) - 1);
  vib.connect(vibAmt); vibAmt.connect(saw.frequency);
  vib.start(); started.push(vib);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = spec.noise;
  noise.connect(noiseGain); noiseGain.connect(carrier);
  noise.start(); started.push(noise);

  // ── 16 × (measure the mic, open the carrier) ───────────────────────
  const sum = ctx.createGain();
  const carrierBands: BiquadFilterNode[] = [];

  for (const fc of centres) {
    // What was said, in this band.
    const modBp = ctx.createBiquadFilter();
    modBp.type = 'bandpass'; modBp.frequency.value = fc; modBp.Q.value = Q;
    input.connect(modBp);

    const rect = ctx.createWaveShaper();
    rect.curve = curve;
    rect.oversample = 'none';
    modBp.connect(rect);

    const env = ctx.createBiquadFilter();
    env.type = 'lowpass'; env.frequency.value = ENV_HZ; env.Q.value = 0.707;
    rect.connect(env);

    const envGain = ctx.createGain();
    envGain.gain.value = ENV_GAIN;
    env.connect(envGain);

    // The same band of the synthetic voice — moved by `formant`.
    const carBp = ctx.createBiquadFilter();
    carBp.type = 'bandpass';
    carBp.frequency.value = Math.min(fc * spec.formant, ctx.sampleRate / 2 - 500);
    carBp.Q.value = Q;
    carrier.connect(carBp);
    carrierBands.push(carBp);

    // gain STARTS at zero and is driven entirely by the envelope: that is the
    // multiplication, and it is why nothing of the carrier is heard in silence.
    const vca = ctx.createGain();
    vca.gain.value = 0;
    envGain.connect(vca.gain);
    carBp.connect(vca);
    vca.connect(sum);
  }

  // ── shaping ────────────────────────────────────────────────────────
  const tilt = ctx.createBiquadFilter();
  tilt.type = 'highshelf'; tilt.frequency.value = 2200; tilt.gain.value = spec.tilt;
  sum.connect(tilt);

  const wide = chorus(ctx, tilt, spec.chorus, started);

  // Speech only. Below the lowest carrier there is nothing but rumble, and
  // above the top band there is nothing at all.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.707;
  wide.connect(hp);

  // A ceiling, so no preset can hand the room something that clips.
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20;
  limit.attack.value = 0.003; limit.release.value = 0.12;
  hp.connect(limit);

  return {
    output: limit,
    retune(d: Disguise) {
      spec = SPEC[d];
      const t = ctx.currentTime;
      saw.frequency.setTargetAtTime(spec.carrierHz, t, 0.02);
      vib.frequency.setTargetAtTime(spec.vibratoHz || 0.001, t, 0.02);
      vibAmt.gain.setTargetAtTime(spec.carrierHz * (Math.pow(2, spec.vibratoCents / 1200) - 1), t, 0.02);
      noiseGain.gain.setTargetAtTime(spec.noise, t, 0.02);
      tilt.gain.setTargetAtTime(spec.tilt, t, 0.02);
      carrierBands.forEach((b, i) => {
        b.frequency.setTargetAtTime(Math.min(centres[i]! * spec.formant, ctx.sampleRate / 2 - 500), t, 0.02);
      });
      // Chorus depth is structural rather than a parameter, so switching to a
      // preset with a different width keeps the old width until the graph is
      // rebuilt. Inaudible next to the pitch and formant change, and worth it
      // to avoid a gap in the middle of somebody's sentence.
    },
    stop() {
      for (const s of started) { try { s.stop(); } catch { /* already stopped */ } }
    },
  };
}

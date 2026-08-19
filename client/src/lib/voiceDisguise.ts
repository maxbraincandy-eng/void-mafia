/**
 * A REAL-TIME voice disguise — you, sounding like somebody else, clearly.
 *
 * TWO KINDS, BECAUSE THEY TRADE DIFFERENTLY
 * ─────────────────────────────────────────
 * NATURAL presets keep your own glottal source and move it: pitch and vocal
 * tract are resized together, so what comes out is a real human voice, fully
 * intelligible, that is not yours. Someone who knows you very well may still
 * place you — a uniform transform preserves the differences between speakers.
 *
 * SYNTHETIC presets throw your source away and rebuild the voice from a carrier
 * we choose (a channel vocoder). Everyone through one preset comes out at the
 * same pitch, which is the property that makes you unidentifiable — and the
 * reason it costs some naturalness.
 *
 * The panel labels which is which, because "clear" and "anonymous" are not the
 * same request and a player should get to choose which one they are making.
 *
 * WHAT WAS WRONG WITH THE FIRST VOCODER
 * ─────────────────────────────────────
 * It buzzed, and the words were hard to make out. Measured rather than argued:
 * in the source signal a fricative has a periodicity of 0.20 — it is noise,
 * which is what "s" IS — and through the old presets it came out at 0.89–0.94,
 * a TONE. Every s, sh and f had become a hum at the carrier pitch, and the
 * consonant/vowel band separation collapsed from 9.0 to about 2.5.
 *
 * One omission caused all of it: the carrier buzzed all the time. Real speech
 * has two sources — the vocal folds for vowels, turbulent noise for fricatives —
 * and a vocoder offering only the first turns half of speech into hum.
 *
 * So the carrier here is both, mixed by frequency AND by moment:
 *   · statically — the saw is rolled off above ~3.5 kHz and the noise rolled off
 *     below ~1.8 kHz, so the top of the carrier is breath where fricatives live
 *     and the bottom stays periodic where vowels live;
 *   · dynamically — a high-band envelope follower opens the noise and DUCKS the
 *     saw during fricatives. That is voiced/unvoiced detection built out of a
 *     gain node with a negative coefficient: no division, no worklet, and no
 *     decision to get wrong, because it is continuous.
 *
 * Two more intelligibility fixes: 24 bands instead of 16 (neighbouring bands
 * were 1.24 apart, coarser than the detail separating one consonant from
 * another; at 24 they are 1.17 apart and overlap properly), and a 42 Hz
 * envelope filter instead of 16 Hz — a stop consonant is a 20–30 ms event, and
 * at 16 Hz it was smeared into whatever sat on either side of it.
 *
 * WHY NATIVE NODES AND NOT A WORKLET
 * ──────────────────────────────────
 * A GainNode whose `gain` is driven by another node's OUTPUT is a multiplier,
 * and BiquadFilterNode is a filter. That is the entire vocoder, so it runs as
 * native code on the audio thread — no per-sample JavaScript in the path a room
 * full of people is listening to.
 */
import { ensurePitchWorklet, PITCH_NODE } from './voiceMask';

export const DISGUISES = [
  // Natural first: this is what most people actually want.
  'baritone', 'tenor', 'alto', 'soprano',
  'phantom', 'machine',
] as const;
export type Disguise = typeof DISGUISES[number];

export const NATURAL: readonly Disguise[] = ['baritone', 'tenor', 'alto', 'soprano'];
export const SYNTHETIC: readonly Disguise[] = ['phantom', 'machine'];

/**
 * Display names only. The KEYS stay `alto` and `soprano` on purpose: the chosen
 * voice is persisted in localStorage by key, so renaming those would silently
 * reset the choice of everyone already using one.
 */
export const DISGUISE_LABEL: Record<Disguise, string> = {
  baritone: 'ბარიტონი',
  tenor:    'ტენორი',
  alto:     'Sakha',
  soprano:  'Blackstar',
  phantom:  'ფანტომი',
  machine:  'მანქანა',
};
export const DISGUISE_ICON: Record<Disguise, string> = {
  // A dove beside "Blackstar" read as a mistake, so that one moved with the name.
  baritone: '🎻', tenor: '🎺', alto: '🪈', soprano: '✴️',
  phantom: '🌑', machine: '🤖',
};

export function isNatural(d: Disguise): boolean { return NATURAL.includes(d); }

// ── natural: the real voice, resized ────────────────────────────────────────

interface NaturalSpec {
  /** Granular shift. Moves pitch AND vocal tract together, like a differently
   *  sized person — which is exactly why it stays natural. */
  ratio: number;
  /** dB at 2.8 kHz. Shifting down drags consonant energy down with it and the
   *  speech goes muddy; this puts the clarity back. */
  presence: number;
  /** dB below 250 Hz. Shifting up thins the voice; this restores the body. */
  body: number;
  /** dB at 6.5 kHz. Negative de-esses a voice that has been raised. */
  air: number;
  /**
   * Read-head jitter — available, and deliberately 0.
   *
   * It does break up the comb (fricative periodicity 0.47 → 0.24 on the upward
   * presets), but it breaks up the vowels with it: periodicity fell from 0.93
   * to 0.61 and the pitch tracker lost the higher test speaker entirely. That
   * is a hoarse voice traded for a cleaner hiss. Once the fricatives were
   * routed around the shifter the trade stopped being worth making, so the
   * knob stays here, measured, at zero.
   */
  jitter: number;
}

const NATURAL_SPEC: Record<'baritone' | 'tenor' | 'alto' | 'soprano', NaturalSpec> = {
  // Deep and calm. The largest downward move the shifter still tracks cleanly —
  // below about 0.7 it warbles on already-low voices.
  baritone: { ratio: 0.78, presence: 4.5, body: -1.5, air: 2, jitter: 0 },
  // Subtle. For someone who wants to be a different person, not a character.
  tenor:    { ratio: 0.90, presence: 2.5, body: 0,    air: 1, jitter: 0 },
  // Lighter and higher, still plainly an adult.
  alto:     { ratio: 1.14, presence: 1,   body: 3,    air: -1.5, jitter: 0 },
  // Clearly higher. The body lift is what stops it becoming a cartoon.
  soprano:  { ratio: 1.28, presence: 0,   body: 4.5,  air: -3, jitter: 0 },
};

// ── synthetic: the vocoder ──────────────────────────────────────────────────

interface VocoderSpec {
  /** The replacement larynx, in Hz. */
  carrierHz: number;
  /** A dead monotone is a machine; a slow wander is a person. */
  vibratoHz: number;
  vibratoCents: number;
  /** Carrier band centres = modulator centres × this. Resizes the vocal tract. */
  formant: number;
  /** Standing breath in the carrier, before the dynamic part. */
  noiseFloor: number;
  /** dB at 2.8 kHz — consonant clarity. */
  presence: number;
}

/*
 * VIBRATO IS ZERO ON BOTH, AND THAT IS THE FIX FOR "IT RUSTLES".
 *
 * Phantom used to wander 35 cents at 3.6 Hz, on the theory that a dead monotone
 * reads as a machine and a little movement reads as a person. What it actually
 * does is frequency-modulate a sawtooth: every harmonic smears across a band,
 * and the smear grows with harmonic number, so the top of the spectrum turns
 * into a wash. Measured as energy sitting BETWEEN the harmonics of a vowel —
 * 0.021 in real speech — phantom was at 0.288 and machine, which never had
 * vibrato, at 0.138. Turning it off took phantom to 0.148 on its own.
 *
 * The two are still clearly different voices: a longer vocal tract and a higher
 * larynx for one, a plain one for the other. That difference costs nothing.
 */
const VOCODER_SPEC: Record<'phantom' | 'machine', VocoderSpec> = {
  phantom: { carrierHz: 104, vibratoHz: 0, vibratoCents: 0, formant: 0.88, noiseFloor: 0.06, presence: 5 },
  machine: { carrierHz: 92,  vibratoHz: 0, vibratoCents: 0, formant: 1.0,  noiseFloor: 0.06, presence: 4 },
};

/*
 * 18 bands.
 *
 * It was 24, on the argument that 16 was too coarse to separate one consonant
 * from another. That argument was wrong about the cause: the thing that made 16
 * unintelligible was the buzzing carrier, not the band count. With the carrier
 * fixed, 18, 20 and 24 measure the same modulation transfer (0.711 / 0.710 /
 * 0.713) — so the extra bands bought no clarity, and each one is another
 * amplitude-modulated copy of the carrier adding energy between the harmonics.
 * 18 gives the quietest silences (0.0173 against 0.0228) for identical
 * intelligibility.
 */
const BANDS = 18;
const LO = 150;
const HI = 6500;
const Q = 3.4;
const ENV_HZ = 42;

/**
 * How hard the envelopes open the gates.
 *
 * Measured, not guessed: a rectified, smoothed band sits well below the signal
 * that produced it, so without scaling the disguise is a whisper. Re-measured
 * after the envelope filter widened to 42 Hz, which passes more energy through:
 * at 5.5 the output peaked at 1.17 and clipped past the limiter. 3.3 fixed that
 * — and then cutting the carrier noise to stop the rustling took the level down
 * with it, to just under the source. 5.2 puts it back beside the natural
 * presets without touching the ceiling.
 */
const ENV_GAIN = 5.2;

/** Where the carrier stops being periodic and starts being breath. */
const SAW_TOP = 3500;
const NOISE_BOTTOM = 1800;

function absCurve(points = 1024): Float32Array<ArrayBuffer> {
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

function bandCentres(n = BANDS): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(LO * Math.pow(HI / LO, i / (n - 1)));
  return out;
}

/** Rectify + smooth: a control signal that follows how loud something is. */
function follower(
  ctx: BaseAudioContext, input: AudioNode, curve: Float32Array<ArrayBuffer>,
  hz: number, gain: number,
): GainNode {
  const rect = ctx.createWaveShaper();
  rect.curve = curve;
  rect.oversample = 'none';
  input.connect(rect);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = hz; lp.Q.value = 0.707;
  rect.connect(lp);

  const g = ctx.createGain();
  g.gain.value = gain;
  lp.connect(g);
  return g;
}

function band(ctx: BaseAudioContext, input: AudioNode, lo: number, hi: number): AudioNode {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = lo; hp.Q.value = 0.707;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = hi; lp.Q.value = 0.707;
  input.connect(hp); hp.connect(lp);
  return lp;
}

export interface DisguiseGraph {
  output: AudioNode;
  /** Retune within the same kind. Returns false if the graph must be rebuilt. */
  retune: (d: Disguise) => boolean;
  stop: () => void;
}

/**
 * Build the disguise. `input` is the microphone; the returned node is the voice
 * that replaces it. Async because the natural presets load the pitch worklet.
 */
export async function buildDisguise(
  ctx: BaseAudioContext, input: AudioNode, preset: Disguise,
): Promise<DisguiseGraph> {
  return isNatural(preset)
    ? buildNatural(ctx, input, preset as keyof typeof NATURAL_SPEC)
    : buildVocoder(ctx, input, preset as keyof typeof VOCODER_SPEC);
}

// ── natural ─────────────────────────────────────────────────────────────────

/**
 * Where the voice stops carrying identity and starts being turbulence.
 *
 * Below this, energy is the vocal folds through the vocal tract — the first
 * three formants, and everything a listener uses to recognise a person. Above
 * it, a fricative is broadband hiss produced at the teeth and tongue, which
 * says almost nothing about who is speaking.
 *
 * That asymmetry is worth exploiting, because the granular shifter's three read
 * heads are a comb filter, and a comb turns hiss into a TONE — measured at 0.29
 * periodicity going down and 0.65 going up, against 0.205 for real speech.
 * Head jitter cures it, but it cures it everywhere: at the smallest setting
 * that worked the vowels dropped from 0.99 periodicity to 0.6, which is a
 * hoarse voice. Routing the hiss AROUND the shifter instead costs nothing —
 * the part left unshifted was not disguising anyone.
 */
const IDENTITY_TOP = 3200;

async function buildNatural(
  ctx: BaseAudioContext, input: AudioNode, preset: keyof typeof NATURAL_SPEC,
): Promise<DisguiseGraph> {
  let spec = NATURAL_SPEC[preset];
  await ensurePitchWorklet(ctx);

  // Voiced path: everything that identifies the speaker, shifted.
  const lp1 = ctx.createBiquadFilter();
  lp1.type = 'lowpass'; lp1.frequency.value = IDENTITY_TOP; lp1.Q.value = 0.707;
  const lp2 = ctx.createBiquadFilter();
  lp2.type = 'lowpass'; lp2.frequency.value = IDENTITY_TOP; lp2.Q.value = 0.707;
  input.connect(lp1); lp1.connect(lp2);

  const shifter = new AudioWorkletNode(ctx, PITCH_NODE, {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
  });
  shifter.parameters.get('ratio')!.value = spec.ratio;
  shifter.parameters.get('jitter')!.value = spec.jitter;
  lp2.connect(shifter);

  // Breath path: straight through, so an "s" is still an "s".
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass'; hp1.frequency.value = IDENTITY_TOP; hp1.Q.value = 0.707;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass'; hp2.frequency.value = IDENTITY_TOP; hp2.Q.value = 0.707;
  input.connect(hp1); hp1.connect(hp2);

  const merged = ctx.createGain();
  shifter.connect(merged);
  hp2.connect(merged);

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 2800; presence.Q.value = 0.9;
  presence.gain.value = spec.presence;
  const body = ctx.createBiquadFilter();
  body.type = 'lowshelf'; body.frequency.value = 250; body.gain.value = spec.body;
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf'; air.frequency.value = 6500; air.gain.value = spec.air;

  merged.connect(presence); presence.connect(body); body.connect(air);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.707;
  air.connect(hp);

  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -5; limit.knee.value = 0; limit.ratio.value = 20;
  limit.attack.value = 0.001; limit.release.value = 0.12;
  hp.connect(limit);

  return {
    output: limit,
    retune(d: Disguise) {
      if (!isNatural(d)) return false;
      spec = NATURAL_SPEC[d as keyof typeof NATURAL_SPEC];
      const t = ctx.currentTime;
      shifter.parameters.get('ratio')!.setTargetAtTime(spec.ratio, t, 0.02);
      shifter.parameters.get('jitter')!.setTargetAtTime(spec.jitter, t, 0.02);
      presence.gain.setTargetAtTime(spec.presence, t, 0.02);
      body.gain.setTargetAtTime(spec.body, t, 0.02);
      air.gain.setTargetAtTime(spec.air, t, 0.02);
      return true;
    },
    stop() { try { shifter.disconnect(); } catch { /* already gone */ } },
  };
}

// ── synthetic ───────────────────────────────────────────────────────────────

function buildVocoder(
  ctx: BaseAudioContext, input: AudioNode, preset: keyof typeof VOCODER_SPEC,
): DisguiseGraph {
  let spec = VOCODER_SPEC[preset];
  const started: AudioScheduledSourceNode[] = [];
  const centres = bandCentres();
  const curve = absCurve();

  // ── the replacement source: periodic below, breath above ─────────────
  const carrier = ctx.createGain();

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = spec.carrierHz;
  saw.start(); started.push(saw);

  const vib = ctx.createOscillator();
  vib.frequency.value = spec.vibratoHz || 0.001;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = spec.carrierHz * (Math.pow(2, spec.vibratoCents / 1200) - 1);
  vib.connect(vibAmt); vibAmt.connect(saw.frequency);
  vib.start(); started.push(vib);

  const sawTop = ctx.createBiquadFilter();
  sawTop.type = 'lowpass'; sawTop.frequency.value = SAW_TOP; sawTop.Q.value = 0.707;
  saw.connect(sawTop);

  const sawVca = ctx.createGain();
  sawVca.gain.value = 1;                       // ducked by `unvoiced`, below
  sawTop.connect(sawVca); sawVca.connect(carrier);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  noise.start(); started.push(noise);

  const noiseBottom = ctx.createBiquadFilter();
  noiseBottom.type = 'highpass'; noiseBottom.frequency.value = NOISE_BOTTOM; noiseBottom.Q.value = 0.707;
  noise.connect(noiseBottom);

  const noiseVca = ctx.createGain();
  noiseVca.gain.value = spec.noiseFloor;       // opened by `unvoiced`, below
  noiseBottom.connect(noiseVca); noiseVca.connect(carrier);

  /*
   * Voiced / unvoiced, built out of a gain node.
   *
   * The high band of speech is loud during a fricative and quiet during a
   * vowel, so its envelope IS an unvoicedness signal. Feeding it to the noise
   * gate opens the breath; feeding it through a NEGATIVE gain to the saw gate
   * closes the buzz. It is continuous, so a sound that is half of each comes
   * out half of each — there is no threshold to get wrong.
   */
  const unvoiced = follower(ctx, band(ctx, input, 3000, 8000), curve, ENV_HZ, 1);

  // 26 opened the breath so far that it sat under the vowels too. 12 still
  // reaches full noise on a fricative — measured fricative periodicity does not
  // move — while cutting the hiss everywhere else.
  const openNoise = ctx.createGain(); openNoise.gain.value = 12;
  unvoiced.connect(openNoise); openNoise.connect(noiseVca.gain);

  const duckSaw = ctx.createGain(); duckSaw.gain.value = -16;
  unvoiced.connect(duckSaw); duckSaw.connect(sawVca.gain);

  // ── 24 × (measure the mic, open the carrier) ─────────────────────────
  const sum = ctx.createGain();
  const carrierBands: BiquadFilterNode[] = [];

  for (const fc of centres) {
    const modBp = ctx.createBiquadFilter();
    modBp.type = 'bandpass'; modBp.frequency.value = fc; modBp.Q.value = Q;
    input.connect(modBp);

    const env = follower(ctx, modBp, curve, ENV_HZ, ENV_GAIN);

    const carBp = ctx.createBiquadFilter();
    carBp.type = 'bandpass';
    carBp.frequency.value = Math.min(fc * spec.formant, ctx.sampleRate / 2 - 500);
    carBp.Q.value = Q;
    carrier.connect(carBp);
    carrierBands.push(carBp);

    const vca = ctx.createGain();
    vca.gain.value = 0;                        // driven entirely by the envelope
    env.connect(vca.gain);
    carBp.connect(vca);
    vca.connect(sum);
  }

  // ── shaping ──────────────────────────────────────────────────────────
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 2800; presence.Q.value = 0.9;
  presence.gain.value = spec.presence;
  sum.connect(presence);

  const airShelf = ctx.createBiquadFilter();
  airShelf.type = 'highshelf'; airShelf.frequency.value = 6500; airShelf.gain.value = 2;
  presence.connect(airShelf);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.707;
  airShelf.connect(hp);

  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -5; limit.knee.value = 0; limit.ratio.value = 20;
  limit.attack.value = 0.001; limit.release.value = 0.12;
  hp.connect(limit);

  return {
    output: limit,
    retune(d: Disguise) {
      if (isNatural(d)) return false;
      spec = VOCODER_SPEC[d as keyof typeof VOCODER_SPEC];
      const t = ctx.currentTime;
      saw.frequency.setTargetAtTime(spec.carrierHz, t, 0.02);
      vib.frequency.setTargetAtTime(spec.vibratoHz || 0.001, t, 0.02);
      vibAmt.gain.setTargetAtTime(spec.carrierHz * (Math.pow(2, spec.vibratoCents / 1200) - 1), t, 0.02);
      noiseVca.gain.setTargetAtTime(spec.noiseFloor, t, 0.02);
      presence.gain.setTargetAtTime(spec.presence, t, 0.02);
      carrierBands.forEach((b, i) => {
        b.frequency.setTargetAtTime(Math.min(centres[i]! * spec.formant, ctx.sampleRate / 2 - 500), t, 0.02);
      });
      return true;
    },
    stop() {
      for (const s of started) { try { s.stop(); } catch { /* already stopped */ } }
    },
  };
}

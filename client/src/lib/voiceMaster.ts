/**
 * Level the recording AFTER it is made, by measuring it.
 *
 * WHY THIS REPLACED LIVE PROCESSING
 * ─────────────────────────────────
 * The first attempt shaped the level while recording: a WebAudio graph between
 * the microphone and the recorder, with a fixed +15.6 dB of gain. In a lab that
 * measured beautifully. On a real phone it did nothing, and the reasons are all
 * the reasons live processing is a gamble:
 *
 *   - the graph was built with `new AudioContext({ sampleRate: 48000 })`, and a
 *     device whose hardware runs at 44.1 kHz can REFUSE that. The fallback then
 *     recorded the bare microphone — with the browser's own gain control turned
 *     off and nothing replacing it, which is QUIETER than doing nothing at all.
 *   - recording from a MediaStreamDestination is unreliable on iOS Safari.
 *   - a fixed amount of gain is a guess about a microphone you cannot see.
 *
 * Doing it afterwards removes every one of those. The finished clip is decoded,
 * measured, and given exactly the gain it needs — no assumption about the
 * device, no graph in the recording path, and the numbers are known rather than
 * hoped for. Recording itself is now the plainest thing the browser offers: the
 * microphone, straight into the recorder.
 *
 * WHAT IT DOES, IN ORDER
 *   1. measure the noise floor and the level of the parts where someone is
 *      actually speaking (silence must not drag the average down)
 *   2. work out the gain that puts speech at a normal listening level
 *   3. if the recording is already fine, CHANGE NOTHING and keep the original
 *      compressed file — a good recording should not pay for this
 *   4. otherwise apply the gain with a soft ceiling so nothing clips, gate the
 *      hiss back down if the boost was large, and write a WAV
 */

/** Speech should land here. Roughly what a messaging app plays back at. */
const TARGET_RMS_DB = -16;
/** Nothing leaves above this, ever. */
const CEILING = 0.84;            // -1.5 dBFS
const CEILING_KNEE = 0.6;
/** Below this much correction it is not worth re-encoding. */
const MIN_GAIN_DB = 3;
/** Never amplify beyond this: past it we are amplifying room noise. */
const MAX_GAIN_DB = 30;

const dB = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
const fromDb = (d: number) => Math.pow(10, d / 20);

export interface VoiceStats {
  /** Level of the speech itself, ignoring the pauses. */
  speechDb: number;
  noiseDb: number;
  peakDb: number;
  gainDb: number;
  gated: boolean;
  durationMs: number;
}

export interface MasteredVoice {
  blob: Blob;
  dataUrl: string;
  durationMs: number;
  /** False when the recording was already good and was left alone. */
  changed: boolean;
  stats: VoiceStats;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('ვერ წაიკითხა'));
    fr.readAsDataURL(blob);
  });
}

/** Per-frame levels, which is what tells speech apart from a quiet room. */
function frameLevels(data: Float32Array, rate: number): { frames: Float64Array; frameLen: number } {
  const frameLen = Math.max(1, Math.floor(rate * 0.02));   // 20 ms
  const count = Math.max(1, Math.floor(data.length / frameLen));
  const frames = new Float64Array(count);
  for (let f = 0; f < count; f++) {
    let sum = 0;
    const start = f * frameLen;
    for (let i = 0; i < frameLen; i++) { const v = data[start + i] ?? 0; sum += v * v; }
    frames[f] = Math.sqrt(sum / frameLen);
  }
  return { frames, frameLen };
}

export function analyseVoice(data: Float32Array, rate: number): {
  speech: number; noise: number; peak: number; clipped: number; frames: Float64Array; frameLen: number;
} {
  let peak = 0, clipped = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
  }

  const { frames, frameLen } = frameLevels(data, rate);
  const sorted = Float64Array.from(frames).sort();
  // The quiet tenth of the clip is the room, not the person.
  const noise = sorted[Math.floor(sorted.length * 0.1)] ?? 0;

  // Speech = the frames clearly above that floor. Averaging the whole clip
  // instead would let the pauses decide how loud someone sounds.
  const threshold = Math.max(noise * 4, peak * 0.06);
  let sum = 0, n = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] >= threshold) { sum += frames[i] * frames[i]; n++; }
  }
  const speech = n > 0 ? Math.sqrt(sum / n) : (sorted[Math.floor(sorted.length * 0.9)] ?? peak);
  return { speech, noise, peak, clipped: clipped / Math.max(data.length, 1), frames, frameLen };
}

/** Linear below the knee, asymptotic to the ceiling above it. Never clips. */
function softCeil(x: number): number {
  const a = Math.abs(x);
  if (a <= CEILING_KNEE) return x;
  const y = CEILING_KNEE + (CEILING - CEILING_KNEE) * Math.tanh((a - CEILING_KNEE) / (CEILING - CEILING_KNEE));
  return Math.sign(x) * y;
}

/** 16-bit mono WAV. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Downsample without folding the top of the spectrum into the voice.
 *
 * Dropping the sample rate by picking fewer samples — however cleverly you
 * interpolate — mirrors everything above the new Nyquist frequency back down
 * into the audible band. On speech that lands on the sibilants and sounds like
 * harsh grit. Measured on a 14 kHz tone taken from 48 kHz to 16 kHz, the fold
 * came back at 2 kHz LOUDER than the voice itself.
 *
 * Handing the job to an OfflineAudioContext does not fix it — measured, the
 * browser's own rate conversion folded it by exactly as much. What fixes it is
 * removing the content first: four cascaded low-pass stages just under the
 * target Nyquist, rendered at the SOURCE rate, and only then decimated. Same
 * measurement afterwards: the fold sits 62 dB below the voice, which is
 * inaudible.
 */
async function resample(
  data: Float32Array<ArrayBuffer>, from: number, to: number,
): Promise<Float32Array<ArrayBuffer>> {
  if (to >= from) return data;

  const ctx = new OfflineAudioContext(1, data.length, from);
  const buf = ctx.createBuffer(1, data.length, from);
  buf.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  let node: AudioNode = src;
  for (let i = 0; i < 4; i++) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // A little under Nyquist: right at it, the filter is only half-way down.
    lp.frequency.value = (to / 2) * 0.9;
    lp.Q.value = 0.707;
    node.connect(lp);
    node = lp;
  }
  node.connect(ctx.destination);
  src.start();
  const clean = (await ctx.startRendering()).getChannelData(0);

  // Now that nothing lives above the new Nyquist, plain decimation is safe.
  const ratio = from / to;
  const out = new Float32Array(new ArrayBuffer(Math.floor(clean.length / ratio) * 4));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x), i1 = Math.min(clean.length - 1, i0 + 1);
    const t = x - i0;
    out[i] = clean[i0] * (1 - t) + clean[i1] * t;
  }
  return out;
}

/**
 * Bring a recording to a normal listening level.
 *
 * `maxChars` is the server's limit for wherever this is going; the delivery
 * sample rate is derived from it so a long clip is never refused after the fact.
 */
export async function masterVoice(source: Blob, maxChars = 2_400_000): Promise<MasteredVoice> {
  const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ctx = new AC();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await source.arrayBuffer());
  } catch {
    // Undecodable here does not mean unplayable there — send it as it is.
    void ctx.close();
    return {
      blob: source, dataUrl: await blobToDataUrl(source), durationMs: 0, changed: false,
      stats: { speechDb: 0, noiseDb: 0, peakDb: 0, gainDb: 0, gated: false, durationMs: 0 },
    };
  }
  const rate = buf.sampleRate;
  void ctx.close();

  // Mono: a phone microphone is one microphone even when the container says two.
  const chans = buf.numberOfChannels;
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < chans; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += d[i] / chans;
  }

  const { speech, noise, peak, clipped } = analyseVoice(mono, rate);
  const durationMs = Math.round(buf.duration * 1000);

  const wanted = fromDb(TARGET_RMS_DB) / Math.max(speech, 1e-9);
  const gain = Math.min(wanted, fromDb(MAX_GAIN_DB));
  const gainDb = dB(gain);

  const stats: VoiceStats = {
    speechDb: +dB(speech).toFixed(1),
    noiseDb: +dB(noise).toFixed(1),
    peakDb: +dB(peak).toFixed(1),
    gainDb: +gainDb.toFixed(1),
    gated: false,
    durationMs,
  };

  /*
   * Already loud enough: keep the original compressed file untouched. Rewriting
   * a good recording as WAV would cost size and gain nothing.
   *
   * Unless it is CLIPPED. A phone's own gain control can push speech into the
   * ceiling, and a recording that arrives already squared off needs bringing
   * down and rounding rather than leaving alone. A few samples at full scale
   * are normal after lossy encoding and not worth rewriting a file over; a
   * fifth of a percent is not a rounding artefact, it is audible.
   */
  const CLIPPED_ENOUGH_TO_FIX = 0.002;
  if (gainDb < MIN_GAIN_DB && clipped < CLIPPED_ENOUGH_TO_FIX) {
    return { blob: source, dataUrl: await blobToDataUrl(source), durationMs, changed: false, stats };
  }

  // A large boost lifts the room with the voice, so hold the quiet parts down.
  // Only when it is actually needed: gating a clean recording dulls its tails.
  const noiseAfter = dB(noise * gain);
  const gate = gainDb > 12 && noiseAfter > -48;
  stats.gated = gate;
  const gateFloor = Math.max(noise * 3, peak * 0.02);

  const out = new Float32Array(new ArrayBuffer(mono.length * 4));
  let env = 0;
  // ~5 ms attack, ~120 ms release, so a gate never chops the start of a word.
  const attack = Math.exp(-1 / (0.005 * rate));
  const release = Math.exp(-1 / (0.120 * rate));
  for (let i = 0; i < mono.length; i++) {
    let v = mono[i] * gain;
    if (gate) {
      const level = Math.abs(mono[i]);
      env = level > env ? attack * env + (1 - attack) * level : release * env + (1 - release) * level;
      // Smooth, not a switch: a hard gate breathes audibly.
      const open = Math.min(1, Math.max(0, (env - gateFloor) / (gateFloor * 2 + 1e-9)));
      v *= 0.25 + 0.75 * open;
    }
    out[i] = softCeil(v);
  }

  // Delivery rate: whatever we recorded at, unless the size budget cannot take
  // it. Keeping the original rate means no resampling at all for a typical
  // short clip — nothing to filter, nothing to alias, full bandwidth kept.
  const budget = Math.floor(((maxChars * 3) / 4 - 64) / (2 * Math.max(buf.duration, 0.1)));
  const target = Math.max(12_000, Math.min(budget, rate));
  const delivered = await resample(out, rate, target);
  const blob = encodeWav(delivered, target);

  return { blob, dataUrl: await blobToDataUrl(blob), durationMs, changed: true, stats };
}

/**
 * Bring a rendered buffer to the same loudness the rest of the app uses.
 *
 * The voice effects need this: a vocoder's output level depends on how loud the
 * input happened to be, so without it a chosen voice can arrive 10 dB quieter
 * than the recording it replaced. Measured on the speech, ceilinged so it
 * cannot clip.
 */
export function normalise(
  data: Float32Array<ArrayBuffer>, rate: number, targetDb = TARGET_RMS_DB,
): { data: Float32Array<ArrayBuffer>; gainDb: number } {
  // The real rate matters: the analysis frames speech in 20 ms windows, and
  // guessing the rate mis-sizes every one of them.
  const { speech } = analyseVoice(data, rate);
  const gain = Math.min(fromDb(targetDb) / Math.max(speech, 1e-9), fromDb(MAX_GAIN_DB));
  const out = new Float32Array(new ArrayBuffer(data.length * 4));
  for (let i = 0; i < data.length; i++) out[i] = softCeil(data[i] * gain);
  return { data: out, gainDb: +dB(gain).toFixed(1) };
}

/** Exported for tests: the frame analysis, without any file handling. */
export const __internals = { frameLevels, softCeil, dB, fromDb };

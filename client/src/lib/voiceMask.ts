/**
 * Voice Mask perk — real-time pitch shifting on your own microphone.
 *
 * WHY A PROCESSOR AND NOT A NEW TRACK
 * ───────────────────────────────────
 * The voice stack enables the mic through LiveKit's setMicrophoneEnabled(),
 * which carries a pile of hard-won behaviour: iOS gesture handling, permission
 * recovery, mute/unmute, phase rules. Publishing our own processed track would
 * mean re-implementing all of it. LiveKit's TrackProcessor hook lets us splice
 * a WebAudio graph into the already-published track instead, so none of that
 * changes — the same track keeps being published, it just sounds different.
 *
 * HOW THE SHIFT WORKS
 * ───────────────────
 * Granular (overlap-add) pitch shifting inside an AudioWorklet. We read from a
 * ring buffer at a rate other than 1.0; that changes pitch AND speed, so we run
 * two read heads half a grain out of phase and crossfade between them. Each head
 * wraps every grain, and the crossfade hides the wrap discontinuity — the net
 * effect is pitch changed, speed unchanged.
 *
 * A worklet (not ScriptProcessor) because this runs on the audio thread: a
 * dropout here is heard by the whole room, and ScriptProcessor competes with
 * React rendering on the main thread.
 */
import type { Room } from 'livekit-client';
import { buildDisguise, DISGUISES, type Disguise, type DisguiseGraph } from './voiceDisguise';

/**
 * The three pitch masks are the coin-shop perk. The four DISGUISES are the
 * verified one, and they are a different thing entirely — a pitch shift makes
 * you sound higher, a vocoder makes you sound like somebody else. See
 * lib/voiceDisguise for why that distinction is physical rather than a matter
 * of degree.
 */
export type VoiceMaskPreset = 'deep' | 'high' | 'ghost' | Disguise;

const DISGUISE_SET = new Set<string>(DISGUISES);
export function isDisguise(p: VoiceMaskPreset): p is Disguise { return DISGUISE_SET.has(p); }

/** Pitch ratios. <1 lowers, >1 raises. Disguises do not use these. */
const RATIO: Record<'deep' | 'high' | 'ghost', number> = {
  deep: 0.72,    // noticeably lower, still intelligible
  high: 1.42,    // clearly a different person, not a chipmunk
  ghost: 0.86,   // small shift + detune wobble; uncanny rather than comic
};
/** Ghost adds a slow detune wobble on top of the shift. */
const WOBBLE_HZ: Record<'deep' | 'high' | 'ghost', number> = { deep: 0, high: 0, ghost: 0.9 };
const WOBBLE_DEPTH: Record<'deep' | 'high' | 'ghost', number> = { deep: 0, high: 0, ghost: 0.055 };

// The worklet source is inlined and loaded from a blob URL: the app is served as
// a hashed bundle, so there is no stable public path to addModule() from.
const WORKLET_SRC = `
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'ratio', defaultValue: 1, minValue: 0.4, maxValue: 2.5, automationRate: 'k-rate' },
      { name: 'wobbleHz', defaultValue: 0, minValue: 0, maxValue: 8, automationRate: 'k-rate' },
      { name: 'wobbleDepth', defaultValue: 0, minValue: 0, maxValue: 0.3, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.size = 8192;                 // ring headroom, comfortably > grain
    this.buf = new Float32Array(this.size);
    this.write = 0;
    this.phase = 0;
    // GRAIN and HEADS are not free choices — they were swept offline against a
    // voice-like harmonic stack at f0 = 85…255 Hz for all three presets, scoring
    // pitch accuracy (autocorrelation) and envelope flatness. Shorter grains
    // cannot hold a full cycle of an 85 Hz fundamental and destroy the pitch
    // (40%+ error); more heads read regions being overwritten and do the same.
    // 1536 / 3 was the flattest configuration that still tracked pitch to ~5%.
    this.grain = 1536;                // ~32ms at 48kHz
    this.heads = 3;
    this.t = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const inCh = input && input.length > 0 ? input[0] : null;
    const out = output[0];
    const n = out.length;

    // No input yet (mic muted upstream): emit silence but stay alive.
    if (!inCh) { out.fill(0); return true; }

    // k-rate params arrive as single-element arrays.
    const ratio = parameters.ratio[0];
    const hz = parameters.wobbleHz[0];
    const depth = parameters.wobbleDepth[0];

    for (let i = 0; i < n; i++) {
      this.buf[this.write] = inCh[i];
      this.write = (this.write + 1) % this.size;

      // Per-sample wobble keeps 'ghost' from sounding like a flat transpose.
      let r = ratio;
      if (hz > 0 && depth > 0) {
        this.t += 1 / sampleRate;
        r = ratio * (1 + depth * Math.sin(2 * Math.PI * hz * this.t));
      }

      // Advance the read phase relative to the write head. phase stays within
      // [0, grain); the second head sits half a grain away.
      this.phase += r - 1;
      if (this.phase >= this.grain) this.phase -= this.grain;
      if (this.phase < 0) this.phase += this.grain;

      // Read heads spread evenly across the grain, each Hann-windowed so it is
      // silent exactly where it wraps — the discontinuity lands at zero gain.
      // The sum is divided by the window sum, so total gain stays at unity
      // regardless of head count rather than swelling with it.
      let acc = 0, gsum = 0;
      for (let h = 0; h < this.heads; h++) {
        const ph = (this.phase + (this.grain * h) / this.heads) % this.grain;
        const s = Math.sin(Math.PI * (ph / this.grain));
        const g = s * s;
        acc += this.sample(this.write - this.grain + ph) * g;
        gsum += g;
      }
      out[i] = gsum > 1e-6 ? acc / gsum : 0;
    }

    // Mirror to any extra output channels so a stereo sink doesn't get silence.
    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }
  sample(pos) {
    // Linear interpolation — the read position is fractional.
    let x = pos;
    while (x < 0) x += this.size;
    while (x >= this.size) x -= this.size;
    const i0 = Math.floor(x);
    const i1 = (i0 + 1) % this.size;
    const f = x - i0;
    return this.buf[i0] * (1 - f) + this.buf[i1] * f;
  }
}
registerProcessor('vm-pitch-shift', PitchShiftProcessor);
`;

let workletUrl: string | null = null;
function moduleUrl(): string {
  if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  return workletUrl;
}

/** The processor's registered name, shared with the offline voice effects. */
export const PITCH_NODE = 'vm-pitch-shift';

const loaded = new WeakSet<BaseAudioContext>();
/**
 * Exported because the same shifter is used twice: live on the microphone
 * here, and offline in lib/voiceFx to change the voice of a RECORDING. It was
 * tuned once, against measured pitch accuracy; a second copy would drift.
 */
export async function ensurePitchWorklet(ctx: BaseAudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  await ctx.audioWorklet.addModule(moduleUrl());
  loaded.add(ctx);
}

/**
 * A LiveKit audio TrackProcessor that pitch-shifts the local mic.
 *
 * Written against the structural interface rather than importing LiveKit's
 * (it's marked experimental there, and the shape is three methods).
 */
export class VoiceMaskProcessor {
  name = 'vm-voice-mask';
  processedTrack?: MediaStreamTrack;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private disguise: DisguiseGraph | null = null;
  private preset: VoiceMaskPreset;

  constructor(preset: VoiceMaskPreset) { this.preset = preset; }

  async init(opts: { track: MediaStreamTrack; audioContext: AudioContext }): Promise<void> {
    this.ctx = opts.audioContext;
    this.source = this.ctx.createMediaStreamSource(new MediaStream([opts.track]));
    this.dest = this.ctx.createMediaStreamDestination();

    if (isDisguise(this.preset)) {
      // No worklet at all on this path: the vocoder is native nodes end to end.
      this.disguise = buildDisguise(this.ctx, this.source, this.preset);
      this.disguise.output.connect(this.dest);
    } else {
      await ensurePitchWorklet(this.ctx);
      this.node = new AudioWorkletNode(this.ctx, 'vm-pitch-shift', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      });
      this.apply(this.preset);
      this.source.connect(this.node).connect(this.dest);
    }

    this.processedTrack = this.dest.stream.getAudioTracks()[0];
  }

  /**
   * Change preset without tearing the graph down (no audible gap).
   *
   * Returns false when the change crosses between a pitch mask and a disguise —
   * those are different graphs, so the caller has to rebuild. Retuning WITHIN
   * either kind is free.
   */
  apply(preset: VoiceMaskPreset): boolean {
    const wasDisguise = isDisguise(this.preset);
    const isNowDisguise = isDisguise(preset);
    if (wasDisguise !== isNowDisguise) return false;
    this.preset = preset;

    if (isNowDisguise) { this.disguise?.retune(preset as Disguise); return true; }

    const p = this.node?.parameters;
    if (!p) return true;
    const k = preset as 'deep' | 'high' | 'ghost';
    p.get('ratio')!.value = RATIO[k];
    p.get('wobbleHz')!.value = WOBBLE_HZ[k];
    p.get('wobbleDepth')!.value = WOBBLE_DEPTH[k];
    return true;
  }

  async restart(opts: { track: MediaStreamTrack; audioContext: AudioContext }): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    // The oscillators keep running until stopped, and a leaked one is a leaked
    // audio thread for the life of the tab.
    try { this.disguise?.stop(); } catch { /* already stopped */ }
    try { this.disguise?.output.disconnect(); } catch { /* already gone */ }
    try { this.source?.disconnect(); } catch { /* already gone */ }
    try { this.node?.disconnect(); } catch { /* already gone */ }
    this.source = null; this.node = null; this.dest = null; this.disguise = null;
    this.processedTrack = undefined;
  }
}

// ── attach / detach against a live LiveKit room ────────────────────────
let active: VoiceMaskProcessor | null = null;

/**
 * Put the mask on (or change/remove it) for the local participant's mic.
 *
 * Safe to call at any time: before the mic exists it simply records the wish
 * and returns, and callers re-invoke it after the mic comes up. Every failure
 * path is swallowed — an unsupported browser must cost the player their mask,
 * never their voice.
 */
export async function applyVoiceMask(room: Room | null, preset: VoiceMaskPreset | null): Promise<void> {
  if (!room) return;
  try {
    const pub = [...room.localParticipant.audioTrackPublications.values()]
      .find(p => p.source === 'microphone' || p.track);
    const track: any = pub?.track;
    if (!track || typeof track.setProcessor !== 'function') return;

    if (!preset) {
      if (active && typeof track.stopProcessor === 'function') await track.stopProcessor();
      active = null;
      return;
    }
    // Already masked → just retune, which avoids a republish and its gap. When
    // the change crosses between a pitch mask and a vocoder the graphs differ,
    // so apply() says so and the processor is replaced instead.
    if (active) {
      if (active.apply(preset)) return;
      if (typeof track.stopProcessor === 'function') await track.stopProcessor();
      active = null;
    }

    const proc = new VoiceMaskProcessor(preset);
    await track.setProcessor(proc);
    active = proc;
  } catch {
    // AudioWorklet unavailable, or LiveKit refused the processor. The mic keeps
    // working unmasked, which is the right way to fail.
    active = null;
  }
}

/** Forget any attached mask — call when the room connection goes away. */
export function resetVoiceMask(): void { active = null; }

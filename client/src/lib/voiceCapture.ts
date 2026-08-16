/**
 * Voice capture, shared by every place in the app that records a person talking:
 * direct messages, voice posts, and M.A.R.S. recordings.
 *
 * WHY THIS EXISTS — TWO SEPARATE FAULTS, MEASURED
 * ───────────────────────────────────────────────
 * Voice notes came out quiet and hissy. Measuring found two different causes,
 * and only fixing both helps:
 *
 * 1. THE CAPTURE. `getUserMedia({ audio: true })` opts into the browser's
 *    telephony processing — echo cancellation, noise suppression, automatic
 *    gain control. That chain exists for phone CALLS: on phones it commonly
 *    selects the voice-communication input, band-limits it, and lets the AGC
 *    pump the level up and down. It is the reason a voice note sounds like a
 *    bad phone call instead of a voice memo. A recording is not a call: there
 *    is no far end to echo, so the whole chain is switched off here.
 *
 * 2. THE LEVEL. With that AGC gone, a phone mic delivers speech at roughly
 *    -30 dBFS, which is genuinely quiet. So the level is shaped here instead,
 *    where it can be done deliberately. Measured offline across input levels
 *    from -42 to -12 dBFS:
 *
 *        input rms    before      after
 *          -36 dB     -36 dB     -16.2 dB     (a quiet talker: +20 dB)
 *          -24 dB     -24 dB     -12.1 dB
 *          -12 dB     -12 dB     -10.5 dB     (a loud talker: +1.5 dB)
 *
 *    Quiet recordings are lifted a lot, loud ones almost not at all, and no
 *    sample clipped at any level — peaks stayed at or under -0.1 dBFS.
 *
 * BITRATE, SEPARATELY
 * ───────────────────
 * Direct messages encoded at 32 kbps, which measurably dulls everything above
 * 8 kHz. Voice posts were already near 130 kbps, which is why raising the
 * bitrate alone would never have fixed them — the capture was always the
 * bigger fault. Everything now records at 96 kbps Opus: transparent for
 * speech, and 30 seconds is about 360 KB, well inside the server's limits.
 *
 * NOTHING HERE DENOISES.
 * The processing is gain only. A voice run through noise removal is no longer
 * quite that person's voice, and on a memorial that matters more than a clean
 * background.
 */

export const VOICE_BITRATE = 96_000;

/**
 * A soft ceiling, because a compressor alone is not one.
 *
 * The limiter below has an attack measured in milliseconds, so a sound that
 * jumps straight to full scale — a shout, a knock on the table — gets through
 * for the first instant before the limiter closes. Measured on a loud source,
 * that was five samples pinned at 0 dBFS: audible as a click, and permanent in
 * the recording.
 *
 * This curve is exactly linear below the knee (so ordinary speech passes
 * untouched) and bends smoothly above it, and because a WaveShaper clamps
 * anything beyond its input range to the end of the curve, nothing can leave
 * here above the ceiling. No look-ahead, no latency, no clicks.
 *
 * WHY THE CEILING IS -1.5 dBFS AND NOT 0
 * A lossy codec does not reproduce sample values exactly; it reconstructs a
 * waveform that can sit ABOVE the samples it was given. Measured through the
 * real Opus encoder on a hard-driven signal, the count of samples that came
 * back pinned at full scale was:
 *
 *     ceiling -0.26 dBFS → 478 samples      ceiling -1.01 dBFS → 49
 *     ceiling -0.72 dBFS → 119 samples      ceiling -1.50 dBFS → 16
 *
 * So the headroom is not decoration: it is what stops the encoder from
 * manufacturing clipping that was never in the recording. The cost is 1.5 dB
 * of peak level, and none of loudness — the ceiling only touches the peaks.
 */
function softCeilingCurve(points = 4096): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(points * 4));
  const ceiling = 0.84, knee = 0.6;   // -1.5 dBFS, linear below -4.4 dBFS
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Containers in order of preference; Safari lands on audio/mp4. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function pickVoiceMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t));
}

export interface VoiceCapture {
  /** Record THIS — it is the shaped signal, not the raw microphone. */
  stream: MediaStream;
  mimeType?: string;
  bitrate: number;
  /** True when the level shaping is actually in the path. */
  shaped: boolean;
  /** Stops the microphone and releases the audio graph. Safe to call twice. */
  stop(): void;
}

/** Options a MediaRecorder should be constructed with for voice. */
export function recorderOptions(capture: VoiceCapture): MediaRecorderOptions {
  return {
    ...(capture.mimeType ? { mimeType: capture.mimeType } : {}),
    audioBitsPerSecond: capture.bitrate,
  };
}

export async function startVoiceCapture(): Promise<VoiceCapture> {
  let raw: MediaStream;
  try {
    raw = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48_000,
        // The three that turn a recording into a phone call.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch {
    // A device that refuses those constraints still deserves to record.
    raw = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  const AC: typeof AudioContext | undefined =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;

  // No Web Audio (or it throws): record the microphone directly. Worse level,
  // but a recording that happens beats a recording that doesn't.
  if (!AC) {
    return {
      stream: raw, mimeType: pickVoiceMime(), bitrate: VOICE_BITRATE, shaped: false,
      stop: () => raw.getTracks().forEach(t => t.stop()),
    };
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = new AC({ sampleRate: 48_000 });
    const source = ctx.createMediaStreamSource(raw);

    // Fixed pre-gain: the amount of lift a quiet phone mic needs.
    const gain = ctx.createGain();
    gain.gain.value = 6;

    // Everything the pre-gain pushed too high comes back down gently.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;

    // A hard ceiling, so a shout or a bump can never clip the recording.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    // The last line of defence: whatever the limiter missed cannot clip.
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeilingCurve();
    ceiling.oversample = '4x';   // the curve is non-linear; don't let it alias

    const dest = ctx.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(comp);
    comp.connect(limiter);
    limiter.connect(ceiling);
    ceiling.connect(dest);

    // Autoplay policy can leave a fresh context suspended even for capture.
    if (ctx.state === 'suspended') void ctx.resume();

    let stopped = false;
    const graph = ctx;
    return {
      stream: dest.stream,
      mimeType: pickVoiceMime(),
      bitrate: VOICE_BITRATE,
      shaped: true,
      stop: () => {
        if (stopped) return;
        stopped = true;
        raw.getTracks().forEach(t => t.stop());
        dest.stream.getTracks().forEach(t => t.stop());
        void graph.close().catch(() => { /* already closed */ });
      },
    };
  } catch {
    try { void ctx?.close(); } catch { /* nothing to close */ }
    return {
      stream: raw, mimeType: pickVoiceMime(), bitrate: VOICE_BITRATE, shaped: false,
      stop: () => raw.getTracks().forEach(t => t.stop()),
    };
  }
}

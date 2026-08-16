/**
 * Voice capture, shared by every place in the app that records a person talking:
 * direct messages, voice posts, and M.A.R.S. recordings.
 *
 * WHAT THIS DOES — AND DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────
 * It asks the microphone for the cleanest signal the device will give, and
 * hands that stream straight to the recorder. Nothing sits in between.
 *
 * There WAS something in between: a WebAudio graph that raised the level while
 * recording. It measured well in a lab and did nothing on a real phone, for
 * reasons that are all reasons live processing is a gamble — a device can
 * refuse the AudioContext sample rate and drop the whole graph, recording from
 * a MediaStreamDestination is unreliable on iOS Safari, and a fixed amount of
 * gain is a guess about a microphone you cannot see. Worse, its fallback path
 * recorded the bare microphone with the browser's own gain control switched
 * off, which is quieter than doing nothing at all.
 *
 * Levelling now happens AFTER recording, in lib/voiceMaster, where the clip can
 * be measured and given exactly the gain it needs. Capture stays the plainest
 * thing the browser offers, because that is the part that has to work on every
 * device in the world.
 *
 * WHY THE MICROPHONE IS ASKED FOR NO PROCESSING
 * ─────────────────────────────────────────────
 * `getUserMedia({ audio: true })` opts into the browser's telephony chain —
 * echo cancellation, noise suppression, automatic gain control. That chain is
 * built for phone CALLS: on phones it commonly selects the voice-communication
 * input, band-limits it, and lets the gain control pump. It is why a voice note
 * sounded like a bad phone call. A recording has no far end to echo, so those
 * are switched off and the level is dealt with afterwards, in one place, from
 * measurements.
 *
 * BITRATE
 * Direct messages used to encode at 32 kbps, which measurably dulls everything
 * above 8 kHz. Everything now records 96 kbps Opus where the browser has it.
 */

export const VOICE_BITRATE = 96_000;

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
  stream: MediaStream;
  mimeType?: string;
  bitrate: number;
  /** What the device actually agreed to, for diagnosis. */
  settings: MediaTrackSettings | null;
  /** Stops the microphone. Safe to call twice. */
  stop(): void;
}

/** Options a MediaRecorder should be constructed with for voice. */
export function recorderOptions(capture: VoiceCapture): MediaRecorderOptions {
  return {
    ...(capture.mimeType ? { mimeType: capture.mimeType } : {}),
    audioBitsPerSecond: capture.bitrate,
  };
}

/**
 * Constraint ladder. Each rung asks for less, and the last one asks for
 * nothing at all — a recording that happens beats a recording that does not.
 * Note there is no `sampleRate` here: pinning it gains nothing (the clip is
 * resampled later anyway) and some devices refuse the whole request over it.
 */
const LADDER: MediaStreamConstraints[] = [
  { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
  { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
  { audio: true },
];

export async function startVoiceCapture(): Promise<VoiceCapture> {
  let stream: MediaStream | null = null;
  let lastError: unknown = null;

  for (const constraints of LADDER) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!stream) throw lastError ?? new Error('microphone unavailable');

  const track = stream.getAudioTracks()[0];
  let stopped = false;
  return {
    stream,
    mimeType: pickVoiceMime(),
    bitrate: VOICE_BITRATE,
    settings: track?.getSettings?.() ?? null,
    stop: () => {
      if (stopped) return;
      stopped = true;
      stream.getTracks().forEach(t => t.stop());
    },
  };
}

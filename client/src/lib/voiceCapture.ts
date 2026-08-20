/**
 * Voice capture, shared by every place in the app that records a person talking:
 * direct messages, voice posts, and M.A.R.S. recordings.
 *
 * TWO THINGS ON iOS THAT PRODUCE EXACTLY "QUIET AND TERRIBLE"
 * ──────────────────────────────────────────────────────────
 * 1. THE CONSTRAINTS. This asked the microphone for no processing at all —
 *    echo cancellation, noise suppression and gain control switched off — on
 *    the reasoning that the telephony chain is what makes a voice note sound
 *    like a phone call. On iPhone that reasoning is wrong in the worst way:
 *    Safari's processed path is the one that is loud and clear, and the
 *    unprocessed path hands back a thin, quiet signal. The evidence was in the
 *    complaint itself — "the microphone works fine in every other app and
 *    site", and every other site calls getUserMedia with the defaults. So the
 *    defaults are what we ask for now. Level is dealt with afterwards, by
 *    measurement, in lib/voiceMaster.
 *
 * 2. THE AUDIO ROUTE. Using the microphone puts iOS into its play-and-record
 *    session, and in that mode playback comes out of the EARPIECE — the little
 *    speaker you hold to your ear — instead of the loudspeaker. A recording
 *    played back that way sounds quiet and muffled no matter how good the file
 *    is. Safari exposes `navigator.audioSession`; setting it back to
 *    'playback' when recording ends puts the sound back on the main speaker.
 *    Call `preparePlayback()` before playing a clip.
 *
 * There is also a meter: `level()` returns the current input loudness, so the
 * interface can show that the microphone is actually hearing something. It is
 * read-only — an analyser hanging off the stream, never in the recording path
 * — so if it fails, the recording is unaffected.
 */

export const VOICE_BITRATE = 96_000;

/**
 * Apple hardware, including iPadOS pretending to be a Mac.
 * `maxTouchPoints` is the tell that separates an iPad from a desktop Safari.
 */
export function isApple(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Containers in order of preference — and the order is not the same everywhere.
 *
 * On Apple devices the native path is mp4/AAC: that is the encoder Safari
 * actually maintains, and it is what every other recorder on the platform
 * produces. Taking whichever candidate merely reports "supported" first can
 * land on an encoder the platform barely implements, which is one way a
 * recording comes out sounding wrong. Everywhere else, Opus first.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];
const APPLE_MIME_CANDIDATES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
];

export function pickVoiceMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  const list = isApple() ? APPLE_MIME_CANDIDATES : MIME_CANDIDATES;
  return list.find(t => MediaRecorder.isTypeSupported(t));
}

/** Safari's audio session, where it exists. Silently absent everywhere else. */
function audioSession(): { type: string } | null {
  const s = (navigator as any).audioSession;
  return s && typeof s === 'object' ? s : null;
}

/**
 * Tell Safari we are about to use the microphone.
 *
 * THE FAILURE THIS EXISTS FOR
 * ───────────────────────────
 * Safari's audio session has a category, and `preparePlayback()` below sets it
 * to 'playback' so a voice note comes out of the loudspeaker instead of the
 * earpiece. That category is not merely a routing hint: while it is set,
 * getUserMedia for audio is REFUSED outright, with
 *
 *     AudioSession category is not compatible with audio capture.
 *
 * So playing one voice post could leave the microphone unusable for the rest of
 * the session — no game voice, no calls, no recording — and the error surfaced
 * as an unexplained failure to turn the mic on. Every path that is about to
 * capture calls this first; it does nothing where the API does not exist.
 */
export function prepareCapture(): void {
  const s = audioSession();
  if (!s) return;
  try { s.type = 'play-and-record'; } catch { /* not settable here */ }
}

/**
 * …and the same trap in reverse.
 *
 * A live microphone — a game's voice chat, a call — must not be dropped into
 * the 'playback' category by somebody hitting play on a voice post in another
 * tab of the app. While a capture is open, `preparePlayback()` below stands
 * down; the routing is already right, because capture set it.
 */
let liveCaptures = 0;
export function setCaptureLive(on: boolean): void {
  liveCaptures = on ? liveCaptures + 1 : Math.max(0, liveCaptures - 1);
}

/**
 * Put audio output back on the loudspeaker.
 *
 * After the microphone has been used, iOS keeps the session in play-and-record
 * and routes playback to the earpiece. Every place that plays a voice clip
 * should call this first; it does nothing on platforms without the API.
 */
export function preparePlayback(): void {
  if (liveCaptures > 0) return;   // a microphone is open; leave the session alone
  const s = audioSession();
  if (!s) return;
  try { s.type = 'playback'; } catch { /* not settable here */ }
}

export interface VoiceCapture {
  stream: MediaStream;
  mimeType?: string;
  bitrate: number;
  /** What the device actually agreed to — useful when a phone misbehaves. */
  settings: MediaTrackSettings | null;
  /** Current input loudness, 0…1, or null when metering is unavailable. */
  level(): number | null;
  /** Stops the microphone and hands the speaker back. Safe to call twice. */
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
 * Constraint ladder. The first rung is what every ordinary site asks for, and
 * on a phone that is the path the platform has actually tuned. The last rung
 * asks for nothing at all, because a recording that happens beats a recording
 * that does not.
 *
 * No `sampleRate` anywhere: pinning it gains nothing (the clip is resampled
 * later regardless) and some devices refuse the whole request over it.
 */
const LADDER: MediaStreamConstraints[] = [
  { audio: { channelCount: 1 } },
  { audio: true },
];

export async function startVoiceCapture(): Promise<VoiceCapture> {
  // Tell Safari we are about to record — and unblock capture if a clip was
  // played earlier in this session.
  prepareCapture();

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
  if (!stream) {
    preparePlayback();
    throw lastError ?? new Error('microphone unavailable');
  }

  // ── the meter, entirely off to the side ────────────────────────────
  let meterCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;
  try {
    const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (AC) {
      meterCtx = new AC();
      if (meterCtx.state === 'suspended') void meterCtx.resume();
      const src = meterCtx.createMediaStreamSource(stream);
      analyser = meterCtx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);                 // and nowhere else: nothing is fed back
      buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    }
  } catch {
    meterCtx = null; analyser = null; buffer = null;
  }

  const track = stream.getAudioTracks()[0];
  let stopped = false;
  setCaptureLive(true);

  return {
    stream,
    mimeType: pickVoiceMime(),
    bitrate: VOICE_BITRATE,
    settings: track?.getSettings?.() ?? null,
    level: () => {
      if (!analyser || !buffer) return null;
      try {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        return Math.sqrt(sum / buffer.length);
      } catch { return null; }
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      setCaptureLive(false);
      stream.getTracks().forEach(t => t.stop());
      try { void meterCtx?.close(); } catch { /* already closed */ }
      // Hand the loudspeaker back before anything is played.
      preparePlayback();
    },
  };
}

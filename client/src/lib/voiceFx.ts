/**
 * Voice profiles for a RECORDING — a voice post, or a voice message.
 *
 * ONE SET OF VOICES FOR THE WHOLE APP
 * ───────────────────────────────────
 * This file used to carry its own effects: deep, high, ghost, robot, radio,
 * giant, echo, L, anonymous, and four more added later. They were written
 * before the live disguise existed and they were, plainly, not good — muddy,
 * quiet, and the vocoder ones buzzed hard enough that the words were difficult
 * to make out. The measurement that condemns them is in lib/voiceDisguise: a
 * fricative that reads 0.20 on a periodicity scale in real speech came out at
 * 0.89–0.94 through them, which is to say every s, sh and f had become a hum.
 *
 * They are gone. A recording now goes through exactly the same profiles the
 * microphone does in the mafia lobby, so a voice is defined once, tuned once,
 * and there is no way for the two paths to drift into "the good ones" and "the
 * old ones".
 *
 * WHY OFFLINE AND NOT DURING RECORDING
 * ────────────────────────────────────
 * Processing while recording gives you one take of one voice. Processing the
 * finished clip means the same recording can be tried as several voices in a
 * couple of seconds, and the original is never lost — which is the whole point
 * of a voice changer. An OfflineAudioContext renders far faster than real time,
 * so tapping a voice is instant rather than a wait the length of the clip.
 *
 * WHY THE RESULT IS WAV
 * ─────────────────────
 * There is no Opus encoder available to a page without shipping a WebAssembly
 * one, and re-encoding through MediaRecorder happens in real time — a 30-second
 * clip would take 30 seconds per voice tried. WAV is written instantly. The
 * sample rate is chosen from the clip's own length so the result always fits
 * the server's limit, and only a CHANGED voice pays that cost: choosing the
 * original sends the untouched original recording.
 */
import {
  buildDisguise, DISGUISES, DISGUISE_LABEL, DISGUISE_ICON, type Disguise,
} from './voiceDisguise';
import { normalise } from './voiceMaster';

export type VoiceFx = 'none' | Disguise;

export interface VoiceFxInfo { id: VoiceFx; label: string; icon: string; vip?: boolean }

/**
 * Which profiles a free account may record with.
 *
 * The old set was free, so retiring it outright would have taken a working
 * feature away from everyone who is not paying. Two of the natural voices stay
 * free — the subtle, most usable ones — and the badge adds the other four.
 * Nobody ends up with less than they had, and the verified set is still the
 * larger one.
 */
const FREE_PROFILES: ReadonlySet<Disguise> = new Set<Disguise>(['baritone', 'tenor']);

/** In the order they are offered. The original is first, because it is honest. */
export const VOICE_FX: VoiceFxInfo[] = [
  { id: 'none', label: 'ორიგინალი', icon: '🎙' },
  ...DISGUISES.map(d => ({
    id: d as VoiceFx,
    label: DISGUISE_LABEL[d],
    icon: DISGUISE_ICON[d],
    vip: !FREE_PROFILES.has(d),
  })),
];

export const FREE_VOICE_FX = new Set<VoiceFx>(VOICE_FX.filter(f => !f.vip).map(f => f.id));

/**
 * Labels, including the RETIRED names.
 *
 * Posts and messages recorded with the old effects still carry those names in
 * the database. Dropping them from this map would leave every one of those
 * posts labelled with a raw id or nothing at all — the badge has to keep
 * reading correctly long after the effect behind it stopped existing.
 */
const RETIRED_LABEL: Record<string, string> = {
  deep: 'ღრმა', high: 'მაღალი', giant: 'გიგანტი', ghost: 'აჩრდილი',
  robot: 'რობოტი', radio: 'რადიო', echo: 'ექო',
  detective: 'L', anonymous: 'ანონიმუსი',
  demon: 'დემონი', alien: 'უცხოპლანეტელი', stadium: 'სტადიონი', hologram: 'ჰოლოგრამა',
};

export const FX_LABEL: Record<string, string> = {
  ...RETIRED_LABEL,
  none: 'ორიგინალი',
  ...Object.fromEntries(DISGUISES.map(d => [d, DISGUISE_LABEL[d]])),
};

// ── rendering ────────────────────────────────────────────────────────────────

/** The rate the pitch shifter was tuned at. */
const WORK_RATE = 48_000;
/** Plenty for speech, and it keeps the file small. */
const MAX_OUT_RATE = 24_000;
const MIN_OUT_RATE = 12_000;

function decodeCtx(): AudioContext {
  const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  return new AC();
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
 * Record it in a different voice.
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

  // Pass one: the voice itself, at the rate the shifter was tuned for.
  const seconds = input.duration;
  const work = new OfflineAudioContext(1, Math.ceil(seconds * WORK_RATE), WORK_RATE);
  const src = work.createBufferSource();
  src.buffer = input;
  const graph = await buildDisguise(work, src, fx);
  graph.output.connect(work.destination);
  src.start();
  const rendered = await work.startRendering();
  // The vocoder's oscillators run until told otherwise; an offline context that
  // has finished rendering does not stop them on its own.
  graph.stop();

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

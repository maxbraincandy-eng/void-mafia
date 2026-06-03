/**
 * Singleton audio engine — one AudioContext for everything.
 * Fixes the "sometimes plays, sometimes doesn't" bug caused by
 * multiple contexts and improper resume handling.
 */

import { useSettingsStore } from '@/store/settingsStore';

// ── Singleton state ───────────────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _master: GainNode | null = null;  // master → destination
let _sfxBus: GainNode | null = null;  // sfx → master
let _musicBus: GainNode | null = null; // music → master

let _musicRunning = false;
let _musicStopFn: (() => void) | null = null;
let _musicPending = false; // want music but no user gesture yet

// ── Context bootstrap ─────────────────────────────────────────────────

function boot(): AudioContext {
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  _ctx = new AudioContext();

  _master    = _ctx.createGain();
  _sfxBus    = _ctx.createGain();
  _musicBus  = _ctx.createGain();

  _sfxBus.connect(_master);
  _musicBus.connect(_master);
  _master.connect(_ctx.destination);

  syncGains();
  return _ctx;
}

function syncGains() {
  if (!_sfxBus || !_musicBus) return;
  const { sfxEnabled, musicEnabled, sfxVolume } = useSettingsStore.getState();
  const vol = sfxVolume / 100;
  _sfxBus.gain.value   = sfxEnabled  ? vol : 0;
  _musicBus.gain.value = musicEnabled ? Math.max(0.5, vol) * 0.75 : 0;
}

/** Called by settings store subscriber — updates gains live */
export function onSettingsChange() {
  syncGains();
  const { musicEnabled } = useSettingsStore.getState();
  if (musicEnabled && !_musicRunning) startMenuMusic();
  if (!musicEnabled && _musicRunning) stopMenuMusic();
}

/** Must be called once after first user gesture */
function resume(): Promise<void> {
  const ctx = boot();
  return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
}


// ── Low-level tone scheduler ──────────────────────────────────────────

interface Tone {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  vol?: number;
  at?: number;
  freqEnd?: number;
  detune?: number;
  attack?: number;
  release?: number;
}

function scheduleTone(ctx: AudioContext, dest: AudioNode, t: Tone): void {
  const {
    freq, type = 'sine', dur = 0.3, vol = 0.15,
    at = 0, freqEnd, detune = 0,
    attack = 0.01, release,
  } = t;
  const rel = release ?? dur * 0.8;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(dest);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctx.currentTime + at + dur);
  }
  if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime + at);
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + attack);
  g.gain.setValueAtTime(vol, ctx.currentTime + at + dur - rel);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.05);
}

function sfxPlay(tones: Tone[], masterVol = 0.5) {
  resume().then(() => {
    const ctx = _ctx!;
    if (!_sfxBus || !useSettingsStore.getState().sfxEnabled) return;
    const bus = ctx.createGain();
    bus.gain.value = masterVol;
    bus.connect(_sfxBus);
    for (const t of tones) scheduleTone(ctx, bus, t);
  });
}

// ── SFX library ───────────────────────────────────────────────────────

export const SFX = {
  click() {
    sfxPlay([
      { freq: 1000, type: 'sine', dur: 0.08, vol: 0.35, attack: 0.004 },
      { freq: 650,  type: 'sine', dur: 0.07, vol: 0.20, at: 0.05, attack: 0.003 },
    ], 0.9);
  },

  ping() {
    sfxPlay([
      { freq: 880,  type: 'sine', dur: 0.35, vol: 0.30 },
      { freq: 1320, type: 'sine', dur: 0.20, vol: 0.18, at: 0.05 },
    ], 0.8);
  },

  join() {
    sfxPlay([
      { freq: 440, type: 'sine', dur: 0.18, vol: 0.35 },
      { freq: 554, type: 'sine', dur: 0.18, vol: 0.35, at: 0.12 },
      { freq: 659, type: 'sine', dur: 0.28, vol: 0.35, at: 0.24 },
    ], 0.8);
  },

  gameStart() {
    sfxPlay([
      { freq: 220, type: 'sawtooth', dur: 0.15, vol: 0.35 },
      { freq: 277, type: 'sawtooth', dur: 0.15, vol: 0.35, at: 0.10 },
      { freq: 330, type: 'sawtooth', dur: 0.15, vol: 0.35, at: 0.20 },
      { freq: 440, type: 'sawtooth', dur: 0.30, vol: 0.40, at: 0.30 },
      { freq: 440, type: 'sine',     dur: 0.50, vol: 0.20, at: 0.30, detune: 7 },
    ], 0.8);
  },

  nightStart() {
    sfxPlay([
      { freq: 220, type: 'sine',     dur: 1.2, vol: 0.45 },
      { freq: 330, type: 'triangle', dur: 0.6, vol: 0.28, freqEnd: 220 },
      { freq: 247, type: 'sine',     dur: 0.4, vol: 0.18, at: 0.3, freqEnd: 165 },
      { freq: 440, type: 'sawtooth', dur: 0.5, vol: 0.14, freqEnd: 220 },
    ], 0.7);
  },

  dayStart() {
    sfxPlay([
      { freq: 330, type: 'sine', dur: 0.20, vol: 0.40, freqEnd: 440 },
      { freq: 440, type: 'sine', dur: 0.20, vol: 0.40, at: 0.18, freqEnd: 554 },
      { freq: 554, type: 'sine', dur: 0.25, vol: 0.40, at: 0.36, freqEnd: 659 },
      { freq: 659, type: 'sine', dur: 0.40, vol: 0.45, at: 0.54 },
    ], 0.8);
  },

  voteStart() {
    sfxPlay([
      { freq: 440, type: 'sawtooth', dur: 0.5, vol: 0.35 },
      { freq: 466, type: 'sawtooth', dur: 0.5, vol: 0.28, detune: -12 },
      { freq: 392, type: 'square',   dur: 0.3, vol: 0.20, at: 0.1 },
      { freq: 523, type: 'sine',     dur: 0.4, vol: 0.25, at: 0.2 },
    ], 0.7);
  },

  voteConfirm() {
    sfxPlay([
      { freq: 660, type: 'sine', dur: 0.10, vol: 0.40, attack: 0.005 },
      { freq: 880, type: 'sine', dur: 0.14, vol: 0.30, at: 0.08, attack: 0.005 },
    ], 0.85);
  },

  timerWarning() {
    sfxPlay([
      { freq: 880, type: 'square', dur: 0.08, vol: 0.40 },
      { freq: 660, type: 'square', dur: 0.08, vol: 0.30, at: 0.12 },
    ], 0.7);
  },

  eliminate() {
    sfxPlay([
      { freq: 330, type: 'sawtooth', dur: 0.8, vol: 0.42, freqEnd: 165 },
      { freq: 440, type: 'sine',     dur: 0.5, vol: 0.32, freqEnd: 220 },
      { freq: 220, type: 'square',   dur: 0.3, vol: 0.22, at: 0.1 },
      { freq: 196, type: 'sine',     dur: 1.0, vol: 0.35 },
    ], 0.7);
  },

  cardFlip() {
    sfxPlay([
      { freq: 1600, type: 'sine',     dur: 0.08, vol: 0.30, freqEnd: 800 },
      { freq: 800,  type: 'triangle', dur: 0.18, vol: 0.25, at: 0.06, freqEnd: 500 },
      { freq: 500,  type: 'sine',     dur: 0.40, vol: 0.20, at: 0.20 },
    ], 0.85);
  },

  gameOver() {
    sfxPlay([
      { freq: 220, type: 'sine',     dur: 2.0, vol: 0.42 },
      { freq: 277, type: 'sine',     dur: 1.8, vol: 0.35, at: 0.1 },
      { freq: 330, type: 'triangle', dur: 1.5, vol: 0.28, at: 0.2 },
      { freq: 415, type: 'sine',     dur: 1.2, vol: 0.22, at: 0.3 },
      { freq: 247, type: 'sawtooth', dur: 1.0, vol: 0.18, at: 0.5, freqEnd: 196 },
    ], 0.7);
  },
};

// ── Mafia ambient music ───────────────────────────────────────────────
// PCB-buffer approach: melody pre-computed as Float32Array (pure sine math).
// No oscillators, no feedback, no scheduling loops — phone-safe guaranteed.

// [melody_hz, bass_hz_or_0]  — 16 steps × 0.9 s = 14.4 s
const MUSIC_LOOP: Array<[number, number]> = [
  [220,   147], [261.6, 0  ], [329.6, 0  ], [261.6, 220],
  [293.7, 147], [349.2, 0  ], [440,   0  ], [349.2, 147],
  [329.6, 220], [261.6, 0  ], [220,   0  ], [196,   220],
  [164.8, 165], [220,   0  ], [329.6, 0  ], [220,   220],
];
const NOTE_STEP = 0.9;
const LOOP_DUR  = MUSIC_LOOP.length * NOTE_STEP;

let _musicMasterGain: GainNode | null = null;
let _musicSource: AudioBufferSourceNode | null = null;

function buildMusicBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const total = Math.ceil(LOOP_DUR * sr);
  const buf  = ctx.createBuffer(1, total, sr);
  const data = buf.getChannelData(0);
  const TAU  = 2 * Math.PI;

  MUSIC_LOOP.forEach(([mel, bass], i) => {
    const start = Math.floor(i * NOTE_STEP * sr);
    const len   = Math.min(Math.ceil(NOTE_STEP * sr), total - start);

    for (let s = 0; s < len; s++) {
      const t = s / sr;

      // Melody envelope: 15 ms attack → sustain → decay to 0 at 95 %
      let me = t < 0.015
        ? t / 0.015
        : t < NOTE_STEP * 0.45
          ? 1.0
          : Math.max(0, 1 - (t - NOTE_STEP * 0.45) / (NOTE_STEP * 0.50));
      data[start + s] += 0.28 * me * Math.sin(TAU * mel * t);

      // Bass envelope: 20 ms attack → decay to 0 at 65 %
      if (bass > 0) {
        const be = t < 0.02
          ? t / 0.02
          : Math.max(0, 1 - (t - 0.02) / (NOTE_STEP * 0.65 - 0.02));
        data[start + s] += 0.35 * be * Math.sin(TAU * bass * t);
      }
    }
  });

  // Normalize peak to 0.65 — no clipping on any device
  let peak = 0;
  for (let i = 0; i < total; i++) if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
  if (peak > 0) { const sc = 0.65 / peak; for (let i = 0; i < total; i++) data[i] *= sc; }

  return buf;
}

export function startMenuMusic() {
  if (_musicRunning) return;
  if (!useSettingsStore.getState().musicEnabled) return;
  if (!_ctx || _ctx.state !== 'running') {
    _musicPending = true;
    return;
  }
  _musicPending = false;
  _musicRunning = true;

  const ctx = _ctx!;

  _musicMasterGain = ctx.createGain();
  _musicMasterGain.gain.setValueAtTime(0, ctx.currentTime);
  _musicMasterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
  _musicMasterGain.connect(_musicBus!);

  _musicSource = ctx.createBufferSource();
  _musicSource.buffer = buildMusicBuffer(ctx);
  _musicSource.loop = true;
  _musicSource.connect(_musicMasterGain);
  _musicSource.start(ctx.currentTime + 0.2);
}

export function stopMenuMusic() {
  _musicRunning = false;
  if (_musicSource) { try { _musicSource.stop(); } catch { /* already stopped */ } _musicSource = null; }
  if (_musicMasterGain && _ctx) {
    const t = _ctx.currentTime;
    _musicMasterGain.gain.setValueAtTime(_musicMasterGain.gain.value, t);
    _musicMasterGain.gain.linearRampToValueAtTime(0, t + 0.5);
    _musicMasterGain = null;
  }
  _musicStopFn = null;
}

export function isMusicRunning() { return _musicRunning; }

// ── Global button click listener ──────────────────────────────────────
// Intercepts all button/interactive element clicks and plays a soft click SFX.

let _clickListenerAttached = false;

export function attachGlobalClickSounds() {
  if (_clickListenerAttached) return;
  _clickListenerAttached = true;

  const onInteraction = () => {
    boot();
    if (_ctx && _ctx.state === 'suspended') {
      _ctx.resume().then(() => {
        // Start music that was requested before user gesture
        if (_musicPending) {
          _musicPending = false;
          startMenuMusic();
        }
      }).catch(() => {});
    } else if (_musicPending) {
      _musicPending = false;
      startMenuMusic();
    }
  };

  document.addEventListener('click', (e) => {
    onInteraction();

    const t = e.target as HTMLElement | null;
    if (!t) return;
    const el = t.closest('button, [role="button"], [data-sfx]') as HTMLElement | null;
    if (!el || el.getAttribute('data-no-sfx') !== null) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    SFX.click();
  }, { passive: true, capture: true });

  // Also handle touch for mobile
  document.addEventListener('touchstart', onInteraction, { passive: true, once: true });
}

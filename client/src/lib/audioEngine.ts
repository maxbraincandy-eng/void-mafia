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
// Am minor key, pre-scheduled loop.
// All notes 147–440 Hz — NO sub-bass, NO feedback delay (phone-safe).

// [melody_hz, bass_hz_or_0]  — 16 steps × 0.9 s = 14.4 s loop
const MUSIC_LOOP: Array<[number, number]> = [
  // ── Am phrase ──
  [220,   147],  // A3 + D3
  [261.6, 0  ],  // C4
  [329.6, 0  ],  // E4
  [261.6, 220],  // C4 + A3
  // ── Dm phrase ──
  [293.7, 147],  // D4 + D3
  [349.2, 0  ],  // F4
  [440,   0  ],  // A4
  [349.2, 147],  // F4 + D3
  // ── Am resolve ──
  [329.6, 220],  // E4 + A3
  [261.6, 0  ],  // C4
  [220,   0  ],  // A3
  [196,   220],  // G3 + A3
  // ── Em phrase ──
  [164.8, 165],  // E3 + E3
  [220,   0  ],  // A3
  [329.6, 0  ],  // E4
  [220,   220],  // A3 + A3
];

const NOTE_STEP = 0.9;
const LOOP_DUR  = MUSIC_LOOP.length * NOTE_STEP; // 14.4 s

// Module-level refs so stopMenuMusic can reliably clean up
let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _musicMasterGain: GainNode | null = null;

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

  // Fade-in gain — direct path to musicBus, no delay/reverb
  _musicMasterGain = ctx.createGain();
  _musicMasterGain.gain.setValueAtTime(0, ctx.currentTime);
  _musicMasterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
  _musicMasterGain.connect(_musicBus!);

  let nextAt = ctx.currentTime + 0.5;

  const tick = () => {
    if (!_musicRunning) return;
    const mg = _musicMasterGain!;
    MUSIC_LOOP.forEach(([mel, bass], i) => {
      const t = nextAt + i * NOTE_STEP;
      // Melody — triangle wave (piano-like attack, sustained decay)
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.type = 'triangle'; o1.frequency.value = mel;
      o1.connect(g1); g1.connect(mg);
      g1.gain.setValueAtTime(0, t);
      g1.gain.linearRampToValueAtTime(0.38, t + 0.015);
      g1.gain.setValueAtTime(0.38, t + NOTE_STEP * 0.5);
      g1.gain.exponentialRampToValueAtTime(0.001, t + NOTE_STEP * 0.95);
      o1.start(t); o1.stop(t + NOTE_STEP);
      // Bass — sine, plucked (shorter)
      if (bass > 0) {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = bass;
        o2.connect(g2); g2.connect(mg);
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.45, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + NOTE_STEP * 0.65);
        o2.start(t); o2.stop(t + NOTE_STEP * 0.7);
      }
    });
    nextAt += LOOP_DUR;
    _loopTimer = setTimeout(tick, (LOOP_DUR - 2) * 1000);
  };

  tick();
}

export function stopMenuMusic() {
  _musicRunning = false;
  if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
  if (_musicMasterGain && _ctx) {
    const t = _ctx.currentTime;
    _musicMasterGain.gain.setValueAtTime(_musicMasterGain.gain.value, t);
    _musicMasterGain.gain.linearRampToValueAtTime(0, t + 1.2);
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

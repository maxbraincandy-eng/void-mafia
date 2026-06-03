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
      { freq: 110, type: 'sine',     dur: 1.2, vol: 0.50 },
      { freq: 220, type: 'triangle', dur: 0.6, vol: 0.30, freqEnd: 110 },
      { freq: 165, type: 'sine',     dur: 0.4, vol: 0.20, at: 0.3, freqEnd: 82 },
      { freq: 330, type: 'sawtooth', dur: 0.5, vol: 0.15, freqEnd: 165 },
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
      { freq: 220, type: 'sawtooth', dur: 0.8, vol: 0.45, freqEnd: 55 },
      { freq: 440, type: 'sine',     dur: 0.5, vol: 0.35, freqEnd: 110 },
      { freq: 110, type: 'square',   dur: 0.3, vol: 0.25, at: 0.1 },
      { freq: 55,  type: 'sine',     dur: 1.0, vol: 0.40 },
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
      { freq: 110, type: 'sine',     dur: 2.0, vol: 0.45 },
      { freq: 220, type: 'sine',     dur: 1.8, vol: 0.38, at: 0.1 },
      { freq: 277, type: 'triangle', dur: 1.5, vol: 0.30, at: 0.2 },
      { freq: 330, type: 'sine',     dur: 1.2, vol: 0.25, at: 0.3 },
      { freq: 165, type: 'sawtooth', dur: 1.0, vol: 0.20, at: 0.5, freqEnd: 110 },
    ], 0.7);
  },
};

// ── Mafia ambient music ───────────────────────────────────────────────
// Am minor key, loop-based scheduling (no continuous oscillators).
// All notes 147–440 Hz — safe for phone speakers (no sub-bass buzz).
//
// Loop = 16 notes × 0.9 s = 14.4 s
// Melody: triangle (piano-like), Bass: sine (plucked)

// [melody_hz, bass_hz_or_0]  — 16 steps
const MUSIC_LOOP: Array<[number, number]> = [
  // ── Am phrase ──
  [220,   147],  // A3 + D3 bass
  [261.6, 0  ],  // C4
  [329.6, 0  ],  // E4
  [261.6, 110],  // C4 + A2 bass
  // ── Dm phrase ──
  [293.7, 147],  // D4 + D3 bass
  [349.2, 0  ],  // F4
  [440,   0  ],  // A4
  [349.2, 147],  // F4 + D3 bass
  // ── Am resolve ──
  [329.6, 110],  // E4 + A2 bass
  [261.6, 0  ],  // C4
  [220,   0  ],  // A3
  [196,   110],  // G3 + A2 bass
  // ── Em phrase ──
  [164.8, 165],  // E3 melody + E3 bass (unison octave)
  [220,   0  ],  // A3
  [329.6, 0  ],  // E4
  [220,   110],  // A3 + A2 bass
];

const NOTE_STEP = 0.9;   // seconds per note
const LOOP_DUR  = MUSIC_LOOP.length * NOTE_STEP; // 14.4 s

export function startMenuMusic() {
  if (_musicRunning) return;
  if (!useSettingsStore.getState().musicEnabled) return;

  // No user gesture yet — defer until first interaction
  if (!_ctx || _ctx.state === 'suspended') {
    _musicPending = true;
    return;
  }

  _musicPending = false;
  if (_musicRunning) return;
  _musicRunning = true;

  const ctx   = _ctx!;
  const bus   = _musicBus!;

  // Master fade-in gain
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
  master.connect(bus);

  // Delay reverb (no impulse buffer needed)
  const dlyNode = ctx.createDelay(0.6);
  dlyNode.delayTime.value = 0.38;
  const dlyFb   = ctx.createGain(); dlyFb.gain.value = 0.38;
  const dlyWet  = ctx.createGain(); dlyWet.gain.value = 0.28;
  dlyNode.connect(dlyFb); dlyFb.connect(dlyNode);
  dlyNode.connect(dlyWet); dlyWet.connect(master);

  // Gentle low-pass so reverb tail isn't harsh
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass'; lpf.frequency.value = 2200;
  dlyNode.connect(lpf); lpf.connect(master);

  // Helper: schedule one note
  function noteOn(hz: number, at: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    osc.connect(g);
    g.connect(master);   // dry
    g.connect(dlyNode);  // send to reverb
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol,   at + 0.018);
    g.gain.setValueAtTime(vol,            at + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // Schedule entire loop starting at `startAt`
  function scheduleLoop(startAt: number) {
    MUSIC_LOOP.forEach(([mel, bass], i) => {
      const t = startAt + i * NOTE_STEP;
      // Melody (triangle, piano-like)
      noteOn(mel, t, NOTE_STEP * 1.1, 0.40, 'triangle');
      // Bass pluck (sine, shorter)
      if (bass > 0) noteOn(bass, t, NOTE_STEP * 0.7, 0.55, 'sine');
    });
  }

  let loopTimer: ReturnType<typeof setTimeout>;
  let nextLoopAt = ctx.currentTime + 0.3;

  function tick() {
    scheduleLoop(nextLoopAt);
    nextLoopAt += LOOP_DUR;
    // Re-schedule 2 s before the next loop ends
    loopTimer = setTimeout(tick, (LOOP_DUR - 2) * 1000);
  }

  tick();

  _musicStopFn = () => {
    _musicRunning = false;
    clearTimeout(loopTimer);
    const t = ctx.currentTime;
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 1.2);
  };
}

export function stopMenuMusic() {
  if (!_musicRunning) return;
  if (_musicStopFn) { _musicStopFn(); _musicStopFn = null; }
  _musicRunning = false;
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

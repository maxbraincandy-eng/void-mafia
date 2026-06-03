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

// ── Reverb (simple feedback delay) ───────────────────────────────────

function makeReverb(ctx: AudioContext, wet: GainNode, time = 1.8, decay = 0.3) {
  const bufLen = Math.ceil(ctx.sampleRate * time);
  const buf = ctx.createBuffer(2, bufLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, decay * 10);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  conv.connect(wet);
  return conv;
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
// Procedural noir/crime atmosphere. Am key, ~56 BPM.
// 3 layers: bass drone, chord pad, slow piano arpeggio.

const BEAT = 1.07; // seconds per beat (~56 BPM)

// Am pentatonic + minor notes (Hz)
// A2  C3     D3     E3     G3     A3   C4     E4
const N = [110, 130.8, 146.8, 164.8, 196, 220, 261.6, 329.6];

// Arpeggio pattern — indices into N, 16 steps, repeating
// Chord groups: Am(0,2,4), Dm(1,3,5), Am, E(3,6,4)
const ARP_SEQ = [
  0, 2, 4, 6,   // Am up
  5, 3, 1, 2,   // Dm down
  0, 4, 2, 7,   // Am spread
  3, 5, 4, 2,   // Dm/E
];

// Bass pattern — (noteIndex, beats duration, at beat)
const BASS_SEQ: Array<[number, number]> = [
  [0, 4], // A2 × 4 beats
  [1, 2], // D2-ish (low D — we use D2 = 73.4)
  [1, 2],
  [0, 3], // A2
  [3, 1], // E
  [0, 4], // A2
  [1, 4], // D
  [3, 2], // E
  [0, 2], // A2
];
const BASS_HZ = [55, 73.4, 82.4, 55, 73.4, 82.4, 55, 73.4, 82.4]; // ~A1, D2, E2 etc.

export function startMenuMusic() {
  if (_musicRunning) return;
  if (!useSettingsStore.getState().musicEnabled) return;

  // If no AudioContext yet (no user gesture), mark as pending.
  // attachGlobalClickSounds will call us again after first interaction.
  if (!_ctx || _ctx.state === 'suspended') {
    _musicPending = true;
  }

  resume().then(() => {
    _musicPending = false;
    if (_musicRunning) return;
    _musicRunning = true;
    const ctx = _ctx!;
    const bus = _musicBus!;

    // Reverb send
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.35;
    reverbWet.connect(bus);
    const reverb = makeReverb(ctx, reverbWet, 2.5, 0.25);

    // Lowpass filter for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    filter.connect(bus);
    filter.connect(reverb);

    // Bass drone — continuous detuned pair
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0;
    bassGain.connect(filter);
    const bass1 = ctx.createOscillator();
    const bass2 = ctx.createOscillator();
    bass1.type = 'sine'; bass1.frequency.value = 55;
    bass2.type = 'sine'; bass2.frequency.value = 55.3;
    bass1.connect(bassGain); bass2.connect(bassGain);
    bass1.start(); bass2.start();

    // Pad — 3 detuned oscillators, Am chord
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padGain.connect(filter);
    const padFreqs = [110, 130.8, 164.8, 220];
    const padOscs = padFreqs.map(f => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8; // subtle detuning
      o.connect(padGain);
      o.start();
      return o;
    });

    // Fade everything in
    const now = ctx.currentTime;
    bassGain.gain.linearRampToValueAtTime(0.55, now + 3);
    padGain.gain.linearRampToValueAtTime(0.18, now + 4);

    // ── Arpeggio scheduler ──────────────────────────────────────────
    let arpStep = 0;
    let nextTime = ctx.currentTime + 1; // start after 1s

    const arpGain = ctx.createGain();
    arpGain.gain.value = 0.22;
    arpGain.connect(filter);
    arpGain.connect(reverbWet);

    let scheduleId: ReturnType<typeof setTimeout>;

    const scheduleArp = () => {
      if (!_musicRunning) return;
      const lookahead = 0.3; // schedule 300ms ahead
      while (nextTime < ctx.currentTime + lookahead) {
        const hz = N[ARP_SEQ[arpStep % ARP_SEQ.length]];
        const dur = BEAT * 1.2;

        // Piano-like envelope: quick attack, medium sustain, slow release
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = hz;
        o.connect(g); g.connect(arpGain);
        g.gain.setValueAtTime(0, nextTime);
        g.gain.linearRampToValueAtTime(0.9, nextTime + 0.015);
        g.gain.exponentialRampToValueAtTime(0.4, nextTime + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, nextTime + dur);
        o.start(nextTime);
        o.stop(nextTime + dur + 0.05);

        // Every 4th step add a soft bass note hit
        if (arpStep % 4 === 0) {
          const bassHz = hz / 2;
          const bo = ctx.createOscillator();
          const bg = ctx.createGain();
          bo.type = 'sine'; bo.frequency.value = bassHz;
          bo.connect(bg); bg.connect(filter);
          bg.gain.setValueAtTime(0, nextTime);
          bg.gain.linearRampToValueAtTime(0.22, nextTime + 0.02);
          bg.gain.exponentialRampToValueAtTime(0.0001, nextTime + BEAT * 2.5);
          bo.start(nextTime);
          bo.stop(nextTime + BEAT * 2.5 + 0.1);
        }

        arpStep++;
        nextTime += BEAT;
      }
      scheduleId = setTimeout(scheduleArp, 100);
    };

    scheduleArp();

    // Slowly evolve pad chord every 8 beats
    let padStep = 0;
    const PADS = [
      [110, 130.8, 164.8, 220],   // Am
      [73.4, 110, 130.8, 174.6],  // Dm-ish
      [110, 130.8, 164.8, 220],   // Am
      [82.4, 123.5, 164.8, 220],  // E minor-ish
    ];
    const padEvolveId = setInterval(() => {
      if (!_musicRunning) return;
      padStep++;
      const chord = PADS[padStep % PADS.length];
      padOscs.forEach((o, i) => {
        o.frequency.linearRampToValueAtTime(chord[i], ctx.currentTime + BEAT * 4);
      });
    }, BEAT * 8 * 1000);

    _musicStopFn = () => {
      _musicRunning = false;
      clearTimeout(scheduleId);
      clearInterval(padEvolveId);
      const t = ctx.currentTime;
      bassGain.gain.setValueAtTime(bassGain.gain.value, t);
      bassGain.gain.linearRampToValueAtTime(0, t + 1.5);
      padGain.gain.setValueAtTime(padGain.gain.value, t);
      padGain.gain.linearRampToValueAtTime(0, t + 1.5);
      arpGain.gain.setValueAtTime(arpGain.gain.value, t);
      arpGain.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => {
        try { bass1.stop(); bass2.stop(); padOscs.forEach(o => o.stop()); } catch {}
      }, 1600);
    };
  });
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

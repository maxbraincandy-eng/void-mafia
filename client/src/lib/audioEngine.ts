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
  // latencyHint:'playback' → higher quality output, bypasses some device audio post-processing
  _ctx = new AudioContext({ latencyHint: 'playback' });

  _master    = _ctx.createGain();
  _sfxBus    = _ctx.createGain();
  _musicBus  = _ctx.createGain();

  // Limiter at the very end of the chain — prevents any clipping that could buzz
  const limiter = _ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;   // start limiting above -6 dBFS
  limiter.knee.value      = 3;
  limiter.ratio.value     = 20;   // hard limit
  limiter.attack.value    = 0.001;
  limiter.release.value   = 0.1;

  _sfxBus.connect(_master);
  _musicBus.connect(_master);
  _master.connect(limiter);
  limiter.connect(_ctx.destination);

  syncGains();
  return _ctx;
}

function syncGains() {
  if (!_sfxBus || !_musicBus) return;
  const { sfxEnabled, musicEnabled, sfxVolume } = useSettingsStore.getState();
  const vol = sfxVolume / 100;
  _sfxBus.gain.value   = sfxEnabled  ? vol : 0;
  _musicBus.gain.value = musicEnabled ? Math.max(0.3, vol) * 0.50 : 0;
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

  tick(urgent: boolean) {
    sfxPlay([
      { freq: urgent ? 880 : 660, type: 'sine', dur: 0.12, vol: 0.20, attack: 0.004 },
    ], 0.8);
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

// ── Synthwave / vaporwave ambient loop ───────────────────────────────
// PCM-buffer: pre-computed Float32Array — no oscillators, phone-safe.
// Am → F → C → G/B  @  80 BPM, 4 bars ≈ 12 s, all freqs ≥ 220 Hz.
//
// Layers: warm sawtooth pad + punchy sine bass + high-octave arpeggio + lead melody w/ vibrato

const _SW_BPM   = 80;
const _SW_BEAT  = 60 / _SW_BPM;       // 0.75 s
const _SW_BAR   = _SW_BEAT * 4;       // 3.0 s
const LOOP_DUR  = _SW_BAR * 4;        // 12.0 s

// All chord tones ≥ 220 Hz (phone-speaker safe)
// Am: A3=220, C4=261.6, E4=329.6
// F:  A3=220, C4=261.6, F4=349.2  (A as common tone avoids going below 220)
// C:  C4=261.6, E4=329.6, G4=392
// G/B: B3=246.9, D4=293.7, G4=392  (first inversion, smooth bass motion 220→220→261.6→246.9)
const _SW_CHORDS: Array<readonly [number, number, number]> = [
  [220,   261.6, 329.6],
  [220,   261.6, 349.2],
  [261.6, 329.6, 392  ],
  [246.9, 293.7, 392  ],
];
const _SW_BASS = [220, 220, 261.6, 246.9] as const;
// 8 arpeggio steps per bar (8th notes) — index into chord [0,1,2]
const _SW_ARP  = [0, 2, 1, 2, 0, 2, 1, 2] as const;
// Lead riff: [beat_offset, freq] per bar — memorable 4-bar synthwave hook
const _SW_LEAD: Array<ReadonlyArray<readonly [number, number]>> = [
  [[0, 440  ], [2, 329.6]],   // Am: A4 → E4
  [[0, 349.2], [2, 261.6]],   // F:  F4 → C4
  [[0, 392  ], [2, 329.6]],   // C:  G4 → E4
  [[0, 293.7], [2, 392  ]],   // G:  D4 → G4
];

let _musicMasterGain: GainNode | null = null;
let _musicSource: AudioBufferSourceNode | null = null;

function buildMusicBuffer(ctx: AudioContext): AudioBuffer {
  const sr  = ctx.sampleRate;
  const N   = Math.ceil(LOOP_DUR * sr);
  const TAU = Math.PI * 2;
  const buf = ctx.createBuffer(1, N, sr);
  const out = buf.getChannelData(0);

  for (let bar = 0; bar < 4; bar++) {
    const chord  = _SW_CHORDS[bar];
    const bSamp  = Math.floor(bar * _SW_BAR * sr);

    // Pad: sawtooth timbre (1st–4th harmonics), slow 0.5 s attack/release
    for (const freq of chord) {
      const padLen = Math.min(Math.ceil(_SW_BAR * sr), N - bSamp);
      for (let s = 0; s < padLen; s++) {
        const t   = s / sr;
        const env = t < 0.5 ? t / 0.5
                  : t > _SW_BAR - 0.5 ? Math.max(0, (_SW_BAR - t) / 0.5)
                  : 1.0;
        out[bSamp + s] += 0.055 * env * (
            Math.sin(TAU * freq * t)
          + 0.50 * Math.sin(TAU * 2 * freq * t)
          + 0.25 * Math.sin(TAU * 3 * freq * t)
          + 0.10 * Math.sin(TAU * 4 * freq * t)
        );
      }
    }

    // Arpeggio: 8th notes, one octave up, pure sine, 72% duty cycle
    for (let step = 0; step < 8; step++) {
      const aFreq  = chord[_SW_ARP[step]] * 2;
      const aStart = bSamp + Math.floor(step * (_SW_BEAT / 2) * sr);
      const aDurS  = Math.floor(_SW_BEAT / 2 * 0.72 * sr);
      for (let s = 0; s < aDurS && aStart + s < N; s++) {
        const t   = s / sr;
        const dur = aDurS / sr;
        const env = t < 0.012 ? t / 0.012
                  : t > dur * 0.60 ? Math.max(0, 1 - (t - dur * 0.60) / (dur * 0.40))
                  : 1.0;
        out[aStart + s] += 0.075 * env * Math.sin(TAU * aFreq * t);
      }
    }

    // Bass: punchy sine on beats 1 and 3
    const bFreq = _SW_BASS[bar];
    for (const beat of [0, 2]) {
      const bNote = bSamp + Math.floor(beat * _SW_BEAT * sr);
      const bDurS = Math.floor(_SW_BEAT * 0.60 * sr);
      for (let s = 0; s < bDurS && bNote + s < N; s++) {
        const t   = s / sr;
        const dur = bDurS / sr;
        const env = t < 0.01 ? t / 0.01
                  : t > dur * 0.45 ? Math.max(0, 1 - (t - dur * 0.45) / (dur * 0.55))
                  : 1.0;
        out[bNote + s] += 0.32 * env * Math.sin(TAU * bFreq * t);
      }
    }

    // Lead: sawtooth tone + 5.5 Hz vibrato (phase modulation), 85% of beat duration
    for (const [beatOff, lFreq] of _SW_LEAD[bar]) {
      const lStart = bSamp + Math.floor(beatOff * _SW_BEAT * sr);
      const lDurS  = Math.floor(_SW_BEAT * 0.85 * sr);
      for (let s = 0; s < lDurS && lStart + s < N; s++) {
        const t      = s / sr;
        const dur    = lDurS / sr;
        const vibPhi = 0.3 * Math.sin(TAU * 5.5 * t); // ±0.3 rad PM vibrato
        const env    = t < 0.025 ? t / 0.025
                     : t > dur * 0.65 ? Math.max(0, 1 - (t - dur * 0.65) / (dur * 0.35))
                     : 1.0;
        out[lStart + s] += 0.14 * env * (
            Math.sin(TAU * lFreq * t + vibPhi)
          + 0.45 * Math.sin(TAU * 2 * lFreq * t + vibPhi * 2)
        );
      }
    }
  }

  // Normalize peak to 0.38
  let peak = 0;
  for (let i = 0; i < N; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
  if (peak > 0.001) {
    const sc = 0.38 / peak;
    for (let i = 0; i < N; i++) out[i] *= sc;
  }

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
  _musicPending = false;
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

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

// ── Background audio keepalive ────────────────────────────────────────
// Prevents AudioContext from suspending when the browser tab is backgrounded.
// Three-layer approach: silent looping buffer + statechange auto-resume + MediaSession.

let _keepaliveInit = false;
let _htmlKeepAlive: HTMLAudioElement | null = null;

function attachKeepAlive(ctx: AudioContext) {
  if (_keepaliveInit) return;
  _keepaliveInit = true;

  // Layer 1: silent looping Web Audio buffer (-60 dB, inaudible but not optimized away)
  const frames = Math.ceil(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) ch[i] = (Math.random() * 2 - 1) * 0.002;

  const silentGain = ctx.createGain();
  silentGain.gain.value = 0.001; // ~-60 dB: inaudible but not zero — prevents browser optimization
  silentGain.connect(ctx.destination);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(silentGain);
  src.start();

  // Layer 2: HTMLAudioElement with silent WAV — keeps Chrome on Android from
  // throttling the Web Audio context; <audio> has stronger background audio priority
  if (!_htmlKeepAlive) {
    const audio = document.createElement('audio');
    audio.loop = true;
    audio.volume = 0.001;
    // 1-second silent WAV at 8kHz
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    audio.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(audio);
    audio.play().catch(() => {});
    _htmlKeepAlive = audio;
  }

  // Layer 3: Auto-resume if the context is suspended (e.g. mid-session OS interruption)
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  });

  // Resume both context and HTML audio when tab returns to foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (_htmlKeepAlive?.paused) _htmlKeepAlive.play().catch(() => {});
    }
  });

  // Register as a media session so the OS treats this page as an audio player
  // and won't silently discard its audio context in the background
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Void Mafia',
      artist: 'In-game audio',
    });
    navigator.mediaSession.setActionHandler('play', () => {
      ctx.resume().catch(() => {});
      _htmlKeepAlive?.play().catch(() => {});
    });
    // Acknowledge pause without actually pausing — keeps session alive
    navigator.mediaSession.setActionHandler('pause', () => {});
  }
}

/** Must be called once after first user gesture */
function resume(): Promise<void> {
  const ctx = boot();
  const p = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  return p.then(() => attachKeepAlive(ctx));
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

function sfxPlay(tones: Tone[], masterVol = 0.5, haptic?: number | number[]) {
  if (haptic !== undefined) {
    try { navigator.vibrate?.(haptic); } catch {}
  }
  resume().then(() => {
    const ctx = _ctx!;
    if (!_sfxBus || !useSettingsStore.getState().sfxEnabled) return;
    const bus = ctx.createGain();
    bus.gain.value = masterVol;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 400;
    lpf.Q.value = 0.7;
    bus.connect(lpf);
    lpf.connect(_sfxBus);
    for (const t of tones) scheduleTone(ctx, bus, t);
  });
}

// ── SFX library ───────────────────────────────────────────────────────
// All sounds: sine/triangle only, 60–160 Hz, soft 12–30 ms attacks,
// short durations, low-pass filtered at 400 Hz. Haptic via navigator.vibrate.

export const SFX = {
  // Subtle low body thud — button tap
  click() {
    sfxPlay([
      { freq: 110, type: 'sine', dur: 0.065, vol: 0.70, attack: 0.012, release: 0.048 },
    ], 0.22, 8);
  },

  // Sharp low thwack — a punch landing (Virtual Space combat)
  punch() {
    sfxPlay([
      { freq: 68,  type: 'sine',     dur: 0.11, vol: 0.90, attack: 0.003, release: 0.10 },
      { freq: 150, type: 'triangle', dur: 0.05, vol: 0.50, attack: 0.002, release: 0.045 },
    ], 0.40, 26);
  },

  // Wet, soft splat — a thrown tomato / snowball landing
  splat() {
    sfxPlay([
      { freq: 95,  type: 'triangle', dur: 0.09, vol: 0.70, attack: 0.004, release: 0.08 },
      { freq: 55,  type: 'sine',     dur: 0.13, vol: 0.55, attack: 0.006, release: 0.12 },
    ], 0.34, 16);
  },

  // Deep felt-mallet resonance — notification
  ping() {
    sfxPlay([
      { freq: 80,  type: 'sine',     dur: 0.18, vol: 0.72, attack: 0.020, release: 0.15 },
      { freq: 100, type: 'triangle', dur: 0.12, vol: 0.45, attack: 0.015, release: 0.10 },
    ], 0.28, 15);
  },

  // Three ascending low taps — welcome arrival
  join() {
    sfxPlay([
      { freq: 90,  type: 'sine', dur: 0.075, vol: 0.65, attack: 0.015 },
      { freq: 110, type: 'sine', dur: 0.075, vol: 0.68, at: 0.09, attack: 0.015 },
      { freq: 130, type: 'sine', dur: 0.100, vol: 0.72, at: 0.18, attack: 0.020 },
    ], 0.28, [10, 20, 10]);
  },

  // Rising low swell — cinematic power-up
  gameStart() {
    sfxPlay([
      { freq: 65,  type: 'sine',     dur: 0.18, vol: 0.58, attack: 0.020 },
      { freq: 80,  type: 'triangle', dur: 0.18, vol: 0.55, at: 0.14, attack: 0.022 },
      { freq: 100, type: 'sine',     dur: 0.20, vol: 0.60, at: 0.28, attack: 0.025 },
      { freq: 120, type: 'triangle', dur: 0.18, vol: 0.64, at: 0.44, attack: 0.025 },
      { freq: 150, type: 'sine',     dur: 0.20, vol: 0.65, at: 0.58, attack: 0.030 },
    ], 0.32, [15, 30, 60]);
  },

  // Descending low tones — lights out, ominous
  nightStart() {
    sfxPlay([
      { freq: 140, type: 'sine',     dur: 0.16, vol: 0.60, attack: 0.020 },
      { freq: 110, type: 'triangle', dur: 0.16, vol: 0.58, at: 0.14, attack: 0.022 },
      { freq: 85,  type: 'sine',     dur: 0.20, vol: 0.60, at: 0.28, attack: 0.025 },
      { freq: 70,  type: 'triangle', dur: 0.22, vol: 0.58, at: 0.44, attack: 0.030 },
    ], 0.28, [15, 20, 40]);
  },

  // Rising low sequence — morning arrival
  dayStart() {
    sfxPlay([
      { freq: 80,  type: 'sine',     dur: 0.10, vol: 0.58, attack: 0.018 },
      { freq: 100, type: 'triangle', dur: 0.10, vol: 0.62, at: 0.10, attack: 0.020 },
      { freq: 125, type: 'sine',     dur: 0.12, vol: 0.66, at: 0.20, attack: 0.022 },
      { freq: 150, type: 'triangle', dur: 0.12, vol: 0.68, at: 0.30, attack: 0.025 },
    ], 0.28, [10, 30, 15]);
  },

  // Triple low thud — tense accusatory stab
  voteStart() {
    sfxPlay([
      { freq: 75, type: 'sine',     dur: 0.12, vol: 0.70, attack: 0.012 },
      { freq: 90, type: 'triangle', dur: 0.14, vol: 0.65, at: 0.10, attack: 0.015 },
      { freq: 70, type: 'sine',     dur: 0.16, vol: 0.60, at: 0.22, attack: 0.018 },
    ], 0.30, [20, 30, 20]);
  },

  // Two ascending low bumps — confirm action
  voteConfirm() {
    sfxPlay([
      { freq: 110, type: 'sine',     dur: 0.09, vol: 0.68, attack: 0.012, release: 0.07 },
      { freq: 130, type: 'triangle', dur: 0.10, vol: 0.65, at: 0.10, attack: 0.015, release: 0.08 },
    ], 0.30, [15, 20, 30]);
  },

  // Soft ascending two-note chime — incoming private message
  dmPing() {
    sfxPlay([
      { freq: 520, type: 'sine', dur: 0.10, vol: 0.42, attack: 0.010, release: 0.09 },
      { freq: 780, type: 'sine', dur: 0.14, vol: 0.38, at: 0.11, attack: 0.012, release: 0.12 },
    ], 0.26, [12, 18, 12]);
  },

  // Urgent low pulse pair — time pressure
  timerWarning() {
    sfxPlay([
      { freq: 95, type: 'sine', dur: 0.09, vol: 0.70, attack: 0.012 },
      { freq: 95, type: 'sine', dur: 0.09, vol: 0.65, at: 0.14, attack: 0.012 },
    ], 0.28, [15, 20, 15]);
  },

  // Single low metronomic tick
  tick(urgent: boolean) {
    sfxPlay([
      { freq: urgent ? 130 : 100, type: 'sine', dur: urgent ? 0.065 : 0.055, vol: urgent ? 0.65 : 0.50, attack: 0.010, release: 0.045 },
    ], urgent ? 0.28 : 0.20, urgent ? 8 : undefined);
  },

  // Deep impact + decay — dramatic elimination
  eliminate() {
    sfxPlay([
      { freq: 80, type: 'sine',     dur: 0.14, vol: 0.80, attack: 0.008 },
      { freq: 65, type: 'triangle', dur: 0.18, vol: 0.72, at: 0.10, attack: 0.015 },
      { freq: 55, type: 'sine',     dur: 0.20, vol: 0.62, at: 0.22, attack: 0.020 },
      { freq: 70, type: 'triangle', dur: 0.18, vol: 0.52, at: 0.36, attack: 0.025 },
    ], 0.32, [30, 20, 60]);
  },

  // Three quick low thumps — card reveal
  cardFlip() {
    sfxPlay([
      { freq: 100, type: 'sine',     dur: 0.07, vol: 0.68, attack: 0.010 },
      { freq: 130, type: 'triangle', dur: 0.09, vol: 0.62, at: 0.06, attack: 0.012 },
      { freq: 110, type: 'sine',     dur: 0.10, vol: 0.58, at: 0.13, attack: 0.015 },
    ], 0.28, [12, 15, 10]);
  },

  // Slow low chord swell — game end
  gameOver() {
    sfxPlay([
      { freq: 70,  type: 'sine',     dur: 0.25, vol: 0.60, attack: 0.030 },
      { freq: 85,  type: 'triangle', dur: 0.22, vol: 0.55, at: 0.10, attack: 0.030 },
      { freq: 100, type: 'sine',     dur: 0.22, vol: 0.50, at: 0.20, attack: 0.030 },
      { freq: 115, type: 'triangle', dur: 0.20, vol: 0.44, at: 0.30, attack: 0.030 },
      { freq: 130, type: 'sine',     dur: 0.18, vol: 0.38, at: 0.42, attack: 0.035 },
    ], 0.30, [20, 40, 60]);
  },

  // Rising triple tap — targeting/nomination
  nomination() {
    sfxPlay([
      { freq: 85,  type: 'sine',     dur: 0.09, vol: 0.65, attack: 0.012 },
      { freq: 100, type: 'triangle', dur: 0.09, vol: 0.68, at: 0.12, attack: 0.014 },
      { freq: 120, type: 'sine',     dur: 0.12, vol: 0.72, at: 0.24, attack: 0.015 },
    ], 0.28, [10, 15, 10]);
  },

  // Muffled descending thud — denied/blocked
  error() {
    sfxPlay([
      { freq: 75, type: 'sine',     dur: 0.10, vol: 0.65, attack: 0.008 },
      { freq: 65, type: 'triangle', dur: 0.10, vol: 0.58, at: 0.08, attack: 0.010 },
      { freq: 60, type: 'sine',     dur: 0.12, vol: 0.52, at: 0.16, attack: 0.012 },
    ], 0.22, [80, 40, 80]);
  },

  // Ascending low sweep — phase boundary
  phaseTransition() {
    sfxPlay([
      { freq: 90,  type: 'sine',     dur: 0.14, vol: 0.62, attack: 0.020 },
      { freq: 110, type: 'triangle', dur: 0.14, vol: 0.60, at: 0.12, attack: 0.022 },
      { freq: 130, type: 'sine',     dur: 0.16, vol: 0.58, at: 0.24, attack: 0.025 },
      { freq: 150, type: 'triangle', dur: 0.14, vol: 0.54, at: 0.38, attack: 0.025 },
    ], 0.28, [15, 20, 30]);
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

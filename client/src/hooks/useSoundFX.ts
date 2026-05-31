import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Phase } from '@/types/index';

// ── Singleton AudioContext (browsers limit how many you can create) ────

let _ctx: AudioContext | null = null;
let _muted = false;

function getCtx(): AudioContext | null {
  if (_muted) return null;
  try {
    if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
    return _ctx;
  } catch { return null; }
}

export function setSoundMuted(m: boolean) { _muted = m; }
export function isSoundMuted() { return _muted; }

// ── Low-level synth helpers ───────────────────────────────────────────

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  duration?: number;
  vol?: number;
  startAt?: number;
  freqEnd?: number;
  detune?: number;
}

function scheduleTone(ctx: AudioContext, master: GainNode, opts: ToneOpts): void {
  const { freq, type = 'sine', duration = 0.3, vol = 0.15, startAt = 0, freqEnd, detune = 0 } = opts;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(master);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + startAt + duration);
  if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime + startAt);
  g.gain.setValueAtTime(0, ctx.currentTime + startAt);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

function play(tones: ToneOpts[], masterVol = 0.5): void {
  const ctx = getCtx();
  if (!ctx) return;
  const schedule = () => {
    const master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(ctx.destination);
    for (const t of tones) scheduleTone(ctx, master, t);
  };
  if (ctx.state === 'running') {
    schedule();
  } else {
    ctx.resume().then(schedule).catch(() => {});
  }
}

// ── Named sound effects ───────────────────────────────────────────────

export const SFX = {
  /** Soft ping — incoming chat message */
  ping() {
    play([
      { freq: 880,  type: 'sine', duration: 0.35, vol: 0.12 },
      { freq: 1320, type: 'sine', duration: 0.20, vol: 0.07, startAt: 0.05 },
    ]);
  },

  /** Player joins the room */
  join() {
    play([
      { freq: 440, type: 'sine', duration: 0.18, vol: 0.18 },
      { freq: 554, type: 'sine', duration: 0.18, vol: 0.18, startAt: 0.12 },
      { freq: 659, type: 'sine', duration: 0.28, vol: 0.18, startAt: 0.24 },
    ]);
  },

  /** Game starts — punchy vaporwave arpeggio */
  gameStart() {
    play([
      { freq: 220, type: 'sawtooth', duration: 0.15, vol: 0.18 },
      { freq: 277, type: 'sawtooth', duration: 0.15, vol: 0.18, startAt: 0.10 },
      { freq: 330, type: 'sawtooth', duration: 0.15, vol: 0.18, startAt: 0.20 },
      { freq: 440, type: 'sawtooth', duration: 0.30, vol: 0.22, startAt: 0.30 },
      { freq: 440, type: 'sine',     duration: 0.50, vol: 0.10, startAt: 0.30, detune: 7 },
    ]);
  },

  /** Night begins — dark, descending, ominous */
  nightStart() {
    play([
      { freq: 110, type: 'sine',     duration: 1.2, vol: 0.25 },
      { freq: 220, type: 'triangle', duration: 0.6, vol: 0.12, freqEnd: 110 },
      { freq: 165, type: 'sine',     duration: 0.4, vol: 0.08, startAt: 0.3, freqEnd: 82 },
      { freq: 330, type: 'sawtooth', duration: 0.5, vol: 0.06, startAt: 0.0, freqEnd: 165 },
    ], 0.4);
  },

  /** Day begins — bright, ascending */
  dayStart() {
    play([
      { freq: 330, type: 'sine', duration: 0.20, vol: 0.20, freqEnd: 440 },
      { freq: 440, type: 'sine', duration: 0.20, vol: 0.20, startAt: 0.18, freqEnd: 554 },
      { freq: 554, type: 'sine', duration: 0.25, vol: 0.20, startAt: 0.36, freqEnd: 659 },
      { freq: 659, type: 'sine', duration: 0.40, vol: 0.22, startAt: 0.54 },
    ]);
  },

  /** Voting begins — tense, dissonant cluster */
  voteStart() {
    play([
      { freq: 440, type: 'sawtooth', duration: 0.5, vol: 0.15 },
      { freq: 466, type: 'sawtooth', duration: 0.5, vol: 0.12, detune: -12 },
      { freq: 392, type: 'square',   duration: 0.3, vol: 0.08, startAt: 0.1 },
      { freq: 523, type: 'sine',     duration: 0.4, vol: 0.10, startAt: 0.2 },
    ], 0.4);
  },

  /** Vote submitted — short confirmation click */
  voteConfirm() {
    play([
      { freq: 660, type: 'sine', duration: 0.08, vol: 0.20 },
      { freq: 880, type: 'sine', duration: 0.12, vol: 0.15, startAt: 0.07 },
    ], 0.5);
  },

  /** Timer running low (≤10 s) — single urgent pulse */
  timerWarning() {
    play([
      { freq: 880, type: 'square', duration: 0.06, vol: 0.18 },
      { freq: 660, type: 'square', duration: 0.06, vol: 0.12, startAt: 0.10 },
    ], 0.35);
  },

  /** Player eliminated — dramatic descending chord */
  eliminate() {
    play([
      { freq: 220, type: 'sawtooth', duration: 0.8, vol: 0.22, freqEnd: 55 },
      { freq: 440, type: 'sine',     duration: 0.5, vol: 0.15, freqEnd: 110 },
      { freq: 110, type: 'square',   duration: 0.3, vol: 0.10, startAt: 0.1 },
      { freq: 55,  type: 'sine',     duration: 1.0, vol: 0.20 },
    ], 0.4);
  },

  /** Role card flip — swoosh + reveal sting */
  cardFlip() {
    play([
      { freq: 1600, type: 'sine',     duration: 0.07, vol: 0.12, freqEnd: 800 },
      { freq: 800,  type: 'triangle', duration: 0.15, vol: 0.09, startAt: 0.06, freqEnd: 500 },
      { freq: 500,  type: 'sine',     duration: 0.35, vol: 0.07, startAt: 0.18 },
    ], 0.55);
  },

  /** Game over — final, spacious chord */
  gameOver() {
    play([
      { freq: 110, type: 'sine',     duration: 2.0, vol: 0.22 },
      { freq: 220, type: 'sine',     duration: 1.8, vol: 0.18, startAt: 0.1 },
      { freq: 277, type: 'triangle', duration: 1.5, vol: 0.14, startAt: 0.2 },
      { freq: 330, type: 'sine',     duration: 1.2, vol: 0.10, startAt: 0.3 },
      { freq: 165, type: 'sawtooth', duration: 1.0, vol: 0.08, startAt: 0.5, freqEnd: 110 },
    ], 0.45);
  },
};

// ── useGameSounds — auto-plays SFX on state transitions ──────────────

export function useGameSounds(): void {
  const room        = useGameStore(s => s.room);
  const nightResult = useGameStore(s => s.nightResult);
  const gameOverResult = useGameStore(s => s.gameOverResult);

  const prevPhaseRef   = useRef<Phase | null>(null);
  const prevChatLenRef = useRef(0);
  const prevPlayersRef = useRef(0);
  // track last timer value where we already fired the warning (to avoid repeating)
  const timerWarnedRef = useRef(false);

  // Phase transitions
  useEffect(() => {
    if (!room) { prevPhaseRef.current = null; timerWarnedRef.current = false; return; }
    const phase = room.phase;
    const prev  = prevPhaseRef.current;
    if (prev !== null && prev !== phase) {
      timerWarnedRef.current = false;
      if (phase === 'role_reveal') SFX.gameStart();
      else if (phase === 'night')  SFX.nightStart();
      else if (phase === 'day')    SFX.dayStart();
      else if (phase === 'voting') SFX.voteStart();
    }
    prevPhaseRef.current = phase;
  }, [room?.phase]);

  // Timer warning — fires once when timer drops to ≤10 s
  useEffect(() => {
    if (!room || room.timer <= 0 || room.maxTimer <= 0) return;
    if (room.timer <= 10 && !timerWarnedRef.current) {
      timerWarnedRef.current = true;
      SFX.timerWarning();
    }
    if (room.timer > 10) timerWarnedRef.current = false;
  }, [room?.timer]);

  // Night result → someone was eliminated
  const prevNightResult = useRef(nightResult);
  useEffect(() => {
    if (nightResult && nightResult !== prevNightResult.current) {
      if (nightResult.killed.length > 0) SFX.eliminate();
    }
    prevNightResult.current = nightResult;
  }, [nightResult]);

  // Game over
  const prevGameOver = useRef(gameOverResult);
  useEffect(() => {
    if (gameOverResult && gameOverResult !== prevGameOver.current) {
      SFX.gameOver();
    }
    prevGameOver.current = gameOverResult;
  }, [gameOverResult]);

  // Incoming chat
  useEffect(() => {
    const len = room?.chat.length ?? 0;
    if (len > prevChatLenRef.current && prevChatLenRef.current > 0) SFX.ping();
    prevChatLenRef.current = len;
  }, [room?.chat.length]);

  // Player joins lobby
  useEffect(() => {
    const count = room?.players.length ?? 0;
    if (count > prevPlayersRef.current && prevPlayersRef.current > 0) SFX.join();
    prevPlayersRef.current = count;
  }, [room?.players.length]);
}

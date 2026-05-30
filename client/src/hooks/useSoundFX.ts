import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Phase } from '@/types/index';

// ── Low-level synth helpers ───────────────────────────────────────────

function makeCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

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
  const ctx = makeCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = masterVol;
  master.connect(ctx.destination);
  for (const t of tones) scheduleTone(ctx, master, t);
  const maxEnd = Math.max(...tones.map(t => (t.startAt ?? 0) + (t.duration ?? 0.3)));
  setTimeout(() => ctx.close(), (maxEnd + 0.5) * 1000);
}

// ── Named sound effects ───────────────────────────────────────────────

export const SFX = {
  /** Soft ping — chat message, join notification */
  ping() {
    play([
      { freq: 880, type: 'sine', duration: 0.4, vol: 0.15 },
      { freq: 1320, type: 'sine', duration: 0.25, vol: 0.08, startAt: 0.05 },
    ]);
  },

  /** Player joins the room */
  join() {
    play([
      { freq: 440, type: 'sine', duration: 0.2, vol: 0.2 },
      { freq: 554, type: 'sine', duration: 0.2, vol: 0.2, startAt: 0.12 },
      { freq: 659, type: 'sine', duration: 0.3, vol: 0.2, startAt: 0.24 },
    ]);
  },

  /** Game starts — punchy vaporwave arpeggio */
  gameStart() {
    play([
      { freq: 220, type: 'sawtooth', duration: 0.15, vol: 0.18 },
      { freq: 277, type: 'sawtooth', duration: 0.15, vol: 0.18, startAt: 0.1 },
      { freq: 330, type: 'sawtooth', duration: 0.15, vol: 0.18, startAt: 0.2 },
      { freq: 440, type: 'sawtooth', duration: 0.3,  vol: 0.22, startAt: 0.3 },
      { freq: 440, type: 'sine',     duration: 0.5,  vol: 0.1,  startAt: 0.3, detune: 7 },
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

  /** Day begins — bright, ascending hope */
  dayStart() {
    play([
      { freq: 330, type: 'sine', duration: 0.2,  vol: 0.2,  freqEnd: 440 },
      { freq: 440, type: 'sine', duration: 0.2,  vol: 0.2,  startAt: 0.18, freqEnd: 554 },
      { freq: 554, type: 'sine', duration: 0.25, vol: 0.2,  startAt: 0.36, freqEnd: 659 },
      { freq: 659, type: 'sine', duration: 0.4,  vol: 0.22, startAt: 0.54 },
    ]);
  },

  /** Voting begins — tense, dissonant cluster */
  voteStart() {
    play([
      { freq: 440, type: 'sawtooth', duration: 0.5, vol: 0.15 },
      { freq: 466, type: 'sawtooth', duration: 0.5, vol: 0.12, detune: -12 },
      { freq: 392, type: 'square',   duration: 0.3, vol: 0.08, startAt: 0.1 },
      { freq: 523, type: 'sine',     duration: 0.4, vol: 0.1,  startAt: 0.2 },
    ], 0.4);
  },

  /** Player eliminated — dramatic descending chord + noise burst */
  eliminate() {
    play([
      { freq: 220, type: 'sawtooth', duration: 0.8,  vol: 0.22, freqEnd: 55 },
      { freq: 440, type: 'sine',     duration: 0.5,  vol: 0.15, freqEnd: 110 },
      { freq: 110, type: 'square',   duration: 0.3,  vol: 0.10, startAt: 0.1 },
      { freq: 55,  type: 'sine',     duration: 1.0,  vol: 0.20 },
    ], 0.4);
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
  const room = useGameStore(s => s.room);
  const nightResult = useGameStore(s => s.nightResult);
  const gameOverResult = useGameStore(s => s.gameOverResult);

  const prevPhaseRef = useRef<Phase | null>(null);
  const prevChatLenRef = useRef(0);
  const prevPlayersRef = useRef(0);

  useEffect(() => {
    if (!room) { prevPhaseRef.current = null; return; }

    const phase = room.phase;
    const prevPhase = prevPhaseRef.current;

    if (prevPhase !== null && prevPhase !== phase) {
      if (phase === 'role_reveal') SFX.gameStart();
      else if (phase === 'night') SFX.nightStart();
      else if (phase === 'day') SFX.dayStart();
      else if (phase === 'voting') SFX.voteStart();
    }

    prevPhaseRef.current = phase;
  }, [room?.phase]);

  // Night result → someone was eliminated
  const prevNightResult = useRef(nightResult);
  useEffect(() => {
    if (nightResult && nightResult !== prevNightResult.current) {
      if (nightResult.killed.length > 0) SFX.eliminate();
    }
    prevNightResult.current = nightResult;
  }, [nightResult]);

  // Game over sound
  const prevGameOver = useRef(gameOverResult);
  useEffect(() => {
    if (gameOverResult && gameOverResult !== prevGameOver.current) {
      SFX.gameOver();
    }
    prevGameOver.current = gameOverResult;
  }, [gameOverResult]);

  // New chat messages
  useEffect(() => {
    const len = room?.chat.length ?? 0;
    if (len > prevChatLenRef.current && prevChatLenRef.current > 0) {
      SFX.ping();
    }
    prevChatLenRef.current = len;
  }, [room?.chat.length]);

  // Player join sound
  useEffect(() => {
    const count = room?.players.length ?? 0;
    if (count > prevPlayersRef.current && prevPlayersRef.current > 0) {
      SFX.join();
    }
    prevPlayersRef.current = count;
  }, [room?.players.length]);
}

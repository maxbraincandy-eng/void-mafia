// Re-exports from the central audio engine so existing imports keep working.
export { SFX } from '@/lib/audioEngine';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { SFX } from '@/lib/audioEngine';
import type { Phase } from '@/types/index';

// Legacy compat — now managed by settingsStore + audioEngine
export function setSoundMuted(m: boolean) {
  const { update } = (window as any).__settingsStore ?? {};
  if (update) update({ sfxEnabled: !m });
}
export function isSoundMuted(): boolean { return false; }

// ── useGameSounds ─────────────────────────────────────────────────────

export function useGameSounds(): void {
  const room           = useGameStore(s => s.room);
  const nightResult    = useGameStore(s => s.nightResult);
  const gameOverResult = useGameStore(s => s.gameOverResult);

  const prevPhaseRef      = useRef<Phase | null>(null);
  const prevChatLenRef    = useRef(0);
  const prevPlayersRef    = useRef(0);
  const timerWarnedRef    = useRef(false);
  const prevNightResult   = useRef(nightResult);
  const prevGameOver      = useRef(gameOverResult);

  useEffect(() => {
    if (!room) { prevPhaseRef.current = null; timerWarnedRef.current = false; return; }
    const phase = room.phase;
    const prev  = prevPhaseRef.current;
    if (prev !== null && prev !== phase) {
      timerWarnedRef.current = false;
      if      (phase === 'role_reveal') SFX.gameStart();
      else if (phase === 'night')       SFX.nightStart();
      else if (phase === 'day')         SFX.dayStart();
      else if (phase === 'voting')      SFX.voteStart();
    }
    prevPhaseRef.current = phase;
  }, [room?.phase]);

  useEffect(() => {
    if (!room || room.timer <= 0 || room.maxTimer <= 0) return;
    if (room.timer <= 10 && !timerWarnedRef.current) {
      timerWarnedRef.current = true;
      SFX.timerWarning();
    }
    if (room.timer > 10) timerWarnedRef.current = false;
  }, [room?.timer]);

  useEffect(() => {
    if (nightResult && nightResult !== prevNightResult.current) {
      if (nightResult.killed.length > 0) SFX.eliminate();
    }
    prevNightResult.current = nightResult;
  }, [nightResult]);

  useEffect(() => {
    if (gameOverResult && gameOverResult !== prevGameOver.current) SFX.gameOver();
    prevGameOver.current = gameOverResult;
  }, [gameOverResult]);

  useEffect(() => {
    const len = room?.chat.length ?? 0;
    if (len > prevChatLenRef.current && prevChatLenRef.current > 0 && room?.phase !== 'role_reveal') SFX.ping();
    prevChatLenRef.current = len;
  }, [room?.chat.length]);

  useEffect(() => {
    const count = room?.players.length ?? 0;
    if (count > prevPlayersRef.current && prevPlayersRef.current > 0 && room?.phase !== 'role_reveal') SFX.join();
    prevPlayersRef.current = count;
  }, [room?.players.length]);
}

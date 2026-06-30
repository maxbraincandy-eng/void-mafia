/**
 * useLivekitVoice — game integration glue for LiveKit voice.
 *
 * Rule: gameRoomId === livekitRoomId. The hook watches the Mafia game store and:
 *   • auto-joins the LiveKit room when the game is in progress
 *   • auto-mutes (listen-only) the local mic when the player dies
 *   • leaves the room when the game ends / the player exits
 *
 * It reuses the existing gameStore fields (no server changes): `room.id`,
 * `myPlayerId`, `room.phase`, and the `amAlive()` selector. Death already
 * propagates through `room:update` flipping `isAlive`, so we just react to it.
 *
 * Drop this hook into the in-game screen:
 *   const voice = useLivekitVoice();
 *   <button onClick={voice.toggleMic}>{voice.micEnabled ? '🎙' : '🔇'}</button>
 */
import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import {
  joinLiveKitVoice, leaveLiveKitVoice, setLiveKitDead,
  toggleLiveKitMic, setLiveKitMic, subscribeLiveKit, getLiveKitState,
  fetchLiveKitEnabled, startLiveKitAudio, type LiveKitVoiceState,
} from '@/services/livekitVoice';

// Phases where there is no active voice room (no auto-join).
const INACTIVE_PHASES = new Set(['lobby', 'game_over']);

/**
 * True once the server reports LiveKit is configured (LIVEKIT_* env present).
 * Lets the game UI mount the LiveKit voice path from runtime config alone —
 * no VITE flag / client rebuild needed.
 */
export function useLiveKitEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    fetchLiveKitEnabled().then(e => { if (mounted) setEnabled(e); });
    return () => { mounted = false; };
  }, []);
  return enabled;
}

export function useLivekitVoice() {
  const [state, setState] = useState<LiveKitVoiceState>(getLiveKitState);

  const roomId = useGameStore(s => s.room?.id ?? null);
  const phase = useGameStore(s => s.room?.phase ?? null);
  const myPlayerId = useGameStore(s => s.myPlayerId);
  // amAlive() is a selector; recompute it from the reactive players list so the
  // effect re-runs when the local player's isAlive flips in room:update.
  const isAlive = useGameStore(s => {
    if (!s.room || !s.myPlayerId) return true;
    const me = s.room.players.find(p => p.id === s.myPlayerId)
      ?? s.room.nextRoundQueue?.find(p => p.id === s.myPlayerId);
    return me?.isAlive ?? true;
  });

  // Mirror the module-level voice state into React.
  useEffect(() => subscribeLiveKit(setState), []);

  const active = !!roomId && !!myPlayerId && !!phase && !INACTIVE_PHASES.has(phase);

  // Auto-join / leave: each game room maps to a LiveKit room of the same id.
  useEffect(() => {
    if (active && roomId && myPlayerId) {
      joinLiveKitVoice(myPlayerId, roomId, { alive: isAlive }).catch(() => {});
    } else {
      leaveLiveKitVoice().catch(() => {});
    }
    // Intentionally not depending on isAlive here — death is handled below so a
    // mid-game death doesn't tear down and rebuild the whole connection.
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [active, roomId, myPlayerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Death → force listen-only; revive/next game → allow speaking again.
  useEffect(() => {
    if (!active) return;
    setLiveKitDead(!isAlive).catch(() => {});
  }, [active, isAlive]);

  // Leave on unmount of the whole app/game tree.
  useEffect(() => () => { leaveLiveKitVoice().catch(() => {}); }, []);

  const toggleMic = useCallback(() => { toggleLiveKitMic().catch(() => {}); }, []);
  const setMic = useCallback((on: boolean) => { setLiveKitMic(on).catch(() => {}); }, []);
  const leave = useCallback(() => { leaveLiveKitVoice().catch(() => {}); }, []);
  const unlockAudio = useCallback(() => { startLiveKitAudio().catch(() => {}); }, []);

  return {
    ...state,
    /** Connected & in a room. */
    connected: state.status === 'connected',
    toggleMic,
    setMic,
    leave,
    unlockAudio,
  };
}

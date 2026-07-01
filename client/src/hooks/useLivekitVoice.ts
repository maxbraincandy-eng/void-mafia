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
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { socket } from '@/lib/socket';
import type { PlayerPublic } from '@/types/index';
import {
  joinLiveKitVoice, leaveLiveKitVoice, setLiveKitDead, setLiveKitForceMuted,
  toggleLiveKitMic, setLiveKitMic, subscribeLiveKit, getLiveKitState,
  toggleLiveKitCamera, getLiveKitRemoteVideo, getLiveKitLocalVideo, getLiveKitSpeaking,
  fetchLiveKitEnabled, getLiveKitEnabledCached, startLiveKitAudio, type LiveKitVoiceState,
} from '@/services/livekitVoice';

const EMPTY_PLAYERS: PlayerPublic[] = [];

// Phases where the game hook itself doesn't auto-join (lobby is handled by
// LobbyPage's own binding; game_over ends voice).
const INACTIVE_PHASES = new Set(['lobby', 'game_over']);

/**
 * LiveKit availability gate. `resolved` is false only during the very first
 * status probe; callers that must decide mesh-vs-LiveKit (to avoid double mic
 * capture) should wait for `resolved` before falling back to the legacy mesh.
 */
export function useLiveKitGate(): { enabled: boolean; resolved: boolean } {
  const [gate, setGate] = useState<{ enabled: boolean; resolved: boolean }>(() => {
    const cached = getLiveKitEnabledCached();
    return cached === null ? { enabled: false, resolved: false } : { enabled: cached, resolved: true };
  });
  useEffect(() => {
    let mounted = true;
    fetchLiveKitEnabled().then(e => { if (mounted) setGate({ enabled: e, resolved: true }); });
    return () => { mounted = false; };
  }, []);
  return gate;
}

/** True once the server reports LiveKit configured (LIVEKIT_* env present). */
export function useLiveKitEnabled(): boolean {
  return useLiveKitGate().enabled;
}

export interface LivekitRoomVoiceOpts {
  /** LiveKit room name (== game/space id). Null when there's no room yet. */
  roomId: string | null;
  /** Local participant identity (profile/player id). */
  identity: string | null;
  /** Should the user be in voice right now. */
  active: boolean;
  /** Listen-only (dead player / ghost) — mic force-muted & locked. */
  listenOnly?: boolean;
}

/**
 * Generic LiveKit voice binding shared by the Mafia game and the Virtual Space.
 * Joins `roomId` as `identity` while `active`, force-mutes when `listenOnly`,
 * and leaves on teardown. One LiveKit room at a time (module singleton), so
 * switching screens cleanly hands the connection over.
 */
export function useLivekitRoomVoice({ roomId, identity, active, listenOnly = false }: LivekitRoomVoiceOpts) {
  const [state, setState] = useState<LiveKitVoiceState>(getLiveKitState);

  // Mirror the module-level voice state into React.
  useEffect(() => subscribeLiveKit(setState), []);

  const on = active && !!roomId && !!identity;

  // Auto-join / leave: room id maps 1:1 to a LiveKit room of the same name.
  useEffect(() => {
    if (on && roomId && identity) {
      joinLiveKitVoice(identity, roomId, { alive: !listenOnly }).catch(() => {});
    } else {
      leaveLiveKitVoice().catch(() => {});
    }
    // listenOnly handled in the next effect so a mid-session death/ghost toggle
    // doesn't tear down and rebuild the whole connection.
  }, [on, roomId, identity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen-only toggle (death / ghost) without reconnecting.
  useEffect(() => {
    if (!on) return;
    setLiveKitDead(listenOnly).catch(() => {});
  }, [on, listenOnly]);

  // Leave on unmount.
  useEffect(() => () => { leaveLiveKitVoice().catch(() => {}); }, []);

  const toggleMic = useCallback(() => { toggleLiveKitMic().catch(() => {}); }, []);
  const setMic = useCallback((m: boolean) => { setLiveKitMic(m).catch(() => {}); }, []);
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

export type LivekitVoice = ReturnType<typeof useLivekitRoomVoice>;

/** Mafia game binding: each game room == one LiveKit room; death → listen-only. */
export function useLivekitVoice() {
  const roomId = useGameStore(s => s.room?.id ?? null);
  const phase = useGameStore(s => s.room?.phase ?? null);
  const myPlayerId = useGameStore(s => s.myPlayerId);
  // Recompute alive from the reactive players list so a death in room:update
  // re-runs the listen-only effect.
  const isAlive = useGameStore(s => {
    if (!s.room || !s.myPlayerId) return true;
    const me = s.room.players.find(p => p.id === s.myPlayerId)
      ?? s.room.nextRoundQueue?.find(p => p.id === s.myPlayerId);
    return me?.isAlive ?? true;
  });

  const active = !!phase && !INACTIVE_PHASES.has(phase);
  const voice = useLivekitRoomVoice({ roomId, identity: myPlayerId, active, listenOnly: !isAlive });

  // Honor the server's phase voice rules so a player is only heard on their
  // turn. The server pushes voice:force-mute / voice:force-unmute per phase.
  useEffect(() => {
    if (!active) return;
    const onMute = (p?: { reason?: string }) => { setLiveKitForceMuted(true, p?.reason).catch(() => {}); };
    const onUnmute = () => { setLiveKitForceMuted(false).catch(() => {}); };
    socket.on('voice:force-mute', onMute);
    socket.on('voice:force-unmute', onUnmute);
    return () => { socket.off('voice:force-mute', onMute); socket.off('voice:force-unmute', onUnmute); };
  }, [active]);

  // Pull the current rule once connected (covers joining / reconnecting mid-phase).
  useEffect(() => {
    if (active && voice.connected) socket.emit('voice:livekit_sync');
  }, [active, voice.connected]);

  // Map LiveKit participant identities (== player id) to socketIds so the game's
  // existing video tiles / speaking rings (keyed by socketId) work with LiveKit.
  const players = useGameStore(s => s.room?.players ?? EMPTY_PLAYERS);
  // voice.rev changes on any video / active-speaker update → recompute the maps.
  const rev = voice.rev;
  const { remoteVideoStreams, speakingSocketIds, isLocalSpeaking } = useMemo(() => {
    const idToSocket = new Map<string, string>();
    for (const p of players) idToSocket.set(p.id, p.socketId);
    const streams: Record<string, MediaStream> = {};
    getLiveKitRemoteVideo().forEach((stream, identity) => {
      const sock = idToSocket.get(identity);
      if (sock) streams[sock] = stream;
    });
    const speaking = new Set<string>();
    getLiveKitSpeaking().forEach(identity => {
      const sock = idToSocket.get(identity);
      if (sock) speaking.add(sock);
    });
    const mySock = myPlayerId ? idToSocket.get(myPlayerId) ?? null : null;
    return { remoteVideoStreams: streams, speakingSocketIds: speaking, isLocalSpeaking: !!mySock && speaking.has(mySock) };
  }, [players, rev, myPlayerId]);

  return {
    ...voice,
    /** Effective muted (user mute, phase force-mute, or dead). */
    isMuted: !voice.micEnabled || voice.forceMuted || voice.dead,
    isLocalSpeaking,
    speakingSocketIds,
    /** Remote camera streams keyed by socketId (for the player tiles). */
    remoteVideoStreams,
    localVideoStream: getLiveKitLocalVideo(),
    toggleCamera: () => { toggleLiveKitCamera().catch(() => {}); },
  };
}

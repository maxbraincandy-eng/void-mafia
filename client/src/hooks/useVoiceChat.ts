/**
 * useVoiceChat — React hook wrapping the WebRTC session.
 *
 * The WebRTC session lives at MODULE level so it persists across component
 * mounts/unmounts (LobbyPage → GamePage transitions, etc.).  Each call to
 * useVoiceChat() subscribes the current component to state updates; it does
 * NOT create or destroy the underlying session.
 *
 * Voice channels:
 *   'room'  — all alive players (and lobby)
 *   'mafia' — only alive Mafia during night
 */

import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, ConnectionState, PeerState, log } from '@/services/webrtcService';

export type VoiceChannel = 'room' | 'mafia' | 'yakuza';

export interface VoiceState {
  channel: VoiceChannel | null;
  status: ConnectionState;
  /** Computed: !userMicEnabled || forceMuted */
  isMuted: boolean;
  /** User's own mic preference (true = they want their mic on) */
  userMicEnabled: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  peers: PeerState[];
  remoteStreams: Record<string, MediaStream>;
  error: string | null;
  /** Server/phase forced the mic off — independent from userMicEnabled */
  forceMuted: boolean;
  forceMutedReason: string | null;
  listenOnly: boolean;
  /** Auto-recovery is in progress */
  isRefreshing: boolean;
  /** Waiting for user to confirm mic/camera permission primer */
  awaitingMediaPrimer: boolean;
}

const INITIAL: VoiceState = {
  channel:          null,
  status:           'disconnected',
  isMuted:          false,
  userMicEnabled:   true,
  cameraOn:         false,
  isLocalSpeaking:  false,
  peers:            [],
  remoteStreams:    {},
  error:            null,
  forceMuted:       false,
  forceMutedReason: null,
  listenOnly:       false,
  isRefreshing:     false,
  awaitingMediaPrimer: false,
};

// ── Module-level singleton ─────────────────────────────────────────────
// Session and state live here — outside any React component — so they
// survive LobbyPage → GamePage transitions without re-joining voice.

const MIC_PRIMED_KEY = 'vm-mic-primed';
let _primerResolve: (() => void) | null = null;
let _primerReject: ((e: Error) => void) | null = null;

export function confirmMediaPrimer() {
  localStorage.setItem(MIC_PRIMED_KEY, '1');
  _patch({ awaitingMediaPrimer: false });
  _primerResolve?.();
  _primerResolve = null;
  _primerReject = null;
}

export function dismissMediaPrimer() {
  _patch({ awaitingMediaPrimer: false });
  _primerReject?.(new Error('cancelled'));
  _primerResolve = null;
  _primerReject = null;
}

let _session: WebRTCSession | null = null;
let _state: VoiceState = { ...INITIAL };
const _subscribers = new Set<(s: VoiceState) => void>();

function _patch(partial: Partial<VoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subscribers) sub({ ..._state });
}

function _reset() {
  _state = { ...INITIAL };
  _session = null;
  for (const sub of _subscribers) sub({ ..._state });
}

// ── Reconnect state ────────────────────────────────────────────────────
let _reconnectOnResume: { channel: VoiceChannel; withCamera: boolean } | null = null;

// ── Auto-refresh debounce ──────────────────────────────────────────────
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
// Reason deferred while page was hidden — executed on next foreground return
let _deferredRefreshReason: string | null = null;

async function doVoiceRefresh(reason: string) {
  if (!_state.channel) return;
  const channel = _state.channel;
  const withCamera = _state.cameraOn;
  log('auto-refreshing voice connection, reason:', reason);
  _patch({ isRefreshing: true, error: null });
  if (_session) {
    (socket as any).emit('voice:leave');
    _session.destroy();
    _session = null;
  }
  _moduleJoinVoice(channel, withCamera, true).finally(() => {
    _patch({ isRefreshing: false });
  });
}

function scheduleVoiceRefresh(reason: string, delayMs = 2000) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  log('scheduling voice refresh:', reason, 'in', delayMs, 'ms');
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null;
    if (!_state.channel) return;
    // If hidden, defer until foreground — getUserMedia is blocked in background on iOS/Android
    if (document.visibilityState === 'hidden') {
      log('deferring voice refresh until foreground:', reason);
      _deferredRefreshReason = reason;
      return;
    }
    doVoiceRefresh(reason);
  }, delayMs);
}

// ── Module-level join (can be called outside hook context) ─────────────

async function _moduleJoinVoice(
  channel: VoiceChannel,
  withCamera = false,
  silent = false,
  startMuted = false,
): Promise<void> {
  if (_session) return;

  const session = new WebRTCSession();
  _session = session;

  session.subscribe(event => {
    if (event.type === 'state') {
      _patch({ status: event.state, error: silent ? null : _state.error });
    } else if (event.type === 'peer-added') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'peer-removed') {
      _patch({ peers: session.getPeers(), remoteStreams: session.getRemoteStreams() });
    } else if (event.type === 'speaking') {
      if (event.socketId === 'local') {
        _patch({ isLocalSpeaking: event.isSpeaking });
      } else {
        _patch({ peers: session.getPeers() });
      }
    } else if (event.type === 'stream-update') {
      _patch({ remoteStreams: session.getRemoteStreams() });
    } else if (event.type === 'error') {
      if (!silent) _patch({ error: event.message, status: 'failed' });
      // On ICE failure, schedule a refresh (with backoff so we don't spam)
      if (event.message.toLowerCase().includes('failed')) {
        scheduleVoiceRefresh('ice-failure', 4000);
      }
    } else if (event.type === 'local-track-ended') {
      // Mic track killed by OS (backgrounded) — reconnect voice
      log('local track ended — scheduling voice refresh');
      scheduleVoiceRefresh('local-track-ended', 800);
    }
  });

  // Show mic/camera permission primer on first use (if permission not yet decided)
  if (!silent && !localStorage.getItem(MIC_PRIMED_KEY)) {
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (perm.state === 'prompt') {
        _patch({ awaitingMediaPrimer: true });
        await new Promise<void>((resolve, reject) => {
          _primerResolve = resolve;
          _primerReject = reject;
        });
      } else {
        localStorage.setItem(MIC_PRIMED_KEY, '1');
      }
    } catch {
      // permissions API unavailable — proceed directly
    }
  }

  // Re-check session is still alive (user may have cancelled primer)
  if (_session !== session) return;

  try {
    await session.requestMedia(true, withCamera, silent);
  } catch {
    session.destroy();
    _session = null;
    if (!silent) _patch({ status: 'failed' });
    else _reset();
    return;
  }

  (socket as any).emit('voice:join', { channel }, async (res: any) => {
    if (!res.ok) {
      const msg = res.error ?? 'Failed to join voice channel.';
      log('voice:join rejected:', msg);
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: msg });
      return;
    }

    const transmitAllowed: boolean = res.data.transmitAllowed ?? true;

    if (res.data.iceServers) {
      session.setIceConfig({
        iceServers: res.data.iceServers,
        iceTransportPolicy: res.data.iceTransportPolicy ?? 'all',
        iceCandidatePoolSize: 10,
      });
    }

    // forceMuted is set if server says transmit not allowed
    const serverForceMuted = !transmitAllowed;
    const effectiveMuted = !_state.userMicEnabled || serverForceMuted || startMuted;

    _patch({
      channel,
      cameraOn: withCamera,
      listenOnly: false,
      forceMuted: serverForceMuted,
      forceMutedReason: transmitAllowed ? null : 'Only the current speaker may transmit.',
      isMuted: effectiveMuted,
    });

    if (effectiveMuted) session.setMuted(true);

    const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;
    log('joined voice, existing peers:', existingPeers.length);

    for (const { socketId: peerId, name } of existingPeers) {
      session.createPeerConnection(peerId, name, (candidate) => {
        (socket as any).emit('voice:ice-candidate', { to: peerId, candidate });
      });
      try {
        const offer = await session.createOffer(peerId);
        (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
        log('offer sent to', peerId);
      } catch (e: any) {
        log('offer creation failed for', peerId, ':', e.message);
      }
    }

    _patch({ peers: session.getPeers() });
  });
}

async function _moduleJoinListenOnly(channel: VoiceChannel): Promise<void> {
  if (_session) return;

  const session = new WebRTCSession();
  _session = session;

  session.subscribe(event => {
    if (event.type === 'state') {
      _patch({ status: event.state });
    } else if (event.type === 'peer-added') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'peer-removed') {
      _patch({ peers: session.getPeers(), remoteStreams: session.getRemoteStreams() });
    } else if (event.type === 'speaking') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'stream-update') {
      _patch({ remoteStreams: session.getRemoteStreams() });
    } else if (event.type === 'error') {
      _patch({ error: event.message, status: 'failed' });
    }
  });

  session.setListenOnlyMode();

  (socket as any).emit('voice:join', { channel }, async (res: any) => {
    if (!res.ok) {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: res.error ?? 'Failed to join voice.' });
      return;
    }

    if (res.data.iceServers) {
      session.setIceConfig({
        iceServers: res.data.iceServers,
        iceTransportPolicy: res.data.iceTransportPolicy ?? 'all',
        iceCandidatePoolSize: 10,
      });
    }

    _patch({ channel, listenOnly: true, forceMuted: true, forceMutedReason: 'Listen only', isMuted: true });
    const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;

    for (const { socketId: peerId, name } of existingPeers) {
      session.createPeerConnection(peerId, name, (candidate) => {
        (socket as any).emit('voice:ice-candidate', { to: peerId, candidate });
      });
      try {
        const offer = await session.createOffer(peerId);
        (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
      } catch (e: any) {
        log('listen-only offer failed for', peerId, ':', e.message);
      }
    }

    _patch({ peers: session.getPeers() });
  });
}

// ── Socket handlers (registered once at module load) ───────────────────

function onPeerJoined({ socketId, name }: { socketId: string; name: string; channel: VoiceChannel }) {
  const s = _session;
  if (!s) return;
  log('peer-joined', socketId, name);
  s.removePeer(socketId);
  s.createPeerConnection(socketId, name, (candidate) => {
    (socket as any).emit('voice:ice-candidate', { to: socketId, candidate });
  });
  _patch({ peers: s.getPeers() });
}

function onPeerLeft({ socketId }: { socketId: string }) {
  log('peer-left', socketId);
  _session?.removePeer(socketId);
  _patch({ peers: _session?.getPeers() ?? [], remoteStreams: _session?.getRemoteStreams() ?? {} });
}

async function onOffer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
  const s = _session;
  if (!s) return;
  log('offer from', from);
  try {
    const existingName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Player';
    const answer = await s.handleOffer(from, existingName, sdp, (candidate) => {
      (socket as any).emit('voice:ice-candidate', { to: from, candidate });
    });
    (socket as any).emit('voice:answer', { to: from, sdp: answer }, () => {});
    _patch({ peers: s.getPeers() });
  } catch (e: any) {
    log('offer handling failed:', e.message);
  }
}

async function onAnswer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
  log('answer from', from);
  try { await _session?.handleAnswer(from, sdp); }
  catch (e: any) { log('answer handling failed:', e.message); }
}

async function onIceCandidate({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) {
  try { await _session?.addIceCandidate(from, candidate); } catch {}
}

function onForceMute({ reason }: { reason: string }) {
  _session?.setMuted(true);
  // Preserve userMicEnabled — only server is forcing mute
  _patch({ forceMuted: true, forceMutedReason: reason, isMuted: true });
}

function onForceUnmute() {
  // Restore user's own mic preference, don't just blindly unmute
  const actualMuted = !_state.userMicEnabled;
  _session?.setMuted(actualMuted);
  _patch({ forceMuted: false, forceMutedReason: null, isMuted: actualMuted });
}

function onVoiceReset() {
  log('voice:reset received — resetting voice state after game over');
  // Clear all force mutes and restore user preference
  const actualMuted = !_state.userMicEnabled;
  _session?.setMuted(actualMuted);
  _patch({
    forceMuted: false,
    forceMutedReason: null,
    isMuted: actualMuted,
    listenOnly: false,
    error: null,
  });
}

function onForceLeave() {
  if (_session) {
    (socket as any).emit('voice:leave');
    _session.destroy();
    _reset();
    log('force-left voice channel');
  }
}

function onDisconnectRoom() {
  if (_session) {
    _session.destroy();
    _reset();
    log('voice:disconnect-room — all peer connections destroyed');
  }
}

function onSocketDisconnect() {
  if (_session && _state.channel) {
    // Save voice state so we can auto-rejoin when socket comes back
    _reconnectOnResume = { channel: _state.channel, withCamera: _state.cameraOn };
    _session.destroy();
    _reset();
    log('socket disconnected — voice state saved for auto-reconnect');
  } else if (_session) {
    _session.destroy();
    _reset();
  }
}

function onSocketConnect() {
  if (!_reconnectOnResume) return;
  const { channel, withCamera } = _reconnectOnResume;
  _reconnectOnResume = null;
  // Give room:join a moment to complete before rejoining voice
  setTimeout(() => {
    if (_session || _state.channel) return; // already back in voice somehow
    log('socket reconnected — auto-rejoining voice channel:', channel);
    _patch({ isRefreshing: true });
    _moduleJoinVoice(channel, withCamera, true).finally(() => {
      _patch({ isRefreshing: false });
    });
  }, 2000);
}

// Register once
(socket as any).on('voice:peer-joined',   onPeerJoined);
(socket as any).on('voice:peer-left',      onPeerLeft);
(socket as any).on('voice:offer',          onOffer);
(socket as any).on('voice:answer',         onAnswer);
(socket as any).on('voice:ice-candidate',  onIceCandidate);
(socket as any).on('voice:force-mute',     onForceMute);
(socket as any).on('voice:force-unmute',   onForceUnmute);
(socket as any).on('voice:reset',          onVoiceReset);
(socket as any).on('voice:force-leave',      onForceLeave);
(socket as any).on('voice:disconnect-room', onDisconnectRoom);
socket.on('disconnect',                      onSocketDisconnect);
socket.on('connect',                         onSocketConnect);

// ── Visibility / background recovery ──────────────────────────────────
// When the app returns from background, execute any deferred refresh first,
// then check ICE health. If unhealthy, schedule a full reconnect.

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    // Execute refresh that was deferred while page was hidden
    if (_deferredRefreshReason && _state.channel) {
      const reason = _deferredRefreshReason;
      _deferredRefreshReason = null;
      log('executing deferred voice refresh on foreground return:', reason);
      doVoiceRefresh(reason);
      return;
    }

    if (!_session || !_state.channel) return;
    log('visibility returned — checking voice health');
    const health = _session.checkHealth();
    if (!health.ok) {
      log('voice unhealthy after background return:', health.reason);
      scheduleVoiceRefresh('visibility-return', 1500);
    }
  });

  // Handle bfcache restore on mobile Safari (fires after visibilitychange)
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    if (!_session || !_state.channel) return;
    log('pageshow (bfcache restore) — scheduling voice refresh');
    scheduleVoiceRefresh('pageshow-bfcache', 1000);
  });
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useVoiceChat() {
  const [state, setLocalState] = useState<VoiceState>({ ..._state });

  useEffect(() => {
    _subscribers.add(setLocalState);
    setLocalState({ ..._state });
    return () => { _subscribers.delete(setLocalState); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Join a voice channel with microphone.
   * Pass silent=true for auto-join attempts — errors won't show in the UI.
   */
  const joinVoice = useCallback(async (
    channel: VoiceChannel,
    withCamera = false,
    silent = false,
    startMuted = false,
  ) => {
    return _moduleJoinVoice(channel, withCamera, silent, startMuted);
  }, []);

  /**
   * Join a voice channel as a listen-only participant (no mic needed).
   * Used for spectators and dead players.
   */
  const joinVoiceListenOnly = useCallback(async (channel: VoiceChannel) => {
    return _moduleJoinListenOnly(channel);
  }, []);

  const leaveVoice = useCallback(() => {
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    (socket as any).emit('voice:leave');
    _session?.destroy();
    _reset();
    log('left voice');
  }, []);

  const toggleMute = useCallback(() => {
    if (!_session || _state.forceMuted) return;
    const nextEnabled = !_state.userMicEnabled;
    const nextMuted = !nextEnabled; // forceMuted already confirmed false above
    _session.setMuted(nextMuted);
    _patch({ userMicEnabled: nextEnabled, isMuted: nextMuted });
  }, []);

  const setMuted = useCallback((on: boolean) => {
    if (!_session || _state.forceMuted) return;
    const nextEnabled = !on;
    _session.setMuted(on);
    _patch({ userMicEnabled: nextEnabled, isMuted: on });
  }, []);

  const toggleCamera = useCallback(async () => {
    const s = _session;
    if (!s) return;
    if (_state.cameraOn) {
      _patch({ cameraOn: false });
      await s.removeCamera();
    } else {
      try {
        await s.addCamera((peerId, offer) => {
          (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
        });
        _patch({ cameraOn: true, error: null });
      } catch (e: any) {
        // Session subscriber may suppress errors when joined silently — always show camera errors
        _patch({ cameraOn: false, error: e instanceof Error ? e.message : 'Could not enable camera.' });
      }
    }
  }, []);

  const getLocalStream = useCallback(() => _session?.getLocalStream() ?? null, []);

  const resetConnection = useCallback(() => {
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    if (_session) {
      (socket as any).emit('voice:leave');
      _session.destroy();
      _reset();
      log('voice connection reset by user');
    }
  }, []);

  const setSpeakerOnly = useCallback((speakerSocketId: string | null) => {
    _session?.setSpeakerOnly(speakerSocketId);
  }, []);

  return {
    ...state,
    joinVoice,
    joinVoiceListenOnly,
    leaveVoice,
    toggleMute,
    setMuted,
    toggleCamera,
    getLocalStream,
    resetConnection,
    setSpeakerOnly,
  };
}

/**
 * Destroy the voice session from outside React (e.g. from the game store on room:closed).
 * Stops ghost audio when the room is deleted while voice is still running.
 */
export function leaveVoiceModule(): void {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  if (_session) {
    (socket as any).emit('voice:leave');
    _session.destroy();
    _reset();
    log('voice session destroyed (room closed)');
  }
}

/**
 * Register a callback to be fired on the next user gesture (touchstart/click).
 * Use this to trigger mic permission on iOS Safari, which requires a user gesture
 * before getUserMedia() is allowed. No-ops if already in a voice session.
 */
export function registerVoiceGestureRetry(joinFn: () => void) {
  if (_session) return;
  const handler = () => {
    if (!_session) joinFn();
  };
  document.addEventListener('touchstart', handler, { once: true, passive: true });
  document.addEventListener('click', handler, { once: true });
}

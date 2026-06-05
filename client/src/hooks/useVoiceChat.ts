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
  isMuted: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  peers: PeerState[];
  remoteStreams: Record<string, MediaStream>;
  error: string | null;
  forceMuted: boolean;
  forceMutedReason: string | null;
  listenOnly: boolean;
}

const INITIAL: VoiceState = {
  channel:          null,
  status:           'disconnected',
  isMuted:          false,
  cameraOn:         false,
  isLocalSpeaking:  false,
  peers:            [],
  remoteStreams:    {},
  error:            null,
  forceMuted:       false,
  forceMutedReason: null,
  listenOnly:       false,
};

// ── Module-level singleton ─────────────────────────────────────────────
// Session and state live here — outside any React component — so they
// survive LobbyPage → GamePage transitions without re-joining voice.

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

// ── Socket handlers (registered once at module load) ───────────────────

function onPeerJoined({ socketId, name }: { socketId: string; name: string; channel: VoiceChannel }) {
  const s = _session;
  if (!s) return;
  log('peer-joined', socketId, name);
  // Clean up any existing PC for this socketId before creating a new one
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
  _patch({ isMuted: true, forceMuted: true, forceMutedReason: reason });
}

function onForceUnmute() {
  _session?.setMuted(false);
  _patch({ isMuted: false, forceMuted: false, forceMutedReason: null });
}

function onForceLeave() {
  if (_session) {
    (socket as any).emit('voice:leave');
    _session.destroy();
    _reset();
    log('force-left voice channel');
  }
}

function onSocketDisconnect() {
  // Socket lost — tear down the voice session so the server state is consistent
  if (_session) {
    _session.destroy();
    _reset();
    log('socket disconnected — voice session reset');
  }
}

// Register once
(socket as any).on('voice:peer-joined',   onPeerJoined);
(socket as any).on('voice:peer-left',      onPeerLeft);
(socket as any).on('voice:offer',          onOffer);
(socket as any).on('voice:answer',         onAnswer);
(socket as any).on('voice:ice-candidate',  onIceCandidate);
(socket as any).on('voice:force-mute',     onForceMute);
(socket as any).on('voice:force-unmute',   onForceUnmute);
(socket as any).on('voice:force-leave',    onForceLeave);
socket.on('disconnect',                    onSocketDisconnect);

// ── Hook ───────────────────────────────────────────────────────────────

export function useVoiceChat() {
  // Each component gets its own copy of state but they all stay in sync
  // via the _subscribers set.
  const [state, setLocalState] = useState<VoiceState>({ ..._state });

  useEffect(() => {
    // Sync this component whenever module-level state changes
    _subscribers.add(setLocalState);
    // Immediately sync in case state changed while this component was unmounted
    setLocalState({ ..._state });
    return () => { _subscribers.delete(setLocalState); };
    // NO cleanup of the voice session here — it persists across page transitions
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Join a voice channel with microphone.
   * Pass silent=true for auto-join attempts — errors won't show in the UI
   * so the "Join Voice" button remains as the user-visible fallback.
   */
  const joinVoice = useCallback(async (channel: VoiceChannel, withCamera = false, silent = false) => {
    if (_session) return; // already in a session

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
      }
    });

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

      // Apply server-provided ICE config (includes TURN credentials from Railway env)
      if (res.data.iceServers) {
        session.setIceConfig({
          iceServers: res.data.iceServers,
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10,
        });
      }

      _patch({
        channel,
        cameraOn: withCamera,
        listenOnly: false,
        forceMuted: !transmitAllowed,
        forceMutedReason: transmitAllowed ? null : 'Only the current speaker may transmit.',
      });
      if (!transmitAllowed) session.setMuted(true);

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
  }, []);

  /**
   * Join a voice channel as a listen-only participant (no mic permission needed).
   * Safe to call from useEffect — does not trigger a browser permission prompt.
   * Used for spectators and auto-listen on game start.
   */
  const joinVoiceListenOnly = useCallback(async (channel: VoiceChannel) => {
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
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10,
        });
      }

      _patch({ channel, listenOnly: true, forceMuted: true, forceMutedReason: 'Listen only' });
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
  }, []);

  const leaveVoice = useCallback(() => {
    (socket as any).emit('voice:leave');
    _session?.destroy();
    _reset();
    log('left voice');
  }, []);

  const toggleMute = useCallback(() => {
    if (!_session || _state.forceMuted) return;
    const nextMuted = !_state.isMuted;
    _session.setMuted(nextMuted);
    _patch({ isMuted: nextMuted });
  }, []);

  const toggleCamera = useCallback(async () => {
    const s = _session;
    if (!s) return;
    if (_state.cameraOn) {
      await s.removeCamera((peerId, offer) => {
        (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
      });
      _patch({ cameraOn: false });
    } else {
      try {
        await s.addCamera((peerId, offer) => {
          (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
        });
        _patch({ cameraOn: true, error: null });
      } catch {
        // error already emitted via subscriber
      }
    }
  }, []);

  const getLocalStream = useCallback(() => _session?.getLocalStream() ?? null, []);

  return {
    ...state,
    joinVoice,
    joinVoiceListenOnly,
    leaveVoice,
    toggleMute,
    toggleCamera,
    getLocalStream,
  };
}

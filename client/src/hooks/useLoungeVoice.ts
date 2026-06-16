/**
 * useLoungeVoice — WebRTC voice for Community lounges.
 *
 * Independent from useVoiceChat.ts (Mafia game-room voice) — no Room/Phase
 * coupling, no faction channels. Reuses the generic WebRTCSession engine.
 *
 * Speaker promotion uses a leave-and-rejoin-with-mic cycle rather than a
 * mid-session track upgrade, which keeps this hook simple.
 */

import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, ConnectionState, PeerState, log } from '@/services/webrtcService';
import type { CommunityLoungeRole } from '@/types/index';

export interface LoungeVoiceState {
  loungeId: string | null;
  role: CommunityLoungeRole | null;
  status: ConnectionState;
  isMuted: boolean;
  isLocalSpeaking: boolean;
  peers: PeerState[];
  remoteStreams: Record<string, MediaStream>;
  error: string | null;
  handRaised: boolean;
  kickedReason: string | null;
}

const INITIAL: LoungeVoiceState = {
  loungeId: null,
  role: null,
  status: 'disconnected',
  isMuted: false,
  isLocalSpeaking: false,
  peers: [],
  remoteStreams: {},
  error: null,
  handRaised: false,
  kickedReason: null,
};

let _session: WebRTCSession | null = null;
let _state: LoungeVoiceState = { ...INITIAL };
const _subscribers = new Set<(s: LoungeVoiceState) => void>();

function _patch(partial: Partial<LoungeVoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subscribers) sub({ ..._state });
}

function _reset() {
  _state = { ...INITIAL };
  _session = null;
  for (const sub of _subscribers) sub({ ..._state });
}

function _canTransmit(role: CommunityLoungeRole): boolean {
  return role === 'host' || role === 'speaker';
}

async function _moduleJoin(loungeId: string, asSpeaker: boolean): Promise<void> {
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
      if (event.socketId === 'local') _patch({ isLocalSpeaking: event.isSpeaking });
      else _patch({ peers: session.getPeers() });
    } else if (event.type === 'stream-update') {
      _patch({ remoteStreams: session.getRemoteStreams() });
    } else if (event.type === 'error') {
      _patch({ error: event.message, status: 'failed' });
    }
  });

  if (asSpeaker) {
    try {
      await session.requestMedia(true, false, false);
    } catch {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: 'Microphone access denied.' });
      return;
    }
  } else {
    session.setListenOnlyMode();
  }

  (socket as any).emit('lounge:join', { loungeId, asSpeaker }, async (res: any) => {
    if (!res.ok) {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: res.error ?? 'Failed to join lounge voice.' });
      return;
    }

    const role: CommunityLoungeRole = res.data.role;
    if (res.data.iceServers) {
      session.setIceConfig({ iceServers: res.data.iceServers, iceCandidatePoolSize: 10 });
    }

    const muted = !_canTransmit(role);
    if (asSpeaker && muted) session.setMuted(true);

    _patch({ loungeId, role, isMuted: muted, error: null, handRaised: false, kickedReason: null });

    const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;
    log('joined lounge voice, existing peers:', existingPeers.length);

    for (const { socketId: peerId, name } of existingPeers) {
      session.createPeerConnection(peerId, name, (candidate) => {
        (socket as any).emit('lounge:ice-candidate', { to: peerId, candidate });
      });
      try {
        const offer = await session.createOffer(peerId);
        (socket as any).emit('lounge:offer', { to: peerId, sdp: offer }, () => {});
      } catch (e: any) {
        log('lounge offer creation failed for', peerId, ':', e.message);
      }
    }

    _patch({ peers: session.getPeers() });
  });
}

function _moduleLeave(): void {
  (socket as any).emit('lounge:leave');
  _session?.destroy();
  _reset();
}

async function _moduleRejoinAs(asSpeaker: boolean): Promise<void> {
  const loungeId = _state.loungeId;
  if (!loungeId) return;
  _session?.destroy();
  _session = null;
  _state = { ...INITIAL };
  await _moduleJoin(loungeId, asSpeaker);
}

// ── Socket handlers (registered once at module load) ───────────────────

function onPeerJoined({ socketId, name }: { socketId: string; name: string; role: CommunityLoungeRole }) {
  const s = _session;
  if (!s) return;
  s.removePeer(socketId);
  s.createPeerConnection(socketId, name, (candidate) => {
    (socket as any).emit('lounge:ice-candidate', { to: socketId, candidate });
  });
  _patch({ peers: s.getPeers() });
}

function onPeerLeft({ socketId }: { socketId: string }) {
  _session?.removePeer(socketId);
  _patch({ peers: _session?.getPeers() ?? [], remoteStreams: _session?.getRemoteStreams() ?? {} });
}

async function onOffer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
  const s = _session;
  if (!s) return;
  try {
    const existingName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Listener';
    const answer = await s.handleOffer(from, existingName, sdp, (candidate) => {
      (socket as any).emit('lounge:ice-candidate', { to: from, candidate });
    });
    (socket as any).emit('lounge:answer', { to: from, sdp: answer }, () => {});
    _patch({ peers: s.getPeers() });
  } catch (e: any) {
    log('lounge offer handling failed:', e.message);
  }
}

async function onAnswer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
  try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('lounge answer handling failed:', e.message); }
}

async function onIceCandidate({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) {
  try { await _session?.addIceCandidate(from, candidate); } catch {}
}

function onPromoted() {
  log('promoted to speaker — rejoining with mic');
  _moduleRejoinAs(true);
}

function onDemoted() {
  log('demoted to listener — rejoining without mic');
  _moduleRejoinAs(false);
}

function onKicked({ reason }: { reason: string }) {
  _session?.destroy();
  _reset();
  _patch({ kickedReason: reason || 'Removed by host.' });
}

function onForceLeave({ reason }: { reason: string }) {
  _session?.destroy();
  _reset();
  _patch({ error: reason });
}

(socket as any).on('lounge:peer-joined',  onPeerJoined);
(socket as any).on('lounge:peer-left',    onPeerLeft);
(socket as any).on('lounge:offer',        onOffer);
(socket as any).on('lounge:answer',       onAnswer);
(socket as any).on('lounge:ice-candidate', onIceCandidate);
(socket as any).on('lounge:promoted',     onPromoted);
(socket as any).on('lounge:demoted',      onDemoted);
(socket as any).on('lounge:kicked',       onKicked);
(socket as any).on('lounge:force-leave',  onForceLeave);

// ── Hook ─────────────────────────────────────────────────────────────

export function useLoungeVoice() {
  const [state, setLocalState] = useState<LoungeVoiceState>({ ..._state });

  useEffect(() => {
    _subscribers.add(setLocalState);
    setLocalState({ ..._state });
    return () => { _subscribers.delete(setLocalState); };
  }, []);

  const joinLounge = useCallback((loungeId: string, asSpeaker: boolean) => _moduleJoin(loungeId, asSpeaker), []);
  const leaveLounge = useCallback(() => _moduleLeave(), []);

  const raiseHand = useCallback(() => {
    (socket as any).emit('lounge:raise_hand', (res: any) => { if (res?.ok) _patch({ handRaised: true }); });
  }, []);

  const lowerHand = useCallback(() => {
    (socket as any).emit('lounge:lower_hand', (res: any) => { if (res?.ok) _patch({ handRaised: false }); });
  }, []);

  const toggleMute = useCallback(() => {
    if (!_session || !_state.role || !_canTransmit(_state.role)) return;
    const next = !_state.isMuted;
    _session.setMuted(next);
    _patch({ isMuted: next });
  }, []);

  const promote = useCallback((targetPlayerId: string) => {
    (socket as any).emit('lounge:promote', { targetPlayerId }, () => {});
  }, []);

  const demote = useCallback((targetPlayerId: string) => {
    (socket as any).emit('lounge:demote', { targetPlayerId }, () => {});
  }, []);

  const kick = useCallback((targetPlayerId: string, reason: string) => {
    (socket as any).emit('lounge:kick', { targetPlayerId, reason }, () => {});
  }, []);

  const clearKicked = useCallback(() => _patch({ kickedReason: null }), []);

  return {
    ...state,
    joinLounge,
    leaveLounge,
    raiseHand,
    lowerHand,
    toggleMute,
    promote,
    demote,
    kick,
    clearKicked,
  };
}

export function leaveLoungeVoiceModule(): void {
  if (_session) _moduleLeave();
}

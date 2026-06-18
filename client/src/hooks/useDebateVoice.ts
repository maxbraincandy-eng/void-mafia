/**
 * useDebateVoice — WebRTC voice for Debate rooms.
 * Speakers (pro/con): full-duplex mic active immediately on join.
 * Spectators: receive-only (no mic, but can hear speakers).
 */

import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, type ConnectionState, type PeerState, log } from '@/services/webrtcService';

export interface DebateVoiceState {
  debateId: string | null;
  status: ConnectionState;
  joined: boolean;
  isSpeaker: boolean;
  peers: PeerState[];
  speakingSocketIds: string[];
  error: string | null;
}

const INITIAL: DebateVoiceState = {
  debateId: null,
  status: 'disconnected',
  joined: false,
  isSpeaker: false,
  peers: [],
  speakingSocketIds: [],
  error: null,
};

let _session: WebRTCSession | null = null;
let _state: DebateVoiceState = { ...INITIAL };
const _subs = new Set<(s: DebateVoiceState) => void>();
let _joining = false;

function _patch(partial: Partial<DebateVoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subs) sub({ ..._state });
}

function _reset() {
  _state = { ...INITIAL };
  _session = null;
  _joining = false;
  for (const sub of _subs) sub({ ..._state });
}

async function _join(debateId: string, side: 'pro' | 'con' | 'spectator', username: string): Promise<void> {
  if (_session || _joining) return;
  _joining = true;
  _patch({ status: 'connecting' });

  const isSpeaker = side === 'pro' || side === 'con';
  const session = new WebRTCSession();
  _session = session;

  session.subscribe(event => {
    if (!_session || _session !== session) return;
    if (event.type === 'state') {
      _patch({ status: event.state });
    } else if (event.type === 'peer-added' || event.type === 'peer-removed' || event.type === 'stream-update') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'error') {
      _patch({ error: event.message });
    }
  });

  // Speakers get a live mic; spectators only receive
  if (isSpeaker) {
    try {
      await session.requestMedia(true, false, false);
      session.setMuted(false); // mic on immediately for speakers
    } catch {
      session.destroy();
      _session = null;
      _joining = false;
      _patch({ status: 'failed', error: 'Microphone access denied.' });
      return;
    }
  }

  (socket as any).emit('debate:voice_join', { debateId, side, username }, async (res: any) => {
    _joining = false;
    if (!_session || _session !== session) return;

    if (!res?.ok) {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: res?.error ?? 'Failed to join voice.' });
      return;
    }

    const { peers: existingPeers, iceServers } = res.data;
    if (iceServers?.iceServers) {
      session.setIceConfig({ ...iceServers, iceCandidatePoolSize: 10 } as any);
    }

    _patch({ debateId, joined: true, isSpeaker, error: null });

    // Connect to existing peers
    for (const peer of (existingPeers ?? []) as Array<{ socketId: string; username: string; side: string }>) {
      session.createPeerConnection(peer.socketId, peer.username, (candidate) => {
        (socket as any).emit('debate:voice_ice', { debateId, to: peer.socketId, candidate });
      });
      // Only speakers initiate offers (so spectators receive audio passively)
      if (isSpeaker) {
        try {
          const offer = await session.createOffer(peer.socketId);
          (socket as any).emit('debate:voice_offer', { debateId, to: peer.socketId, sdp: offer });
        } catch (e: any) {
          log('debate voice offer failed for', peer.socketId, ':', e.message);
        }
      }
    }
    _patch({ peers: session.getPeers() });
  });
}

function _leave(debateId?: string): void {
  if (!_session && !_joining) return;
  const id = debateId ?? _state.debateId;
  if (id) {
    (socket as any).emit('debate:voice_leave', { debateId: id });
  }
  _session?.destroy();
  _reset();
}

// ── Socket listeners ─────────────────────────────────────────────────────

(socket as any).on('debate:voice_peer_joined', ({ socketId, username }: { socketId: string; username: string }) => {
  const s = _session;
  if (!s) return;
  s.removePeer(socketId);
  s.createPeerConnection(socketId, username, (candidate) => {
    const debateId = _state.debateId;
    if (debateId) (socket as any).emit('debate:voice_ice', { debateId, to: socketId, candidate });
  });
  _patch({ peers: s.getPeers() });
});

(socket as any).on('debate:voice_peer_left', ({ socketId }: { socketId: string }) => {
  _session?.removePeer(socketId);
  _patch({
    peers: _session?.getPeers() ?? [],
    speakingSocketIds: _state.speakingSocketIds.filter(id => id !== socketId),
  });
});

(socket as any).on('debate:voice_offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const s = _session;
  if (!s) return;
  try {
    const name = s.getPeers().find(p => p.socketId === from)?.name ?? 'Speaker';
    const debateId = _state.debateId;
    const answer = await s.handleOffer(from, name, sdp, (candidate) => {
      if (debateId) (socket as any).emit('debate:voice_ice', { debateId, to: from, candidate });
    });
    (socket as any).emit('debate:voice_answer', { debateId, to: from, sdp: answer });
    _patch({ peers: s.getPeers() });
  } catch (e: any) {
    log('debate voice offer handling failed:', e.message);
  }
});

(socket as any).on('debate:voice_answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('debate voice answer failed:', e.message); }
});

(socket as any).on('debate:voice_ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
  try { await _session?.addIceCandidate(from, candidate); } catch {}
});

(socket as any).on('disconnect', () => {
  if (_session) { _session.destroy(); _reset(); }
});

// ── Hook ─────────────────────────────────────────────────────────────────

export function useDebateVoice() {
  const [state, setLocalState] = useState<DebateVoiceState>({ ..._state });

  useEffect(() => {
    _subs.add(setLocalState);
    setLocalState({ ..._state });
    return () => { _subs.delete(setLocalState); };
  }, []);

  const join  = useCallback((debateId: string, side: 'pro' | 'con' | 'spectator', username: string) => {
    _join(debateId, side, username);
  }, []);
  const leave = useCallback((debateId?: string) => _leave(debateId), []);

  return { ...state, join, leave };
}

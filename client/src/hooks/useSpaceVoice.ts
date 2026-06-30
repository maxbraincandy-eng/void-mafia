import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, type ConnectionState, log } from '@/services/webrtcService';

export interface SpaceVoiceState {
  joined: boolean;
  muted: boolean;
  status: ConnectionState;
  speakingIds: Set<string>; // 'local' = self, otherwise peer socketId
  error: string | null;
}

const INITIAL: SpaceVoiceState = {
  joined: false,
  muted: false,
  status: 'disconnected',
  speakingIds: new Set(),
  error: null,
};

// Module-level singleton — survives re-renders
let _session: WebRTCSession | null = null;
let _state: SpaceVoiceState = { ...INITIAL, speakingIds: new Set() };
const _subs = new Set<(s: SpaceVoiceState) => void>();
let _joining = false;

function _patch(partial: Partial<SpaceVoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subs) sub({ ..._state });
}

function _reset() {
  _state = { ...INITIAL, speakingIds: new Set() };
  _session = null;
  _joining = false;
  for (const sub of _subs) sub({ ..._state });
}

async function _join(): Promise<void> {
  if (_session || _joining) return;
  _joining = true;

  const session = new WebRTCSession();
  _session = session;

  session.subscribe(event => {
    if (!_session || _session !== session) return;
    if (event.type === 'state') {
      _patch({ status: event.state });
    } else if (event.type === 'speaking') {
      const next = new Set(_state.speakingIds);
      if (event.isSpeaking) next.add(event.socketId);
      else next.delete(event.socketId);
      _patch({ speakingIds: next });
    } else if (event.type === 'error') {
      _patch({ error: event.message });
    }
  });

  try {
    await session.requestMedia(true, false, false);
  } catch {
    session.destroy();
    _session = null;
    _joining = false;
    _patch({ status: 'failed', error: 'Microphone access denied.' });
    return;
  }

  (socket as any).emit('space:voice-join', {}, async (res: any) => {
    _joining = false;
    if (!_session || _session !== session) return;

    if (!res?.ok) {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: res?.error ?? 'Voice join failed.' });
      return;
    }

    const { peers, iceServers, iceTransportPolicy } = res.data;
    if (iceServers) {
      session.setIceConfig({ iceServers, iceTransportPolicy, iceCandidatePoolSize: 10 } as any);
    }

    _patch({ joined: true, error: null });

    for (const { socketId, name } of (peers as Array<{ socketId: string; name: string }>)) {
      session.createPeerConnection(socketId, name, (candidate) => {
        (socket as any).emit('space:voice-ice', { to: socketId, candidate });
      });
      try {
        const offer = await session.createOffer(socketId);
        (socket as any).emit('space:voice-offer', { to: socketId, sdp: offer });
      } catch (e: any) {
        log('space voice offer failed for', socketId, ':', e?.message);
      }
    }
  });
}

// Ghost listen-only: receive everyone's audio, never transmit, stay off the
// voice roster. Offers to current peers + (via peer-joined) future joiners.
let _ghostVoice = false;
async function _joinGhost(): Promise<void> {
  if (_session || _joining) return;
  _joining = true;
  _ghostVoice = true;
  const session = new WebRTCSession();
  _session = session;
  session.subscribe(event => {
    if (!_session || _session !== session) return;
    if (event.type === 'state') _patch({ status: event.state });
    else if (event.type === 'speaking') {
      const next = new Set(_state.speakingIds);
      if (event.isSpeaking) next.add(event.socketId); else next.delete(event.socketId);
      _patch({ speakingIds: next });
    } else if (event.type === 'error') _patch({ error: event.message });
  });
  try {
    await session.requestMedia(true, false, false);
  } catch {
    // No mic? Still observe — we only ever receive.
  }
  session.setMuted(true);        // hard mute — owner never transmits while ghosting
  _patch({ muted: true });
  (socket as any).emit('space:voice-ghost_join', async (res: any) => {
    _joining = false;
    if (!_session || _session !== session) return;
    if (!res?.ok) { session.destroy(); _session = null; _ghostVoice = false; _patch({ status: 'failed', error: res?.error ?? 'Voice failed.' }); return; }
    const { peers, iceServers, iceTransportPolicy } = res.data;
    if (iceServers) session.setIceConfig({ iceServers, iceTransportPolicy, iceCandidatePoolSize: 10 } as any);
    _patch({ joined: true, error: null });
    for (const { socketId, name } of (peers as Array<{ socketId: string; name: string }>)) {
      session.createPeerConnection(socketId, name, (candidate) => (socket as any).emit('space:voice-ice', { to: socketId, candidate }));
      try {
        const offer = await session.createOffer(socketId);
        (socket as any).emit('space:voice-offer', { to: socketId, sdp: offer });
      } catch (e: any) { log('ghost voice offer failed for', socketId, ':', e?.message); }
    }
  });
}

function _leave(): void {
  if (!_session && !_joining) return;
  (socket as any).emit('space:voice-leave');
  _session?.destroy();
  _ghostVoice = false;
  _reset();
}

// ── Socket signal handlers (registered once) ───────────────────────────

(socket as any).on('space:voice-peer-joined', ({ socketId, name }: { socketId: string; name: string }) => {
  const s = _session;
  if (!s) return;
  s.removePeer(socketId);
  s.createPeerConnection(socketId, name, (candidate) => {
    (socket as any).emit('space:voice-ice', { to: socketId, candidate });
  });
  // A ghost isn't in the new peer's roster, so it must initiate the offer
  // itself to receive that peer's audio.
  if (_ghostVoice) {
    s.createOffer(socketId).then(offer => (socket as any).emit('space:voice-offer', { to: socketId, sdp: offer })).catch(() => {});
  }
});

(socket as any).on('space:voice-offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const s = _session;
  if (!s) return;
  try {
    const peerName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Player';
    const answer = await s.handleOffer(from, peerName, sdp, (candidate) => {
      (socket as any).emit('space:voice-ice', { to: from, candidate });
    });
    (socket as any).emit('space:voice-answer', { to: from, sdp: answer });
  } catch (e: any) {
    log('space voice offer handling failed:', e?.message);
  }
});

(socket as any).on('space:voice-answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('space voice answer failed:', e?.message); }
});

(socket as any).on('space:voice-ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
  try { await _session?.addIceCandidate(from, candidate); } catch {}
});

(socket as any).on('space:voice-peer-left', ({ socketId }: { socketId: string }) => {
  if (!_session) return;
  _session.removePeer(socketId);
  const next = new Set(_state.speakingIds);
  next.delete(socketId);
  _patch({ speakingIds: next });
});

(socket as any).on('disconnect', () => {
  if (_session) { _session.destroy(); _reset(); }
});

// ── Hook ──────────────────────────────────────────────────────────────

export function useSpaceVoice() {
  const [state, setState] = useState<SpaceVoiceState>({ ..._state });

  useEffect(() => {
    _subs.add(setState);
    setState({ ..._state });
    return () => { _subs.delete(setState); };
  }, []);

  const joinVoice  = useCallback(() => { _join(); }, []);
  const joinVoiceGhost = useCallback(() => { _joinGhost(); }, []);
  const leaveVoice = useCallback(() => { _leave(); }, []);
  const toggleMute = useCallback(() => {
    if (!_session) return;
    const nowMuted = !_state.muted;
    _session.setMuted(nowMuted);
    _patch({ muted: nowMuted });
  }, []);

  return { ...state, joinVoice, joinVoiceGhost, leaveVoice, toggleMute };
}

export function leaveSpaceVoice(): void { _leave(); }

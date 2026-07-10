import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, type ConnectionState, log } from '@/services/webrtcService';
import { BackroomsSpatial, type SpatialListener, type SpatialPeer } from '@/components/backrooms/spatialAudio';
import { tNow } from '@/store/langStore';

// ── Backrooms spatial voice ────────────────────────────────────────────
// A dedicated WebRTC-mesh voice session per Backrooms instance (own
// `backrooms:voice-*` signaling so it never collides with the Virtual Space
// voice hook). Remote audio is spatialised by BackroomsSpatial, driven each
// tick from the world loop via applyBackroomsSpatial().

export interface BackroomsVoiceState {
  joined: boolean;
  muted: boolean;
  status: ConnectionState;
  speakingIds: Set<string>;
  error: string | null;
}

const INITIAL: BackroomsVoiceState = { joined: false, muted: false, status: 'disconnected', speakingIds: new Set(), error: null };

let _session: WebRTCSession | null = null;
let _spatial: BackroomsSpatial | null = null;
let _state: BackroomsVoiceState = { ...INITIAL, speakingIds: new Set() };
const _subs = new Set<(s: BackroomsVoiceState) => void>();
let _joining = false;

function _patch(partial: Partial<BackroomsVoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subs) sub({ ..._state });
}
function _reset() {
  _state = { ...INITIAL, speakingIds: new Set() };
  _session = null; _joining = false;
  for (const sub of _subs) sub({ ..._state });
}

async function _join(): Promise<void> {
  if (_session || _joining) return;
  _joining = true;
  const session = new WebRTCSession();
  _session = session;
  _spatial = new BackroomsSpatial(session);

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
    session.destroy(); _session = null; _joining = false;
    _spatial?.dispose(); _spatial = null;
    _patch({ status: 'failed', error: tNow().misc.micDenied });
    return;
  }

  (socket as any).emit('backrooms:voice-join', {}, async (res: any) => {
    _joining = false;
    if (!_session || _session !== session) return;
    if (!res?.ok) {
      session.destroy(); _session = null; _spatial?.dispose(); _spatial = null;
      _patch({ status: 'failed', error: res?.error ?? tNow().misc.voiceConnectFailed });
      return;
    }
    const { peers, iceServers, iceTransportPolicy } = res.data;
    if (iceServers) session.setIceConfig({ iceServers, iceTransportPolicy, iceCandidatePoolSize: 10 } as any);
    _patch({ joined: true, error: null });
    _spatial?.resume();
    for (const { socketId, name } of (peers as Array<{ socketId: string; name: string }>)) {
      session.createPeerConnection(socketId, name, (candidate) => (socket as any).emit('backrooms:voice-ice', { to: socketId, candidate }));
      try {
        const offer = await session.createOffer(socketId);
        (socket as any).emit('backrooms:voice-offer', { to: socketId, sdp: offer });
      } catch (e: any) { log('backrooms voice offer failed for', socketId, ':', e?.message); }
    }
  });
}

function _leave(): void {
  if (!_session && !_joining) return;
  (socket as any).emit('backrooms:voice-leave');
  _session?.destroy();
  _spatial?.dispose(); _spatial = null;
  _reset();
}

/** Drive spatialisation from the world render loop (~10Hz). */
export function applyBackroomsSpatial(listener: SpatialListener, peers: SpatialPeer[]): void {
  _spatial?.update(listener, peers);
}

// ── Signaling (registered once at module load) ─────────────────────────
(socket as any).on('backrooms:voice-peer-joined', ({ socketId, name }: { socketId: string; name: string }) => {
  const s = _session; if (!s) return;
  s.removePeer(socketId);
  s.createPeerConnection(socketId, name, (candidate) => (socket as any).emit('backrooms:voice-ice', { to: socketId, candidate }));
});
(socket as any).on('backrooms:voice-offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const s = _session; if (!s) return;
  try {
    const peerName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Lost';
    const answer = await s.handleOffer(from, peerName, sdp, (candidate) => (socket as any).emit('backrooms:voice-ice', { to: from, candidate }));
    (socket as any).emit('backrooms:voice-answer', { to: from, sdp: answer });
  } catch (e: any) { log('backrooms voice offer handling failed:', e?.message); }
});
(socket as any).on('backrooms:voice-answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('backrooms voice answer failed:', e?.message); }
});
(socket as any).on('backrooms:voice-ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
  try { await _session?.addIceCandidate(from, candidate); } catch { /* ignore */ }
});
(socket as any).on('backrooms:voice-peer-left', ({ socketId }: { socketId: string }) => {
  if (!_session) return;
  _session.removePeer(socketId);
  const next = new Set(_state.speakingIds); next.delete(socketId);
  _patch({ speakingIds: next });
});
(socket as any).on('disconnect', () => { if (_session) { _session.destroy(); _spatial?.dispose(); _spatial = null; _reset(); } });

export function useBackroomsVoice() {
  const [state, setState] = useState<BackroomsVoiceState>({ ..._state });
  useEffect(() => { _subs.add(setState); setState({ ..._state }); return () => { _subs.delete(setState); }; }, []);
  const joinVoice = useCallback(() => { _join(); }, []);
  const leaveVoice = useCallback(() => { _leave(); }, []);
  const toggleMute = useCallback(() => {
    if (!_session) return;
    const nowMuted = !_state.muted;
    _session.setMuted(nowMuted);
    _patch({ muted: nowMuted });
  }, []);
  return { ...state, joinVoice, leaveVoice, toggleMute };
}

export function leaveBackroomsVoice(): void { _leave(); }

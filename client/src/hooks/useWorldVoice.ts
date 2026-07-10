import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, type ConnectionState, log } from '@/services/webrtcService';
import { BackroomsSpatial, type SpatialListener, type SpatialPeer } from '@/components/backrooms/spatialAudio';

// ── Premium Worlds spatial voice ───────────────────────────────────────
// A dedicated WebRTC-mesh voice session per world on the `world:voice-*`
// channel (own namespace so it never collides with Space / Backrooms voice).
// Remote audio is spatialised by the shared BackroomsSpatial spatializer,
// driven each tick from the world loop via applyWorldSpatial().

export interface WorldVoiceState { joined: boolean; muted: boolean; status: ConnectionState; speakingIds: Set<string>; error: string | null; }
const INITIAL: WorldVoiceState = { joined: false, muted: false, status: 'disconnected', speakingIds: new Set(), error: null };

let _session: WebRTCSession | null = null;
let _spatial: BackroomsSpatial | null = null;
let _state: WorldVoiceState = { ...INITIAL, speakingIds: new Set() };
const _subs = new Set<(s: WorldVoiceState) => void>();
let _joining = false;

function _patch(p: Partial<WorldVoiceState>) { _state = { ..._state, ...p }; for (const s of _subs) s({ ..._state }); }
function _reset() { _state = { ...INITIAL, speakingIds: new Set() }; _session = null; _joining = false; for (const s of _subs) s({ ..._state }); }

async function _join(retriesLeft = 4): Promise<void> {
  if (_session || _joining) { _spatial?.resume(); return; }
  _joining = true;
  const session = new WebRTCSession();
  _session = session;
  _spatial = new BackroomsSpatial(session);
  session.subscribe(ev => {
    if (!_session || _session !== session) return;
    if (ev.type === 'state') _patch({ status: ev.state });
    else if (ev.type === 'speaking') { const n = new Set(_state.speakingIds); if (ev.isSpeaking) n.add(ev.socketId); else n.delete(ev.socketId); _patch({ speakingIds: n }); }
    else if (ev.type === 'error') _patch({ error: ev.message });
  });
  try { await session.requestMedia(true, false, false); }
  catch { session.destroy(); _session = null; _joining = false; _spatial?.dispose(); _spatial = null; _patch({ status: 'failed', error: 'მიკროფონზე წვდომა უარყოფილია.' }); return; }
  (socket as any).emit('world:voice-join', {}, async (res: any) => {
    if (!_session || _session !== session) { _joining = false; return; }
    if (!res?.ok) {
      // Race: the auto-join can fire before `world:join` has registered us in
      // the world on the server. Retry a few times before giving up.
      if (retriesLeft > 0 && /not in a world/i.test(String(res?.error ?? ''))) {
        session.destroy(); _session = null; _joining = false; _spatial?.dispose(); _spatial = null;
        setTimeout(() => { _join(retriesLeft - 1); }, 600);
        return;
      }
      session.destroy(); _session = null; _joining = false; _spatial?.dispose(); _spatial = null;
      _patch({ status: 'failed', error: res?.error ?? 'ხმა ვერ დაუკავშირდა.' });
      return;
    }
    _joining = false;
    const { peers, iceServers, iceTransportPolicy } = res.data;
    if (iceServers) session.setIceConfig({ iceServers, iceTransportPolicy, iceCandidatePoolSize: 10 } as any);
    _patch({ joined: true, error: null });
    _spatial?.resume();
    for (const { socketId, name } of (peers as Array<{ socketId: string; name: string }>)) {
      session.createPeerConnection(socketId, name, (c) => (socket as any).emit('world:voice-ice', { to: socketId, candidate: c }));
      try { const offer = await session.createOffer(socketId); (socket as any).emit('world:voice-offer', { to: socketId, sdp: offer }); }
      catch (e: any) { log('world voice offer failed', socketId, e?.message); }
    }
  });
}

/**
 * Resume the spatial AudioContext from a user gesture. Remote voice is routed
 * through a Web-Audio graph whose context starts SUSPENDED under browser
 * autoplay policy (the world auto-joins voice without a tap). Call this on any
 * tap so the context resumes and spatial audio (or at minimum audible voice)
 * kicks in — otherwise players hear silence even though the mesh is connected.
 */
export function resumeWorldVoiceAudio(): void { _spatial?.resume(); }

function _leave(): void {
  if (!_session && !_joining) return;
  (socket as any).emit('world:voice-leave');
  _session?.destroy();
  _spatial?.dispose(); _spatial = null;
  _reset();
}

export function applyWorldSpatial(listener: SpatialListener, peers: SpatialPeer[]): void { _spatial?.update(listener, peers); }

(socket as any).on('world:voice-peer-joined', ({ socketId, name }: { socketId: string; name: string }) => {
  const s = _session; if (!s) return;
  s.removePeer(socketId);
  s.createPeerConnection(socketId, name, (c) => (socket as any).emit('world:voice-ice', { to: socketId, candidate: c }));
});
(socket as any).on('world:voice-offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const s = _session; if (!s) return;
  try { const nm = s.getPeers().find(p => p.socketId === from)?.name ?? 'Guest'; const ans = await s.handleOffer(from, nm, sdp, (c) => (socket as any).emit('world:voice-ice', { to: from, candidate: c })); (socket as any).emit('world:voice-answer', { to: from, sdp: ans }); }
  catch (e: any) { log('world voice offer handling failed', e?.message); }
});
(socket as any).on('world:voice-answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => { try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('world voice answer failed', e?.message); } });
(socket as any).on('world:voice-ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => { try { await _session?.addIceCandidate(from, candidate); } catch { /* ignore */ } });
(socket as any).on('world:voice-peer-left', ({ socketId }: { socketId: string }) => { if (!_session) return; _session.removePeer(socketId); const n = new Set(_state.speakingIds); n.delete(socketId); _patch({ speakingIds: n }); });
(socket as any).on('disconnect', () => { if (_session) { _session.destroy(); _spatial?.dispose(); _spatial = null; _reset(); } });

export function useWorldVoice() {
  const [state, setState] = useState<WorldVoiceState>({ ..._state });
  useEffect(() => { _subs.add(setState); setState({ ..._state }); return () => { _subs.delete(setState); }; }, []);
  const joinVoice = useCallback(() => { _join(); }, []);
  const leaveVoice = useCallback(() => { _leave(); }, []);
  const toggleMute = useCallback(() => { if (!_session) return; const m = !_state.muted; _session.setMuted(m); _patch({ muted: m }); }, []);
  return { ...state, joinVoice, leaveVoice, toggleMute };
}
export function leaveWorldVoice(): void { _leave(); }

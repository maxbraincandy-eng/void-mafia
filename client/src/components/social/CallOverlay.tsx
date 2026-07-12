import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { useCallStore } from '@/store/callStore';
import { useT } from '@/store/langStore';
import {
  joinLiveKitVoice, leaveLiveKitVoice, startLiveKitAudio,
  toggleLiveKitMic, toggleLiveKitCamera, setLiveKitCamera,
  subscribeLiveKit, getLiveKitState, getLiveKitRemoteVideo, getLiveKitLocalVideo,
} from '@/services/livekitVoice';

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Ringtone (WebAudio, no asset) ──────────────────────────────────────
let _ringCtx: AudioContext | null = null;
let _ringTimer: number | null = null;
function startRingtone() {
  stopRingtone();
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    _ringCtx = _ringCtx || new Ctx();
    const ctx = _ringCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const beep = () => {
      if (!_ringCtx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 480;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
    };
    beep();
    _ringTimer = window.setInterval(beep, 2400);
  } catch { /* ignore */ }
}
function stopRingtone() {
  if (_ringTimer !== null) { clearInterval(_ringTimer); _ringTimer = null; }
}

// ── Remote / local video tiles ─────────────────────────────────────────
function VideoTile({ stream, mirror, className }: { stream: MediaStream | null; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={className}
      style={{ transform: mirror ? 'scaleX(-1)' : undefined, objectFit: 'cover' }}
    />
  );
}

export function CallOverlay() {
  const t = useT();
  const myId = useAuthStore(s => s.profile?.id ?? null);
  const addToast = useGameStore(s => s.addToast);
  const { status, roomId, conversationId, peer, video, startIncoming, setRoomId, markConnected, reset } = useCallStore();

  // Re-render on LiveKit state changes (mic / camera / remote tracks).
  const [, force] = useState(0);
  useEffect(() => subscribeLiveKit(() => force(n => n + 1)), []);
  const lk = getLiveKitState();

  const invitedRef = useRef(false);
  const wasCallerRef = useRef(false);
  const connectedRef = useRef(false);
  const loggedRef = useRef(false);
  const durationRef = useRef(0);
  const [callSecs, setCallSecs] = useState(0);

  // ── Log the finished call as a DM (only the caller reports the outcome) ──
  const logCall = useCallback((logStatus: 'completed' | 'missed' | 'declined') => {
    if (!wasCallerRef.current || loggedRef.current) return;
    const st = useCallStore.getState();
    if (!st.conversationId) return;
    loggedRef.current = true;
    socket.emit('dm:call_log' as any, {
      conversationId: st.conversationId,
      kind: st.video ? 'video' : 'audio',
      status: logStatus,
      duration: logStatus === 'completed' ? durationRef.current : 0,
    });
  }, []);

  // ── End the call locally (and free media) ──
  const endLocal = useCallback(() => {
    stopRingtone();
    invitedRef.current = false;
    wasCallerRef.current = false;
    connectedRef.current = false;
    loggedRef.current = false;
    durationRef.current = 0;
    leaveLiveKitVoice().catch(() => {});
    reset();
  }, [reset]);

  // ── Join media once both sides agreed ──
  const beginConnected = useCallback(async (rid: string, wantVideo: boolean) => {
    if (!myId) return;
    stopRingtone();
    try {
      await joinLiveKitVoice(myId, rid, { alive: true });
      await startLiveKitAudio().catch(() => {});
      if (wantVideo) await setLiveKitCamera(true).catch(() => {});
      connectedRef.current = true;
      markConnected();
    } catch {
      addToast(t.dmPanel.callEnded, 'error');
      endLocal();
    }
  }, [myId, markConnected, addToast, t, endLocal]);

  // ── Outgoing: fire the invite once ──
  useEffect(() => {
    if (status !== 'outgoing' || invitedRef.current || !conversationId) return;
    invitedRef.current = true;
    wasCallerRef.current = true;
    startRingtone();
    emitWithAck<{ conversationId: string; video: boolean }, Res<{ roomId: string }>>(
      'dm:call_invite', { conversationId, video },
    ).then(res => {
      if (useCallStore.getState().status !== 'outgoing') return; // cancelled meanwhile
      if (res.ok) setRoomId(res.data.roomId);
      else { addToast(res.error === 'User is offline.' ? t.dmPanel.callOffline : res.error, 'error'); endLocal(); }
    }).catch(() => { addToast(t.dmPanel.callOffline, 'error'); endLocal(); });
  }, [status, conversationId, video, setRoomId, addToast, t, endLocal]);

  // ── Incoming ring plays a tone ──
  useEffect(() => {
    if (status === 'incoming') { startRingtone(); navigator.vibrate?.([300, 200, 300]); }
    else if (status === 'connected' || status === 'idle') stopRingtone();
  }, [status]);

  // ── Call duration timer ──
  useEffect(() => {
    if (status !== 'connected') { setCallSecs(0); return; }
    const id = window.setInterval(() => setCallSecs(s => { durationRef.current = s + 1; return s + 1; }), 1000);
    return () => clearInterval(id);
  }, [status]);

  // ── Socket signaling listeners (mounted once) ──
  useEffect(() => {
    const onRing = (p: {
      roomId: string; conversationId: string; video: boolean;
      fromProfileId: string; fromUsername: string; fromAvatar: string; fromAvatarUrl: string | null;
    }) => {
      // Already busy in another call → auto-decline.
      if (useCallStore.getState().status !== 'idle') {
        socket.emit('dm:call_answer' as any, { conversationId: p.conversationId, roomId: p.roomId, accept: false });
        return;
      }
      startIncoming({
        peer: { profileId: p.fromProfileId, username: p.fromUsername, avatar: p.fromAvatar, avatarUrl: p.fromAvatarUrl },
        conversationId: p.conversationId,
        roomId: p.roomId,
        video: p.video,
      });
    };
    const onAnswered = (p: { roomId: string; accept: boolean }) => {
      const st = useCallStore.getState();
      if (st.status !== 'outgoing' || st.roomId !== p.roomId) return;
      if (p.accept) beginConnected(p.roomId, st.video);
      else { addToast(t.dmPanel.callDeclined, 'info'); logCall('declined'); endLocal(); }
    };
    const onClosed = (p: { roomId: string }) => {
      const st = useCallStore.getState();
      if (st.roomId && st.roomId !== p.roomId) return;
      if (connectedRef.current) logCall('completed');
      endLocal();
    };
    socket.on('dm:call_ring' as any, onRing);
    socket.on('dm:call_answered' as any, onAnswered);
    socket.on('dm:call_closed' as any, onClosed);
    return () => {
      socket.off('dm:call_ring' as any, onRing);
      socket.off('dm:call_answered' as any, onAnswered);
      socket.off('dm:call_closed' as any, onClosed);
    };
  }, [startIncoming, beginConnected, endLocal, addToast, t, logCall]);

  // ── Button actions ──
  const accept = () => {
    if (!roomId || !conversationId) return;
    socket.emit('dm:call_answer' as any, { conversationId, roomId, accept: true });
    beginConnected(roomId, video);
  };
  const decline = () => {
    if (conversationId && roomId) socket.emit('dm:call_answer' as any, { conversationId, roomId, accept: false });
    endLocal();
  };
  const hangup = () => {
    if (connectedRef.current) logCall('completed');
    else if (wasCallerRef.current) logCall('missed'); // caller canceled while ringing
    if (conversationId && roomId) socket.emit('dm:call_close' as any, { conversationId, roomId });
    endLocal();
  };

  if (status === 'idle' || !peer) return null;

  // Remote video (the peer keyed by their profileId; fall back to first entry).
  const remoteMap = getLiveKitRemoteVideo();
  const remoteStream = remoteMap.get(peer.profileId) ?? (remoteMap.size ? [...remoteMap.values()][0] : null);
  const localStream = getLiveKitLocalVideo();
  const showRemoteVideo = status === 'connected' && !!remoteStream;
  const showLocalVideo = status === 'connected' && lk.cameraOn && !!localStream;

  const mmss = `${Math.floor(callSecs / 60)}:${String(callSecs % 60).padStart(2, '0')}`;
  const statusText =
    status === 'outgoing' ? t.dmPanel.callCalling
    : status === 'incoming' ? (video ? t.dmPanel.callIncomingVideo : t.dmPanel.callIncoming)
    : lk.status === 'connecting' ? t.dmPanel.callConnecting
    : mmss;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="call"
        className="fixed inset-0 z-[400] flex flex-col items-center justify-between"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 25%, rgba(40,10,70,0.98), rgba(4,2,12,0.99))' }}
      >
        {/* Remote video fills the background when connected + video */}
        {showRemoteVideo && (
          <VideoTile stream={remoteStream} className="absolute inset-0 w-full h-full" />
        )}
        {showRemoteVideo && <div className="absolute inset-0 bg-black/25" />}

        {/* Local self-view PIP */}
        {showLocalVideo && (
          <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] right-4 w-28 h-40 rounded-2xl overflow-hidden border border-white/15 shadow-2xl z-10">
            <VideoTile stream={localStream} mirror className="w-full h-full" />
          </div>
        )}

        {/* Peer identity */}
        <div className="relative flex flex-col items-center gap-4 pt-[calc(env(safe-area-inset-top,0px)+60px)]">
          {!showRemoteVideo && (
            <div
              className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center text-5xl shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)', boxShadow: '0 0 60px rgba(155,0,255,0.4)' }}
            >
              {peer.avatarUrl
                ? <img src={peer.avatarUrl} alt={peer.username} className="w-full h-full object-cover" />
                : <span>{peer.avatar}</span>}
            </div>
          )}
          <div className="text-center">
            <p className="font-display font-bold text-2xl text-white tracking-wide drop-shadow-lg">{peer.username}</p>
            <p className="font-mono text-sm text-white/60 mt-1 flex items-center justify-center gap-2">
              {(status === 'outgoing' || status === 'incoming') && (
                <span className="inline-block w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
              )}
              {statusText}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="relative flex flex-col items-center gap-5 pb-[calc(env(safe-area-inset-bottom,0px)+48px)]">
          {status === 'connected' && (
            <div className="flex items-center gap-5">
              {/* Mute mic */}
              <button
                onClick={() => toggleLiveKitMic()}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: lk.micEnabled ? 'rgba(255,255,255,0.10)' : 'rgba(255,60,60,0.85)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
                title={lk.micEnabled ? 'Mute' : 'Unmute'}
              >
                {lk.micEnabled ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                )}
              </button>

              {/* Toggle camera */}
              <button
                onClick={() => toggleLiveKitCamera()}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: lk.cameraOn ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
                title={lk.cameraOn ? 'Camera off' : 'Camera on'}
              >
                {lk.cameraOn ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h4a2 2 0 0 1 2 2v2l4-3v9" /><line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Primary row: accept/decline (incoming) or hang up */}
          {status === 'incoming' ? (
            <div className="flex items-center gap-16">
              <button onClick={decline} className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full flex items-center justify-center bg-neon-red active:scale-90 transition-all" style={{ boxShadow: '0 0 30px rgba(255,40,60,0.5)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                </span>
                <span className="font-mono text-xs text-white/70">{t.dmPanel.callDecline}</span>
              </button>
              <button onClick={accept} className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full flex items-center justify-center bg-neon-green active:scale-90 transition-all" style={{ boxShadow: '0 0 30px rgba(40,255,120,0.5)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#04120a"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                </span>
                <span className="font-mono text-xs text-white/70">{t.dmPanel.callAccept}</span>
              </button>
            </div>
          ) : (
            <button onClick={hangup} className="flex flex-col items-center gap-2">
              <span className="w-16 h-16 rounded-full flex items-center justify-center bg-neon-red active:scale-90 transition-all" style={{ boxShadow: '0 0 30px rgba(255,40,60,0.5)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" style={{ transform: 'rotate(135deg)' }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              </span>
              <span className="font-mono text-xs text-white/70">{t.dmPanel.callEnd}</span>
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

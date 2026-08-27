/**
 * Watching somebody's broadcast.
 *
 * The same screen the host sees, with the controls swapped: they get a mic and
 * an end button, a viewer gets a comment box and a heart. Both are built from
 * `LiveStage` for that reason — two implementations of one screen is how the
 * comment overlay ends up in a different place depending on who you are.
 *
 * LEAVING IS TOLD, NOT INFERRED
 * ─────────────────────────────
 * The viewer count is what a host is watching while they talk, so it has to
 * fall when somebody goes. Closing this tells the server; closing the tab is
 * caught by the disconnect handler. Both matter — a count that only ever goes
 * up is worse than no count at all.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useLivekitRoomVoice, useLiveKitGate } from '@/hooks/useLivekitVoice';
import { getLiveKitRemoteVideo } from '@/services/livekitVoice';
import type { LiveSession, LiveComment } from '@/types/live';
import { LiveStage, LiveComments, HeartBurst, useHearts } from './LiveStage';

const RED = '#ff2d55';

export function LiveViewer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const { enabled: lkEnabled } = useLiveKitGate();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [viewers, setViewers] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [draft, setDraft] = useState('');
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { hearts, burst } = useHearts();

  // Join once, and tell the server when we go.
  useEffect(() => {
    socket.emit('live:join' as any, { sessionId }, (res: any) => {
      if (!res?.ok) { setError(res?.error ?? 'ეთერი ვერ მოიძებნა'); return; }
      setSession(res.data);
      setViewers(res.data.viewers ?? 0);
    });
    return () => { socket.emit('live:leave' as any, { sessionId }, () => {}); };
  }, [sessionId]);

  useLivekitRoomVoice({
    roomId: session ? session.room : null,
    identity: myId || null,
    active: lkEnabled && !!session && !ended,
    // A viewer listens. The host is the only publisher in the room.
    listenOnly: true,
  });

  // The host's video, out of the LiveKit subscription map.
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => {
      setStream(getLiveKitRemoteVideo().get(session.hostId) ?? null);
    }, 500);
    return () => clearInterval(tick);
  }, [session?.hostId]);

  useEffect(() => {
    const onViewers = (d: any) => { if (d?.sessionId === sessionId) setViewers(d.viewers ?? 0); };
    const onComment = (d: any) => {
      if (d?.sessionId !== sessionId) return;
      setComments(c => [...c.slice(-40), { id: `${d.userId}_${d.at}`, userId: d.userId, name: d.name, text: d.text, at: d.at }]);
    };
    const onHeart = (d: any) => { if (d?.sessionId === sessionId) burst(); };
    const onEnded = (d: any) => { if (d?.sessionId === sessionId) setEnded(true); };
    socket.on('live:viewers' as any, onViewers);
    socket.on('live:comment' as any, onComment);
    socket.on('live:hearted' as any, onHeart);
    socket.on('live:ended' as any, onEnded);
    return () => {
      socket.off('live:viewers' as any, onViewers);
      socket.off('live:comment' as any, onComment);
      socket.off('live:hearted' as any, onHeart);
      socket.off('live:ended' as any, onEnded);
    };
  }, [sessionId, burst]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    socket.emit('live:comment' as any, { sessionId, text });
    setDraft('');
  };

  const heart = () => {
    burst();                                     // yours shows instantly
    socket.emit('live:heart' as any, { sessionId });
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[700] flex flex-col" style={{ background: '#05030c' }}>

      <LiveStage stream={stream} />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="px-2 py-1 rounded-lg font-mono font-bold text-[11px] text-white" style={{ background: RED }}>LIVE</span>
          <span className="px-2 py-1 rounded-lg font-mono text-[11px] text-white"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.14)' }}>👁 {viewers}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-white text-[13px] truncate">{session?.hostName ?? ''}</span>
            <span className="block font-mono text-[10.5px] text-white/50 truncate">{session?.title ?? ''}</span>
          </span>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
        </div>

        {error && <p className="mx-auto mt-6 font-mono text-[12px]" style={{ color: '#ff8a92' }}>{error}</p>}

        <div className="mt-auto">
          <LiveComments comments={comments} />
          <div className="flex items-center gap-2 px-4 pb-6 pt-3">
            <input
              value={draft} onChange={e => setDraft(e.target.value.slice(0, 200))}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="დაწერე კომენტარი…"
              disabled={ended}
              className="flex-1 min-w-0 rounded-full px-4 py-2.5 font-mono text-[12px] text-white outline-none disabled:opacity-40"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}
            />
            <button onClick={heart} disabled={ended}
              className="w-11 h-11 rounded-full flex items-center justify-center text-[19px] flex-shrink-0 transition-transform active:scale-90 disabled:opacity-40"
              style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${RED}66` }}>❤️</button>
          </div>
        </div>

        <HeartBurst hearts={hearts} />
      </div>

      {/* The host stopped. Say so rather than leaving a frozen last frame. */}
      <AnimatePresence>
        {ended && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-[705] flex flex-col items-center justify-center px-8 text-center"
            style={{ background: 'rgba(5,3,12,0.92)' }}>
            <p className="text-5xl mb-3">📡</p>
            <p className="font-display font-black text-white" style={{ fontSize: 21 }}>ეთერი დასრულდა</p>
            <p className="font-mono text-[12px] text-white/45 mt-1.5">{session?.hostName ?? ''}</p>
            <button onClick={onClose} className="mt-7 px-8 py-3 rounded-2xl font-display font-bold text-white text-[14px]"
              style={{ background: RED }}>დახურვა</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

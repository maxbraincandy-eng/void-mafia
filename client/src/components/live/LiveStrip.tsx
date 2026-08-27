/**
 * Who is on air right now.
 *
 * WHY THIS HAD TO EXIST
 * ─────────────────────
 * The LIVE ring on an avatar only appears where an avatar appears — and in the
 * feed that is post authors. So somebody broadcasting who had not also posted
 * was invisible: the badge worked and there was nothing to put it on. A live
 * badge with no surface listing live people is half a feature.
 *
 * This is that surface, and it goes above the stories row for the same reason
 * every other product puts it there: a broadcast is happening now and a story
 * happened earlier, so the thing with a clock on it goes first.
 *
 * YOUR OWN BROADCAST IS THE FIRST TILE
 * ────────────────────────────────────
 * Going live on a phone and then opening the app on a laptop should show you
 * that you are live, with a way back into it. Without that the honest question
 * "am I actually broadcasting?" has no answer anywhere in the app, which is the
 * one thing a host most needs to know.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useLiveStore } from '@/store/liveStore';
import type { LiveSession } from '@/types/live';

const RED = '#ff2d55';

export function LiveStrip({ onWatch, onResume }: {
  onWatch: (sessionId: string) => void;
  /** Your own session — reopens the broadcast screen rather than the viewer. */
  onResume: (session: LiveSession) => void;
}) {
  const myId = useAuthStore(s => s.profile?.id) ?? '';
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const setLive = useLiveStore(s => s.setLive);

  const load = useCallback(() => {
    socket.emit('live:list' as any, {}, (res: any) => {
      if (!res?.ok) return;
      const list: LiveSession[] = res.data ?? [];
      setSessions(list);
      // The strip and the rings agree by construction: everything the list
      // knows is pushed into the store the avatars read from.
      for (const s of list) setLive(s.hostId, { sessionId: s.id, title: s.title, viewers: s.viewers });
    });
  }, [setLive]);

  useEffect(() => {
    load();
    /*
     * Sockets carry the changes; this is the floor under them.
     *
     * A client that was backgrounded through `live:started` would otherwise sit
     * on an empty strip until something else happened to re-render it — and
     * "nothing is live" is exactly the wrong thing to be confidently wrong
     * about on the screen that exists to answer that question.
     */
    const t = setInterval(load, 30_000);
    const onChange = () => load();
    socket.on('live:started' as any, onChange);
    socket.on('live:stopped' as any, onChange);
    return () => {
      clearInterval(t);
      socket.off('live:started' as any, onChange);
      socket.off('live:stopped' as any, onChange);
    };
  }, [load]);

  if (sessions.length === 0) return null;

  // Yours first, so "am I live?" is answered before anything else.
  const mine = sessions.find(s => s.hostId === myId) ?? null;
  const others = sessions.filter(s => s.hostId !== myId);
  const ordered = mine ? [mine, ...others] : others;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <LiveDot />
        <p className="font-mono text-[10.5px] tracking-wide" style={{ color: RED }}>
          პირდაპირ ეთერში · {sessions.length}
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <AnimatePresence initial={false}>
          {ordered.map(s => {
            const isMine = s.hostId === myId;
            return (
              <motion.button
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => (isMine ? onResume(s) : onWatch(s.id))}
                className="flex flex-col items-center flex-shrink-0"
                style={{ width: 68, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <span style={{
                  position: 'relative', display: 'inline-flex', borderRadius: '50%', padding: 3,
                  background: 'conic-gradient(from 210deg, #ff2d55, #ff6b6b, #ff2d55)',
                  animation: 'liveRingPulse 1.8s ease-in-out infinite',
                }}>
                  <span style={{ borderRadius: '50%', padding: 1.5, background: '#0d0a1a', display: 'inline-flex' }}>
                    <span style={{
                      width: 54, height: 54, borderRadius: '50%', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                      background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
                    }}>
                      {s.hostAvatarUrl
                        ? <img src={s.hostAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : s.hostAvatar}
                    </span>
                  </span>
                  <span style={{
                    position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                    background: RED, color: '#fff', fontFamily: 'monospace', fontWeight: 700,
                    fontSize: 8.5, lineHeight: 1, padding: '2px 5px', borderRadius: 999,
                    border: '1px solid rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
                  }}>{isMine ? 'შენ' : 'LIVE'}</span>
                </span>

                <span className="font-mono text-[10px] mt-2 truncate w-full text-center"
                  style={{ color: isMine ? RED : 'rgba(255,255,255,0.6)' }}>
                  {isMine ? 'შენი ეთერი' : s.hostName}
                </span>
                <span className="font-mono text-[9px] text-white/30">👁 {s.viewers}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The broadcast mark.
 *
 * Drawn rather than the 📡 emoji it replaced: that emoji is a different picture
 * on every platform, sits off-centre in a round button, and at this size reads
 * as a grey smudge. Two arcs and a dot is unmistakably "on air" at 14px and
 * inherits the colour it is given.
 */
export function LiveDot({ size = 13, color = RED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }} aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill={color} />
      <path d="M6.6 6.6a7.6 7.6 0 0 0 0 10.8M17.4 6.6a7.6 7.6 0 0 1 0 10.8"
        stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 3.2a12.4 12.4 0 0 0 0 17.6M20.8 3.2a12.4 12.4 0 0 1 0 17.6"
        stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

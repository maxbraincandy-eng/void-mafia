/**
 * The pieces a live screen is made of — shared by the host's view and a
 * viewer's, because they are the same screen with different controls.
 */

import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LiveComment } from '@/types/live';

/**
 * The picture, full bleed.
 *
 * `object-cover` rather than contain: a broadcast fills the screen the way a
 * story does, and letterboxing a phone camera inside a phone screen wastes the
 * only thing anybody came to look at.
 */
export function LiveStage({ stream, mirror, muted, videoRef }: {
  stream: MediaStream | null;
  mirror?: boolean;
  /** A viewer turning their own speaker down. Never told to the server. */
  muted?: boolean;
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
}) {
  const own = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? own;
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [stream]);

  return (
    <div className="absolute inset-0" style={{ background: '#05030c' }}>
      {stream
        // The mirror is your own camera coming back at you: muting it is not a
        // choice, it is the only thing standing between the host and feedback.
        ? <video ref={ref} autoPlay playsInline muted={mirror || muted}
            className="absolute inset-0 w-full h-full object-cover"
            style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
        : <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-[12px] text-white/25 animate-pulse">კამერა…</p>
          </div>}
      {/* A wash top and bottom so white text survives a bright frame. */}
      <div className="absolute inset-x-0 top-0 h-28 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-52 pointer-events-none"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.7), transparent)' }} />
    </div>
  );
}

/**
 * The comment overlay.
 *
 * Bottom third, oldest fading out at the top — the shape everybody already
 * knows from every other live product, and the reason it works is that the
 * newest line is nearest the thumb and the video stays visible behind it.
 *
 * Only the last handful are kept. A scrollback would invite reading rather than
 * watching, and a live chat nobody can scroll is the correct live chat.
 */
export function LiveComments({ comments }: { comments: LiveComment[] }) {
  const shown = comments.slice(-6);
  return (
    <div className="px-4" style={{ maxHeight: '34dvh', overflow: 'hidden' }}>
      <AnimatePresence initial={false}>
        {shown.map((c, i) => (
          <motion.div key={c.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: c.pending ? 0.55 : i === shown.length - 1 ? 1 : 0.45 + i * 0.09 }}
            exit={{ opacity: 0 }}
            className="mb-1.5 flex items-start gap-1.5"
          >
            <CommentFace comment={c} />
            <span className="inline-block rounded-2xl px-2.5 py-1.5 max-w-full"
              style={{
                background: c.isHost ? 'rgba(255,45,85,0.26)' : 'rgba(0,0,0,0.42)',
                border: c.isHost ? '1px solid rgba(255,45,85,0.5)' : '1px solid transparent',
                backdropFilter: 'blur(4px)',
              }}>
              <span className="font-mono text-[11px]" style={{ color: c.isHost ? '#ffd0da' : '#ff9fb4' }}>
                {c.name}{c.isHost ? ' ·' : ''}
              </span>
              <span className="font-mono text-[12px] text-white/90 ml-1.5">{c.text}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * The face beside a comment.
 *
 * Names alone are a wall of pink text at speed — two people called "მაქსი" are
 * indistinguishable, and a chat you cannot follow is a chat nobody reads.
 */
function CommentFace({ comment: c }: { comment: LiveComment }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
      background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
      border: c.isHost ? '1px solid rgba(255,45,85,0.8)' : '1px solid rgba(255,255,255,0.18)',
    }}>
      {c.avatarUrl
        ? <img src={c.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (c.avatar || c.name.slice(0, 1))}
    </span>
  );
}

/**
 * One number in the top bar.
 *
 * Tappable when there is something behind it — the viewer count opens the list
 * of who is actually there, which is the other half of the question a host is
 * asking when they glance at it.
 */
export function LiveStat({ icon, value, onClick, tint }: {
  icon: string; value: number | string; onClick?: () => void; tint?: string;
}) {
  const Tag: any = onClick ? 'button' : 'span';
  return (
    <Tag onClick={onClick}
      className="px-2 py-1 rounded-lg font-mono text-[11px] text-white flex-shrink-0 flex items-center gap-1"
      style={{
        background: 'rgba(0,0,0,0.5)',
        border: `1px solid ${tint ?? 'rgba(255,255,255,0.14)'}`,
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <span>{icon}</span><span>{value}</span>
    </Tag>
  );
}

/**
 * Hearts rising.
 *
 * Purely local. A reaction is broadcast as "somebody tapped", and every client
 * draws its own — sending the coordinates of a floating heart would be a packet
 * per tap per viewer for something nobody can tell apart.
 */
export function useHearts() {
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const next = useRef(0);
  const burst = useCallback(() => {
    const id = next.current++;
    setHearts(h => [...h.slice(-14), { id, x: 8 + Math.random() * 34 }]);
    setTimeout(() => setHearts(h => h.filter(x => x.id !== id)), 2400);
  }, []);
  return { hearts, burst };
}

export function HeartBurst({ hearts }: { hearts: { id: number; x: number }[] }) {
  return (
    <div className="absolute bottom-24 right-3 pointer-events-none" style={{ width: 60, height: '46dvh' }}>
      <AnimatePresence>
        {hearts.map(h => (
          <motion.span key={h.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -260, scale: [0.6, 1.15, 1, 0.9], x: [0, h.x - 20, h.x - 34] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.3, ease: 'easeOut' }}
            className="absolute bottom-0"
            style={{ right: h.x, fontSize: 26 }}
          >❤️</motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

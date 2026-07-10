import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { useSocialStore } from '@/store/socialStore';
import { tNow } from '@/store/langStore';

interface ActivePing { kind: 'game' | 'lounge'; code: string; label: string; fromName: string; fromId: string }

/**
 * Lightweight, non-blocking toast: "<friend> is now playing / in a lounge — Join?".
 * Distinct from the strict invite overlays — this is informational, dismissable,
 * auto-hides after ~9s. Tapping Join drops you into their room/lounge.
 */
export function FriendActiveToast() {
  const [ping, setPing] = useState<ActivePing | null>(null);

  useEffect(() => {
    const onPing = (data: ActivePing) => setPing(data);
    (socket as any).on('presence:friend_active', onPing);
    return () => { (socket as any).off('presence:friend_active', onPing); };
  }, []);

  useEffect(() => {
    if (!ping) return;
    const t = setTimeout(() => setPing(null), 9000);
    return () => clearTimeout(t);
  }, [ping]);

  if (!ping) return null;

  const join = () => {
    const p = ping;
    setPing(null);
    if (p.kind === 'lounge') {
      useSocialStore.getState().requestJoinLounge(p.code);
    } else {
      const name = useAuthStore.getState().profile?.username ?? 'Player';
      useGameStore.getState().joinRoom(p.code, name).catch(() => {});
    }
  };

  const accent = ping.kind === 'lounge' ? '#c084fc' : '#00f5ff';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={ping.fromId + ping.code}
        initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        style={{ position: 'fixed', top: 'calc(12px + env(safe-area-inset-top,0px))', left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', zIndex: 2800, width: 'min(360px, calc(100vw - 24px))', background: 'rgba(10,4,26,0.98)', backdropFilter: 'blur(18px)', border: `1px solid ${accent}55`, borderRadius: 16, padding: '11px 13px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <div style={{ fontSize: 22, flexShrink: 0 }}>{ping.kind === 'lounge' ? '🎬' : '🎮'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b>{ping.fromName}</b> {ping.kind === 'lounge' ? `· ${ping.label}` : 'created a room'}
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{ping.kind === 'lounge' ? tNow().misc.inLounge : 'Mafia'}</p>
        </div>
        <button onClick={join}
          style={{ padding: '7px 13px', borderRadius: 11, fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: `${accent}22`, border: `1px solid ${accent}66`, color: accent, cursor: 'pointer', flexShrink: 0 }}>→ Join</button>
        <button onClick={() => setPing(null)}
          style={{ padding: '7px 9px', borderRadius: 11, fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

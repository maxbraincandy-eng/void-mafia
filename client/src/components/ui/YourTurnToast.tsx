import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCheckersStore } from '@/store/checkersStore';
import { useLudoStore } from '@/store/ludoStore';
import { useJokerStore } from '@/store/jokerStore';
import { useUnoStore } from '@/store/unoStore';
import { haptic } from '@/lib/haptics';
import { tNow } from '@/store/langStore';

function useIsMyTurn(): { myTurn: boolean; game: string } {
  const ck = useCheckersStore(s => s.match);
  const ld = useLudoStore(s => s.match);
  const jk = useJokerStore(s => s.match);
  const un = useUnoStore(s => s.match);

  if (ck && ck.status === 'active' && ck.myColor && ck.myColor !== 'spectator' && ck.currentTurn === ck.myColor)
    return { myTurn: true, game: `♟ ${tNow().gamePanels.checkers}` };

  if (ld && ld.status === 'active' && ld.myColor && ld.myColor !== 'spectator' && ld.currentTurn === ld.myColor && !ld.diceRolled)
    return { myTurn: true, game: '🎲 Ludo' };

  if (jk && jk.status === 'playing' && jk.mySeatIndex !== null && jk.currentPlaySeat === jk.mySeatIndex)
    return { myTurn: true, game: '🃏 Joker' };

  if (un && un.status === 'active' && un.myUserId && un.currentPlayerId === un.myUserId)
    return { myTurn: true, game: '🎴 UNO' };

  return { myTurn: false, game: '' };
}

export function YourTurnToast() {
  const { myTurn, game } = useIsMyTurn();
  const [visible, setVisible] = useState(false);
  const prevTurn = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (myTurn && !prevTurn.current) {
      // Just became my turn
      haptic('success');
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 2800);
    }
    prevTurn.current = myTurn;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [myTurn]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -60, opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
        >
          <div
            className="mx-4 px-5 py-3 rounded-2xl flex items-center gap-3"
            style={{
              background: 'rgba(0,229,255,0.12)',
              border: '1px solid rgba(0,229,255,0.45)',
              boxShadow: '0 4px 24px rgba(0,229,255,0.2), 0 0 0 1px rgba(0,229,255,0.08)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <span className="text-xl">⚡</span>
            <div>
              <p className="font-display font-bold text-neon-cyan text-sm tracking-wide leading-tight whitespace-nowrap">
                {tNow().gamePanels.yourTurn}
              </p>
              <p className="font-mono text-[12px] text-white/40 leading-tight">{game}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

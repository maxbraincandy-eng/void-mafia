import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XPGain } from '@/types/index';
import { MAX_LEVEL, xpForLevel, xpForNextLevel, LEVEL_TITLES } from '@/lib/level';

const MILESTONE_LEVELS = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

interface Props {
  gain: XPGain | null;
  onDismiss: () => void;
}

export function XPToast({ gain, onDismiss }: Props) {
  // Milestone levels get the full-screen overlay; suppress toast for those
  const isMilestone = gain?.leveledUp && LEVEL_TITLES[gain.newLevel] && MILESTONE_LEVELS.has(gain.newLevel);

  useEffect(() => {
    if (!gain || isMilestone) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [gain, isMilestone, onDismiss]);

  if (!gain || isMilestone) return null;

  const isMaxLevel = gain.newLevel >= MAX_LEVEL;
  const levelMin = xpForLevel(gain.newLevel);
  const levelMax = xpForNextLevel(gain.newLevel);
  const progress = isMaxLevel ? 1 : levelMax > levelMin
    ? Math.min(1, (gain.newXP - levelMin) / (levelMax - levelMin))
    : 1;

  return (
    <AnimatePresence>
      {gain && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[90] w-72"
          style={{
            background: 'rgba(8,4,24,0.97)',
            border: '1px solid rgba(155,0,255,0.35)',
            boxShadow: '0 0 40px rgba(155,0,255,0.2), 0 8px 32px rgba(0,0,0,0.8)',
            borderRadius: '20px',
            backdropFilter: 'blur(20px)',
          }}
          onClick={onDismiss}
        >
          <div className="p-4">
            {gain.leveledUp && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
                className="text-center mb-2"
              >
                <p className="font-display text-lg font-bold tracking-widest uppercase"
                  style={{ color: '#ffd700', textShadow: '0 0 20px rgba(255,215,0,0.6)' }}>
                  {gain.newLevel >= MAX_LEVEL ? '👑 VOID MASTER!' : `🎉 LEVEL UP! → ${gain.newLevel}`}
                </p>
                {LEVEL_TITLES[gain.newLevel] && (
                  <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,215,0,0.6)' }}>
                    {LEVEL_TITLES[gain.newLevel]!.ka}
                  </p>
                )}
              </motion.div>
            )}

            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-display font-bold flex-shrink-0"
                style={{
                  background: 'rgba(155,0,255,0.2)',
                  border: '1px solid rgba(155,0,255,0.4)',
                  color: '#c084fc',
                }}
              >
                {gain.newLevel}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-display font-bold tracking-wider text-white/70">
                    +{gain.amount} XP
                    {gain.challengeCompleted && (
                      <span className="ml-2 text-[9px] text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5 rounded-full">
                        +{gain.challengeBonus} challenge
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] font-mono text-white/30">{gain.newXP} XP</p>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ delay: 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #9b00ff, #c084fc)' }}
                  />
                </div>
              </div>
            </div>

            {gain.challengeCompleted && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)' }}
              >
                <span className="text-base">✅</span>
                <p className="text-xs font-mono text-yellow-400/80">Daily challenge completed!</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

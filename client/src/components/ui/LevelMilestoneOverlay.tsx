import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XPGain } from '@/types/index';
import { MAX_LEVEL, LEVEL_TITLES, levelColor, levelTitleLocal } from '@/lib/level';

interface Props {
  gain: XPGain | null;
  onDismiss: () => void;
}

// Which levels get the full-screen milestone treatment
const MILESTONE_LEVELS = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

export function LevelMilestoneOverlay({ gain, onDismiss }: Props) {
  const isMilestone = gain?.leveledUp && LEVEL_TITLES[gain.newLevel] && MILESTONE_LEVELS.has(gain.newLevel);

  useEffect(() => {
    if (!isMilestone) return;
    const t = setTimeout(onDismiss, gain!.newLevel >= MAX_LEVEL ? 6000 : 4500);
    return () => clearTimeout(t);
  }, [isMilestone, gain?.newLevel, onDismiss]);

  if (!isMilestone || !gain) return null;

  const color = levelColor(gain.newLevel);
  const title = LEVEL_TITLES[gain.newLevel]!;
  const isVoidMaster = gain.newLevel >= MAX_LEVEL;
  const isMajor = gain.newLevel >= 50;

  // Glow color for the ambient background
  const glowRgb = isVoidMaster ? '255,215,0' : isMajor ? '255,107,0' : '155,0,255';

  return (
    <AnimatePresence>
      <motion.div
        key={gain.newLevel}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(${glowRgb},0.18) 0%, rgba(0,0,0,0.92) 70%)` }}
        onClick={onDismiss}
      >
        {/* Particle rings */}
        {[1, 2, 3].map(i => (
          <motion.div
            key={i}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 2.5 + i * 0.6, opacity: 0 }}
            transition={{ duration: 1.8 + i * 0.3, delay: i * 0.15, ease: 'easeOut' }}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 120,
              height: 120,
              border: `2px solid rgba(${glowRgb},${0.5 - i * 0.12})`,
            }}
          />
        ))}

        {/* Level badge */}
        <motion.div
          initial={{ scale: 0.2, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          className="relative mb-6"
        >
          <div
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center"
            style={{
              background: `radial-gradient(circle, rgba(${glowRgb},0.25) 0%, rgba(0,0,0,0.6) 100%)`,
              border: `3px solid ${color}`,
              boxShadow: `0 0 60px rgba(${glowRgb},0.5), 0 0 120px rgba(${glowRgb},0.2), inset 0 0 30px rgba(${glowRgb},0.1)`,
            }}
          >
            {isVoidMaster ? (
              <span className="text-5xl leading-none">👑</span>
            ) : (
              <>
                <span className="font-display text-xs font-bold tracking-[0.2em] uppercase mb-1" style={{ color: `rgba(${glowRgb},0.7)` }}>LV</span>
                <span className="font-display text-4xl font-black leading-none" style={{ color, textShadow: `0 0 20px ${color}` }}>
                  {gain.newLevel}
                </span>
              </>
            )}
          </div>
        </motion.div>

        {/* Title text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center px-8"
        >
          {isVoidMaster && (
            <motion.p
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
              className="font-display text-3xl font-black tracking-[0.15em] uppercase mb-2"
              style={{ color: '#ffd700', textShadow: '0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(255,215,0,0.4)' }}
            >
              VOID MASTER
            </motion.p>
          )}
          {!isVoidMaster && (
            <p
              className="font-display text-xl font-bold tracking-[0.12em] uppercase mb-1"
              style={{ color, textShadow: `0 0 24px ${color}` }}
            >
              {title.en}
            </p>
          )}
          <p
            className="font-display text-lg tracking-wide"
            style={{ color: `rgba(${glowRgb},0.7)` }}
          >
            {levelTitleLocal(title)}
          </p>
          <p className="font-mono text-xs tracking-[0.25em] uppercase mt-3 text-white/25">
            Level {gain.newLevel} Milestone Unlocked
          </p>
        </motion.div>

        {/* Shimmer line */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="absolute"
          style={{
            bottom: '35%',
            width: '200px',
            height: '1px',
            background: `linear-gradient(90deg, transparent, rgba(${glowRgb},0.8), transparent)`,
            boxShadow: `0 0 12px rgba(${glowRgb},0.6)`,
          }}
        />

        {/* Tap to dismiss hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-12 font-mono text-[12px] tracking-[0.2em] uppercase text-white/20"
        >
          tap to dismiss
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}

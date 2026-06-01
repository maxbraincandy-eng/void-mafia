import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AchievementEarned } from '@/types/index';

const RARITY_STYLES: Record<string, { border: string; glow: string; label: string }> = {
  common:    { border: 'rgba(255,255,255,0.18)', glow: 'rgba(255,255,255,0.1)', label: 'text-white/40' },
  uncommon:  { border: 'rgba(0,229,255,0.35)',   glow: 'rgba(0,229,255,0.15)', label: 'text-neon-cyan/60' },
  rare:      { border: 'rgba(155,0,255,0.45)',   glow: 'rgba(155,0,255,0.2)', label: 'text-purple-400' },
  epic:      { border: 'rgba(255,0,204,0.55)',   glow: 'rgba(255,0,204,0.25)', label: 'text-pink-400' },
  legendary: { border: 'rgba(255,180,0,0.6)',    glow: 'rgba(255,180,0,0.3)', label: 'text-yellow-400' },
};

interface Props {
  achievements: AchievementEarned[];
  onDismiss: () => void;
}

export function AchievementToast({ achievements, onDismiss }: Props) {
  useEffect(() => {
    if (achievements.length === 0) return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [achievements, onDismiss]);

  return (
    <AnimatePresence>
      {achievements.length > 0 && (
        <motion.div
          key="achievement-toast"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-24 right-4 z-[80] flex flex-col gap-2 cursor-pointer max-w-[280px]"
          onClick={onDismiss}
        >
          {achievements.map(a => {
            const style = RARITY_STYLES[a.rarity] ?? RARITY_STYLES.common;
            return (
              <div
                key={a.key}
                className="rounded-2xl backdrop-blur-2xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: 'rgba(8,4,20,0.95)',
                  border: `1px solid ${style.border}`,
                  boxShadow: `0 0 30px ${style.glow}`,
                }}
              >
                <span className="text-3xl flex-shrink-0">{a.icon}</span>
                <div className="min-w-0">
                  <p className={`font-mono text-[9px] uppercase tracking-[0.2em] ${style.label}`}>
                    {a.rarity} achievement
                  </p>
                  <p className="font-display text-sm font-bold text-white tracking-wide">{a.name}</p>
                  <p className="font-mono text-[10px] text-white/40 leading-snug mt-0.5 truncate">{a.description}</p>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

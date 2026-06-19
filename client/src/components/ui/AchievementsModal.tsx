import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import type { Res, AchievementEarned } from '@/types/index';

interface Props {
  open: boolean;
  onClose: () => void;
  profileId: string | null;
}

const ALL_ACHIEVEMENTS = [
  { key: 'first_blood',   name: 'First Blood',   icon: '🩸', rarity: 'common',    description: 'მოიგე პირველი თამაში' },
  { key: 'godfather',     name: 'Godfather',      icon: '♛',  rarity: 'rare',      description: 'მოიგე 5 თამაში დონად' },
  { key: 'town_hero',     name: 'Town Hero',      icon: '🛡',  rarity: 'rare',      description: 'იხსენი 3 მოთამაშე ექიმად' },
  { key: 'detective',     name: 'Detective',      icon: '🔍', rarity: 'common',    description: 'დაიჭირე მაფიელი შერიფად' },
  { key: 'survivor',      name: 'Survivor',       icon: '💪', rarity: 'common',    description: 'გადარჩი 10 თამაშში' },
  { key: 'executioner',   name: 'Executioner',    icon: '⚖️', rarity: 'uncommon',  description: 'ერთ თამაშში 3 ხმით გარიცხვა' },
  { key: 'ghost',         name: 'Ghost',          icon: '👻', rarity: 'uncommon',  description: 'მოიგე ჯესტერად (ხმით გარიცხვა)' },
  { key: 'serial_killer', name: 'Serial Killer',  icon: '🌀', rarity: 'rare',      description: 'მოიგე მანიაკად' },
  { key: 'veteran_wars',  name: 'War Hero',       icon: '🎖️', rarity: 'uncommon',  description: 'მოკალი თავდამსხმელი ვეტერანად' },
  { key: 'cult_master',   name: 'Cult Master',    icon: '🕯️', rarity: 'epic',      description: 'გადაიბირე 3 მოთამაშე კულტის ლიდერად' },
  { key: 'night_owl',     name: 'Night Owl',      icon: '🦉', rarity: 'common',    description: 'ითამაშე 10 თამაში' },
  { key: 'legend',        name: 'Legend',         icon: '🏆', rarity: 'legendary', description: 'მოიგე 50 თამაში' },
  { key: 'arsonist_win',  name: 'Ignition',       icon: '🔥', rarity: 'rare',      description: 'მოიგე მაწვრად' },
  { key: 'loyal_guard',   name: 'Loyal Guard',    icon: '🛡',  rarity: 'uncommon',  description: 'დაიღუპე მოთამაშის დასაცავად მცველად' },
  { key: 'comeback',      name: 'Comeback',       icon: '⚡', rarity: 'uncommon',  description: 'მოიგე მაშინ, როცა 2 ქალაქელი დარჩა' },
] as const;

const RARITY_COLOR: Record<string, string> = {
  common:    'text-white/60',
  uncommon:  'text-neon-green',
  rare:      'text-neon-cyan',
  epic:      'text-neon-purple',
  legendary: 'text-yellow-400',
};

const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.07)',
  uncommon:  'rgba(0,255,128,0.2)',
  rare:      'rgba(0,229,255,0.2)',
  epic:      'rgba(138,43,226,0.3)',
  legendary: 'rgba(250,204,21,0.3)',
};

export function AchievementsModal({ open, onClose, profileId }: Props) {
  const [earned, setEarned] = useState<AchievementEarned[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profileId) return;
    setLoading(true);
    setError(null);
    socket.emit('player:achievements', { profileId }, (res: Res<AchievementEarned[]>) => {
      if (res.ok) {
        setEarned(res.data);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [open, profileId]);

  const earnedMap = new Map(earned.map(a => [a.key, a]));
  const earnedCount = earned.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-0 sm:px-4 pb-0"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(138,43,226,0.18)',
              boxShadow: '0 -8px 60px rgba(138,43,226,0.08)',
              maxHeight: '82vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6 flex-shrink-0">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-neon-purple/50 mb-0.5">Progress</p>
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-bold text-white text-base">Achievements</h2>
                  {!loading && (
                    <span
                      className="font-mono text-xs text-neon-purple px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(138,43,226,0.14)', border: '1px solid rgba(138,43,226,0.28)' }}
                    >
                      {earnedCount}/{ALL_ACHIEVEMENTS.length}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-neon-purple/30 border-t-neon-purple rounded-full animate-spin" />
                </div>
              )}

              {!loading && error && (
                <div className="text-center py-10">
                  <p className="font-mono text-sm text-red-400/60">{error}</p>
                </div>
              )}

              {!loading && !error && (
                <div className="grid grid-cols-1 gap-2">
                  {ALL_ACHIEVEMENTS.map(achievement => {
                    const earnedEntry = earnedMap.get(achievement.key);
                    const isEarned = !!earnedEntry;
                    return (
                      <div
                        key={achievement.key}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-opacity"
                        style={{
                          background: isEarned ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isEarned ? RARITY_BORDER[achievement.rarity] : 'rgba(255,255,255,0.05)'}`,
                          opacity: isEarned ? 1 : 0.4,
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                          style={{
                            background: isEarned ? 'rgba(138,43,226,0.12)' : 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          {isEarned ? achievement.icon : '🔒'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-bold text-white/85 text-sm">{achievement.name}</span>
                            <span className={`font-mono text-[12px] uppercase tracking-wider ${RARITY_COLOR[achievement.rarity]}`}>
                              {achievement.rarity}
                            </span>
                          </div>
                          <p className="font-mono text-[12px] text-white/40 mt-0.5 truncate">{achievement.description}</p>
                        </div>
                        {isEarned && earnedEntry && (
                          <p className="font-mono text-[12px] text-white/25 flex-shrink-0 text-right">
                            {new Date(earnedEntry.earnedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

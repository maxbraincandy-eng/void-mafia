import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { DailyChallenge } from '@/types/index';
import type { Res } from '@/types/index';

export function DailyChallengeCard() {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);

  useEffect(() => {
    emitWithAck<undefined, Res<DailyChallenge>>('challenge:today', undefined)
      .then(res => { if (res.ok) setChallenge(res.data); })
      .catch(() => {});
  }, []);

  if (!challenge) return null;

  const progressPct = challenge.targetCount > 1
    ? Math.min(1, challenge.progressCount / challenge.targetCount) * 100
    : challenge.completedToday ? 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 mb-4"
      style={{
        background: challenge.completedToday
          ? 'rgba(0,255,136,0.05)'
          : 'rgba(255,215,0,0.04)',
        border: challenge.completedToday
          ? '1px solid rgba(0,255,136,0.2)'
          : '1px solid rgba(255,215,0,0.2)',
        boxShadow: challenge.completedToday
          ? '0 0 20px rgba(0,255,136,0.06)'
          : '0 0 20px rgba(255,215,0,0.04)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0 mt-0.5">
          {challenge.completedToday ? '✅' : '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[9px] font-display font-bold tracking-[0.25em] uppercase text-white/30">
              Daily Challenge
            </p>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
              style={{
                background: 'rgba(255,215,0,0.1)',
                border: '1px solid rgba(255,215,0,0.25)',
                color: 'rgba(255,215,0,0.8)',
              }}
            >
              +{challenge.xpReward} XP
            </span>
          </div>
          <p className={`text-sm font-mono ${challenge.completedToday ? 'text-neon-green/80 line-through opacity-60' : 'text-white/70'}`}>
            {challenge.description}
          </p>
          {challenge.targetCount > 1 && (
            <div className="mt-2">
              <div className="flex justify-between text-[9px] font-mono text-white/25 mb-1">
                <span>{challenge.progressCount}/{challenge.targetCount}</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: challenge.completedToday
                      ? 'linear-gradient(90deg, #00ff88, #00e5ff)'
                      : 'linear-gradient(90deg, #ffd700, #ffaa00)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { DailyChallenge } from '@/types/index';
import type { Res } from '@/types/index';

const QUEST_ICONS = ['🎯', '🛡️', '🎮'];
const QUEST_LABELS = ['Daily Win', 'Survivor', 'Grinder'];

export function DailyChallengeCard() {
  const [quests, setQuests] = useState<DailyChallenge[]>([]);

  useEffect(() => {
    emitWithAck<undefined, Res<DailyChallenge[]>>('challenge:today', undefined)
      .then(res => { if (res.ok) setQuests(Array.isArray(res.data) ? res.data : [res.data as any]); })
      .catch(() => {});
  }, []);

  if (!quests.length) return null;

  const allDone = quests.every(q => q.completedToday);
  const totalXp = quests.reduce((s, q) => s + q.xpReward, 0);
  const earnedXp = quests.filter(q => q.completedToday).reduce((s, q) => s + q.xpReward, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-3 py-2 mb-2"
      style={{
        background: allDone ? 'rgba(0,255,136,0.04)' : 'rgba(255,215,0,0.03)',
        border: allDone ? '1px solid rgba(0,255,136,0.15)' : '1px solid rgba(255,215,0,0.15)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] font-display font-bold tracking-[0.25em] uppercase text-white/25">
          Daily Quests
        </p>
        <span
          className="text-[12px] font-mono px-1.5 py-0.5 rounded-full"
          style={{
            background: 'rgba(255,215,0,0.08)',
            border: '1px solid rgba(255,215,0,0.2)',
            color: 'rgba(255,215,0,0.7)',
          }}
        >
          {earnedXp}/{totalXp} XP
        </span>
      </div>
      <div className="flex gap-2">
        {quests.map((q, i) => {
          const progressPct = q.targetCount > 1
            ? Math.min(1, q.progressCount / q.targetCount) * 100
            : q.completedToday ? 100 : 0;
          return (
            <div key={q.id} className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-xs leading-none">{q.completedToday ? '✅' : QUEST_ICONS[i]}</span>
                <p className={`text-[12px] font-mono truncate ${q.completedToday ? 'text-neon-green/40 line-through' : 'text-white/50'}`}>
                  {q.description}
                </p>
              </div>
              <div className="h-0.5 rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: q.completedToday
                      ? 'linear-gradient(90deg, #00ff88, #00e5ff)'
                      : 'linear-gradient(90deg, #ffd700, #ffaa00)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

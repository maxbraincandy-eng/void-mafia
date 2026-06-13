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
      className="rounded-2xl p-3 mb-4"
      style={{
        background: allDone ? 'rgba(0,255,136,0.05)' : 'rgba(255,215,0,0.04)',
        border: allDone ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,215,0,0.2)',
        boxShadow: allDone ? '0 0 20px rgba(0,255,136,0.06)' : '0 0 20px rgba(255,215,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[9px] font-display font-bold tracking-[0.25em] uppercase text-white/30">
          Daily Quests
        </p>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
          style={{
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.25)',
            color: 'rgba(255,215,0,0.8)',
          }}
        >
          {earnedXp}/{totalXp} XP
        </span>
      </div>
      <div className="space-y-2">
        {quests.map((q, i) => {
          const progressPct = q.targetCount > 1
            ? Math.min(1, q.progressCount / q.targetCount) * 100
            : q.completedToday ? 100 : 0;
          return (
            <div key={q.id} className="flex items-start gap-2.5">
              <span className="text-base flex-shrink-0 mt-0.5">{q.completedToday ? '✅' : QUEST_ICONS[i]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <p className={`text-[10px] font-display font-bold tracking-wider uppercase ${q.completedToday ? 'text-neon-green/50' : 'text-white/40'}`}>
                    {QUEST_LABELS[i]}
                  </p>
                  <span className="text-[9px] font-mono text-white/25 flex-shrink-0">+{q.xpReward} XP</span>
                </div>
                <p className={`text-[11px] font-mono ${q.completedToday ? 'text-white/30 line-through' : 'text-white/60'}`}>
                  {q.description}
                </p>
                {q.targetCount > 1 && (
                  <div className="mt-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-white/20 mb-0.5">
                      <span>{q.progressCount}/{q.targetCount}</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/8 overflow-hidden">
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
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

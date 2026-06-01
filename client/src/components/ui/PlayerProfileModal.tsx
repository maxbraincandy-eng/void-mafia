import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { ModBadge } from '@/components/ui/ModBadge';
import type { Res, AchievementEarned, PlayerProfilePublic } from '@/types/index';

interface Props {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerProfileModal({ playerId, onClose }: Props) {
  const [profile, setProfile] = useState<PlayerProfilePublic | null>(null);
  const [achievements, setAchievements] = useState<AchievementEarned[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) { setProfile(null); setAchievements([]); return; }
    setLoading(true);
    emitWithAck<{ profileId: string }, Res<PlayerProfilePublic>>('player:profile', { profileId: playerId })
      .then(res => {
        if (res.ok) {
          setProfile(res.data);
          return emitWithAck<{ profileId: string }, Res<AchievementEarned[]>>('player:achievements', { profileId: playerId });
        }
        return null;
      })
      .then(achRes => { if (achRes?.ok) setAchievements(achRes.data); })
      .finally(() => setLoading(false));
  }, [playerId]);

  return (
    <AnimatePresence>
      {playerId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-xs glass-panel border border-neon-purple/30 rounded-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
              </div>
            )}

            {!loading && profile && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-2xl font-bold flex-shrink-0">
                    {profile.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className={`font-display font-bold text-base ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                        {profile.username}
                      </h3>
                      {profile.isModerator && profile.moderatorBadgeVisible && (
                        <ModBadge level={profile.moderatorLevel} />
                      )}
                    </div>
                    <p className="text-white/25 font-mono text-[10px]">
                      Joined {new Date(profile.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mb-4">
                  {[
                    { label: 'Games', value: profile.stats.gamesPlayed, color: 'text-neon-cyan' },
                    { label: 'Wins',  value: profile.stats.wins,        color: 'text-neon-green' },
                    { label: 'Loss',  value: profile.stats.losses,      color: 'text-neon-red/80' },
                    { label: 'WR',    value: `${profile.stats.winRate}%`, color: 'text-neon-pink' },
                  ].map(s => (
                    <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-2 text-center">
                      <p className={`font-display font-bold text-base ${s.color}`}>{s.value}</p>
                      <p className="text-white/25 text-[9px] font-mono">{s.label}</p>
                    </div>
                  ))}
                </div>

                {achievements.length > 0 && (
                  <div className="mb-4">
                    <p className="font-mono text-[10px] text-white/30 uppercase tracking-wider mb-2">
                      Achievements ({achievements.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {achievements.slice(0, 8).map(a => (
                        <span key={a.key} className="text-xl" title={a.name}>{a.icon}</span>
                      ))}
                      {achievements.length > 8 && (
                        <span className="text-white/30 font-mono text-xs self-center">+{achievements.length - 8}</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {!loading && !profile && (
              <p className="text-center text-white/30 font-mono text-sm py-4">Profile not found</p>
            )}

            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl border border-white/10 text-white/35 hover:text-white/60 font-mono text-xs transition-colors"
            >
              CLOSE
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

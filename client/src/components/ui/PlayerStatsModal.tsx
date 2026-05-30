import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerProfilePublic } from '@/types/index';
import { socket } from '@/lib/socket';
import { ModBadge } from './ModBadge';
import type { Res } from '@/types/index';

interface Props {
  profileId: string | null;
  playerName: string;
  onClose: () => void;
  onReport?: (profileId: string) => void;
}

export function PlayerStatsModal({ profileId, playerName, onClose, onReport }: Props) {
  const [profile, setProfile] = useState<PlayerProfilePublic | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    socket.emit('player:stats', { profileId }, (res: Res<PlayerProfilePublic>) => {
      setLoading(false);
      if (res.ok) setProfile(res.data);
    });
  }, [profileId]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="glass-panel border border-neon-cyan/20 rounded-2xl p-6 w-full max-w-sm shadow-glass-lg"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
        >
          {loading && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {!loading && profile && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-xl font-bold text-white">
                  {profile.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-display font-bold text-lg ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                      {profile.username}
                    </h3>
                    {profile.isModerator && profile.moderatorBadgeVisible && (
                      <ModBadge level={profile.moderatorLevel} />
                    )}
                  </div>
                  <p className="text-white/25 font-mono text-xs">ID: {profile.id.slice(0, 10)}…</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-6">
                {[
                  { label: 'Games', value: profile.stats.gamesPlayed, color: 'text-neon-cyan' },
                  { label: 'Wins',  value: profile.stats.wins,        color: 'text-neon-green' },
                  { label: 'Rate',  value: `${profile.stats.winRate}%`, color: 'text-neon-pink' },
                ].map(s => (
                  <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-3 text-center">
                    <p className={`font-display font-bold text-xl ${s.color}`}>{s.value}</p>
                    <p className="text-white/30 text-xs font-mono">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {onReport && profileId && (
                  <button
                    onClick={() => { onReport(profileId); onClose(); }}
                    className="flex-1 py-2 border border-neon-red/30 text-neon-red font-mono text-xs rounded-xl hover:bg-neon-red/10 transition-all"
                  >
                    Report
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 py-2 border border-white/10 text-white/50 font-mono text-xs rounded-xl hover:text-white transition-all"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {!loading && !profile && (
            <div className="text-center py-4">
              <p className="text-white/40 font-mono text-sm">{playerName}</p>
              <p className="text-white/20 font-mono text-xs mt-1">No profile data available</p>
              <button onClick={onClose} className="mt-4 text-neon-cyan/60 text-xs font-mono hover:text-neon-cyan">
                Close
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

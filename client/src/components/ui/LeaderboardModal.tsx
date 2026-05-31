import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerProfilePublic } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LeaderboardModal({ open, onClose }: Props) {
  const getLeaderboard = useGameStore(s => s.getLeaderboard);
  const t = useT();
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getLeaderboard()
      .then(setPlayers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="glass-panel border border-neon-cyan/20 rounded-2xl p-6 w-full max-w-sm shadow-glass"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold text-neon-cyan tracking-widest uppercase">
                🏆 {t.leaderboard.title}
              </h2>
              <button onClick={onClose} className="text-white/30 hover:text-white text-sm">✕</button>
            </div>

            {loading && (
              <div className="text-center py-8 text-white/40 font-mono text-sm">{t.common.loading}</div>
            )}

            {!loading && players.length === 0 && (
              <div className="text-center py-8 text-white/30 font-mono text-sm">
                {t.leaderboard.noPlayers}
              </div>
            )}

            {!loading && players.length > 0 && (
              <div className="space-y-2">
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/6">
                    <span className="text-lg w-6 text-center">{medals[i] ?? `${i + 1}`}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'rgba(255,255,255,0.1)' }}>
                      {p.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-mono truncate">{p.username}</p>
                      <p className="text-xs text-white/40 font-mono">{p.stats.gamesPlayed} {t.leaderboard.gamesCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-neon-green">{p.stats.winRate}%</p>
                      <p className="text-xs text-white/30 font-mono">{p.stats.wins}W/{p.stats.losses}L</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-white/20 font-mono text-center mt-4">
              {t.leaderboard.sortedBy}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

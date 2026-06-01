import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { PlayerProfilePublic } from '@/types/index';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BORDER = ['border-yellow-400/25', 'border-gray-400/15', 'border-amber-700/20'];
const MEDAL_BG = ['bg-yellow-400/4', 'bg-white/3', 'bg-amber-900/5'];
const MEDAL_TEXT = ['text-yellow-400', 'text-gray-300', 'text-amber-500'];

export function LeaderboardPage() {
  const getLeaderboard = useGameStore(s => s.getLeaderboard);
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaderboard();
      setPlayers(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-pink/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-neon-purple/8 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
            <PoweredBy className="block mt-0.5" />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-white/40 hover:text-white/70 transition-colors font-mono text-xs disabled:opacity-30"
          >
            ↻ refresh
          </button>
        </div>

        <div className="mb-5">
          <h2 className="font-display text-xl font-bold text-neon-pink tracking-widest uppercase">Leaderboard</h2>
          <p className="text-white/30 font-mono text-xs mt-0.5">Players with 3+ games · sorted by win rate</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="text-4xl animate-pulse">◈</div>
              <p className="text-white/30 font-mono text-sm">Loading rankings…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="glass-panel border border-neon-red/20 rounded-2xl p-6 text-center">
            <p className="text-neon-red/70 font-mono text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-white/40 hover:text-white/60 font-mono underline">
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && players.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel border border-neon-pink/20 rounded-2xl p-10 text-center"
          >
            <div className="text-5xl mb-4 opacity-30">◈</div>
            <p className="text-white/30 font-mono text-sm">No players with 3+ games yet.</p>
            <p className="text-white/15 font-mono text-xs mt-1">Play some games to appear here!</p>
          </motion.div>
        )}

        {/* Podium — top 3 */}
        {!loading && !error && top3.length === 3 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex gap-2 mb-4 items-end"
          >
            {/* 2nd */}
            <PodiumCard player={top3[1]!} rank={1} />
            {/* 1st — taller */}
            <PodiumCard player={top3[0]!} rank={0} tall />
            {/* 3rd */}
            <PodiumCard player={top3[2]!} rank={2} />
          </motion.div>
        )}

        {/* Full ranked list */}
        {!loading && !error && players.length > 0 && (
          <div className="space-y-2">
            {players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.03 }}
                className={clsx(
                  'flex items-center gap-3 p-3 rounded-2xl border transition-colors',
                  i < 3 ? `${MEDAL_BORDER[i]} ${MEDAL_BG[i]}` : 'border-white/5 bg-white/2',
                )}
              >
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {i < 3 ? (
                    <span className="text-xl">{MEDALS[i]}</span>
                  ) : (
                    <span className="text-white/20 font-mono text-sm font-bold">#{i + 1}</span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className={clsx(
                    'w-9 h-9 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0',
                    i === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                      : 'bg-gradient-to-br from-neon-pink to-neon-purple',
                  )}
                  style={i === 0 ? { boxShadow: '0 0 14px rgba(250,204,21,0.4)' } : undefined}
                >
                  {player.avatar}
                </div>

                {/* Name + win bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={clsx(
                      'font-display font-semibold text-sm truncate',
                      i < 3 ? MEDAL_TEXT[i] : 'text-white/60',
                    )}>
                      {player.username}
                    </p>
                    {player.isModerator && (
                      <span className="text-[9px] font-mono text-neon-green border border-neon-green/30 rounded px-1 shrink-0">MOD</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-20 h-1 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full',
                          player.stats.winRate >= 60
                            ? 'bg-gradient-to-r from-neon-green to-neon-cyan'
                            : player.stats.winRate >= 40
                            ? 'bg-gradient-to-r from-neon-cyan to-blue-400'
                            : 'bg-white/30',
                        )}
                        style={{ width: `${player.stats.winRate}%` }}
                      />
                    </div>
                    <span className="text-white/25 font-mono text-[10px]">
                      {player.stats.wins}W {player.stats.losses}L
                    </span>
                  </div>
                </div>

                {/* Win rate */}
                <div className="text-right shrink-0">
                  <p className={clsx(
                    'font-display font-bold text-base',
                    player.stats.winRate >= 60
                      ? 'text-neon-green'
                      : player.stats.winRate >= 40
                      ? 'text-neon-cyan'
                      : 'text-white/40',
                  )}>
                    {player.stats.winRate}%
                  </p>
                  <p className="text-white/25 font-mono text-[10px]">{player.stats.gamesPlayed} games</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumCard({
  player,
  rank,
  tall = false,
}: {
  player: PlayerProfilePublic;
  rank: number;
  tall?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + rank * 0.05 }}
      className={clsx(
        'flex-1 glass-panel rounded-xl p-3 text-center border',
        rank === 0 ? 'border-yellow-400/25' : 'border-white/8',
        tall ? 'pb-4' : '',
      )}
      style={rank === 0 ? { boxShadow: '0 0 24px rgba(250,204,21,0.12)', marginBottom: 8 } : undefined}
    >
      <div className="text-2xl mb-1">{MEDALS[rank]}</div>
      <div
        className={clsx(
          'rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center font-bold text-white mx-auto mb-2',
          tall ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-base',
        )}
        style={rank === 0 ? { background: 'linear-gradient(135deg,#facc15,#d97706)', boxShadow: '0 0 16px rgba(250,204,21,0.5)' } : undefined}
      >
        {player.avatar}
      </div>
      <p className={clsx('font-display font-bold truncate', tall ? 'text-sm' : 'text-xs', MEDAL_TEXT[rank])}>
        {player.username}
      </p>
      <p className={clsx('font-mono font-bold', tall ? 'text-lg' : 'text-sm', MEDAL_TEXT[rank])}>
        {player.stats.winRate}%
      </p>
      <p className="text-white/25 font-mono text-[10px]">{player.stats.gamesPlayed}g</p>
    </motion.div>
  );
}

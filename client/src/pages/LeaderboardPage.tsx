import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useSocialStore } from '@/store/socialStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { RatingBadge } from '@/components/ui/RatingBadge';
import { PlayerProfilePublic } from '@/types/index';
import type { RankTier } from '@/types/index';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { MAX_LEVEL, xpForLevel, xpForNextLevel } from '@/lib/level';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BORDER = ['border-yellow-400/25', 'border-gray-400/15', 'border-amber-700/20'];
const MEDAL_BG = ['bg-yellow-400/4', 'bg-white/3', 'bg-amber-900/5'];
const MEDAL_TEXT = ['text-yellow-400', 'text-gray-300', 'text-amber-500'];

function levelPct(level: number, xp: number) {
  if (level >= MAX_LEVEL) return 100;
  const min = xpForLevel(level), max = xpForNextLevel(level);
  return max > min ? Math.min(100, Math.round(((xp - min) / (max - min)) * 100)) : 100;
}
function levelColor(level: number) {
  return level >= 80 ? 'text-yellow-400' : level >= 60 ? 'text-orange-400' : level >= 40 ? 'text-neon-cyan' : level >= 20 ? 'text-purple-400' : 'text-neon-purple/80';
}

interface GiftLeaderEntry {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  totalSpent?: number;
  totalReceived?: number;
  giftCount: number;
}

interface RankedEntry {
  playerId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  publicId: number | null;
  elo: number;
  peakElo: number;
  rankedWins: number;
  rankedLosses: number;
  isPlaced: boolean;
  tier: RankTier;
}

type Tab = 'rankings' | 'ranked' | 'gifts';

export function LeaderboardPage({ onBack }: { onBack?: () => void }) {
  const getLeaderboard = useGameStore(s => s.getLeaderboard);
  const openProfile = useSocialStore(s => s.openProfile);
  const [tab, setTab] = useState<Tab>('rankings');
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giftData, setGiftData] = useState<{ topGifters: GiftLeaderEntry[]; topRecipients: GiftLeaderEntry[] } | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rankedData, setRankedData] = useState<RankedEntry[]>([]);
  const [rankedLoading, setRankedLoading] = useState(false);
  const [rankedError, setRankedError] = useState<string | null>(null);

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

  const loadGifts = async () => {
    setGiftLoading(true);
    setGiftError(null);
    try {
      const res = await emitWithAck<null, Res<any>>('gifts:leaderboard');
      if (res.ok) setGiftData(res.data);
      else setGiftError(res.error ?? 'Failed to load gift rankings.');
    } catch (e: any) {
      setGiftError(e.message ?? 'Failed to load gift rankings.');
    } finally {
      setGiftLoading(false);
    }
  };

  const loadRanked = async () => {
    setRankedLoading(true);
    setRankedError(null);
    try {
      const res = await emitWithAck<null, Res<any[]>>('rating:leaderboard' as any);
      if (res.ok) setRankedData(res.data);
      else setRankedError(res.error ?? 'Failed to load ranked leaderboard.');
    } catch (e: any) {
      setRankedError(e.message ?? 'Failed to load ranked leaderboard.');
    } finally {
      setRankedLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'gifts' && !giftData) loadGifts(); }, [tab]);
  useEffect(() => { if (tab === 'ranked' && rankedData.length === 0) loadRanked(); }, [tab]);

  const top3 = players.slice(0, 3);

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-pink/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-neon-purple/8 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))' }}>
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/8 active:scale-95 text-white/50 hover:text-white/80"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              aria-label="Back"
            >
              ←
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-2xl font-bold text-neon-pink tracking-widest uppercase leading-none">ტოპი</h2>
            <p className="text-white/25 font-mono text-[10px] tracking-widest mt-0.5">
              {tab === 'rankings' ? 'ALL PLAYERS · SORTED BY LEVEL' : tab === 'ranked' ? 'ELO RATING · RANKED MATCHES' : 'TOP GIFTERS & RECIPIENTS'}
            </p>
          </div>
          <button
            onClick={tab === 'rankings' ? load : tab === 'ranked' ? loadRanked : loadGifts}
            disabled={tab === 'rankings' ? loading : tab === 'ranked' ? rankedLoading : giftLoading}
            className="text-white/30 hover:text-white/60 transition-colors font-mono text-xs disabled:opacity-30 flex-shrink-0"
          >
            ↻
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([['rankings', '🏆 Levels'], ['ranked', '⚔️ Ranked'], ['gifts', '🎁 Gifts']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 py-2 rounded-lg font-mono text-xs uppercase tracking-widest transition-all',
                tab === t
                  ? t === 'gifts'
                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    : t === 'ranked'
                      ? 'bg-neon-purple/10 text-neon-purple border border-neon-purple/20'
                      : 'bg-neon-pink/10 text-neon-pink border border-neon-pink/20'
                  : 'text-white/30 hover:text-white/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Ranked ELO tab ─────────────────────────────────────────────── */}
        {tab === 'ranked' && (
          <>
            {rankedLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-3">
                  <div className="text-4xl animate-pulse">⚔️</div>
                  <p className="text-white/30 font-mono text-sm">Loading ranked…</p>
                </div>
              </div>
            )}
            {!rankedLoading && rankedError && (
              <div className="glass-panel border border-neon-red/20 rounded-2xl p-6 text-center">
                <p className="text-neon-red/70 font-mono text-sm">{rankedError}</p>
                <button onClick={loadRanked} className="mt-3 text-xs text-white/40 hover:text-white/60 font-mono underline">
                  Try again
                </button>
              </div>
            )}
            {!rankedLoading && !rankedError && rankedData.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel border border-neon-purple/20 rounded-2xl p-10 text-center"
              >
                <div className="text-5xl mb-4 opacity-30">⚔️</div>
                <p className="text-white/30 font-mono text-sm">No ranked players yet.</p>
                <p className="text-white/15 font-mono text-xs mt-1">Complete 5 placement games to appear here!</p>
              </motion.div>
            )}
            {!rankedLoading && !rankedError && rankedData.length > 0 && (
              <div className="space-y-2">
                {rankedData.map((entry, i) => {
                  const isTop3 = i < 3;
                  const top3Borders = ['border-yellow-400/25', 'border-gray-400/15', 'border-amber-700/20'];
                  const top3Bgs    = ['bg-yellow-400/4', 'bg-white/3', 'bg-amber-900/5'];
                  return (
                    <motion.div
                      key={entry.playerId}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.03 }}
                      onClick={() => openProfile(entry.playerId)}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer active:scale-[0.98]',
                        isTop3 ? `${top3Borders[i]} ${top3Bgs[i]} hover:bg-white/5` : 'border-white/5 bg-white/2 hover:bg-white/4',
                      )}
                    >
                      {/* Rank # */}
                      <div className="w-8 text-center shrink-0">
                        {isTop3 ? (
                          <span className="text-xl">{MEDALS[i]}</span>
                        ) : (
                          <span className="text-white/20 font-mono text-sm font-bold">#{i + 1}</span>
                        )}
                      </div>

                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 overflow-hidden"
                        style={i === 0
                          ? { background: 'linear-gradient(135deg,#facc15,#d97706)', boxShadow: '0 0 14px rgba(250,204,21,0.4)' }
                          : { background: 'linear-gradient(135deg, #9b00ff, #00f5ff)' }
                        }
                      >
                        {entry.avatarUrl
                          ? <img src={entry.avatarUrl} alt={entry.username || ''} className="w-full h-full object-cover rounded-full" />
                          : entry.avatar
                        }
                      </div>

                      {/* Name + badge */}
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-sm truncate text-white/70">
                          {entry.username}
                        </p>
                        <div className="mt-0.5">
                          <RatingBadge tier={entry.tier} size="sm" showElo={false} />
                        </div>
                      </div>

                      {/* ELO + W/L */}
                      <div className="text-right shrink-0">
                        <p className="font-display font-bold text-base text-neon-purple">{entry.elo}</p>
                        <p className="text-white/25 font-mono text-[10px]">
                          {entry.rankedWins}W {entry.rankedLosses}L
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Gift leaderboard tab ─────────────────────────────────────────── */}
        {tab === 'gifts' && (
          <>
            {giftLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-3">
                  <div className="text-4xl animate-pulse">🎁</div>
                  <p className="text-white/30 font-mono text-sm">Loading gift rankings…</p>
                </div>
              </div>
            )}
            {!giftLoading && giftError && (
              <div className="glass-panel border border-neon-red/20 rounded-2xl p-6 text-center">
                <p className="text-neon-red/70 font-mono text-sm">{giftError}</p>
                <button onClick={loadGifts} className="mt-3 text-xs text-white/40 hover:text-white/60 font-mono underline">
                  Try again
                </button>
              </div>
            )}
            {!giftLoading && giftData && (
              <div className="space-y-6">
                <GiftLeaderSection
                  title="Top Gifters"
                  subtitle="MOST COINS SPENT ON GIFTS"
                  emoji="💝"
                  entries={giftData.topGifters}
                  valueKey="totalSpent"
                  valueSuffix=" coins"
                  onProfile={openProfile}
                />
                <GiftLeaderSection
                  title="Top Recipients"
                  subtitle="MOST GIFTS RECEIVED"
                  emoji="🎁"
                  entries={giftData.topRecipients}
                  valueKey="totalReceived"
                  valueSuffix=" coins"
                  onProfile={openProfile}
                />
              </div>
            )}
            {!giftLoading && !giftError && giftData && giftData.topGifters.length === 0 && giftData.topRecipients.length === 0 && (
              <div className="glass-panel border border-amber-400/10 rounded-2xl p-10 text-center">
                <div className="text-5xl mb-4 opacity-30">🎁</div>
                <p className="text-white/30 font-mono text-sm">No gifts sent yet.</p>
                <p className="text-white/15 font-mono text-xs mt-1">Send someone a gift to appear here!</p>
              </div>
            )}
          </>
        )}

        {/* ── Rankings tab ─────────────────────────────────────────────────── */}
        {tab === 'rankings' && loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="text-4xl animate-pulse">◈</div>
              <p className="text-white/30 font-mono text-sm">Loading rankings…</p>
            </div>
          </div>
        )}

        {tab === 'rankings' && !loading && error && (
          <div className="glass-panel border border-neon-red/20 rounded-2xl p-6 text-center">
            <p className="text-neon-red/70 font-mono text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-white/40 hover:text-white/60 font-mono underline">
              Try again
            </button>
          </div>
        )}

        {tab === 'rankings' && !loading && !error && players.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel border border-neon-pink/20 rounded-2xl p-10 text-center"
          >
            <div className="text-5xl mb-4 opacity-30">◈</div>
            <p className="text-white/30 font-mono text-sm">No players yet.</p>
            <p className="text-white/15 font-mono text-xs mt-1">Play some games to appear here!</p>
          </motion.div>
        )}

        {/* Podium */}
        {tab === 'rankings' && !loading && !error && top3.length === 3 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex gap-2 mb-4 items-end"
          >
            <PodiumCard player={top3[1]!} rank={1} onClick={() => openProfile(top3[1]!.id)} />
            <PodiumCard player={top3[0]!} rank={0} tall onClick={() => openProfile(top3[0]!.id)} />
            <PodiumCard player={top3[2]!} rank={2} onClick={() => openProfile(top3[2]!.id)} />
          </motion.div>
        )}

        {/* Full ranked list */}
        {tab === 'rankings' && !loading && !error && players.length > 0 && (
          <div className="space-y-2">
            {players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.03 }}
                onClick={() => openProfile(player.id)}
                className={clsx(
                  'flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer active:scale-[0.98]',
                  i < 3 ? `${MEDAL_BORDER[i]} ${MEDAL_BG[i]} hover:bg-white/5` : 'border-white/5 bg-white/2 hover:bg-white/4',
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
                    'w-9 h-9 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 overflow-hidden',
                    i === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                      : 'bg-gradient-to-br from-neon-pink to-neon-purple',
                  )}
                  style={i === 0 ? { boxShadow: '0 0 14px rgba(250,204,21,0.4)' } : undefined}
                >
                  {player.avatarUrl
                    ? <img src={player.avatarUrl} alt={player.username || ''} className="w-full h-full object-cover rounded-full" />
                    : player.avatar
                  }
                </div>

                {/* Name + XP bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={clsx(
                      'font-display font-semibold text-sm truncate',
                      player.isModerator ? 'text-neon-green'
                        : i < 3 ? MEDAL_TEXT[i] : 'text-white/60',
                    )}>
                      {player.username}
                    </p>
                    {player.isModerator && player.moderatorBadgeVisible && (
                      <ModBadge level={player.moderatorLevel} size="xs" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-20 h-1 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-pink"
                        style={{ width: `${levelPct(player.level ?? 1, player.xp ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-white/25 font-mono text-[10px]">
                      {player.stats.wins}W {player.stats.losses}L
                    </span>
                  </div>
                </div>

                {/* Level */}
                <div className="text-right shrink-0">
                  <p className={clsx('font-display font-bold text-base', levelColor(player.level ?? 1))}>
                    {(player.level ?? 1) >= MAX_LEVEL ? 'Lv.100 MAX' : `Lv.${player.level ?? 1}`}
                  </p>
                  <p className="text-white/25 font-mono text-[10px]">{player.stats.gamesPlayed}g · {player.stats.winRate}%</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GiftLeaderSection({
  title, subtitle, emoji, entries, valueKey, valueSuffix, onProfile,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  entries: GiftLeaderEntry[];
  valueKey: 'totalSpent' | 'totalReceived';
  valueSuffix: string;
  onProfile: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <div>
          <p className="font-display font-bold text-sm text-white/80">{title}</p>
          <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.profileId}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onProfile(entry.profileId)}
            className="flex items-center gap-3 p-3 rounded-2xl border cursor-pointer active:scale-[0.98] transition-colors"
            style={{
              background: i === 0 ? 'rgba(255,180,0,0.04)' : 'rgba(255,255,255,0.02)',
              border: i === 0 ? '1px solid rgba(255,180,0,0.15)' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div className="w-7 text-center shrink-0">
              {i < 3
                ? <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                : <span className="text-white/20 font-mono text-xs font-bold">#{i + 1}</span>
              }
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
            >
              {entry.avatarUrl
                ? <img src={entry.avatarUrl} alt={entry.username} className="w-full h-full object-cover rounded-full" />
                : entry.avatar
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm text-white/70 truncate">{entry.username}</p>
              <p className="font-mono text-[10px] text-white/25">{entry.giftCount} gifts</p>
            </div>
            <p className={clsx('font-display font-bold text-sm shrink-0', i === 0 ? 'text-amber-400' : 'text-white/40')}>
              {((entry[valueKey] ?? 0) as number).toLocaleString()}{valueSuffix}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PodiumCard({
  player,
  rank,
  tall = false,
  onClick,
}: {
  player: PlayerProfilePublic;
  rank: number;
  tall?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + rank * 0.05 }}
      onClick={onClick}
      className={clsx(
        'flex-1 glass-panel rounded-xl p-3 text-center border cursor-pointer hover:brightness-110 active:scale-95 transition-transform',
        rank === 0 ? 'border-yellow-400/25' : 'border-white/8',
        tall ? 'pb-4' : '',
      )}
      style={rank === 0 ? { boxShadow: '0 0 24px rgba(250,204,21,0.12)', marginBottom: 8 } : undefined}
    >
      <div className="text-2xl mb-1">{MEDALS[rank]}</div>
      <div
        className={clsx(
          'rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center font-bold text-white mx-auto mb-2 overflow-hidden',
          tall ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-base',
        )}
        style={rank === 0 ? { background: 'linear-gradient(135deg,#facc15,#d97706)', boxShadow: '0 0 16px rgba(250,204,21,0.5)' } : undefined}
      >
        {player.avatarUrl
          ? <img src={player.avatarUrl} alt={player.username || ''} className="w-full h-full object-cover rounded-full" />
          : player.avatar
        }
      </div>
      <p className={clsx('font-display font-bold truncate', tall ? 'text-sm' : 'text-xs', MEDAL_TEXT[rank])}>
        {player.username}
      </p>
      <p className={clsx('font-mono font-bold', tall ? 'text-lg' : 'text-sm', MEDAL_TEXT[rank])}>
        Lv.{player.level ?? 1}
      </p>
      <p className="text-white/25 font-mono text-[10px]">{player.stats.winRate}% · {player.stats.gamesPlayed}g</p>
    </motion.div>
  );
}

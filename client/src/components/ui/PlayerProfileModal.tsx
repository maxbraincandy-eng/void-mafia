import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { ModBadge } from '@/components/ui/ModBadge';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import type { Res, PublicProfileFull, FriendshipStatus, PlayerRoleStats } from '@/types/index';

interface Props {
  playerId: string | null;
  onClose: () => void;
}

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400];
function xpForLevel(level: number) { return LEVEL_THRESHOLDS[level - 1] ?? 0; }
function xpForNextLevel(level: number) { return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!; }
function levelColor(level: number) { return level >= 8 ? '#facc15' : level >= 5 ? '#00e5ff' : '#9b00ff'; }

function formatDate(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 86_400_000) return 'today';
  if (diff < 172_800_000) return 'yesterday';
  return d.toLocaleDateString();
}

const TEAM_COLOR: Record<string, string> = {
  mafia:   '#ff1e3c',
  town:    '#00ff88',
  neutral: '#facc15',
  cult:    '#9b00ff',
  yakuza:  '#00e5ff',
};
const TEAM_LABEL: Record<string, string> = {
  mafia: 'Mafia', town: 'Town', neutral: 'Neutral', cult: 'Cult', yakuza: 'Yakuza',
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="font-mono text-[11px] text-white/40">{label}</span>
      <span className="font-mono text-[11px] text-white/75 font-bold">{value}</span>
    </div>
  );
}

function TeamBreakdown({ roleStats }: { roleStats: PlayerRoleStats }) {
  if (!roleStats.byTeam.length) return null;
  return (
    <div className="space-y-0">
      {roleStats.byTeam.map(t => {
        const wr = t.games > 0 ? Math.round((t.wins / t.games) * 100) : 0;
        const col = TEAM_COLOR[t.team] ?? '#ffffff';
        return (
          <div key={t.team} className="flex items-center gap-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: col }} />
            <span className="font-mono text-[11px] flex-1" style={{ color: `${col}cc` }}>
              {TEAM_LABEL[t.team] ?? t.team}
            </span>
            <span className="font-mono text-[11px] text-white/50">{t.games}g</span>
            <span className="font-mono text-[11px] font-bold" style={{ color: `${col}cc` }}>{wr}% WR</span>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerProfileModal({ playerId, onClose }: Props) {
  const [data, setData] = useState<PublicProfileFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const myProfileId = useAuthStore(s => s.profile?.id);
  const { openDmWith } = useSocialStore();

  useEffect(() => {
    if (!playerId) { setData(null); return; }
    if (playerId === myProfileId) { onClose(); return; }
    setLoading(true);
    setData(null);
    emitWithAck<{ profileId: string }, Res<PublicProfileFull>>('player:public_profile', { profileId: playerId })
      .then(res => { if (res.ok) setData(res.data); })
      .finally(() => setLoading(false));
  }, [playerId, myProfileId]);

  const updateFriendStatus = (status: FriendshipStatus) =>
    setData(d => d ? { ...d, friendshipStatus: status } : null);

  const handleAddFriend = async () => {
    if (!data?.profile.friendCode) return;
    setActionLoading(true);
    const res = await emitWithAck<{ friendCode: string }, Res<null>>('friend:request', { friendCode: data.profile.friendCode });
    if (res.ok) updateFriendStatus('pending_sent');
    setActionLoading(false);
  };

  const handleAcceptFriend = async () => {
    if (!playerId) return;
    setActionLoading(true);
    const res = await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:accept', { fromProfileId: playerId });
    if (res.ok) updateFriendStatus('accepted');
    setActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    if (!playerId) return;
    setActionLoading(true);
    const res = await emitWithAck<{ profileId: string }, Res<null>>('friend:remove', { profileId: playerId });
    if (res.ok) updateFriendStatus('none');
    setActionLoading(false);
  };

  const handleDm = () => {
    if (!playerId) return;
    openDmWith(playerId);
    onClose();
  };

  const handleReport = async () => {
    if (!playerId || !data) return;
    const reason = prompt('Report reason (harassment, cheating, toxic_behavior, other):');
    if (!reason) return;
    await emitWithAck('player:report', { reportedId: playerId, reason, details: '' });
  };

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
            className="w-full max-w-xs glass-panel border border-neon-purple/30 rounded-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {loading && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
              </div>
            )}

            {!loading && !data && (
              <div className="p-5">
                <p className="text-center text-white/30 font-mono text-sm py-4">Profile not found</p>
                <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/10 text-white/35 font-mono text-xs">
                  Close
                </button>
              </div>
            )}

            {!loading && data && (() => {
              const { profile, achievements, clan, friendshipStatus, isOnline, roleStats } = data;
              const level = profile.level ?? 1;
              const xp = profile.xp ?? 0;
              const xpMin = xpForLevel(level);
              const xpMax = xpForNextLevel(level);
              const xpPct = xpMax > xpMin ? Math.min(100, Math.round(((xp - xpMin) / (xpMax - xpMin)) * 100)) : 100;
              const col = levelColor(level);
              const survived = roleStats?.totalSurvived ?? 0;
              const totalGames = roleStats?.totalGames ?? profile.stats.gamesPlayed;
              const survivalRate = totalGames > 0 ? Math.round((survived / totalGames) * 100) : 0;

              return (
                <>
                  {/* Scrollable content */}
                  <div className="overflow-y-auto flex-1 overscroll-contain">
                    {/* ── Hero band ─────────────────────────────── */}
                    <div
                      className="px-5 pt-5 pb-4 relative"
                      style={{ background: `linear-gradient(160deg, ${col}10 0%, rgba(6,3,20,0) 60%)` }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold"
                            style={{
                              background: 'linear-gradient(135deg,rgba(255,0,128,0.6),rgba(138,43,226,0.6))',
                              border: `2px solid ${col}60`,
                            }}
                          >
                            {profile.avatarUrl
                              ? <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                              : profile.avatar}
                          </div>
                          {isOnline && (
                            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-neon-green rounded-full border-2 border-void" />
                          )}
                          <div
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full font-mono font-bold text-[9px] whitespace-nowrap"
                            style={{ background: `${col}25`, border: `1px solid ${col}60`, color: col }}
                          >
                            Lv.{level}
                          </div>
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <h3 className={`font-display font-bold text-base leading-tight ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                              {profile.username}
                            </h3>
                            {profile.isModerator && profile.moderatorBadgeVisible && (
                              <ModBadge level={profile.moderatorLevel} />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {profile.publicId != null && (
                              <span
                                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(0,229,255,0.08)', color: 'rgba(0,229,255,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}
                              >
                                ID #{profile.publicId}
                              </span>
                            )}
                            {isOnline
                              ? <span className="text-neon-green font-mono text-[9px]">● online</span>
                              : <span className="text-white/25 font-mono text-[9px]">Last: {formatDate(roleStats?.lastGameAt ?? profile.joinedAt)}</span>
                            }
                          </div>
                        </div>
                      </div>

                      {/* XP bar */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono text-[9px]" style={{ color: `${col}80` }}>XP {xp - xpMin} / {xpMax - xpMin}</span>
                          <span className="font-mono text-[9px]" style={{ color: `${col}80` }}>{xpPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${xpPct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${col}90, ${col})` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="px-5 pb-3 space-y-3">
                      {/* ── Clan ───────────────────────────────── */}
                      {clan ? (
                        <div className="rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-neon-cyan text-xs font-bold">[{clan.tag}]</span>
                            <span className="font-mono text-white/60 text-xs truncate flex-1">{clan.name}</span>
                            <span className="font-mono text-[9px] text-white/30 capitalize">{clan.memberRole}</span>
                          </div>
                          <p className="font-mono text-[9px] text-white/25">
                            Joined {new Date(clan.joinedAt).toLocaleDateString()} · {clan.memberCount} members
                          </p>
                        </div>
                      ) : (
                        <p className="text-center font-mono text-[10px] text-white/20 py-1">Not in a clan</p>
                      )}

                      {/* ── Stats grid ─────────────────────────── */}
                      <div className="grid grid-cols-4 gap-1.5">
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

                      {/* ── Info rows ──────────────────────────── */}
                      <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-1">
                        <StatRow label="Survival" value={totalGames > 0 ? `${survived}/${totalGames} (${survivalRate}%)` : '—'} />
                        <StatRow label="First game" value={formatDate(roleStats?.firstGameAt ?? undefined)} />
                        <StatRow label="Last played" value={formatDate(roleStats?.lastGameAt ?? undefined)} />
                        <StatRow label="Joined" value={new Date(profile.joinedAt).toLocaleDateString()} />
                      </div>

                      {/* ── Team breakdown ─────────────────────── */}
                      {roleStats && roleStats.byTeam.length > 0 && (
                        <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                          <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider mb-1.5">By Team</p>
                          <TeamBreakdown roleStats={roleStats} />
                        </div>
                      )}

                      {/* ── Achievements ───────────────────────── */}
                      {achievements.length > 0 && (
                        <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                          <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider mb-1.5">
                            Achievements ({achievements.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {achievements.slice(0, 10).map(a => (
                              <span key={a.key} className="text-xl" title={`${a.name}: ${a.description}`}>{a.icon}</span>
                            ))}
                            {achievements.length > 10 && (
                              <span className="text-white/30 font-mono text-xs self-center">+{achievements.length - 10}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── DM button ──────────────────────────── */}
                      <button
                        onClick={handleDm}
                        className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-colors"
                        style={{
                          background: 'rgba(155,0,255,0.15)',
                          border: '1px solid rgba(155,0,255,0.35)',
                          color: 'rgba(200,100,255,0.9)',
                        }}
                      >
                        ✉ Send Message
                      </button>

                      {/* ── Friend action ───────────────────────── */}
                      {friendshipStatus === 'none' && (
                        <button
                          onClick={handleAddFriend}
                          disabled={actionLoading || !profile.friendCode}
                          className="w-full py-2 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan font-mono text-xs hover:bg-neon-cyan/20 transition-colors disabled:opacity-40"
                        >
                          + Add Friend
                        </button>
                      )}
                      {friendshipStatus === 'pending_sent' && (
                        <button disabled className="w-full py-2 rounded-xl border border-white/10 text-white/30 font-mono text-xs opacity-50 cursor-not-allowed">
                          Request Sent
                        </button>
                      )}
                      {friendshipStatus === 'pending_received' && (
                        <button
                          onClick={handleAcceptFriend}
                          disabled={actionLoading}
                          className="w-full py-2 rounded-xl border border-neon-green/30 bg-neon-green/10 text-neon-green font-mono text-xs hover:bg-neon-green/20 transition-colors disabled:opacity-40"
                        >
                          ✓ Accept Friend Request
                        </button>
                      )}
                      {friendshipStatus === 'accepted' && (
                        <button
                          onClick={handleRemoveFriend}
                          disabled={actionLoading}
                          className="w-full py-2 rounded-xl border border-neon-red/20 text-neon-red/60 font-mono text-xs hover:bg-neon-red/10 transition-colors disabled:opacity-40"
                        >
                          Remove Friend
                        </button>
                      )}

                      {/* ── Report + Close ──────────────────────── */}
                      <div className="flex gap-2 pb-1">
                        <button
                          onClick={handleReport}
                          className="flex-1 py-2 rounded-xl border border-white/5 text-white/20 hover:text-neon-red/50 hover:border-neon-red/20 font-mono text-[10px] transition-colors"
                        >
                          Report
                        </button>
                        <button
                          onClick={onClose}
                          className="flex-1 py-2 rounded-xl border border-white/10 text-white/35 hover:text-white/60 font-mono text-xs transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

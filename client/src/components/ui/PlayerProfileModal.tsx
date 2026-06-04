import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { ModBadge } from '@/components/ui/ModBadge';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import type { Res, PublicProfileFull, FriendshipStatus } from '@/types/index';

interface Props {
  playerId: string | null;
  onClose: () => void;
}

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400];
function xpForLevel(level: number) { return LEVEL_THRESHOLDS[level - 1] ?? 0; }
function xpForNextLevel(level: number) { return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!; }

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
            className="w-full max-w-xs glass-panel border border-neon-purple/30 rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
              </div>
            )}

            {!loading && data && (() => {
              const { profile, achievements, clan, friendshipStatus, isOnline } = data;
              const level = profile.level ?? 1;
              const xp = profile.xp ?? 0;
              const xpMin = xpForLevel(level);
              const xpMax = xpForNextLevel(level);
              const xpPct = xpMax > xpMin ? Math.min(100, Math.round(((xp - xpMin) / (xpMax - xpMin)) * 100)) : 100;
              const levelColor = level >= 8 ? '#facc15' : level >= 5 ? '#00e5ff' : '#9b00ff';

              return (
                <>
                  {/* Hero band — avatar + name + level */}
                  <div
                    className="px-5 pt-5 pb-4 relative"
                    style={{ background: `linear-gradient(160deg, ${levelColor}10 0%, rgba(6,3,20,0) 60%)` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold"
                          style={{ background: 'linear-gradient(135deg,rgba(255,0,128,0.6),rgba(138,43,226,0.6))', border: `2px solid ${levelColor}60` }}>
                          {profile.avatarUrl
                            ? <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                            : profile.avatar}
                        </div>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-neon-green rounded-full border-2 border-void" />
                        )}
                        {/* Level ring label */}
                        <div
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full font-mono font-bold text-[9px] whitespace-nowrap"
                          style={{ background: `${levelColor}25`, border: `1px solid ${levelColor}60`, color: levelColor }}
                        >
                          Lv.{level}
                        </div>
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <h3 className={`font-display font-bold text-base truncate ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                            {profile.username}
                          </h3>
                          {profile.isModerator && profile.moderatorBadgeVisible && (
                            <ModBadge level={profile.moderatorLevel} />
                          )}
                        </div>
                        {/* ID + joined */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {profile.publicId != null && (
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: 'rgba(0,229,255,0.08)', color: 'rgba(0,229,255,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}>
                              ID #{profile.publicId}
                            </span>
                          )}
                          {isOnline
                            ? <span className="text-neon-green font-mono text-[9px]">● online</span>
                            : <span className="text-white/20 font-mono text-[9px]">Joined {new Date(profile.joinedAt).toLocaleDateString()}</span>
                          }
                        </div>
                      </div>
                    </div>

                    {/* XP progress bar */}
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-[9px]" style={{ color: `${levelColor}80` }}>XP {xp - xpMin} / {xpMax - xpMin}</span>
                        <span className="font-mono text-[9px]" style={{ color: `${levelColor}80` }}>{xpPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${xpPct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${levelColor}90, ${levelColor})` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-5 space-y-3">
                    {/* Clan */}
                    {clan && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5">
                        <span className="font-mono text-neon-cyan text-xs font-bold">[{clan.tag}]</span>
                        <span className="font-mono text-white/50 text-xs truncate">{clan.name}</span>
                      </div>
                    )}

                    {/* Stats grid */}
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

                    {/* Achievements */}
                    {achievements.length > 0 && (
                      <div>
                        <p className="font-mono text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                          Achievements ({achievements.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {achievements.slice(0, 8).map(a => (
                            <span key={a.key} className="text-xl" title={`${a.name}: ${a.description}`}>{a.icon}</span>
                          ))}
                          {achievements.length > 8 && (
                            <span className="text-white/30 font-mono text-xs self-center">+{achievements.length - 8}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DM button — full width, prominent */}
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

                    {/* Friend action */}
                    <div>
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
                    </div>

                    {/* Report + Close */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleReport}
                        className="flex-1 py-1.5 rounded-xl border border-white/5 text-white/20 hover:text-neon-red/50 hover:border-neon-red/20 font-mono text-[10px] transition-colors"
                      >
                        Report
                      </button>
                      <button
                        onClick={onClose}
                        className="flex-1 py-1.5 rounded-xl border border-white/10 text-white/35 hover:text-white/60 font-mono text-xs transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}

            {!loading && !data && (
              <div className="p-5">
                <p className="text-center text-white/30 font-mono text-sm py-4">Profile not found</p>
                <button onClick={onClose} className="w-full py-2 rounded-xl border border-white/10 text-white/35 font-mono text-xs">
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

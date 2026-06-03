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
            className="w-full max-w-xs glass-panel border border-neon-purple/30 rounded-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
              </div>
            )}

            {!loading && data && (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-2xl font-bold flex-shrink-0">
                      {data.profile.avatar}
                    </div>
                    {data.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-neon-green rounded-full border-2 border-void" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className={`font-display font-bold text-base truncate ${data.profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                        {data.profile.username}
                      </h3>
                      {data.profile.isModerator && data.profile.moderatorBadgeVisible && (
                        <ModBadge level={data.profile.moderatorLevel} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-white/25 font-mono text-[10px]">
                        Joined {new Date(data.profile.joinedAt).toLocaleDateString()}
                      </p>
                      {data.isOnline && (
                        <span className="text-neon-green font-mono text-[9px]">● online</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Clan */}
                {data.clan && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5">
                    <span className="font-mono text-neon-cyan text-xs font-bold">[{data.clan.tag}]</span>
                    <span className="font-mono text-white/50 text-xs truncate">{data.clan.name}</span>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                  {[
                    { label: 'Games', value: data.profile.stats.gamesPlayed, color: 'text-neon-cyan' },
                    { label: 'Wins',  value: data.profile.stats.wins,        color: 'text-neon-green' },
                    { label: 'Loss',  value: data.profile.stats.losses,      color: 'text-neon-red/80' },
                    { label: 'WR',    value: `${data.profile.stats.winRate}%`, color: 'text-neon-pink' },
                  ].map(s => (
                    <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-2 text-center">
                      <p className={`font-display font-bold text-base ${s.color}`}>{s.value}</p>
                      <p className="text-white/25 text-[9px] font-mono">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Achievements */}
                {data.achievements.length > 0 && (
                  <div className="mb-4">
                    <p className="font-mono text-[10px] text-white/30 uppercase tracking-wider mb-2">
                      Achievements ({data.achievements.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.achievements.slice(0, 8).map(a => (
                        <span key={a.key} className="text-xl" title={`${a.name}: ${a.description}`}>{a.icon}</span>
                      ))}
                      {data.achievements.length > 8 && (
                        <span className="text-white/30 font-mono text-xs self-center">+{data.achievements.length - 8}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Social actions */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* Friend action */}
                  {data.friendshipStatus === 'none' && (
                    <button
                      onClick={handleAddFriend}
                      disabled={actionLoading || !data.profile.friendCode}
                      className="py-2 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan font-mono text-xs hover:bg-neon-cyan/20 transition-colors disabled:opacity-40"
                    >
                      + Add Friend
                    </button>
                  )}
                  {data.friendshipStatus === 'pending_sent' && (
                    <button
                      disabled
                      className="py-2 rounded-xl border border-white/10 text-white/30 font-mono text-xs opacity-50 cursor-not-allowed"
                    >
                      Request Sent
                    </button>
                  )}
                  {data.friendshipStatus === 'pending_received' && (
                    <button
                      onClick={handleAcceptFriend}
                      disabled={actionLoading}
                      className="py-2 rounded-xl border border-neon-green/30 bg-neon-green/10 text-neon-green font-mono text-xs hover:bg-neon-green/20 transition-colors disabled:opacity-40"
                    >
                      Accept Friend
                    </button>
                  )}
                  {data.friendshipStatus === 'accepted' && (
                    <button
                      onClick={handleRemoveFriend}
                      disabled={actionLoading}
                      className="py-2 rounded-xl border border-neon-red/20 text-neon-red/60 font-mono text-xs hover:bg-neon-red/10 transition-colors disabled:opacity-40"
                    >
                      Remove Friend
                    </button>
                  )}

                  {/* DM button */}
                  <button
                    onClick={handleDm}
                    className="py-2 rounded-xl border border-neon-purple/30 bg-neon-purple/10 text-neon-purple font-mono text-xs hover:bg-neon-purple/20 transition-colors"
                  >
                    ✉ Message
                  </button>
                </div>

                {/* Report */}
                <button
                  onClick={handleReport}
                  className="w-full py-1.5 rounded-xl border border-white/5 text-white/20 hover:text-neon-red/50 hover:border-neon-red/20 font-mono text-[10px] transition-colors mb-2"
                >
                  Report Player
                </button>
              </>
            )}

            {!loading && !data && (
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

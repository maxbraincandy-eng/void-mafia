import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { Friend, FriendRequest } from '@/types/index';
import type { Res } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';

const LEVEL_COLORS = ['text-white/40', 'text-neon-cyan/70', 'text-neon-purple/80', 'text-neon-pink/80', 'text-yellow-400'];
function lvlColor(level: number) { return LEVEL_COLORS[Math.min(Math.floor((level - 1) / 2), LEVEL_COLORS.length - 1)]; }

export function FriendsPanel() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [addCode, setAddCode] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const { pendingFriendRequests } = useGameStore(s => ({ pendingFriendRequests: s.pendingFriendRequests }));
  const profile = useAuthStore(s => s.profile);

  const refresh = () => {
    emitWithAck<void, Res<Friend[]>>('friend:list')
      .then(res => { if (res.ok) setFriends(res.data ?? []); })
      .catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCode.trim()) return;
    setAddLoading(true);
    setAddError('');
    const res = await emitWithAck<{ friendCode: string }, Res<null>>('friend:request', { friendCode: addCode.trim() });
    setAddLoading(false);
    if (res.ok) {
      setAddCode('');
    } else {
      setAddError(res.error);
    }
  };

  const accept = async (fromProfileId: string) => {
    await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:accept', { fromProfileId });
    useGameStore.setState(s => ({
      pendingFriendRequests: s.pendingFriendRequests.filter(r => r.fromId !== fromProfileId),
    }));
    refresh();
  };

  const decline = async (fromProfileId: string) => {
    await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:decline', { fromProfileId });
    useGameStore.setState(s => ({
      pendingFriendRequests: s.pendingFriendRequests.filter(r => r.fromId !== fromProfileId),
    }));
  };

  const remove = async (profileId: string) => {
    await emitWithAck<{ profileId: string }, Res<null>>('friend:remove', { profileId });
    setFriends(f => f.filter(x => x.profileId !== profileId));
  };

  const online = friends.filter(f => f.isOnline);
  const offline = friends.filter(f => !f.isOnline);

  return (
    <div className="space-y-4">
      {/* My friend code */}
      {profile?.friendCode && (
        <div className="px-3 py-2 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-white/30">Your code</p>
            <p className="font-display font-bold text-neon-cyan text-lg tracking-widest">#{profile.friendCode}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(profile.friendCode!)}
            className="font-mono text-[9px] text-white/30 hover:text-neon-cyan/70 transition-colors uppercase tracking-wider"
          >
            copy
          </button>
        </div>
      )}

      {/* Add friend */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={addCode}
          onChange={e => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4-digit code…"
          inputMode="numeric"
          maxLength={4}
          className="flex-1 bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-neon-cyan/30 font-mono tracking-widest"
        />
        <button
          type="submit"
          disabled={addLoading || addCode.length < 4}
          className="px-4 py-2 rounded-xl font-display font-bold text-xs tracking-wider uppercase border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-all disabled:opacity-40"
        >
          {addLoading ? '…' : 'Add'}
        </button>
      </form>
      {addError && <p className="text-xs text-neon-red/80 font-mono">{addError}</p>}

      {/* Pending requests */}
      <AnimatePresence>
        {pendingFriendRequests.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-[9px] font-display uppercase tracking-[0.25em] text-neon-pink/50 mb-2">
              Requests ({pendingFriendRequests.length})
            </p>
            <div className="space-y-2">
              {pendingFriendRequests.map(req => (
                <div key={req.id} className="flex items-center gap-2 p-2 rounded-xl border border-neon-pink/15 bg-neon-pink/5">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(255,0,128,0.4), rgba(138,43,226,0.4))', border: '1px solid rgba(138,43,226,0.3)' }}>
                    {(req as any).fromAvatarUrl
                      ? <img src={(req as any).fromAvatarUrl} alt={req.fromUsername} className="w-full h-full object-cover rounded-full" />
                      : req.fromAvatar
                    }
                  </div>
                  <span className="flex-1 text-sm text-white font-semibold truncate">{req.fromUsername}</span>
                  <button
                    onClick={() => accept(req.fromId)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold text-neon-green border border-neon-green/30 bg-neon-green/8 hover:bg-neon-green/15 transition-all"
                  >✓</button>
                  <button
                    onClick={() => decline(req.fromId)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold text-white/40 border border-white/10 hover:bg-white/8 transition-all"
                  >✕</button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online friends */}
      {online.length > 0 && (
        <div>
          <p className="text-[9px] font-display uppercase tracking-[0.25em] text-neon-green/50 mb-2">
            Online ({online.length})
          </p>
          <div className="space-y-1.5">
            {online.map(f => (
              <FriendRow key={f.profileId} friend={f} onRemove={remove} />
            ))}
          </div>
        </div>
      )}

      {/* Offline friends */}
      {offline.length > 0 && (
        <div>
          <p className="text-[9px] font-display uppercase tracking-[0.25em] text-white/25 mb-2">
            Offline ({offline.length})
          </p>
          <div className="space-y-1.5 opacity-60">
            {offline.map(f => (
              <FriendRow key={f.profileId} friend={f} onRemove={remove} />
            ))}
          </div>
        </div>
      )}


      {friends.length === 0 && pendingFriendRequests.length === 0 && (
        <div className="text-center py-8 text-white/20 font-mono text-sm">
          <p className="text-3xl mb-2">👥</p>
          <p>No friends yet</p>
          <p className="text-[10px] mt-1 text-white/15">Add friends by their 4-digit code</p>
        </div>
      )}
    </div>
  );
}

function FriendRow({ friend, onRemove }: { friend: Friend; onRemove: (id: string) => void }) {
  const { openProfile, openDmWith } = useSocialStore();
  return (
    <div
      onClick={() => openProfile(friend.profileId)}
      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/4 transition-colors group cursor-pointer"
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-base flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(255,0,128,0.4), rgba(138,43,226,0.4))', border: '1px solid rgba(138,43,226,0.3)' }}>
          {friend.avatarUrl
            ? <img src={friend.avatarUrl} alt={friend.username} className="w-full h-full object-cover rounded-full" />
            : friend.avatar
          }
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-void ${
            friend.isOnline ? 'bg-neon-green' : 'bg-white/20'
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-semibold truncate leading-tight">{friend.username}</p>
        <p className={`text-[9px] font-mono ${lvlColor(friend.level)}`}>Lv.{friend.level}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); openDmWith(friend.profileId); }}
        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-neon-purple/70 transition-all text-xs px-1"
        title="Message"
      >
        ✉
      </button>
      <button
        onClick={e => { e.stopPropagation(); onRemove(friend.profileId); }}
        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-neon-red/60 transition-all text-xs px-1"
        title="Remove friend"
      >
        ✕
      </button>
    </div>
  );
}

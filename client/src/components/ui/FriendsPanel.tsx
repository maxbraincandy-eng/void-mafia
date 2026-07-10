import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { Friend, FriendRequest } from '@/types/index';
import type { Res } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import { useT } from '@/store/langStore';

const LEVEL_COLORS = ['text-white/40', 'text-neon-cyan/70', 'text-neon-purple/80', 'text-neon-pink/80', 'text-yellow-400'];
function lvlColor(level: number) { return LEVEL_COLORS[Math.min(Math.floor((level - 1) / 2), LEVEL_COLORS.length - 1)]; }

type Suggestion = { profileId: string; username: string; avatar: string; avatarUrl: string | null; mutualCount: number };

export function FriendsPanel() {
  const t = useT();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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

  const refreshSuggestions = () => {
    emitWithAck<void, Res<Suggestion[]>>('friend:suggestions')
      .then(res => { if (res.ok) setSuggestions(res.data ?? []); })
      .catch(() => {});
  };

  useEffect(() => { refresh(); refreshSuggestions(); }, []);

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

  const ONLINE_STATUSES = ['online', 'in_game', 'in_lounge', 'spectating'];
  const online = friends.filter(f => f.isOnline || ONLINE_STATUSES.includes(f.playerStatus ?? ''));
  const offline = friends.filter(f => !f.isOnline && !ONLINE_STATUSES.includes(f.playerStatus ?? ''));

  return (
    <div className="space-y-4">
      {/* My friend code */}
      {profile?.friendCode && (
        <div className="px-3 py-2 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-wider text-white/30">Your code</p>
            <p className="font-display font-bold text-neon-cyan text-lg tracking-widest">#{profile.friendCode}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(profile.friendCode!)}
            className="font-mono text-[12px] text-white/30 hover:text-neon-cyan/70 transition-colors uppercase tracking-wider"
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
            <p className="text-[12px] font-display uppercase tracking-[0.25em] text-neon-pink/50 mb-2">
              Requests ({pendingFriendRequests.length})
            </p>
            <div className="space-y-2">
              {pendingFriendRequests.map(req => (
                <div key={req.id} className="flex items-center gap-2 p-2 rounded-xl border border-neon-pink/15 bg-neon-pink/5">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(255,0,128,0.4), rgba(138,43,226,0.4))', border: '1px solid rgba(138,43,226,0.3)' }}>
                    {req.fromAvatarUrl
                      ? <img src={req.fromAvatarUrl} alt={req.fromUsername} className="w-full h-full object-cover rounded-full" />
                      : req.fromAvatar
                    }
                  </div>
                  <span className="flex-1 text-sm text-white font-semibold truncate">{req.fromUsername}</span>
                  <button
                    onClick={() => accept(req.fromId)}
                    className="px-2 py-1 rounded-lg text-[12px] font-bold text-neon-green border border-neon-green/30 bg-neon-green/8 hover:bg-neon-green/15 transition-all"
                  >✓</button>
                  <button
                    onClick={() => decline(req.fromId)}
                    className="px-2 py-1 rounded-lg text-[12px] font-bold text-white/40 border border-white/10 hover:bg-white/8 transition-all"
                  >✕</button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online / In Game friends */}
      {online.length > 0 && (
        <div>
          <p className="text-[12px] font-display uppercase tracking-[0.25em] text-neon-green/50 mb-2">
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
          <p className="text-[12px] font-display uppercase tracking-[0.25em] text-white/25 mb-2">
            Offline ({offline.length})
          </p>
          <div className="space-y-1.5 opacity-60">
            {offline.map(f => (
              <FriendRow key={f.profileId} friend={f} onRemove={remove} />
            ))}
          </div>
        </div>
      )}


      {/* Friend suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-[12px] font-display uppercase tracking-[0.25em] text-neon-purple/50 mb-2">
            {t.uiMisc.maybeKnow}
          </p>
          <div className="space-y-1.5">
            {suggestions.map(s => (
              <SuggestionRow key={s.profileId} suggestion={s} onSent={(id) => setSuggestions(prev => prev.filter(x => x.profileId !== id))} />
            ))}
          </div>
        </div>
      )}

      {friends.length === 0 && pendingFriendRequests.length === 0 && (
        <div className="text-center py-8 text-white/20 font-mono text-sm">
          <p className="text-3xl mb-2">👥</p>
          <p>No friends yet</p>
          <p className="text-[12px] mt-1 text-white/15">Add friends by their 4-digit code</p>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ suggestion, onSent }: { suggestion: Suggestion; onSent: (id: string) => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { openProfile } = useSocialStore();
  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    const res = await emitWithAck<{ toProfileId: string }, Res<null>>('friend:request', { toProfileId: suggestion.profileId });
    setSending(false);
    if (res.ok) { setSent(true); setTimeout(() => onSent(suggestion.profileId), 600); }
  };
  return (
    <div
      onClick={() => openProfile(suggestion.profileId)}
      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/4 transition-colors cursor-pointer"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-base flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, rgba(138,43,226,0.4), rgba(0,212,255,0.4))', border: '1px solid rgba(138,43,226,0.3)' }}>
        {suggestion.avatarUrl
          ? <img src={suggestion.avatarUrl} alt={suggestion.username} className="w-full h-full object-cover rounded-full" />
          : suggestion.avatar
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-semibold truncate leading-tight">{suggestion.username}</p>
        <p className="text-[11px] font-mono text-neon-purple/50">{suggestion.mutualCount} mutual</p>
      </div>
      <button
        onClick={handleAdd}
        disabled={sending || sent}
        className="text-[11px] font-mono px-2.5 py-1 rounded-lg transition-all active:scale-95 flex-shrink-0 disabled:opacity-50"
        style={{ background: sent ? 'rgba(0,255,136,.14)' : 'rgba(138,43,226,.14)', border: `1px solid ${sent ? 'rgba(0,255,136,.4)' : 'rgba(138,43,226,.4)'}`, color: sent ? '#00ff88' : '#c084fc' }}
      >
        {sent ? '✓' : sending ? '…' : '+ Add'}
      </button>
    </div>
  );
}

function FriendRow({ friend, onRemove }: { friend: Friend; onRemove: (id: string) => void }) {
  const { openProfile, openDmWith, requestJoinLounge, closeDm } = useSocialStore();
  const joinPresence = (e: React.MouseEvent) => {
    e.stopPropagation();
    const p = friend.presence;
    if (!p) return;
    closeDm();
    if (p.kind === 'lounge') {
      requestJoinLounge(p.code);
    } else {
      const name = useAuthStore.getState().profile?.username ?? 'Player';
      useGameStore.getState().joinRoom(p.code, name).catch(() => {});
    }
  };
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
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-void"
          style={{
            background: friend.playerStatus === 'in_game'
              ? '#00f5ff'
              : (friend.playerStatus === 'online' || friend.isOnline)
                ? '#00ff88'
                : 'rgba(255,255,255,0.2)',
            boxShadow: friend.playerStatus === 'in_game'
              ? '0 0 4px rgba(0,245,255,0.7)'
              : friend.playerStatus === 'online' || friend.isOnline
                ? '0 0 4px rgba(0,255,136,0.5)'
                : 'none',
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-semibold truncate leading-tight">{friend.username}</p>
        <p className={`text-[12px] font-mono ${lvlColor(friend.level)}`}>
          {friend.playerStatus === 'in_game' ? (
            <span style={{ color: '#00f5ff' }}>🎮 In Game</span>
          ) : friend.playerStatus === 'in_lounge' ? (
            <span style={{ color: '#c084fc' }}>🎬 {friend.presence?.label ?? 'In Lounge'}</span>
          ) : friend.playerStatus === 'spectating' ? (
            <span style={{ color: '#facc15' }}>👁 Watching</span>
          ) : friend.playerStatus === 'online' || friend.isOnline ? (
            <span style={{ color: '#00ff88' }}>Online</span>
          ) : (
            <span className={lvlColor(friend.level)}>Lv.{friend.level}</span>
          )}
        </p>
      </div>
      {friend.presence && (
        <button
          onClick={joinPresence}
          className="text-[11px] font-mono px-2.5 py-1 rounded-lg transition-all active:scale-95 flex-shrink-0"
          style={{ background: friend.presence.kind === 'lounge' ? 'rgba(155,0,255,.16)' : 'rgba(0,245,255,.14)', border: `1px solid ${friend.presence.kind === 'lounge' ? 'rgba(155,0,255,.4)' : 'rgba(0,245,255,.4)'}`, color: friend.presence.kind === 'lounge' ? '#c084fc' : '#00f5ff' }}
          title="Join"
        >
          → Join
        </button>
      )}
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

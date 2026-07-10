import { useState, useEffect, useCallback } from 'react';
import { emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { useGameStore } from '@/store/gameStore';
import { useSocialStore } from '@/store/socialStore';
import type { Friend, Res } from '@/types/index';

const ONLINE = ['online', 'in_game', 'in_lounge', 'spectating'];

/** Live horizontal strip of online friends at the top of the feed. */
export function FriendsPresenceStrip({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const t = useT();
  const [friends, setFriends] = useState<Friend[]>([]);
  const requestJoinLounge = useSocialStore(s => s.requestJoinLounge);

  const refresh = useCallback(() => {
    emitWithAck<void, Res<Friend[]>>('friend:list')
      .then(res => { if (res.ok) setFriends((res.data ?? []).filter(f => f.isOnline || ONLINE.includes(f.playerStatus ?? ''))); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  if (friends.length === 0) return null;

  // Friends who are doing something joinable come first.
  const sorted = [...friends].sort((a, b) => (b.presence ? 1 : 0) - (a.presence ? 1 : 0));

  const tap = (f: Friend) => {
    const p = f.presence;
    if (!p) { onOpenProfile(f.profileId); return; }
    if (p.kind === 'lounge') requestJoinLounge(p.code);
    else {
      const name = useAuthStore.getState().profile?.username ?? 'Player';
      useGameStore.getState().joinRoom(p.code, name).catch(() => {});
    }
  };

  const dot = (f: Friend) =>
    f.playerStatus === 'in_game' ? '#00f5ff'
    : f.playerStatus === 'in_lounge' ? '#c084fc'
    : f.playerStatus === 'spectating' ? '#facc15'
    : '#00ff88';

  return (
    <div className="-mx-1 px-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1.5">{t.commB.onlineFriends} · {friends.length}</p>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {sorted.map(f => (
          <button key={f.profileId} onClick={() => tap(f)}
            className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform" style={{ width: 56 }}>
            <div className="relative">
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-lg"
                style={{ background: 'linear-gradient(135deg, rgba(255,0,128,0.35), rgba(138,43,226,0.35))', border: `2px solid ${dot(f)}` }}>
                {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : f.avatar}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-[#0a041a]" style={{ background: dot(f), boxShadow: `0 0 6px ${dot(f)}` }} />
              {f.presence && (
                <span className="absolute -top-1 -right-1 text-[10px]">{f.presence.kind === 'lounge' ? '🎬' : '🎮'}</span>
              )}
            </div>
            <span className="font-mono text-[9px] text-white/55 truncate" style={{ maxWidth: 54 }}>
              {f.presence ? <span style={{ color: dot(f) }}>→ Join</span> : f.username}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

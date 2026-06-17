import { useState, useEffect } from 'react';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityProfileV2 } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, Spinner, EmptyState } from '@/components/community/shared';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

function PersonCard({ person, onOpenProfile }: { person: CommunityProfileV2; onOpenProfile: (id: string) => void }) {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const { followUser, unfollowUser } = useCommunityStore();
  const [followBusy, setFollowBusy] = useState(false);
  const [following, setFollowing] = useState(person.isFollowedByMe);
  const isSelf = currentUser?.id === person.id;
  const isMrMax = person.badges?.includes('owner');

  async function handleFollow() {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      if (following) { await unfollowUser(person.id); setFollowing(false); }
      else { await followUser(person.id); setFollowing(true); }
    } finally { setFollowBusy(false); }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all"
      style={{ borderColor: isMrMax ? 'rgba(255,215,0,0.3)' : 'rgba(155,0,255,0.18)', background: isMrMax ? 'rgba(255,215,0,0.03)' : 'rgba(255,255,255,0.02)' }}
    >
      <button onClick={() => onOpenProfile(person.id)} className="flex-shrink-0 active:scale-95 transition-transform">
        <Avatar avatar={person.avatar} avatarUrl={person.avatarUrl} size={40} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isMrMax ? (
            <MrMaxGlow><span className="font-mono text-sm text-yellow-300 font-bold truncate">{person.username}</span></MrMaxGlow>
          ) : (
            <span className="font-mono text-sm text-white/80 truncate">{person.username}</span>
          )}
          {person.badges?.length > 0 && <BadgeRow badges={person.badges} max={3} />}
        </div>
        <p className="font-mono text-[10px] text-white/35">
          {person.followersCount} {t.community.profile.followers}
          {person.reputation > 0 && ` · ⭐ ${person.reputation}`}
        </p>
      </div>
      {!isSelf && (
        <button
          onClick={handleFollow}
          disabled={followBusy}
          className="flex-shrink-0 px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40"
          style={{
            background: following ? 'rgba(0,245,255,0.1)' : 'rgba(155,0,255,0.15)',
            border: `1px solid ${following ? 'rgba(0,245,255,0.3)' : 'rgba(155,0,255,0.35)'}`,
            color: following ? '#00f5ff' : '#c084fc',
          }}
        >
          {following ? t.community.profile.unfollow : t.community.profile.follow}
        </button>
      )}
    </div>
  );
}

export function PeopleTab({ onOpenProfile }: { onOpenProfile: (playerId: string) => void }) {
  const t = useT();
  const { peopleList, onlineMembers, onlineMemberCount, fetchPeopleList, fetchOnlineMembers } = useCommunityStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchPeopleList(), fetchOnlineMembers()]);
      setLoading(false);
    })();
  }, [fetchPeopleList, fetchOnlineMembers]);

  return (
    <div className="space-y-5">
      <h2 className="font-display font-bold text-white text-lg">{t.community.people.title}</h2>

      {/* Online now */}
      {onlineMembers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">{t.community.people.online}</span>
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}
            >
              {onlineMemberCount} {t.community.people.onlineCount}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {onlineMembers.slice(0, 12).map(m => (
              <button
                key={m.playerId}
                onClick={() => onOpenProfile(m.playerId)}
                className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-90 transition-transform"
              >
                <div className="relative">
                  <Avatar avatar={m.avatar} avatarUrl={m.avatarUrl} size={40} />
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black"
                    style={{ background: '#00ff88' }}
                  />
                </div>
                <span className="font-mono text-[9px] text-white/50 max-w-[48px] truncate">{m.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All members */}
      <div className="space-y-2">
        <h3 className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">{t.community.people.title}</h3>
        {loading ? (
          <Spinner color="#9b00ff" />
        ) : peopleList.length === 0 ? (
          <EmptyState text={t.community.people.empty} />
        ) : (
          <div className="space-y-2">
            {peopleList.map(person => (
              <PersonCard key={person.id} person={person} onOpenProfile={onOpenProfile} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

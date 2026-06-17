import { useState, useEffect } from 'react';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useSocialStore } from '@/store/socialStore';
import type { CommunityProfileV2 } from '@/types/index';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { Spinner, PillButton, ModalShell, Avatar, BadgeRow, MrMaxGlow } from '@/components/community/shared';

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <p className="font-display font-bold text-white text-lg leading-none">{value}</p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-white/35 mt-0.5">{label}</p>
    </div>
  );
}

export function ProfileModalV2({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const { followUser, unfollowUser } = useCommunityStore();
  const openDmWith = useSocialStore(s => s.openDmWith);
  const [profile, setProfile] = useState<CommunityProfileV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await emitWithAck<any, Res<CommunityProfileV2>>('community:profile', { profileId });
        if (!cancelled && res.ok) setProfile(res.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  async function handleToggleFollow() {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = profile.isFollowedByMe;
    setProfile(p => p ? {
      ...p,
      isFollowedByMe: !wasFollowing,
      followersCount: wasFollowing ? Math.max(0, p.followersCount - 1) : p.followersCount + 1,
    } : p);
    try {
      if (wasFollowing) await unfollowUser(profileId);
      else await followUser(profileId);
    } catch {
      setProfile(p => p ? {
        ...p,
        isFollowedByMe: wasFollowing,
        followersCount: wasFollowing ? p.followersCount + 1 : Math.max(0, p.followersCount - 1),
      } : p);
    } finally {
      setFollowBusy(false);
    }
  }

  const isMrMax = profile?.badges?.includes('owner');
  const isSelf = currentUser?.id === profile?.id;

  return (
    <ModalShell onClose={onClose} accent="purple" maxWidthClass="max-w-md">
      {loading || !profile ? (
        <Spinner color="#9b00ff" />
      ) : (
        <div className="space-y-4">
          {/* Cover banner */}
          {profile.coverUrl && (
            <div className="-mx-6 -mt-6 mb-2 h-24 rounded-t-3xl overflow-hidden">
              <img src={profile.coverUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Avatar + name + badges */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className={isMrMax ? 'ring-2 ring-yellow-400/60 ring-offset-2 ring-offset-black rounded-full' : ''}>
              <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} size={72} />
            </div>

            <div className="space-y-1">
              {isMrMax ? (
                <MrMaxGlow><h3 className="font-display font-bold text-yellow-300 text-xl">{profile.username}</h3></MrMaxGlow>
              ) : (
                <h3 className="font-display font-bold text-white text-xl">{profile.username}</h3>
              )}
              {profile.badges?.length > 0 && (
                <div className="flex justify-center"><BadgeRow badges={profile.badges} max={6} /></div>
              )}
            </div>

            {profile.bio && (
              <p className="font-mono text-xs text-white/55 text-center max-w-xs leading-relaxed">{profile.bio}</p>
            )}

            {profile.clanTag && (
              <span className="font-mono text-[10px] text-white/35">[{profile.clanTag}] {profile.clanName}</span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-around rounded-2xl border border-white/10 bg-white/[0.02] py-3">
            <StatBox label={t.community.profile.followers} value={profile.followersCount} />
            <StatBox label={t.community.profile.following} value={profile.followingCount} />
            <StatBox label={t.community.profile.posts} value={profile.postsCount} />
            {profile.reputation > 0 && <StatBox label={t.community.profile.reputation} value={profile.reputation} />}
          </div>

          {/* Level + clan */}
          <div className="flex items-center justify-center gap-3">
            <span
              className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border"
              style={{ color: 'rgba(180,80,255,0.95)', borderColor: 'rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.12)' }}
            >
              {t.community.profile.level}: {profile.level}
            </span>
            {profile.favoriteRole && (
              <span className="font-mono text-[10px] text-white/35">⚙ {profile.favoriteRole}</span>
            )}
          </div>

          {/* Action buttons */}
          {!isSelf && (
            <div className="flex gap-2">
              <PillButton
                onClick={handleToggleFollow}
                disabled={followBusy}
                accent={profile.isFollowedByMe ? 'cyan' : 'purple'}
                className="flex-1 justify-center"
              >
                {profile.isFollowedByMe ? t.community.profile.unfollow : t.community.profile.follow}
              </PillButton>
              <PillButton
                onClick={() => { onClose(); openDmWith(profileId); }}
                accent="purple"
                className="flex-1 justify-center"
              >
                {t.community.profile.message ?? 'Message'}
              </PillButton>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

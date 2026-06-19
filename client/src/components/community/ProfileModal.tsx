import { useState, useEffect } from 'react';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityProfile } from '@/types/index';
import { Spinner, PillButton, ModalShell, Avatar } from '@/components/community/shared';

export function ProfileModal({ profileId, onClose }: { profileId: string; onClose: () => void }): JSX.Element {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const { fetchProfile, followUser, unfollowUser } = useCommunityStore();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fetched = await fetchProfile(profileId);
      if (!cancelled) {
        setProfile(fetched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId, fetchProfile]);

  async function handleToggleFollow() {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = profile.isFollowedByMe;
    setProfile({
      ...profile,
      isFollowedByMe: !wasFollowing,
      followersCount: wasFollowing ? Math.max(0, profile.followersCount - 1) : profile.followersCount + 1,
    });
    try {
      if (wasFollowing) await unfollowUser(profileId);
      else await followUser(profileId);
    } catch {
      // revert optimistic update on failure
      setProfile(prev => prev ? {
        ...prev,
        isFollowedByMe: wasFollowing,
        followersCount: wasFollowing ? prev.followersCount + 1 : Math.max(0, prev.followersCount - 1),
      } : prev);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} accent="purple" maxWidthClass="max-w-md">
      {loading || !profile ? (
        <Spinner color="#9b00ff" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} size={72} />
            <h3 className="font-display font-bold text-white text-xl">{profile.username}</h3>
            <span
              className="font-mono text-[12px] uppercase tracking-wider px-2.5 py-1 rounded-full border"
              style={{ color: 'rgba(180,80,255,0.95)', borderColor: 'rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.12)' }}
            >
              {t.community.profile.level}: {profile.level}
            </span>
            <p className="font-mono text-xs text-white/45">
              {profile.clanTag || profile.clanName
                ? `${t.community.profile.clan}: ${profile.clanTag ? `[${profile.clanTag}] ` : ''}${profile.clanName ?? ''}`
                : t.community.profile.noClan}
            </p>
          </div>

          <div className="flex items-center justify-around rounded-2xl border border-white/10 bg-white/[0.02] py-3">
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">{profile.followersCount}</p>
              <p className="font-mono text-[12px] uppercase tracking-wider text-white/35">{t.community.profile.followers}</p>
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">{profile.followingCount}</p>
              <p className="font-mono text-[12px] uppercase tracking-wider text-white/35">{t.community.profile.following}</p>
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">{profile.postsCount}</p>
              <p className="font-mono text-[12px] uppercase tracking-wider text-white/35">{t.community.profile.posts}</p>
            </div>
          </div>

          <p className="font-mono text-[11px] text-white/30 text-center">
            {t.community.profile.joined}: {new Date(profile.joinedAt).toLocaleDateString()}
          </p>

          {profile.id !== currentUser?.id && (
            <PillButton onClick={handleToggleFollow} disabled={followBusy} accent={profile.isFollowedByMe ? 'cyan' : 'purple'} className="w-full justify-center">
              {profile.isFollowedByMe ? t.community.profile.unfollow : t.community.profile.follow}
            </PillButton>
          )}
        </div>
      )}
    </ModalShell>
  );
}

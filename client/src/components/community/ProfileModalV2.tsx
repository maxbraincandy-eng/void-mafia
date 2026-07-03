import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useSocialStore } from '@/store/socialStore';
import type { CommunityProfileV2 } from '@/types/index';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, Spinner } from '@/components/community/shared';

function parseCoverUrl(url: string): { type: 'gradient' | 'image'; src: string; posY: number } {
  if (url.startsWith('gradient:')) return { type: 'gradient', src: url.slice(9), posY: 50 };
  if (url.startsWith('imagepos:')) {
    const rest = url.slice(9);
    const i = rest.indexOf(':');
    return { type: 'image', src: rest.slice(i + 1), posY: parseInt(rest.slice(0, i), 10) || 50 };
  }
  return { type: 'image', src: url, posY: 50 };
}

export function ProfileModalV2({
  profileId,
  onClose,
  onOpenFullProfile,
}: {
  profileId: string;
  onClose: () => void;
  onOpenFullProfile?: () => void;
}) {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const { followUser, unfollowUser } = useCommunityStore();
  const openDmWith = useSocialStore(s => s.openDmWith);
  const [profile, setProfile] = useState<CommunityProfileV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    emitWithAck<any, Res<CommunityProfileV2>>('community:profile', { profileId }).then(r => {
      if (!cancelled && r.ok) setProfile(r.data);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profileId]);

  const handleToggleFollow = async () => {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    const was = profile.isFollowedByMe;
    setProfile(p => p ? {
      ...p,
      isFollowedByMe: !was,
      followersCount: was ? Math.max(0, p.followersCount - 1) : p.followersCount + 1,
    } : p);
    try {
      if (was) await unfollowUser(profileId);
      else await followUser(profileId);
    } catch {
      setProfile(p => p ? {
        ...p,
        isFollowedByMe: was,
        followersCount: was ? p.followersCount + 1 : Math.max(0, p.followersCount - 1),
      } : p);
    } finally { setFollowBusy(false); }
  };

  const isMrMax = profile?.badges?.includes('owner');
  const isSelf  = currentUser?.id === profileId;
  const isLoggedIn = !!currentUser;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
        className="w-full sm:max-w-sm overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #120d24 0%, #0d0a1a 100%)',
          border: '1px solid rgba(155,0,255,0.22)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
        </div>
        {/* Close button */}
        <div className="flex justify-end pt-2 pr-3 pb-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>✕</span>
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><Spinner color="#9b00ff" /></div>
        ) : !profile ? (
          <div className="py-10 text-center font-mono text-sm text-white/30">Not found</div>
        ) : (
          <div className="px-5 pt-2 pb-5">
            {/* Cover strip */}
            {profile.coverUrl && (() => {
              const cover = parseCoverUrl(profile.coverUrl);
              return (
              <div className="-mx-5 -mt-2 mb-4 h-20 overflow-hidden" style={{ position: 'relative' }}>
                {cover.type === 'gradient' ? (
                  <div className="w-full h-full" style={{ background: cover.src }} />
                ) : (
                  <img src={cover.src} alt="" className="w-full h-full object-cover" style={{ objectPosition: `center ${cover.posY}%` }} />
                )}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 10%, rgba(13,10,26,0.4) 40%, rgba(13,10,26,0.85) 70%, rgba(13,10,26,1) 100%)' }} />
              </div>
              );
            })()}

            {/* Avatar + info row */}
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className={isMrMax ? 'ring-2 ring-yellow-400/60 ring-offset-1 ring-offset-[#0d0a1a] rounded-full flex-shrink-0' : 'flex-shrink-0'}>
                <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} size={52} />
              </div>

              <div className="min-w-0 flex-1">
                {isMrMax ? (
                  <MrMaxGlow>
                    <p className="font-display font-bold text-yellow-300 text-base leading-tight truncate">{profile.username}</p>
                  </MrMaxGlow>
                ) : (
                  <p className="font-display font-bold text-white text-base leading-tight truncate">{profile.username}</p>
                )}

                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span
                    className="font-mono text-[12px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(155,0,255,0.15)', color: '#c084fc', border: '1px solid rgba(155,0,255,0.3)' }}
                  >
                    {t.community.profile.level} {profile.level}
                  </span>
                  {profile.clanTag && (
                    <span className="font-mono text-[12px] text-white/35">[{profile.clanTag}]</span>
                  )}
                  {profile.publicId && (
                    <span className="font-mono text-[12px] text-white/25">#{profile.publicId}</span>
                  )}
                </div>

                {profile.badges?.length > 0 && (
                  <div className="mt-1"><BadgeRow badges={profile.badges} max={5} /></div>
                )}
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="font-mono text-[11px] text-white/50 leading-relaxed mb-3 line-clamp-2">{profile.bio}</p>
            )}

            {/* Stats strip */}
            <div
              className="flex items-center rounded-xl mb-3 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {[
                { label: t.community.profile.posts, value: profile.postsCount },
                { label: t.community.profile.followers, value: profile.followersCount },
                { label: t.community.profile.following, value: profile.followingCount },
              ].map((s, i) => (
                <div key={s.label} className="flex-1 py-2.5 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <p className="font-display font-bold text-white text-sm leading-none">{s.value}</p>
                  <p className="font-mono text-[12px] uppercase tracking-wider text-white/30 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {/* Open Profile — primary CTA */}
              {onOpenFullProfile && (
                <button
                  onClick={onOpenFullProfile}
                  className="w-full py-3 rounded-2xl font-mono text-[11px] uppercase tracking-wider font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.14))',
                    border: '1px solid rgba(155,0,255,0.45)',
                    color: '#e0c0ff',
                  }}
                >
                  <span style={{ fontSize: 15 }}>👤</span>
                  <span>{t.community.profile.openProfile ?? 'Open Profile'}</span>
                </button>
              )}

              {/* Follow / Unfollow + Message */}
              {!isSelf && isLoggedIn && (
                <div className="flex gap-2">
                  <button
                    onClick={handleToggleFollow}
                    disabled={followBusy}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[12px] uppercase tracking-wider font-bold transition-all active:scale-95 disabled:opacity-50"
                    style={profile.isFollowedByMe ? {
                      background: 'rgba(0,245,255,0.08)',
                      border: '1px solid rgba(0,245,255,0.3)',
                      color: '#00f5ff',
                    } : {
                      background: 'rgba(155,0,255,0.14)',
                      border: '1px solid rgba(155,0,255,0.35)',
                      color: '#c084fc',
                    }}
                  >
                    {profile.isFollowedByMe
                      ? t.community.profile.unfollow
                      : t.community.profile.follow}
                  </button>

                  <button
                    onClick={() => { onClose(); openDmWith(profileId); }}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[12px] uppercase tracking-wider font-bold transition-all active:scale-95"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.55)',
                    }}
                  >
                    {t.community.profile.message}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}

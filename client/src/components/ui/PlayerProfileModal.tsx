import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { socket } from '@/lib/socket';
import { ModBadge } from '@/components/ui/ModBadge';
import { ReportModal } from '@/components/ui/ReportModal';
import { SendGiftModal } from '@/components/ui/SendGiftModal';
import { ShareCardModal } from '@/components/ui/ShareCardModal';
import { GiftGallery } from '@/components/ui/GiftGallery';
import { CoinHistoryModal } from '@/components/ui/CoinHistoryModal';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { useGameStore } from '@/store/gameStore';
import type { Res, PublicProfileFull, FriendshipStatus, PlayerRoleStats, ModeratorLevel, WarnCategory, ClanRole, CommunityPostV2, CommunityProfileV2 } from '@/types/index';
import {
  getFrameById, getTitleById, getWallpaperById, getBorderById, getNameColorById, nameColorGlow,
  FRAMES, TITLES, BORDERS, WALLPAPERS, ROLE_SKINS, NAME_COLORS,
  RARITY_COLOR, RARITY_LABEL, type CosmeticRarity,
} from '@/constants/cosmetics';
import type { ProfileCardData } from '@/components/ui/ProfileCard';
import { MAX_LEVEL, xpForLevel, xpForNextLevel, levelColor } from '@/lib/level';
import { tNow } from '@/store/langStore';

// ── Gift carousel constants ───────────────────────────────────────────
const G_BG: Record<string, string> = {
  common:    'rgba(255,255,255,0.04)',
  uncommon:  'rgba(0,229,255,0.07)',
  rare:      'rgba(155,0,255,0.10)',
  epic:      'rgba(255,0,204,0.10)',
  legendary: 'rgba(255,180,0,0.12)',
};
const G_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.09)',
  uncommon:  'rgba(0,229,255,0.20)',
  rare:      'rgba(155,0,255,0.30)',
  epic:      'rgba(255,0,204,0.32)',
  legendary: 'rgba(255,180,0,0.42)',
};
const G_TEXT: Record<string, string> = {
  common: 'text-white/45', uncommon: 'text-cyan-400', rare: 'text-purple-400',
  epic:   'text-pink-400',  legendary: 'text-amber-400',
};

type AggGift = { gift: import('@/types/index').PlayerGift; count: number };

function GiftSwipeViewer({ items, startIdx, onClose }: { items: AggGift[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  const [dir, setDir] = useState(0);
  const touchX = useRef(0);

  const cur = items[idx];
  if (!cur) return null;
  const { gift, count } = cur;

  const goPrev = () => { if (idx > 0) { setDir(-1); setIdx(i => i - 1); } };
  const goNext = () => { if (idx < items.length - 1) { setDir(1); setIdx(i => i + 1); } };

  const borderCol = G_BORDER[gift.giftRarity] ?? 'rgba(255,255,255,0.12)';

  return (
    <motion.div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-md px-5"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <AnimatePresence mode="popLayout" custom={dir}>
        <motion.div
          key={idx}
          custom={dir}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: d * 70, scale: 0.92 }),
            center: { opacity: 1, x: 0, scale: 1 },
            exit: (d: number) => ({ opacity: 0, x: d * -50, scale: 0.92 }),
          }}
          initial="enter" animate="center" exit="exit"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative w-full max-w-xs rounded-2xl p-5"
          style={{ background: 'rgba(7,2,20,0.98)', border: `1px solid ${borderCol}`, boxShadow: `0 0 60px ${G_BG[gift.giftRarity] ?? 'rgba(0,0,0,0)'}` }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (dx < -50) goNext(); else if (dx > 50) goPrev();
          }}
        >
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-white/30 hover:text-white/70 text-[13px] transition-colors">✕</button>

          <div className="text-center mb-5">
            {gift.giftImageUrl
              ? <img src={gift.giftImageUrl} alt={gift.giftName} className="w-24 h-24 rounded-2xl object-cover mx-auto mb-3 shadow-2xl" />
              : <div className="text-7xl mb-3 leading-none select-none">{gift.giftIcon}</div>}
            <h3 className="font-display font-bold text-white text-lg mb-1.5">{gift.giftName}</h3>
            <div className="flex items-center justify-center gap-0.5 mb-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`text-[15px] ${i < gift.giftStars ? 'text-amber-400' : 'text-white/10'}`}>★</span>
              ))}
            </div>
            <span className={`font-mono text-[12px] uppercase tracking-widest ${G_TEXT[gift.giftRarity] ?? 'text-white/40'}`}>
              {gift.giftRarity}
            </span>
            <p className="font-mono text-[13px] text-white/35 mt-2">
              Received <span className="text-white/75 font-bold">×{count}</span>
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={goPrev} disabled={idx === 0}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl text-white/40 hover:text-white/85 disabled:opacity-15 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            >‹</button>
            <span className="font-mono text-[12px] text-white/25 select-none">{idx + 1} / {items.length}</span>
            <button
              onClick={goNext} disabled={idx === items.length - 1}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl text-white/40 hover:text-white/85 disabled:opacity-15 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            >›</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

const MOD_RANK: Record<ModeratorLevel, number> = { moderator: 0, senior_moderator: 1, admin: 2, owner: 3 };
function modRank(lvl: ModeratorLevel | null | undefined) { return lvl ? (MOD_RANK[lvl] ?? -1) : -1; }

const WARN_CATEGORIES: { value: WarnCategory; label: string }[] = [
  { value: 'offensive_language',      label: 'Offensive Language' },
  { value: 'voice_abuse',             label: 'Voice Abuse' },
  { value: 'spam',                    label: 'Spam' },
  { value: 'game_sabotage',           label: 'Game Sabotage' },
  { value: 'harassment',              label: 'Harassment' },
  { value: 'inappropriate_avatar_name', label: 'Inappropriate Avatar/Name' },
  { value: 'bug_abuse',               label: 'Bug Abuse' },
  { value: 'other',                   label: 'Other' },
];

const BAN_DURATIONS = [
  { value: 900,     label: '15 minutes' },
  { value: 3600,    label: '1 hour' },
  { value: 21600,   label: '6 hours' },
  { value: 86400,   label: '24 hours' },
  { value: 604800,  label: '7 days' },
  { value: -1,      label: 'Permanent (owner only)' },
];

interface Props {
  playerId: string | null;
  onClose: () => void;
}

type ProfileTab = 'overview' | 'posts' | 'items';

// ── Cosmetics showcase ────────────────────────────────────────────────
type ShowcaseItem = { id: string; name: string; rarity: CosmeticRarity; swatch: [string, string] };

function CosmeticsShowcase({ cosmetics }: { cosmetics: import('@/types/index').PlayerCosmetics | undefined }) {
  const unlocked = new Set(cosmetics?.unlockedItems ?? []);
  const equipped = new Set(
    [cosmetics?.equippedFrame, cosmetics?.equippedTitle, cosmetics?.equippedBorder,
     cosmetics?.equippedWallpaper, cosmetics?.equippedRoleSkin, cosmetics?.equippedNameColor]
      .filter(Boolean) as string[]
  );

  const sections: { label: string; items: ShowcaseItem[] }[] = [
    { label: 'Frames',    items: FRAMES.map(f => ({ id: f.id, name: f.name, rarity: f.rarity, swatch: f.colors })) },
    { label: 'Borders',   items: BORDERS.map(b => ({ id: b.id, name: b.name, rarity: b.rarity, swatch: b.colors })) },
    { label: 'Titles',    items: TITLES.map(t => ({ id: t.id, name: t.name, rarity: t.rarity, swatch: [t.color, t.color] })) },
    { label: 'Wallpapers',items: WALLPAPERS.map(w => ({ id: w.id, name: w.name, rarity: w.rarity, swatch: [w.accent, w.accent] })) },
    { label: 'Role Skins',items: ROLE_SKINS.map(s => ({ id: s.id, name: s.name, rarity: s.rarity, swatch: [s.c1, s.c2] })) },
    { label: 'Name Colors',items: NAME_COLORS.map(n => ({ id: n.id, name: n.name, rarity: n.rarity, swatch: [n.color, n.color] })) },
  ];

  const ownedCount = [...unlocked].length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider">Collection</p>
        <span className="font-mono text-[12px] text-white/25">{ownedCount} unlocked</span>
      </div>
      {sections.map(sec => {
        const owned = sec.items.filter(it => unlocked.has(it.id));
        return (
          <div key={sec.label}>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="font-mono text-[12px] text-white/40 uppercase tracking-wider">{sec.label}</p>
              <span className="font-mono text-[11px] text-white/20">{owned.length}/{sec.items.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {sec.items.map(it => {
                const has = unlocked.has(it.id);
                const isOn = equipped.has(it.id);
                const rc = RARITY_COLOR[it.rarity];
                return (
                  <div
                    key={it.id}
                    className="rounded-xl px-2 py-2 flex flex-col items-center gap-1 relative"
                    style={{
                      background: has ? `${rc}10` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${has ? `${rc}40` : 'rgba(255,255,255,0.05)'}`,
                      opacity: has ? 1 : 0.4,
                    }}
                    title={`${it.name} · ${RARITY_LABEL[it.rarity]}${has ? '' : ' (locked)'}`}
                  >
                    {isOn && (
                      <span className="absolute -top-1 -right-1 text-[10px] px-1 rounded-full font-mono font-bold"
                        style={{ background: rc, color: '#03000d' }}>ON</span>
                    )}
                    <span
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${it.swatch[0]}, ${it.swatch[1]})`, boxShadow: has ? `0 0 8px ${rc}55` : 'none' }}
                    />
                    <span className="font-mono text-[10px] text-center leading-tight" style={{ color: has ? `${rc}dd` : 'rgba(255,255,255,0.3)' }}>
                      {has ? it.name : '🔒'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── User posts list (read-only) ───────────────────────────────────────
function UserPostsList({ authorId }: { authorId: string }) {
  const [posts, setPosts] = useState<CommunityPostV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    emitWithAck<{ authorId: string; before?: number }, Res<CommunityPostV2[]>>('community:user_posts', { authorId })
      .then(res => { if (alive && res.ok) setPosts(res.data); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authorId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
      </div>
    );
  }
  if (posts.length === 0) {
    return <p className="text-center font-mono text-[12px] text-white/25 py-8">No posts yet</p>;
  }
  return (
    <div className="space-y-2">
      {posts.map(p => (
        <div key={p.id} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
          {p.content && <p className="text-white/80 text-[13px] leading-snug whitespace-pre-wrap break-words">{p.content}</p>}
          {(p.imageUrl || p.gifUrl) && (
            <img src={(p.imageUrl ?? p.gifUrl)!} alt="" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
          )}
          {p.recTitle && (
            <p className="mt-1 font-mono text-[12px] text-neon-cyan/80">★ {p.recTitle}</p>
          )}
          <div className="flex items-center gap-3 mt-2 font-mono text-[11px] text-white/30">
            <span>♥ {p.likesCount}</span>
            <span>💬 {p.commentsCount}</span>
            <span className="ml-auto">{formatDate(p.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Followers / Following list overlay ────────────────────────────────
function FollowListOverlay({ profileId, mode, onClose }: { profileId: string; mode: 'followers' | 'following'; onClose: () => void }) {
  const [list, setList] = useState<CommunityProfileV2[]>([]);
  const [loading, setLoading] = useState(true);
  const ev = mode === 'followers' ? 'community:followers_list' : 'community:following_list';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    emitWithAck<{ profileId: string }, Res<CommunityProfileV2[]>>(ev, { profileId })
      .then(res => { if (alive && res.ok) setList(res.data); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [profileId, ev]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[310] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-xs glass-panel border border-neon-purple/30 rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <span className="font-display font-bold text-white text-sm capitalize">{mode}</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/30 hover:text-white/70 text-[13px]">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
          {loading ? (
            [0,1,2,3].map(i => <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)
          ) : list.length === 0 ? (
            <p className="text-center font-mono text-[12px] text-white/25 py-6">No {mode} yet</p>
          ) : (
            list.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-white/3 border border-white/6">
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,rgba(255,0,128,0.5),rgba(138,43,226,0.5))' }}>
                  {u.avatarUrl ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" /> : u.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] text-white/80 truncate">{u.username}</p>
                  <p className="font-mono text-[11px] text-white/30">Lv.{u.level}{u.clanTag ? ` · [${u.clanTag}]` : ''}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

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
  const [showReport, setShowReport] = useState(false);
  const [showSendGift, setShowSendGift] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showCoinHistory, setShowCoinHistory] = useState(false);
  // Mod action panel: null | 'warn' | 'kick' | 'ban'
  const [modPanel, setModPanel] = useState<null | 'warn' | 'kick' | 'ban'>(null);
  const [modReason, setModReason] = useState('');
  const [modCategory, setModCategory] = useState<WarnCategory>('other');
  const [modBanDuration, setModBanDuration] = useState(3600);
  const [modActionLoading, setModActionLoading] = useState(false);
  const [carouselGifts, setCarouselGifts] = useState<import('@/types/index').PlayerGift[]>([]);
  const [carouselLoading, setCarouselLoading] = useState(false);
  const [aggGifts, setAggGifts] = useState<AggGift[]>([]);
  const [giftViewerIdx, setGiftViewerIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [v2, setV2] = useState<CommunityProfileV2 | null>(null);
  const [followList, setFollowList] = useState<null | 'followers' | 'following'>(null);

  const t = useT();
  const myProfile = useAuthStore(s => s.profile);
  const myProfileId = myProfile?.id;
  const myRank = modRank(myProfile?.moderatorLevel);
  const isMod = myRank >= 0;
  const myClanId = useAuthStore(s => s.myClanId);
  const myClanRole = useAuthStore(s => s.myClanRole);

  const { openDmWith } = useSocialStore();
  const addToast = useGameStore(s => s.addToast);
  const room = useGameStore(s => s.room);

  // Clan moderation state
  const [clanModPanel, setClanModPanel] = useState<null | 'warn' | 'kick'>(null);
  const [clanModReason, setClanModReason] = useState('');
  const [clanModLoading, setClanModLoading] = useState(false);

  const isClanRoom = !!(room?.clanRoom && room?.clanId);
  const hasClanModPower = isClanRoom && room?.clanId === myClanId &&
    (myClanRole === 'owner' || myClanRole === 'admin' || myClanRole === 'moderator');

  const isSelf = !!playerId && playerId === myProfileId;

  useEffect(() => {
    if (!playerId) { setData(null); setCarouselGifts([]); setV2(null); return; }
    setLoading(true);
    setData(null);
    setV2(null);
    setTab('overview');
    emitWithAck<{ profileId: string }, Res<PublicProfileFull>>('player:public_profile', { profileId: playerId })
      .then(res => { if (res.ok) setData(res.data); })
      .finally(() => setLoading(false));
    // Social counts (followers / following / posts) — best-effort, non-blocking
    emitWithAck<{ profileId: string }, Res<CommunityProfileV2 | null>>('community:profile', { profileId: playerId })
      .then(res => { if (res.ok && res.data) setV2(res.data); })
      .catch(() => {});
  }, [playerId]);

  useEffect(() => {
    if (!data?.profile.id) { setCarouselGifts([]); return; }
    setCarouselLoading(true);
    emitWithAck<any, Res<import('@/types/index').PlayerGift[]>>('gifts:player_gifts', { profileId: data.profile.id })
      .then(res => { if (res.ok) setCarouselGifts(res.data); })
      .finally(() => setCarouselLoading(false));
  }, [data?.profile.id]);

  useEffect(() => {
    const map = new Map<string, AggGift>();
    for (const g of carouselGifts) {
      const e = map.get(g.giftId);
      if (e) e.count++;
      else map.set(g.giftId, { gift: g, count: 1 });
    }
    setAggGifts(Array.from(map.values()));
  }, [carouselGifts]);

  const openModPanel = useCallback((panel: 'warn' | 'kick' | 'ban') => {
    setModPanel(panel);
    setModReason('');
    setModCategory('other');
    setModBanDuration(3600);
  }, []);

  const closeModPanel = useCallback(() => setModPanel(null), []);

  const doModWarn = useCallback(() => {
    if (!playerId || !modReason.trim()) { addToast('Reason required', 'error'); return; }
    setModActionLoading(true);
    socket.emit('mod:warn' as any, { targetProfileId: playerId, reason: modReason, category: modCategory }, (res: Res<null>) => {
      setModActionLoading(false);
      if (res.ok) { addToast(`Warning sent`, 'success'); closeModPanel(); }
      else addToast(res.error, 'error');
    });
  }, [playerId, modReason, modCategory, addToast, closeModPanel]);

  const doModKick = useCallback(() => {
    if (!playerId || !modReason.trim()) { addToast('Reason required', 'error'); return; }
    setModActionLoading(true);
    socket.emit('mod:kick_player' as any, { targetProfileId: playerId, reason: modReason }, (res: Res<null>) => {
      setModActionLoading(false);
      if (res.ok) { addToast(`Player kicked`, 'success'); closeModPanel(); }
      else addToast(res.error, 'error');
    });
  }, [playerId, modReason, addToast, closeModPanel]);

  const doModBan = useCallback(() => {
    if (!playerId || !modReason.trim()) { addToast('Reason required', 'error'); return; }
    if (modBanDuration === -1 && myRank < 3) { addToast('Permanent ban requires owner', 'error'); return; }
    const duration = modBanDuration === -1 ? 365 * 24 * 3600 : modBanDuration;
    setModActionLoading(true);
    socket.emit('mod:ban' as any, { targetProfileId: playerId, reason: modReason, duration }, (res: Res<null>) => {
      setModActionLoading(false);
      if (res.ok) { addToast(`Player banned`, 'success'); closeModPanel(); onClose(); }
      else addToast(res.error, 'error');
    });
  }, [playerId, modReason, modBanDuration, myRank, addToast, closeModPanel, onClose]);

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

  const doClanWarn = useCallback(() => {
    if (!playerId || !clanModReason.trim()) { addToast('Reason required', 'error'); return; }
    setClanModLoading(true);
    socket.emit('clanRoom:warn' as any, { targetPlayerId: playerId, reason: clanModReason }, (res: Res<null>) => {
      setClanModLoading(false);
      if (res.ok) { addToast('Clan warning sent', 'success'); setClanModPanel(null); setClanModReason(''); }
      else addToast(res.error, 'error');
    });
  }, [playerId, clanModReason, addToast]);

  const doClanKick = useCallback(() => {
    if (!playerId || !clanModReason.trim()) { addToast('Reason required', 'error'); return; }
    setClanModLoading(true);
    socket.emit('clanRoom:kick' as any, { targetPlayerId: playerId, reason: clanModReason }, (res: Res<null>) => {
      setClanModLoading(false);
      if (res.ok) { addToast('Player removed from clan room', 'success'); setClanModPanel(null); setClanModReason(''); onClose(); }
      else addToast(res.error, 'error');
    });
  }, [playerId, clanModReason, addToast, onClose]);

  return (
    <>
    <AnimatePresence>
      {playerId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
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
              const frameDef = getFrameById(profile.cosmetics?.equippedFrame ?? null);
              const titleDef = getTitleById(profile.cosmetics?.equippedTitle ?? null);
              const wallpaperDef = getWallpaperById(profile.cosmetics?.equippedWallpaper ?? null);
              const borderDef = getBorderById(profile.cosmetics?.equippedBorder ?? null);
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
                      className="px-5 pt-7 pb-4 relative"
                      style={{
                        background: wallpaperDef
                          ? wallpaperDef.gradient
                          : `linear-gradient(160deg, ${col}12 0%, rgba(6,3,20,0) 65%)`,
                      }}
                    >
                      {/* Close button */}
                      <button
                        onClick={onClose}
                        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full transition-all text-[13px]"
                        style={{ color: 'rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.05)' }}
                      >✕</button>

                      {/* Avatar — centered */}
                      <div className="flex flex-col items-center mb-2">
                        <div className="relative">
                          {(frameDef || borderDef) ? (
                            <div
                              className={`w-20 h-20 rounded-full p-[2.5px] ${borderDef ? borderDef.animationClass : ''}`}
                              style={{
                                background: `linear-gradient(135deg, ${(borderDef ?? frameDef)!.colors[0]}, ${(borderDef ?? frameDef)!.colors[1]})`,
                                boxShadow: `0 0 16px ${(borderDef ?? frameDef)!.glow}`,
                              }}>
                              <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold"
                                style={{ background: 'linear-gradient(135deg,rgba(255,0,128,0.6),rgba(138,43,226,0.6))' }}>
                                {profile.avatarUrl
                                  ? <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                                  : profile.avatar}
                              </div>
                            </div>
                          ) : (
                            <div
                              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold"
                              style={{
                                background: 'linear-gradient(135deg,rgba(255,0,128,0.6),rgba(138,43,226,0.6))',
                                border: `2px solid ${col}60`,
                                boxShadow: `0 0 20px ${col}20`,
                              }}
                            >
                              {profile.avatarUrl
                                ? <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                                : profile.avatar}
                            </div>
                          )}
                          {isOnline && (
                            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-neon-green rounded-full border-2 border-void" />
                          )}
                          <div
                            className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full font-mono font-bold text-[11px] whitespace-nowrap"
                            style={{ background: `${col}25`, border: `1px solid ${col}60`, color: col }}
                          >
                            Lv.{level}
                          </div>
                        </div>
                      </div>

                      {/* Name + badges — centered */}
                      <div className="text-center mt-5">
                        <h3
                          className={`font-display font-bold text-[17px] leading-tight ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}
                          style={{ color: getNameColorById(profile.cosmetics?.equippedNameColor ?? null) ?? undefined, textShadow: nameColorGlow(getNameColorById(profile.cosmetics?.equippedNameColor ?? null)) }}
                        >
                          {profile.username}
                        </h3>
                        <div className="flex items-center justify-center gap-1.5 flex-wrap mt-1 mb-0.5">
                          {profile.isModerator && profile.moderatorBadgeVisible && (
                            <ModBadge level={profile.moderatorLevel} />
                          )}
                          {titleDef && (
                            <span className="font-mono text-[12px] font-bold px-1.5 py-0.5 rounded"
                              style={{ color: titleDef.color, background: `${titleDef.color}15`, border: `1px solid ${titleDef.color}40` }}>
                              {titleDef.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-2 flex-wrap mt-0.5">
                          {profile.publicId != null && (
                            <span
                              className="font-mono text-[12px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(0,229,255,0.08)', color: 'rgba(0,229,255,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}
                            >
                              ID #{profile.publicId}
                            </span>
                          )}
                          {isOnline
                            ? <span className="text-neon-green font-mono text-[12px]">● online</span>
                            : <span className="text-white/25 font-mono text-[12px]">Last: {formatDate(roleStats?.lastGameAt ?? profile.joinedAt)}</span>
                          }
                        </div>
                      </div>

                      {/* XP bar */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-1">
                          {level >= MAX_LEVEL
                            ? <span className="font-mono text-[12px] uppercase tracking-widest" style={{ color: '#facc1590' }}>{tNow().uiMisc.maxLevel}</span>
                            : <span className="font-mono text-[12px]" style={{ color: `${col}80` }}>XP {xp - xpMin} / {xpMax - xpMin}</span>
                          }
                          <span className="font-mono text-[12px]" style={{ color: `${col}80` }}>{xpPct}%</span>
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
                      {/* ── Social counts ──────────────────────── */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => v2 && setFollowList('followers')}
                          disabled={!v2}
                          className="glass-panel border border-white/6 rounded-xl py-1.5 text-center transition-all active:scale-95 disabled:opacity-60"
                        >
                          <p className="font-display font-bold text-sm text-white">{v2?.followersCount ?? '—'}</p>
                          <p className="text-white/30 text-[11px] font-mono">Followers</p>
                        </button>
                        <button
                          onClick={() => v2 && setFollowList('following')}
                          disabled={!v2}
                          className="glass-panel border border-white/6 rounded-xl py-1.5 text-center transition-all active:scale-95 disabled:opacity-60"
                        >
                          <p className="font-display font-bold text-sm text-white">{v2?.followingCount ?? '—'}</p>
                          <p className="text-white/30 text-[11px] font-mono">Following</p>
                        </button>
                        <div className="glass-panel border border-white/6 rounded-xl py-1.5 text-center">
                          <p className="font-display font-bold text-sm text-white">{v2?.postsCount ?? '—'}</p>
                          <p className="text-white/30 text-[11px] font-mono">Posts</p>
                        </div>
                      </div>

                      {/* ── Bio ────────────────────────────────── */}
                      {v2?.bio && (
                        <p className="text-white/55 text-[13px] leading-snug text-center px-1">{v2.bio}</p>
                      )}

                      {/* ── Mafia / Community switch ─────────────── */}
                      <div className="flex gap-1.5">
                        {([
                          { id: 'overview', label: `🎮 ${t.uiMisc.mafiaProfile}` },
                          { id: 'posts',    label: `🌐 ${t.uiMisc.communityProfile}` },
                        ] as { id: ProfileTab; label: string }[]).map(tb => {
                          const active = tab === tb.id;
                          return (
                            <button
                              key={tb.id}
                              onClick={() => setTab(tb.id)}
                              className="flex-1 py-2 rounded-xl font-mono text-[12.5px] font-bold uppercase tracking-wider transition-all active:scale-95"
                              style={{
                                background: active ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${active ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                              }}
                            >
                              {tb.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* ════════ COMMUNITY TAB (posts + cosmetics) ════════ */}
                      {tab === 'posts' && (
                        <>
                          <UserPostsList authorId={profile.id} />
                          <CosmeticsShowcase cosmetics={profile.cosmetics} />
                        </>
                      )}

                      {/* ════════ OVERVIEW TAB ════════ */}
                      {tab === 'overview' && (<>
                      {/* ── Clan ───────────────────────────────── */}
                      {clan ? (
                        <div className="rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-neon-cyan text-xs font-bold">[{clan.tag}]</span>
                            <span className="font-mono text-white/60 text-xs truncate flex-1">{clan.name}</span>
                            <span className="font-mono text-[12px] text-white/30 capitalize">{clan.memberRole}</span>
                          </div>
                          <p className="font-mono text-[12px] text-white/25">
                            Joined {new Date(clan.joinedAt).toLocaleDateString()} · {clan.memberCount} members
                          </p>
                        </div>
                      ) : (
                        <p className="text-center font-mono text-[12px] text-white/20 py-1">Not in a clan</p>
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
                            <p className="text-white/25 text-[12px] font-mono">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* ── Gift carousel ─────────────────────── */}
                      {(carouselLoading || aggGifts.length > 0) && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider">🎁 Gifts</p>
                            {aggGifts.length > 0 && (
                              <span className="font-mono text-[12px] text-white/20">{aggGifts.length} types</span>
                            )}
                          </div>
                          {carouselLoading ? (
                            <div className="flex gap-2">
                              {[0,1,2,3].map(i => (
                                <div key={i} className="flex-shrink-0 w-[62px] h-[72px] rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                              ))}
                            </div>
                          ) : (
                            <div
                              className="flex gap-2 overflow-x-auto pb-1"
                              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                            >
                              {aggGifts.map(({ gift, count }, i) => (
                                <button
                                  key={gift.giftId}
                                  onClick={() => setGiftViewerIdx(i)}
                                  className="flex-shrink-0 w-[62px] rounded-xl flex flex-col items-center gap-1 pt-2 pb-1.5 relative transition-all hover:scale-105 active:scale-95"
                                  style={{
                                    background: G_BG[gift.giftRarity] ?? G_BG.common,
                                    border: `1px solid ${G_BORDER[gift.giftRarity] ?? G_BORDER.common}`,
                                  }}
                                >
                                  {gift.giftImageUrl
                                    ? <img src={gift.giftImageUrl} alt={gift.giftName} className="w-9 h-9 rounded-lg object-cover" />
                                    : <span className="text-2xl leading-none">{gift.giftIcon}</span>}
                                  <span
                                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-mono font-bold text-[11px] px-1"
                                    style={{ background: 'rgba(155,0,255,0.85)', color: '#fff' }}
                                  >{count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

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
                          <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider mb-1.5">By Team</p>
                          <TeamBreakdown roleStats={roleStats} />
                        </div>
                      )}

                      {/* ── Achievements ───────────────────────── */}
                      {achievements.length > 0 && (
                        <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                          <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider mb-1.5">
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
                      </>)}

                      {/* ── DM + Gift buttons (hidden for self) ── */}
                      {!isSelf && (
                        <>
                          <button
                            onClick={handleDm}
                            className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.98]"
                            style={{
                              background: 'rgba(155,0,255,0.12)',
                              border: '1px solid rgba(155,0,255,0.35)',
                              color: 'rgba(200,100,255,0.9)',
                              backdropFilter: 'blur(12px)',
                              WebkitBackdropFilter: 'blur(12px)',
                              boxShadow: 'inset 0 1px 0 rgba(200,100,255,0.12)',
                            }}
                          >
                            ✉ Send Message
                          </button>
                          <button
                            onClick={() => setShowSendGift(true)}
                            className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.98]"
                            style={{
                              background: 'rgba(255,180,0,0.08)',
                              border: '1px solid rgba(255,180,0,0.28)',
                              color: 'rgba(255,200,60,0.9)',
                              backdropFilter: 'blur(12px)',
                              WebkitBackdropFilter: 'blur(12px)',
                              boxShadow: 'inset 0 1px 0 rgba(255,200,60,0.10)',
                            }}
                          >
                            🎁 Send Gift
                          </button>
                        </>
                      )}

                      {/* ── Self-only actions ───────────────────── */}
                      {isSelf && (
                        <button
                          onClick={() => setShowCoinHistory(true)}
                          className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.98]"
                          style={{
                            background: 'rgba(255,180,0,0.07)',
                            border: '1px solid rgba(255,180,0,0.25)',
                            color: 'rgba(255,200,60,0.8)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: 'inset 0 1px 0 rgba(255,180,0,0.08)',
                          }}
                        >
                          🪙 Coin History
                        </button>
                      )}

                      {/* ── Share Profile button ─────────────────── */}
                      {profile.publicId != null && (
                        <button
                          onClick={() => setShowShare(true)}
                          className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.98]"
                          style={{
                            background: 'rgba(0,229,255,0.07)',
                            border: '1px solid rgba(0,229,255,0.25)',
                            color: 'rgba(0,229,255,0.75)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: 'inset 0 1px 0 rgba(0,229,255,0.10)',
                          }}
                        >
                          ↗ Share Profile
                        </button>
                      )}

                      {/* ── Friend action (hidden for self) ─────── */}
                      {!isSelf && friendshipStatus === 'none' && (
                        <button
                          onClick={handleAddFriend}
                          disabled={actionLoading || !profile.friendCode}
                          className="w-full py-2 rounded-xl font-mono text-xs transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:scale-100"
                          style={{
                            background: 'rgba(0,229,255,0.07)',
                            border: '1px solid rgba(0,229,255,0.28)',
                            color: 'rgba(0,229,255,0.85)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                          }}
                        >
                          + Add Friend
                        </button>
                      )}
                      {!isSelf && friendshipStatus === 'pending_sent' && (
                        <button disabled className="w-full py-2 rounded-xl border border-white/10 text-white/30 font-mono text-xs opacity-50 cursor-not-allowed"
                          style={{ background: 'rgba(8,4,20,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
                        >
                          Request Sent
                        </button>
                      )}
                      {!isSelf && friendshipStatus === 'pending_received' && (
                        <button
                          onClick={handleAcceptFriend}
                          disabled={actionLoading}
                          className="w-full py-2 rounded-xl font-mono text-xs transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40"
                          style={{
                            background: 'rgba(0,255,136,0.08)',
                            border: '1px solid rgba(0,255,136,0.30)',
                            color: 'rgba(0,255,136,0.9)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                          }}
                        >
                          ✓ Accept Friend Request
                        </button>
                      )}
                      {!isSelf && friendshipStatus === 'accepted' && (
                        <button
                          onClick={handleRemoveFriend}
                          disabled={actionLoading}
                          className="w-full py-2 rounded-xl font-mono text-xs transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40"
                          style={{
                            background: 'rgba(255,30,60,0.06)',
                            border: '1px solid rgba(255,30,60,0.20)',
                            color: 'rgba(255,80,80,0.65)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                          }}
                        >
                          Remove Friend
                        </button>
                      )}

                      {/* ── Mod Actions ────────────────────────── */}
                      {isMod && !isSelf && (() => {
                        const targetRank = modRank(profile.moderatorLevel);
                        const canAct = targetRank < myRank;
                        return (
                          <div className="rounded-xl border border-yellow-400/15 bg-yellow-400/5 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-yellow-400/70 text-[12px] font-mono uppercase tracking-widest font-bold">🛡 Mod Actions</span>
                              {!canAct && (
                                <span className="text-white/20 text-[12px] font-mono">(rank protected)</span>
                              )}
                            </div>
                            {!modPanel ? (
                              <div className="flex flex-wrap gap-1">
                                <button
                                  disabled={!canAct}
                                  onClick={() => openModPanel('warn')}
                                  className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ⚠ Warn
                                </button>
                                <button
                                  disabled={!canAct}
                                  onClick={() => openModPanel('kick')}
                                  className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-orange-400/30 text-orange-400 hover:bg-orange-400/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ⬆ Kick
                                </button>
                                {myRank >= 1 && (
                                  <button
                                    disabled={!canAct}
                                    onClick={() => openModPanel('ban')}
                                    className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    🔨 Ban
                                  </button>
                                )}
                              </div>
                            ) : modPanel === 'warn' ? (
                              <div className="space-y-2">
                                <select
                                  value={modCategory}
                                  onChange={e => setModCategory(e.target.value as WarnCategory)}
                                  className="w-full bg-void-50/80 border border-yellow-400/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-yellow-400/40"
                                >
                                  {WARN_CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={modReason}
                                  onChange={e => setModReason(e.target.value)}
                                  placeholder="Reason…"
                                  className="w-full bg-void-50/80 border border-yellow-400/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-yellow-400/40"
                                />
                                <div className="flex gap-1">
                                  <button onClick={closeModPanel} className="flex-1 py-1.5 text-[12px] font-mono border border-white/10 text-white/40 rounded-lg hover:text-white/60">Cancel</button>
                                  <button onClick={doModWarn} disabled={modActionLoading || !modReason.trim()}
                                    className="flex-1 py-1.5 text-[12px] font-mono font-bold border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 rounded-lg hover:bg-yellow-400/20 disabled:opacity-40">
                                    {modActionLoading ? '…' : 'Send Warning'}
                                  </button>
                                </div>
                              </div>
                            ) : modPanel === 'kick' ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={modReason}
                                  onChange={e => setModReason(e.target.value)}
                                  placeholder="Kick reason…"
                                  className="w-full bg-void-50/80 border border-orange-400/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-orange-400/40"
                                />
                                <p className="text-white/30 text-[12px] font-mono">Player will be removed from room and voice.</p>
                                <div className="flex gap-1">
                                  <button onClick={closeModPanel} className="flex-1 py-1.5 text-[12px] font-mono border border-white/10 text-white/40 rounded-lg hover:text-white/60">Cancel</button>
                                  <button onClick={doModKick} disabled={modActionLoading || !modReason.trim()}
                                    className="flex-1 py-1.5 text-[12px] font-mono font-bold border border-orange-400/30 bg-orange-400/10 text-orange-400 rounded-lg hover:bg-orange-400/20 disabled:opacity-40">
                                    {modActionLoading ? '…' : 'Kick Player'}
                                  </button>
                                </div>
                              </div>
                            ) : modPanel === 'ban' ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={modReason}
                                  onChange={e => setModReason(e.target.value)}
                                  placeholder="Ban reason…"
                                  className="w-full bg-void-50/80 border border-neon-red/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-red/40"
                                />
                                <select
                                  value={modBanDuration}
                                  onChange={e => setModBanDuration(Number(e.target.value))}
                                  className="w-full bg-void-50/80 border border-neon-red/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none"
                                >
                                  {BAN_DURATIONS.filter(d => d.value !== -1 || myRank >= 3).map(d => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                  ))}
                                </select>
                                <div className="flex gap-1">
                                  <button onClick={closeModPanel} className="flex-1 py-1.5 text-[12px] font-mono border border-white/10 text-white/40 rounded-lg hover:text-white/60">Cancel</button>
                                  <button onClick={doModBan} disabled={modActionLoading || !modReason.trim()}
                                    className="flex-1 py-1.5 text-[12px] font-mono font-bold border border-neon-red/30 bg-neon-red/10 text-neon-red rounded-lg hover:bg-neon-red/20 disabled:opacity-40">
                                    {modActionLoading ? '…' : 'Ban Player'}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* ── Clan Mod Actions ────────────────────── */}
                      {hasClanModPower && playerId !== myProfileId && (
                        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-cyan-400/70 text-[12px] font-mono uppercase tracking-widest font-bold">🛡 Clan Moderation</span>
                            <span className="text-cyan-400/40 text-[12px] font-mono capitalize">{myClanRole}</span>
                          </div>
                          {!clanModPanel ? (
                            <div className="flex flex-wrap gap-1">
                              <button
                                onClick={() => { setClanModPanel('warn'); setClanModReason(''); }}
                                className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all"
                              >
                                ⚠ Clan Warn
                              </button>
                              {(myClanRole === 'owner' || myClanRole === 'admin') && (
                                <button
                                  onClick={() => { setClanModPanel('kick'); setClanModReason(''); }}
                                  className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-orange-400/30 text-orange-400 hover:bg-orange-400/10 transition-all"
                                >
                                  ⬆ Clan Kick
                                </button>
                              )}
                              {myClanRole === 'moderator' && (
                                <button
                                  onClick={() => { setClanModPanel('kick'); setClanModReason(''); }}
                                  className="px-2 py-1 text-[12px] font-mono uppercase rounded-lg border border-orange-400/30 text-orange-400 hover:bg-orange-400/10 transition-all"
                                >
                                  ⬆ Clan Kick
                                </button>
                              )}
                            </div>
                          ) : clanModPanel === 'warn' ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={clanModReason}
                                onChange={e => setClanModReason(e.target.value)}
                                placeholder="Reason for clan warning…"
                                maxLength={300}
                                className="w-full bg-void-50/80 border border-yellow-400/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-yellow-400/40"
                              />
                              <p className="text-white/30 text-[12px] font-mono">Warning will show clan name and your role.</p>
                              <div className="flex gap-1">
                                <button onClick={() => setClanModPanel(null)} className="flex-1 py-1.5 text-[12px] font-mono border border-white/10 text-white/40 rounded-lg hover:text-white/60">Cancel</button>
                                <button onClick={doClanWarn} disabled={clanModLoading || !clanModReason.trim()}
                                  className="flex-1 py-1.5 text-[12px] font-mono font-bold border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 rounded-lg hover:bg-yellow-400/20 disabled:opacity-40">
                                  {clanModLoading ? '…' : 'Send Warning'}
                                </button>
                              </div>
                            </div>
                          ) : clanModPanel === 'kick' ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={clanModReason}
                                onChange={e => setClanModReason(e.target.value)}
                                placeholder="Reason for clan kick…"
                                maxLength={300}
                                className="w-full bg-void-50/80 border border-orange-400/20 rounded-lg px-2 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-orange-400/40"
                              />
                              <p className="text-white/30 text-[12px] font-mono">Player will be removed from this clan room only.</p>
                              <div className="flex gap-1">
                                <button onClick={() => setClanModPanel(null)} className="flex-1 py-1.5 text-[12px] font-mono border border-white/10 text-white/40 rounded-lg hover:text-white/60">Cancel</button>
                                <button onClick={doClanKick} disabled={clanModLoading || !clanModReason.trim()}
                                  className="flex-1 py-1.5 text-[12px] font-mono font-bold border border-orange-400/30 bg-orange-400/10 text-orange-400 rounded-lg hover:bg-orange-400/20 disabled:opacity-40">
                                  {clanModLoading ? '…' : 'Kick from Clan Room'}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* ── Gift Gallery ─────────────────────────── */}
                      {tab === 'overview' && data && (
                        <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                          <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider mb-2">
                            🎁 Gifts
                          </p>
                          <GiftGallery profileId={data.profile.id} viewerId={myProfileId ?? ''} />
                        </div>
                      )}

                      {/* ── Report + Close ──────────────────────── */}
                      <div className="flex gap-2 pb-1">
                        {!isSelf && (
                        <button
                          onClick={() => setShowReport(true)}
                          className="flex-1 py-2 rounded-xl font-mono text-[12px] transition-all hover:scale-[1.01] active:scale-[0.98]"
                          style={{
                            background: 'rgba(255,30,60,0.05)',
                            border: '1px solid rgba(255,30,60,0.15)',
                            color: 'rgba(255,255,255,0.22)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,60,80,0.6)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,30,60,0.3)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.22)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,30,60,0.15)'; }}
                        >
                          Report
                        </button>
                        )}
                        <button
                          onClick={onClose}
                          className="flex-1 py-2 rounded-xl font-mono text-xs transition-all hover:scale-[1.01] active:scale-[0.98]"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            color: 'rgba(255,255,255,0.35)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                          }}
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

    {showReport && playerId && data && (
      <ReportModal
        targetProfileId={playerId}
        targetName={data.profile.username}
        roomId={room?.id ?? null}
        onClose={() => setShowReport(false)}
        onSuccess={msg => addToast(msg, 'success')}
      />
    )}

    <AnimatePresence>
      {showSendGift && playerId && data && (
        <SendGiftModal
          recipientId={playerId}
          recipientName={data.profile.username}
          recipientAvatar={data.profile.avatar}
          recipientAvatarUrl={data.profile.avatarUrl}
          onClose={() => setShowSendGift(false)}
          onSuccess={() => addToast('Gift sent!', 'success')}
        />
      )}
    </AnimatePresence>

    {showShare && data && (
      <ShareCardModal
        open={showShare}
        data={{ profile: data.profile, clan: data.clan, achievements: data.achievements } satisfies ProfileCardData}
        onClose={() => setShowShare(false)}
      />
    )}
    <CoinHistoryModal open={showCoinHistory} onClose={() => setShowCoinHistory(false)} />

    <AnimatePresence>
      {giftViewerIdx !== null && aggGifts.length > 0 && (
        <GiftSwipeViewer
          items={aggGifts}
          startIdx={giftViewerIdx}
          onClose={() => setGiftViewerIdx(null)}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {followList && playerId && (
        <FollowListOverlay profileId={playerId} mode={followList} onClose={() => setFollowList(null)} />
      )}
    </AnimatePresence>
    </>
  );
}

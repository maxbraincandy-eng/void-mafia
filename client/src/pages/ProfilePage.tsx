import { useRef, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { VoidProfileIcon } from '@/components/ui/VoidProfileIcon';
import { VoidClansIcon } from '@/components/ui/VoidClansIcon';
import { VoidGamesIcon } from '@/components/ui/VoidGamesIcon';
import { VoidLeaderboardIcon } from '@/components/ui/VoidLeaderboardIcon';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { FriendsPanel } from '@/components/ui/FriendsPanel';
import { GiftGallery } from '@/components/ui/GiftGallery';
import { ShareCardModal } from '@/components/ui/ShareCardModal';
import type { ProfileCardData } from '@/components/ui/ProfileCard';
import { emitWithAck, socket } from '@/lib/socket';
import type { AchievementEarned, GameHistoryEntry, PlayerRoleStats, ClanMembership, Res, PlayerCosmetics, PlayerRating, SeasonResult, Friend, FriendRequest } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { RatingBadge } from '@/components/ui/RatingBadge';
import {
  FRAMES, TITLES, ROLE_SKINS, WALLPAPERS, BORDERS, NAME_COLORS,
  PROFILE_BACKGROUNDS,
  RARITY_COLOR, RARITY_LABEL,
  getFrameById, getTitleById, getRoleSkinById, getWallpaperById, getBorderById, getBackgroundById,
} from '@/constants/cosmetics';

import { MAX_LEVEL, xpForLevel, xpForNextLevel, levelColor } from '@/lib/level';
import { tNow } from '@/store/langStore';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { useIsVerified } from '@/store/verifiedStore';

const RARITY_GLOW: Record<string, string> = {
  common:    'rgba(255,255,255,0.12)',
  uncommon:  'rgba(0,229,255,0.2)',
  rare:      'rgba(155,0,255,0.25)',
  epic:      'rgba(255,0,204,0.3)',
  legendary: 'rgba(255,180,0,0.35)',
};
const RARITY_BORDER: Record<string, string> = {
  common:    'rgba(255,255,255,0.1)',
  uncommon:  'rgba(0,229,255,0.25)',
  rare:      'rgba(155,0,255,0.35)',
  epic:      'rgba(255,0,204,0.4)',
  legendary: 'rgba(255,180,0,0.5)',
};

const TEAM_COLOR: Record<string, string> = {
  mafia: '#ff1e3c', town: '#00ff88', neutral: '#facc15', cult: '#9b00ff', yakuza: '#00e5ff',
};
const TEAM_LABEL: Record<string, string> = {
  mafia: 'Mafia', town: 'Town', neutral: 'Neutral', cult: 'Cult', yakuza: 'Yakuza',
};
const ROLE_LABEL: Record<string, string> = {
  citizen: 'Citizen', mafia: 'Mafia', sheriff: 'Sheriff', doctor: 'Doctor', don: 'Don',
  maniac: 'Maniac', jester: 'Jester', bodyguard: 'Bodyguard', spy: 'Spy', escort: 'Escort',
  vigilante: 'Vigilante', cult_leader: 'Cult Leader', cultist: 'Cultist', veteran: 'Veteran',
  tracker: 'Tracker', arsonist: 'Arsonist', mayor: 'Mayor', yakuza: 'Yakuza', shogun: 'Shogun',
};

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function formatDate(ts: number | null | undefined) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 86_400_000) return 'today';
  if (diff < 172_800_000) return 'yesterday';
  return new Date(ts).toLocaleDateString();
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm flex items-center">{icon}</span>
      <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-white/30">{title}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="font-mono text-xs text-white/40">{label}</span>
      <span className="font-mono text-xs text-white/80 font-bold">{String(value)}</span>
    </div>
  );
}

function TeamBadge({ team }: { team: string | null }) {
  const colors: Record<string, string> = {
    mafia: 'text-neon-red/80', town: 'text-neon-green/80',
    neutral: 'text-yellow-400/80', cult: 'text-neon-purple/80', yakuza: 'text-neon-cyan/80',
  };
  return <span className={`font-mono text-[12px] uppercase tracking-wider ${colors[team ?? ''] ?? 'text-white/30'}`}>{team ?? '—'}</span>;
}

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
      else       { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/webp', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image.')); };
    img.src = url;
  });
}

export function ProfilePage({ onViewReplay }: { onViewReplay?: (gameId: string) => void } = {}) {
  const { profile, logout, localAvatar, uploadAvatar, removeAvatar, uid, changeName } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const myVerified = useIsVerified(profile?.id ?? null);
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<'public' | 'secret'>('public');
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [achievements, setAchievements] = useState<AchievementEarned[]>([]);
  const [history, setHistory]           = useState<GameHistoryEntry[]>([]);
  const [roleStats, setRoleStats]       = useState<PlayerRoleStats | null>(null);
  const [clan, setClan]                 = useState<ClanMembership | null | undefined>(undefined);
  const [tab, setTab] = useState<'achievements' | 'history' | 'friends'>('achievements');
  const [loadingAch, setLoadingAch]   = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError]   = useState('');
  const [previewSrc, setPreviewSrc]     = useState<string | null>(null);
  const [coins, setCoins]           = useState<number | null>(null);
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [dailyMsg, setDailyMsg]     = useState<string | null>(null);
  const [showShare, setShowShare]   = useState(false);
  const [cosmeticsTab, setCosmeticsTab] = useState<'frames' | 'titles' | 'skins' | 'wallpapers' | 'borders' | 'colors'>('frames');
  const [equipLoading, setEquipLoading] = useState(false);
  const [buyingItem, setBuyingItem] = useState<string | null>(null);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [rating, setRating] = useState<PlayerRating | null>(null);
  const [seasonHistory, setSeasonHistory] = useState<SeasonResult[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const pendingFriendRequests = useGameStore(s => s.pendingFriendRequests);
  const [showCoinsClan, setShowCoinsClan] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [showGifts, setShowGifts] = useState(false);

  const startEditName = () => {
    setNewName(profile?.username ?? '');
    setNameError('');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEditName = () => { setEditingName(false); setNameError(''); };

  const saveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === profile?.username) { cancelEditName(); return; }
    if (trimmed.length < 2 || trimmed.length > 24) { setNameError('2–24 characters'); return; }
    setNameSaving(true);
    const res = await changeName(trimmed);
    setNameSaving(false);
    if (res.ok) { setEditingName(false); setNameError(''); }
    else setNameError(res.error ?? 'Failed');
  };

  useEffect(() => {
    if (!profile) return;
    setLoadingAch(true);
    Promise.all([
      emitWithAck<{ profileId: string }, Res<AchievementEarned[]>>('player:achievements', { profileId: profile.id }),
      emitWithAck<{ profileId: string }, Res<GameHistoryEntry[]>>('player:history', { profileId: profile.id }),
      emitWithAck<{ profileId: string }, Res<PlayerRoleStats>>('player:role_stats', { profileId: profile.id }),
      emitWithAck<null, Res<ClanMembership | null>>('clan:my_membership', null),
    ]).then(([achRes, histRes, rsRes, clanRes]) => {
      if (achRes.ok)  setAchievements(achRes.data);
      if (histRes.ok) setHistory(histRes.data);
      if (rsRes.ok)   setRoleStats(rsRes.data);
      setClan(clanRes.ok ? clanRes.data : null);
    }).catch(() => { setClan(null); })
      .finally(() => setLoadingAch(false));
  }, [profile]);

  // Friends list
  useEffect(() => {
    if (!profile) return;
    emitWithAck<void, Res<Friend[]>>('friend:list').then(res => {
      if (res.ok) setFriends(res.data ?? []);
    }).catch(() => {});
  }, [profile]);

  // Coin balance
  useEffect(() => {
    if (!profile) return;
    emitWithAck<null, Res<{ coins: number }>>('coins:balance').then(res => {
      if (res.ok) setCoins(res.data.coins);
      else setCoins(0);
    }).catch(() => setCoins(0));
    const onCoinsUpdated = ({ coins: c }: { coins: number }) => setCoins(c);
    socket.on('coins:updated' as any, onCoinsUpdated);
    return () => { socket.off('coins:updated' as any, onCoinsUpdated); };
  }, [profile]);

  // Ranked rating
  useEffect(() => {
    if (!profile) return;
    emitWithAck<null, Res<PlayerRating | null>>('rating:get_my' as any).then(res => {
      if (res.ok) setRating(res.data);
    }).catch(() => {});
    const onEloUpdate = (data: { eloChange: number; newElo: number; tier: string }) => {
      setRating(prev => prev ? { ...prev, elo: data.newElo, tier: data.tier as any } : null);
    };
    socket.on('rated:elo_update' as any, onEloUpdate);
    return () => { socket.off('rated:elo_update' as any, onEloUpdate); };
  }, [profile]);

  // Season history
  useEffect(() => {
    if (!profile) return;
    emitWithAck<null, Res<SeasonResult[]>>('season:my_history' as any).then(res => {
      if (res.ok) setSeasonHistory(res.data);
    }).catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    emitWithAck<null, Res<{ profileMode: 'public' | 'secret' }>>('community:privacy_get' as any).then(res => {
      if (res.ok) setPrivacyMode(res.data.profileMode ?? 'public');
    }).catch(() => {});
  }, [profile]);

  const claimDaily = async () => {
    setDailyClaiming(true);
    setDailyMsg(null);
    try {
      const res = await emitWithAck<null, Res<{ coins: number; balance: number; alreadyClaimed: boolean }>>('coins:daily_reward');
      if (res.ok) {
        setCoins(res.data.balance);
        setDailyMsg(res.data.alreadyClaimed ? 'Already claimed today. Come back tomorrow!' : `+${res.data.coins} coins claimed!`);
      } else {
        setDailyMsg((res as any).error ?? 'Claim failed — please try again.');
      }
    } catch {
      setDailyMsg('Connection error — please try again.');
    } finally {
      setDailyClaiming(false);
      setTimeout(() => setDailyMsg(null), 3000);
    }
  };

  const handleAvatarClick = () => { if (!uploadLoading) fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploadError('');
    if (!ALLOWED_TYPES.includes(file.type)) { setUploadError('Unsupported type. Use JPG, PNG, or WebP.'); return; }
    if (file.size > MAX_SIZE) { setUploadError('Image too large. Max 5MB.'); return; }
    setUploadLoading(true);
    try {
      const resized = await resizeImage(file);
      setPreviewSrc(resized);
      const result = await uploadAvatar(resized);
      if (!result.ok) { setUploadError(result.error ?? 'Upload failed.'); setPreviewSrc(null); }
      else setPreviewSrc(null);
    } catch { setUploadError('Upload failed. Please try again.'); setPreviewSrc(null); }
    finally { setUploadLoading(false); }
  };

  const handleRemove = async () => {
    setUploadLoading(true); setUploadError(''); setPreviewSrc(null);
    const result = await removeAvatar();
    if (!result.ok) setUploadError(result.error ?? 'Remove failed.');
    setUploadLoading(false);
  };

  const handleEquip = useCallback(async (type: 'frame' | 'title' | 'role_skin' | 'wallpaper' | 'border' | 'name_color', itemId: string | null) => {
    if (equipLoading) return;
    setEquipLoading(true);
    try {
      const res = await emitWithAck<{ type: string; itemId: string | null }, Res<PlayerCosmetics>>(
        'cosmetics:equip', { type, itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile
          ? { profile: { ...s.profile!, cosmetics: res.data } }
          : s,
        );
      }
    } finally {
      setEquipLoading(false);
    }
  }, [equipLoading]);

  const handleBuyBackground = useCallback(async (itemId: string) => {
    if (buyingItem) return;
    setBuyingItem(itemId);
    setBuyMsg(null);
    try {
      const res = await emitWithAck<{ itemId: string }, Res<{ cosmetics: PlayerCosmetics; newBalance: number }>>(
        'cosmetics:buy_item' as any, { itemId },
      );
      if (res.ok) {
        useAuthStore.setState(s => s.profile
          ? { profile: { ...s.profile!, cosmetics: res.data.cosmetics } }
          : s,
        );
        setCoins(res.data.newBalance);
        setBuyMsg('Purchased!');
      } else {
        setBuyMsg((res as any).error ?? 'Purchase failed.');
      }
    } finally {
      setBuyingItem(null);
      setTimeout(() => setBuyMsg(null), 3000);
    }
  }, [buyingItem]);

  if (!profile) return null;

  const { stats } = profile;
  const displayAvatar = previewSrc ?? localAvatar;
  const level   = profile.level ?? 1;
  const xp      = profile.xp ?? 0;
  const col     = levelColor(level);
  const xpMin   = xpForLevel(level);
  const xpMax   = xpForNextLevel(level);
  const xpPct   = xpMax > xpMin ? Math.min(1, (xp - xpMin) / (xpMax - xpMin)) * 100 : 100;

  const totalGames   = roleStats?.totalGames ?? stats.gamesPlayed;
  const survived     = roleStats?.totalSurvived ?? 0;
  const survivalRate = totalGames > 0 ? Math.round((survived / totalGames) * 100) : 0;

  // Resolve equipped profile background (bg_* takes priority over wp_* for full-bleed)
  const equippedBgId = profile.cosmetics?.equippedWallpaper ?? null;
  const bgDef = getBackgroundById(equippedBgId);
  const bgStyle = bgDef ? { background: bgDef.css } : undefined;

  return (
    <div className="min-h-screen scanlines pb-20 relative overflow-hidden" style={bgStyle ?? { background: 'linear-gradient(135deg, #03000d 0%, #0a0520 100%)' }}>
      {/* Full-bleed overlay to keep text readable */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(3,0,13,0.6) 50%, rgba(3,0,13,0.92) 100%)' }} />
      {!bgDef && <div className="absolute inset-0 bg-neon-grid-animated pointer-events-none" />}
      <div className="absolute top-0 left-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 vm-page px-4 pt-8">
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <PoweredBy className="block mt-0.5" />
        </div>

        {/* ── Profile header card ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border border-neon-purple/20 rounded-2xl p-5 mb-3"
          style={{ background: `linear-gradient(160deg, ${col}06 0%, rgba(6,3,20,0.7) 60%)` }}
        >
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFileChange} />

          <div className="flex items-center gap-4 mb-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <button type="button" onClick={handleAvatarClick} disabled={uploadLoading}
                className="relative w-16 h-16 rounded-full group" title="Tap to upload photo">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,0,128,0.6), rgba(138,43,226,0.6))',
                    boxShadow: displayAvatar ? `0 0 16px ${col}50` : `0 0 8px ${col}30`,
                    border: `2px solid ${col}60`,
                  }}>
                  {displayAvatar
                    ? <img src={displayAvatar} alt={profile.username} className="w-full h-full object-cover rounded-full" />
                    : <span>{profile.avatar}</span>}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadLoading
                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                </div>
              </button>
              {/* Level badge */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-display font-bold border"
                style={{ background: `${col}30`, borderColor: `${col}70`, color: col, boxShadow: `0 0 8px ${col}50` }}>
                {level}
              </div>
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    ref={nameInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEditName(); }}
                    maxLength={24}
                    placeholder="New username…"
                    className="flex-1 min-w-0 border border-white/10 rounded-xl px-3 py-2 placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/50 transition-all"
                    style={{ background: 'rgba(10,5,32,0.88)', color: 'rgba(255,255,255,0.9)', fontSize: 14 }}
                  />
                  <button onClick={saveName} disabled={nameSaving}
                    className="px-3 py-1.5 text-xs font-mono rounded-xl border border-neon-green/40 text-neon-green bg-neon-green/10 hover:bg-neon-green/20 disabled:opacity-40 transition-all whitespace-nowrap">
                    {nameSaving ? '…' : '✓ Save'}
                  </button>
                  <button onClick={cancelEditName}
                    className="px-2 py-1.5 text-xs font-mono rounded-xl border border-white/15 text-white/40 hover:text-white/70 transition-all">
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`font-display font-bold text-xl ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                    {profile.username}
                  </h2>
                  {myVerified && <VerifiedBadge size={18} />}
                  {profile.isModerator && profile.moderatorBadgeVisible && <ModBadge level={profile.moderatorLevel} />}
                  <button onClick={startEditName} title="Change username"
                    className="text-white/25 hover:text-neon-cyan/70 transition-colors text-sm">
                    ✎
                  </button>
                </div>
              )}
              {nameError && <p className="text-[12px] font-mono text-neon-red/80 mt-0.5">{nameError}</p>}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {profile.publicId != null && (
                  <span className="font-mono text-[12px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(0,229,255,0.08)', color: 'rgba(0,229,255,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}>
                    ID #{profile.publicId}
                  </span>
                )}
                <span className="font-mono text-[12px] text-white/30">
                  Joined {new Date(profile.joinedAt).toLocaleDateString()}
                </span>
              </div>
              {/* Avatar actions */}
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={handleAvatarClick} disabled={uploadLoading}
                  className="font-mono text-[12px] uppercase tracking-wider text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors disabled:opacity-40">
                  {displayAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                {displayAvatar && (
                  <>
                    <span className="text-white/15 font-mono text-[12px]">·</span>
                    <button onClick={handleRemove} disabled={uploadLoading}
                      className="font-mono text-[12px] uppercase tracking-wider text-neon-red/40 hover:text-neon-red/70 transition-colors disabled:opacity-40">
                      Remove
                    </button>
                  </>
                )}
              </div>
              {uploadError && <p className="text-[12px] font-mono text-neon-red/80 mt-1">{uploadError}</p>}
            </div>
          </div>

          {/* XP bar */}
          <div className="mb-4 p-3 rounded-xl border border-white/8 bg-white/3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-display font-bold tracking-widest uppercase" style={{ color: `${col}90` }}>
                Level {level}
              </span>
              <span className="text-[12px] font-mono text-white/30">{xp} XP</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${xpPct}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
            </div>
            {level < MAX_LEVEL ? (
              <p className="text-[12px] font-mono text-white/20 mt-1 text-right">
                {xpMax - xp} XP to Level {level + 1}
              </p>
            ) : (
              <p className="text-[12px] font-mono text-yellow-400/40 mt-1 text-right uppercase tracking-widest">
                {tNow().uiMisc.maxLevel}
              </p>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Games',    value: stats.gamesPlayed, color: 'text-neon-cyan' },
              { label: 'Wins',     value: stats.wins,        color: 'text-neon-green' },
              { label: 'Losses',   value: stats.losses,      color: 'text-neon-red/80' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-neon-pink' },
            ].map(s => (
              <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-2.5 text-center">
                <p className={`font-display font-bold text-xl ${s.color}`}>{s.value}</p>
                <p className="text-white/30 text-[12px] font-mono mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {stats.gamesPlayed > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] font-mono text-white/30">
                <span>{stats.wins} wins</span>
                <span>{stats.losses} losses</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-l-full transition-all" style={{ width: `${stats.winRate}%` }} />
                <div className="h-full bg-neon-red/40 rounded-r-full flex-1" />
              </div>
            </div>
          )}

          {/* Share Profile button */}
          <button
            onClick={() => setShowShare(true)}
            className="mt-3 w-full py-2.5 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all border border-neon-cyan/30 bg-neon-cyan/6 text-neon-cyan/80 hover:bg-neon-cyan/12 hover:text-neon-cyan"
          >
            ↗ Share Profile
          </button>
        </motion.div>

        {/* ── Gifts section (collapsed accordion) ───────────────────── */}
        <div className="glass-panel border border-white/8 rounded-2xl mb-3 overflow-hidden">
          <button
            onClick={() => setShowGifts(v => !v)}
            className="w-full flex items-center justify-between p-4"
          >
            <span className="font-mono text-sm font-bold text-white/60">🎁 Gifts</span>
            <span className="text-white/30 font-mono text-xs">{showGifts ? '▲' : '▼'}</span>
          </button>
          {showGifts && (
            <div className="border-t border-white/8 p-4">
              {profile && <GiftGallery profileId={profile.id} viewerId={profile.id} />}
            </div>
          )}
        </div>

        {/* ── Daily Reward ────────────────────────────────────────────── */}
        <div className="glass-panel border border-amber-400/15 rounded-2xl p-4 mb-3">
          <button onClick={claimDaily} disabled={dailyClaiming}
            className="w-full py-3 rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-400 font-mono text-sm uppercase tracking-widest hover:bg-amber-400/20 transition-all disabled:opacity-50 font-bold">
            {dailyClaiming ? 'Claiming...' : '☀ Claim Daily Reward — 50 🪙'}
          </button>
          {dailyMsg && <p className="text-center font-mono text-xs mt-2 text-amber-400/70">{dailyMsg}</p>}
        </div>

        {/* ── Info section ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
          <SectionHeader icon="📋" title="Info" />
          <StatRow label="Public ID"    value={profile.publicId != null ? `#${profile.publicId}` : '—'} />
          <StatRow label="XP"           value={xp} />
          <StatRow label="Level"        value={level} />
          <StatRow label="Joined"       value={new Date(profile.joinedAt).toLocaleDateString()} />
          <StatRow label="Last active"  value={formatDate(profile.lastSeenAt ?? undefined)} />
          <StatRow label="First game"   value={formatDate(roleStats?.firstGameAt ?? undefined)} />
          <StatRow label="Last played"  value={formatDate(roleStats?.lastGameAt ?? undefined)} />
          <StatRow label="Survived"     value={totalGames > 0 ? `${survived} / ${totalGames} (${survivalRate}%)` : '—'} />
        </motion.div>

        {/* ── Coins + Clan collapsed accordion ───────────────────────── */}
        <div className="glass-panel border border-amber-400/15 rounded-2xl mb-3 overflow-hidden">
          {/* Header — always visible, click to expand */}
          <button
            onClick={() => setShowCoinsClan(v => !v)}
            className="w-full flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-amber-400 font-mono text-sm">🪙</span>
              <span className="font-mono text-sm font-bold text-amber-400">
                {coins != null ? coins.toLocaleString() : '—'}
              </span>
              {clan && (
                <>
                  <span className="text-white/20 font-mono text-xs">·</span>
                  <span className="font-mono text-xs text-white/50">[{clan.tag}] {clan.name}</span>
                </>
              )}
            </div>
            <span className="text-white/30 font-mono text-xs">{showCoinsClan ? '▲' : '▼'}</span>
          </button>
          {/* Expanded content */}
          {showCoinsClan && (
            <div className="border-t border-white/8 p-4 space-y-4">
              {/* Coins section */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">Coin Wallet</p>
                <p className="font-mono text-2xl font-bold text-amber-400">{coins != null ? coins.toLocaleString() : '—'} <span className="text-base">🪙</span></p>
              </div>
              {/* Clan section */}
              {clan === undefined && (
                <p className="text-white/20 font-mono text-xs text-center py-2">Loading…</p>
              )}
              {clan === null && (
                <p className="text-white/20 font-mono text-xs text-center py-2">Not in a clan</p>
              )}
              {clan && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">Clan</p>
                  <p className="font-mono text-sm text-white font-bold">[{clan.tag}] {clan.name}</p>
                  <div className="mt-2 space-y-1">
                    {[
                      { label: 'Role', value: clan.memberRole.charAt(0).toUpperCase() + clan.memberRole.slice(1) },
                      { label: 'Joined clan', value: new Date(clan.joinedAt).toLocaleDateString() },
                      { label: 'Members', value: clan.memberCount },
                      { label: 'Clan wins', value: clan.wins },
                      { label: 'Clan losses', value: clan.losses },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                        <span className="font-mono text-xs text-white/40">{label}</span>
                        <span className="font-mono text-xs text-white/80">{value ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Friends box ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.065 }}
          className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <SectionHeader icon="👥" title="Friends" />
            <div className="flex items-center gap-2">
              {pendingFriendRequests.length > 0 && (
                <span className="bg-neon-pink/20 border border-neon-pink/30 text-neon-pink font-mono text-[12px] px-1.5 py-0.5 rounded-full">
                  {pendingFriendRequests.length} new
                </span>
              )}
              <button
                onClick={() => setShowFriendsModal(true)}
                className="font-mono text-[12px] text-white/25 hover:text-neon-cyan/60 transition-colors uppercase tracking-wider"
              >
                see more
              </button>
            </div>
          </div>

          {/* Pending requests first */}
          {pendingFriendRequests.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {pendingFriendRequests.slice(0, 2).map(req => (
                <div key={req.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-neon-pink/15 bg-neon-pink/5">
                  <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,rgba(255,0,128,.35),rgba(138,43,226,.35))', border: '1px solid rgba(138,43,226,.25)' }}>
                    {req.fromAvatarUrl
                      ? <img src={req.fromAvatarUrl} alt={req.fromUsername} className="w-full h-full object-cover rounded-full" />
                      : req.fromAvatar}
                  </div>
                  <span className="flex-1 font-mono text-xs text-white/80 truncate">{req.fromUsername}</span>
                  <button
                    onClick={async () => {
                      await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:accept', { fromProfileId: req.fromId });
                      useGameStore.setState(s => ({ pendingFriendRequests: s.pendingFriendRequests.filter(r => r.fromId !== req.fromId) }));
                      emitWithAck<void, Res<Friend[]>>('friend:list').then(r => { if (r.ok) setFriends(r.data ?? []); }).catch(() => {});
                    }}
                    className="px-2 py-1 rounded-lg text-[12px] font-bold text-neon-green border border-neon-green/30 bg-neon-green/8 hover:bg-neon-green/15 transition-all"
                  >✓ Add</button>
                  <button
                    onClick={async () => {
                      await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:decline', { fromProfileId: req.fromId });
                      useGameStore.setState(s => ({ pendingFriendRequests: s.pendingFriendRequests.filter(r => r.fromId !== req.fromId) }));
                    }}
                    className="px-2 py-1 rounded-lg text-[12px] font-bold text-white/35 border border-white/10 hover:bg-white/8 transition-all"
                  >✕</button>
                </div>
              ))}
              {pendingFriendRequests.length > 2 && (
                <button onClick={() => setShowFriendsModal(true)} className="text-center w-full font-mono text-[12px] text-neon-pink/50 hover:text-neon-pink/80 transition-colors py-0.5">
                  +{pendingFriendRequests.length - 2} more requests
                </button>
              )}
            </div>
          )}

          {/* Friends list — up to 5 */}
          {friends.length === 0 && pendingFriendRequests.length === 0 && (
            <p className="text-white/15 font-mono text-xs text-center py-2">No friends yet — add by 4-digit code</p>
          )}
          {friends.length > 0 && (
            <div className="space-y-0.5">
              {[...friends]
                .sort((a, b) => {
                  const aOn = a.isOnline || a.playerStatus === 'online' || a.playerStatus === 'in_game';
                  const bOn = b.isOnline || b.playerStatus === 'online' || b.playerStatus === 'in_game';
                  return Number(bOn) - Number(aOn);
                })
                .slice(0, 5)
                .map(f => {
                  const isOnline = f.isOnline || f.playerStatus === 'online' || f.playerStatus === 'in_game';
                  return (
                    <div key={f.profileId} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/4 transition-colors">
                      <div className="relative flex-shrink-0">
                        <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-sm"
                          style={{ background: 'linear-gradient(135deg,rgba(255,0,128,.35),rgba(138,43,226,.35))', border: '1px solid rgba(138,43,226,.25)' }}>
                          {f.avatarUrl
                            ? <img src={f.avatarUrl} alt={f.username} className="w-full h-full object-cover rounded-full" />
                            : f.avatar}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-void"
                          style={{ background: f.playerStatus === 'in_game' ? '#00f5ff' : isOnline ? '#00ff88' : 'rgba(255,255,255,0.15)' }} />
                      </div>
                      <span className="flex-1 font-mono text-xs text-white/70 truncate">{f.username}</span>
                      <span className="font-mono text-[12px]" style={{ color: f.playerStatus === 'in_game' ? '#00f5ff' : isOnline ? '#00ff88' : 'rgba(255,255,255,0.2)' }}>
                        {f.playerStatus === 'in_game' ? 'In Game' : isOnline ? 'Online' : `Lv.${f.level}`}
                      </span>
                    </div>
                  );
                })}
              {friends.length > 5 && (
                <button onClick={() => setShowFriendsModal(true)}
                  className="w-full text-center font-mono text-[12px] text-white/20 hover:text-neon-cyan/50 transition-colors py-1.5">
                  see more… ({friends.length - 5} more)
                </button>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Expandable "see more" section ──────────────────────────── */}
        <div className="mb-3">
          <button
            onClick={() => setShowFullProfile(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl mb-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="font-mono text-[12px] text-white/40 uppercase tracking-widest">
              {showFullProfile ? '▲ See Less' : '▼ See More — Identity, Stats, History'}
            </span>
          </button>
          {showFullProfile && (
            <div>

        {/* ── Cosmetics / Wardrobe ───────────────────────────────────── */}
        {(() => {
          const cosmetics = profile.cosmetics;
          const unlockedItems = cosmetics?.unlockedItems ?? [];
          const equippedFrame = cosmetics?.equippedFrame ?? null;
          const equippedTitle = cosmetics?.equippedTitle ?? null;
          const equippedSkin  = cosmetics?.equippedRoleSkin ?? null;
          const equippedWallpaper = cosmetics?.equippedWallpaper ?? null;
          const equippedBorder = cosmetics?.equippedBorder ?? null;
          const equippedNameColor = cosmetics?.equippedNameColor ?? null;

          const frameDef = getFrameById(equippedFrame);
          const titleDef = getTitleById(equippedTitle);
          const skinDef  = getRoleSkinById(equippedSkin);

          const unlockedFrames = FRAMES.filter(f => unlockedItems.includes(f.id));
          const unlockedTitles = TITLES.filter(t => unlockedItems.includes(t.id));
          const unlockedSkins  = ROLE_SKINS.filter(s => unlockedItems.includes(s.id));
          const unlockedWallpapers = WALLPAPERS.filter(w => unlockedItems.includes(w.id));
          const unlockedBorders    = BORDERS.filter(b => unlockedItems.includes(b.id));
          const unlockedNameColors = NAME_COLORS.filter(n => unlockedItems.includes(n.id));

          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
              className="glass-panel border border-neon-purple/20 rounded-2xl p-4 mb-3">
              <SectionHeader icon="✨" title="Identity" />

              {/* Equipped overview */}
              <div className="flex gap-2 mb-3">
                {/* Frame preview */}
                <div className="flex-1 rounded-xl border border-white/8 bg-white/3 p-2 flex flex-col items-center gap-1.5">
                  <div
                    className="w-10 h-10 rounded-full p-[2.5px]"
                    style={frameDef
                      ? { background: `linear-gradient(135deg, ${frameDef.colors[0]}, ${frameDef.colors[1]})`, boxShadow: `0 0 8px ${frameDef.glow}` }
                      : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }
                    }
                  >
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-neon-purple/30 to-neon-cyan/20 flex items-center justify-center text-sm font-bold text-neon-cyan">
                      {(profile.username[0] ?? '?').toUpperCase()}
                    </div>
                  </div>
                  <p className="text-[12px] font-mono text-white/30 uppercase tracking-wider text-center">Frame</p>
                  <p className="text-[12px] font-mono text-white/60 text-center truncate w-full">
                    {frameDef ? frameDef.name : 'None'}
                  </p>
                </div>

                {/* Title preview */}
                <div className="flex-1 rounded-xl border border-white/8 bg-white/3 p-2 flex flex-col items-center justify-center gap-1.5">
                  <div
                    className="px-2 py-1 rounded-lg text-[11px] font-display font-bold tracking-wider text-center truncate max-w-full"
                    style={titleDef
                      ? { color: titleDef.color, background: `${titleDef.color}15`, border: `1px solid ${titleDef.color}40` }
                      : { color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >
                    {titleDef ? titleDef.name : '—'}
                  </div>
                  <p className="text-[12px] font-mono text-white/30 uppercase tracking-wider">Title</p>
                </div>

                {/* Skin preview */}
                <div className="flex-1 rounded-xl border border-white/8 bg-white/3 p-2 flex flex-col items-center justify-center gap-1.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                    style={skinDef
                      ? { background: skinDef.bg, border: `2px solid ${skinDef.c1}`, boxShadow: `0 0 8px ${skinDef.glow}40` }
                      : { background: '#03000d', border: '2px solid rgba(155,0,255,0.3)' }
                    }
                  >
                    🃏
                  </div>
                  <p className="text-[12px] font-mono text-white/30 uppercase tracking-wider">Card</p>
                  <p className="text-[12px] font-mono text-white/60 text-center truncate w-full">
                    {skinDef ? skinDef.name : 'Classic'}
                  </p>
                </div>

                {/* Wallpaper preview */}
                <div className="flex-1 rounded-xl border border-white/8 bg-white/3 p-2 flex flex-col items-center justify-center gap-1.5">
                  {equippedWallpaper ? (() => {
                    const wp = getWallpaperById(equippedWallpaper);
                    return wp ? (
                      <div className="w-8 h-8 rounded-lg border border-white/10" style={{ background: wp.gradient }} />
                    ) : null;
                  })() : (
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8" />
                  )}
                  <p className="text-[12px] font-mono text-white/30 uppercase tracking-wider">Wall</p>
                  <p className="text-[12px] font-mono text-white/60 text-center truncate w-full">
                    {getWallpaperById(equippedWallpaper)?.name ?? 'None'}
                  </p>
                </div>
              </div>

              {/* Wardrobe tabs */}
              <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
                {[
                  { id: 'frames',     label: `Frames (${unlockedFrames.length})` },
                  { id: 'titles',     label: `Titles (${unlockedTitles.length})` },
                  { id: 'skins',      label: `Skins (${unlockedSkins.length})` },
                  { id: 'wallpapers', label: `Wallpapers (${unlockedWallpapers.length})` },
                  { id: 'borders',    label: `Borders (${unlockedBorders.length})` },
                  { id: 'colors',     label: `Colors (${unlockedNameColors.length})` },
                ].map(t => (
                  <button key={t.id} onClick={() => setCosmeticsTab(t.id as any)}
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all ${
                      cosmeticsTab === t.id ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'text-white/30 hover:text-white/50'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Frames grid */}
              {cosmeticsTab === 'frames' && (
                <div className="space-y-1.5">
                  {unlockedFrames.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No frames unlocked yet</p>
                  )}
                  {unlockedFrames.map(f => {
                    const isEquipped = equippedFrame === f.id;
                    return (
                      <div key={f.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={{
                          background: isEquipped ? `${f.colors[0]}10` : 'rgba(255,255,255,0.03)',
                          borderColor: isEquipped ? `${f.colors[0]}50` : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="w-9 h-9 rounded-full p-[2px] flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${f.colors[0]}, ${f.colors[1]})`, boxShadow: `0 0 8px ${f.glow}` }}>
                          <div className="w-full h-full rounded-full bg-[#03000d] flex items-center justify-center text-xs font-bold text-neon-cyan">
                            {(profile.username[0] ?? '?').toUpperCase()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-white/80 font-bold">{f.name}</p>
                          <p className="font-mono text-[12px]" style={{ color: RARITY_COLOR[f.rarity] }}>
                            {RARITY_LABEL[f.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('frame', isEquipped ? null : f.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all disabled:opacity-40"
                          style={isEquipped
                            ? { background: `${f.colors[0]}20`, color: f.colors[0], border: `1px solid ${f.colors[0]}50` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }
                          }
                        >
                          {isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Titles grid */}
              {cosmeticsTab === 'titles' && (
                <div className="space-y-1.5">
                  {unlockedTitles.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No titles unlocked yet</p>
                  )}
                  {unlockedTitles.map(t => {
                    const isEquipped = equippedTitle === t.id;
                    return (
                      <div key={t.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={{
                          background: isEquipped ? `${t.color}10` : 'rgba(255,255,255,0.03)',
                          borderColor: isEquipped ? `${t.color}50` : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="flex-shrink-0 px-2 py-1 rounded-lg font-display font-bold text-[11px]"
                          style={{ color: t.color, background: `${t.color}15`, border: `1px solid ${t.color}40` }}>
                          {t.name}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[12px]" style={{ color: RARITY_COLOR[t.rarity] }}>
                            {RARITY_LABEL[t.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('title', isEquipped ? null : t.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all disabled:opacity-40"
                          style={isEquipped
                            ? { background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}50` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }
                          }
                        >
                          {isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Role skins grid */}
              {cosmeticsTab === 'skins' && (
                <div className="space-y-1.5">
                  {unlockedSkins.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No skins unlocked yet</p>
                  )}
                  {unlockedSkins.map(s => {
                    const isEquipped = equippedSkin === s.id;
                    return (
                      <div key={s.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={{
                          background: isEquipped ? `${s.c1}10` : 'rgba(255,255,255,0.03)',
                          borderColor: isEquipped ? `${s.c1}50` : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="w-9 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg"
                          style={{ background: s.bg, border: `2px solid ${s.c1}`, boxShadow: `0 0 10px ${s.glow}40` }}>
                          🃏
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-white/80 font-bold">{s.name}</p>
                          <p className="font-mono text-[12px]" style={{ color: RARITY_COLOR[s.rarity] }}>
                            {RARITY_LABEL[s.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('role_skin', isEquipped ? null : s.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all disabled:opacity-40"
                          style={isEquipped
                            ? { background: `${s.c1}20`, color: s.c1, border: `1px solid ${s.c1}50` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }
                          }
                        >
                          {isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Wallpapers / Backgrounds grid */}
              {cosmeticsTab === 'wallpapers' && (
                <div className="space-y-1.5">
                  {/* Profile Backgrounds (purchasable) */}
                  <p className="text-[12px] font-mono text-white/25 uppercase tracking-widest mb-1">Profile Backgrounds</p>
                  {buyMsg && (
                    <p className="text-center font-mono text-xs text-neon-green/70 py-1">{buyMsg}</p>
                  )}
                  {PROFILE_BACKGROUNDS.map(bg => {
                    const isOwned = unlockedItems.includes(bg.id);
                    const isEquipped = equippedWallpaper === bg.id;
                    const isBuying = buyingItem === bg.id;
                    return (
                      <div key={bg.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={isEquipped
                          ? { borderColor: `${bg.accent}60`, background: `${bg.accent}10`, boxShadow: `0 0 12px ${bg.accent}30` }
                          : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="w-10 h-10 rounded-lg shrink-0 border border-white/10" style={{ background: bg.css }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold text-white/80 truncate">{bg.name}</p>
                          <p className="text-[12px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[bg.rarity] }}>{RARITY_LABEL[bg.rarity]}</p>
                          {!isOwned && bg.price > 0 && (
                            <p className="text-[12px] font-mono text-amber-400/70">{bg.price} coins</p>
                          )}
                          {isOwned && !isEquipped && (
                            <p className="text-[12px] font-mono text-white/25">Owned</p>
                          )}
                        </div>
                        {isOwned ? (
                          <button
                            disabled={equipLoading}
                            onClick={() => handleEquip('wallpaper', isEquipped ? null : bg.id)}
                            className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={isEquipped
                              ? { background: `${bg.accent}20`, color: bg.accent, border: `1px solid ${bg.accent}50` }
                              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
                          >
                            {isEquipped ? 'Unequip' : 'Equip'}
                          </button>
                        ) : (
                          <button
                            disabled={isBuying || !!buyingItem}
                            onClick={() => handleBuyBackground(bg.id)}
                            className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] font-bold transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,180,0,0.1)', color: 'rgba(255,180,0,0.8)', border: '1px solid rgba(255,180,0,0.25)' }}
                          >
                            {isBuying ? '...' : 'Buy'}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Legacy level-unlock wallpapers */}
                  {unlockedWallpapers.length > 0 && (
                    <>
                      <p className="text-[12px] font-mono text-white/25 uppercase tracking-widest mt-3 mb-1">Level Wallpapers</p>
                      {unlockedWallpapers.map(w => {
                        const isEquipped = equippedWallpaper === w.id;
                        return (
                          <div key={w.id}
                            className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                            style={isEquipped ? { borderColor: `${w.accent}40`, background: `${w.accent}08` } : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <div className="w-10 h-10 rounded-lg shrink-0 border border-white/10" style={{ background: w.gradient }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-mono font-bold text-white/80 truncate">{w.name}</p>
                              <p className="text-[12px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[w.rarity] }}>{RARITY_LABEL[w.rarity]}</p>
                            </div>
                            <button
                              onClick={() => handleEquip('wallpaper', isEquipped ? null : w.id)}
                              className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] font-bold transition-all"
                              style={isEquipped
                                ? { background: `${w.accent}20`, color: w.accent, border: `1px solid ${w.accent}40` }
                                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                              {isEquipped ? 'Unequip' : 'Equip'}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* Borders grid */}
              {cosmeticsTab === 'borders' && (
                <div className="space-y-1.5">
                  {unlockedBorders.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No borders unlocked yet</p>
                  )}
                  {unlockedBorders.map(b => {
                    const isEquipped = equippedBorder === b.id;
                    return (
                      <div key={b.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={isEquipped ? { borderColor: `${b.colors[0]}40`, background: `${b.colors[0]}08` } : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className={`w-10 h-10 rounded-full p-[2.5px] shrink-0 ${b.animationClass}`}
                          style={{ background: `linear-gradient(135deg, ${b.colors[0]}, ${b.colors[1]})` }}>
                          <div className="w-full h-full rounded-full bg-void flex items-center justify-center">
                            <VoidProfileIcon size={20} color="rgba(255,255,255,0.55)" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold text-white/80 truncate">{b.name}</p>
                          <p className="text-[12px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[b.rarity] }}>{RARITY_LABEL[b.rarity]}</p>
                        </div>
                        <button
                          onClick={() => handleEquip('border', isEquipped ? null : b.id)}
                          className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] font-bold transition-all"
                          style={isEquipped
                            ? { background: `${b.colors[0]}20`, color: b.colors[0], border: `1px solid ${b.colors[0]}40` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {isEquipped ? 'Unequip' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Name Colors grid */}
              {cosmeticsTab === 'colors' && (
                <div className="space-y-1.5">
                  {unlockedNameColors.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No name colors unlocked yet</p>
                  )}
                  {unlockedNameColors.map(nc => {
                    const isEquipped = equippedNameColor === nc.id;
                    return (
                      <div key={nc.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={isEquipped ? { borderColor: `${nc.color}40`, background: `${nc.color}08` } : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-mono font-bold text-sm border border-white/10"
                          style={{ color: nc.color, background: `${nc.color}12` }}>
                          Aa
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold truncate" style={{ color: nc.color }}>{nc.name}</p>
                          <p className="text-[12px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[nc.rarity] }}>{RARITY_LABEL[nc.rarity]}</p>
                        </div>
                        <button
                          onClick={() => handleEquip('name_color', isEquipped ? null : nc.id)}
                          className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[12px] font-bold transition-all"
                          style={isEquipped
                            ? { background: `${nc.color}20`, color: nc.color, border: `1px solid ${nc.color}40` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {isEquipped ? 'Unequip' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* ── Ranked Rating ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.065 }}
          className="glass-panel rounded-2xl p-4 mb-3"
          style={{ border: '1px solid rgba(155,0,255,0.2)', background: 'rgba(155,0,255,0.04)' }}>
          <SectionHeader icon={<VoidClansIcon size={14} color="rgba(155,0,255,0.7)" />} title="Ranked" />
          {rating === null ? (
            <div className="text-center py-2">
              <p className="font-mono text-xs text-white/25">No ranked games yet</p>
              <p className="font-mono text-[12px] text-white/15 mt-0.5">Play ranked matches to earn a rating</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <RatingBadge tier={rating.tier} elo={rating.elo} size="md" />
                {rating.peakElo > rating.elo && (
                  <span className="font-mono text-[12px] text-white/30">
                    Peak: <span className="text-white/50">{rating.peakElo}</span>
                  </span>
                )}
              </div>
              {!rating.isPlaced ? (
                <div className="mb-3 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                  <p className="font-mono text-xs text-white/50 text-center">
                    Placement: {rating.placementGames}/5 games played
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-pink transition-all"
                      style={{ width: `${Math.round((rating.placementGames / 5) * 100)}%` }}
                    />
                  </div>
                  <p className="font-mono text-[12px] text-white/25 text-center mt-1">
                    {5 - rating.placementGames} more to get ranked
                  </p>
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-xl bg-white/3 border border-white/6">
                  <p className="font-mono text-base font-bold text-neon-green">{rating.rankedWins}</p>
                  <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider">Wins</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-white/3 border border-white/6">
                  <p className="font-mono text-base font-bold text-neon-red/80">{rating.rankedLosses}</p>
                  <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider">Losses</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-white/3 border border-white/6">
                  <p className="font-mono text-base font-bold text-white/60">
                    {rating.rankedWins + rating.rankedLosses > 0
                      ? Math.round((rating.rankedWins / (rating.rankedWins + rating.rankedLosses)) * 100)
                      : 0}%
                  </p>
                  <p className="font-mono text-[12px] text-white/30 uppercase tracking-wider">Win Rate</p>
                </div>
              </div>
            </>
          )}
        </motion.div>

        {/* ── Season History ──────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.068 }}
          className="glass-panel rounded-2xl p-4 mb-3"
          style={{ border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.03)' }}>
          <SectionHeader icon="🌀" title="Season History" />
          {seasonHistory === null ? (
            <p className="text-white/20 font-mono text-xs text-center py-2">Loading…</p>
          ) : seasonHistory.length === 0 ? (
            <div className="text-center py-2">
              <p className="font-mono text-xs text-white/25">Play ranked games to earn season rewards</p>
            </div>
          ) : (
            <div className="space-y-2">
              {seasonHistory.map(sr => (
                <div key={sr.seasonId} className="rounded-xl p-3 border border-white/6 bg-white/3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-display font-bold text-xs text-white/80 truncate pr-2">{sr.seasonName}</p>
                    <span className="font-mono text-[12px] text-white/30 shrink-0">#{sr.finalRank}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <RatingBadge tier={sr.finalTier as any} size="sm" showElo={false} />
                    <span className="font-mono text-[12px] text-white/40">{sr.finalElo} ELO</span>
                    {sr.rewardTitle && (
                      <span className="font-mono text-[12px] text-neon-purple/70 border border-neon-purple/20 rounded-lg px-1.5 py-0.5">
                        {sr.rewardTitle}
                      </span>
                    )}
                    {sr.rewardCoins > 0 && (
                      <span className="font-mono text-[12px] text-amber-400/70">+{sr.rewardCoins} 🪙</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Games by team ──────────────────────────────────────────── */}
        {roleStats && roleStats.byTeam.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
            <SectionHeader icon={<VoidGamesIcon size={14} color="rgba(245,158,11,0.7)" />} title="Games by Team" />
            {roleStats.byTeam.map(t => {
              const wr  = t.games > 0 ? Math.round((t.wins / t.games) * 100) : 0;
              const pct = t.games > 0 ? Math.round((t.wins / t.games) * 100) : 0;
              const tc  = TEAM_COLOR[t.team] ?? '#ffffff';
              return (
                <div key={t.team} className="py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: tc }} />
                      <span className="font-mono text-xs font-bold" style={{ color: tc }}>
                        {TEAM_LABEL[t.team] ?? t.team}
                      </span>
                    </div>
                    <span className="font-mono text-[12px] text-white/40">
                      {t.games}g · {t.wins}W · {t.survived}sur
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `${tc}80` }} />
                  </div>
                  <p className="text-right font-mono text-[12px] mt-0.5" style={{ color: `${tc}80` }}>{wr}% win rate</p>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* ── Games by role ──────────────────────────────────────────── */}
        {roleStats && roleStats.byRole.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
            className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
            <SectionHeader icon="🎭" title="Games by Role" />
            {roleStats.byRole.slice(0, 10).map(r => {
              const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
              return (
                <div key={r.role} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <span className="font-mono text-xs text-white/60">
                    {ROLE_LABEL[r.role] ?? r.role}
                  </span>
                  <div className="flex items-center gap-3 text-right">
                    <span className="font-mono text-[12px] text-white/30">{r.games}g</span>
                    <span className="font-mono text-[12px] text-neon-green/70">{r.wins}W</span>
                    <span className="font-mono text-[12px] text-white/50">{wr}%</span>
                  </div>
                </div>
              );
            })}
            {roleStats.byRole.length > 10 && (
              <p className="text-[12px] font-mono text-white/20 text-center mt-2">+{roleStats.byRole.length - 10} more roles</p>
            )}
          </motion.div>
        )}

        {/* ── Tabs: achievements / history / friends ─────────────────── */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl bg-white/4 border border-white/6">
          {(['achievements', 'history', 'friends'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all ${
                tab === t ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'text-white/30 hover:text-white/50'
              }`}>
              {t === 'achievements' ? (
                <span className="flex items-center gap-1 justify-center">
                  <VoidLeaderboardIcon size={11} color="currentColor" />
                  ({achievements.length})
                </span>
              ) : t === 'history' ? '📋 History' : '👥 Friends'}
            </button>
          ))}
        </div>

        {/* Achievements */}
        {tab === 'achievements' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loadingAch ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
              </div>
            ) : achievements.length === 0 ? (
              <div className="text-center py-10 text-white/20 font-mono text-sm">
                <div className="flex justify-center mb-2 opacity-30">
                  <VoidLeaderboardIcon size={36} color="#facc15" />
                </div>
                <p>Play games to earn achievements</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {achievements.map(a => (
                  <div key={a.key} className="rounded-2xl p-3 flex items-center gap-3"
                    style={{
                      background: 'linear-gradient(135deg, rgba(8,4,20,0.9), rgba(8,4,20,0.7))',
                      border: `1px solid ${RARITY_BORDER[a.rarity] ?? RARITY_BORDER.common}`,
                      boxShadow: `0 0 20px ${RARITY_GLOW[a.rarity] ?? RARITY_GLOW.common}`,
                    }}>
                    <span className="text-2xl flex-shrink-0">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-white text-sm leading-tight truncate">{a.name}</p>
                      <p className="font-mono text-[12px] text-white/35 leading-tight mt-0.5">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* History */}
        {tab === 'history' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {history.length === 0 ? (
              <div className="text-center py-10 text-white/20 font-mono text-sm">
                <p className="text-3xl mb-2">📋</p>
                <p>No games played yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map(g => (
                  <div key={g.id} className="rounded-2xl px-4 py-3 flex items-center gap-3 border"
                    style={{
                      background: g.won ? 'rgba(0,255,136,0.04)' : 'rgba(255,30,60,0.04)',
                      borderColor: g.won ? 'rgba(0,255,136,0.15)' : 'rgba(255,30,60,0.15)',
                    }}>
                    <span className="text-xl flex-shrink-0">{g.won ? '🏆' : '💀'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white/70 font-bold">{g.myRole ?? 'Unknown'}</span>
                        <TeamBadge team={g.myTeam} />
                      </div>
                      <p className="font-mono text-[12px] text-white/30">Room #{g.roomCode} · Day {g.dayReached} · {g.playerCount}p</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                      <p className={`font-display font-bold text-sm ${g.won ? 'text-neon-green' : 'text-neon-red/70'}`}>{g.won ? 'WIN' : 'LOSS'}</p>
                      <p className="font-mono text-[12px] text-white/20">{new Date(g.endedAt).toLocaleDateString()}</p>
                      {onViewReplay && (
                        <button
                          onClick={() => onViewReplay(g.id)}
                          className="font-mono text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-lg transition-all"
                          style={{
                            background: 'rgba(0,229,255,0.08)',
                            color: 'rgba(0,229,255,0.6)',
                            border: '1px solid rgba(0,229,255,0.2)',
                          }}
                        >
                          📺 Replay
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Friends */}
        {tab === 'friends' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FriendsPanel />
          </motion.div>
        )}

            </div>
          )}
        </div>

        {/* ── Actions ────────────────────────────────────────────────── */}
        <div className="mt-2 mb-4">
          <button onClick={logout}
            className="w-full py-3 border border-neon-red/30 text-neon-red font-display font-bold tracking-widest rounded-xl hover:bg-neon-red/10 transition-all text-sm">
            Log Out
          </button>
        </div>
      </div>

      {/* ── Friends full modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {showFriendsModal && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowFriendsModal(false)}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'rgba(8,4,20,0.97)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '80vh' }}
              initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/40">👥 Friends</p>
                <button onClick={() => setShowFriendsModal(false)} className="text-white/30 hover:text-white/70 text-sm">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                <FriendsPanel />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareCardModal
        open={showShare}
        data={showShare ? {
          profile,
          clan: clan ?? null,
          achievements,
        } satisfies ProfileCardData : null}
        onClose={() => setShowShare(false)}
      />
    </div>
  );
}

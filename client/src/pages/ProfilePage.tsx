import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { FriendsPanel } from '@/components/ui/FriendsPanel';
import { GiftGallery } from '@/components/ui/GiftGallery';
import { ShareCardModal } from '@/components/ui/ShareCardModal';
import type { ProfileCardData } from '@/components/ui/ProfileCard';
import { emitWithAck, socket } from '@/lib/socket';
import type { AchievementEarned, GameHistoryEntry, PlayerRoleStats, ClanMembership, Res, PlayerCosmetics } from '@/types/index';
import {
  FRAMES, TITLES, ROLE_SKINS, WALLPAPERS, BORDERS, NAME_COLORS,
  RARITY_COLOR, RARITY_LABEL,
  getFrameById, getTitleById, getRoleSkinById, getWallpaperById, getBorderById,
} from '@/constants/cosmetics';

import { MAX_LEVEL, xpForLevel, xpForNextLevel, levelColor } from '@/lib/level';

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

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm">{icon}</span>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">{title}</p>
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
  return <span className={`font-mono text-[9px] uppercase tracking-wider ${colors[team ?? ''] ?? 'text-white/30'}`}>{team ?? '—'}</span>;
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

interface LinkedProvider { provider: string; email: string | null; displayName: string | null; }

export function ProfilePage() {
  const { profile, logout, localAvatar, uploadAvatar, removeAvatar, uid, changeName } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [achievements, setAchievements] = useState<AchievementEarned[]>([]);
  const [history, setHistory]           = useState<GameHistoryEntry[]>([]);
  const [roleStats, setRoleStats]       = useState<PlayerRoleStats | null>(null);
  const [clan, setClan]                 = useState<ClanMembership | null | undefined>(undefined);
  const [tab, setTab] = useState<'achievements' | 'history' | 'friends'>('achievements');
  const [loadingAch, setLoadingAch]   = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError]   = useState('');
  const [previewSrc, setPreviewSrc]     = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<LinkedProvider[]>([]);
  const [linkMsg, setLinkMsg]   = useState('');
  const [linkError, setLinkError] = useState('');
  const [coins, setCoins]           = useState<number | null>(null);
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [dailyMsg, setDailyMsg]     = useState<string | null>(null);
  const [showShare, setShowShare]   = useState(false);
  const [cosmeticsTab, setCosmeticsTab] = useState<'frames' | 'titles' | 'skins' | 'wallpapers' | 'borders' | 'colors'>('frames');
  const [equipLoading, setEquipLoading] = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_linked')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      setLinkMsg(`${params.get('oauth_linked')} account connected successfully!`);
      setTimeout(() => setLinkMsg(''), 4000);
    }
    if (params.get('oauth_error')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      const msg = params.get('oauth_error');
      setLinkError(msg === '1' ? 'Connection failed. Please try again.' : decodeURIComponent(msg ?? ''));
      setTimeout(() => setLinkError(''), 5000);
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    fetch(`/api/auth/linked?uid=${encodeURIComponent(uid)}`)
      .then(r => r.json())
      .then(data => { if (data.ok) setLinkedProviders(data.providers); })
      .catch(() => {});
  }, [uid]);

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
    }).finally(() => setLoadingAch(false));
  }, [profile]);

  // Coin balance
  useEffect(() => {
    if (!profile) return;
    emitWithAck<null, Res<{ coins: number }>>('coins:balance').then(res => {
      if (res.ok) setCoins(res.data.coins);
    });
    const onCoinsUpdated = ({ coins: c }: { coins: number }) => setCoins(c);
    socket.on('coins:updated' as any, onCoinsUpdated);
    return () => { socket.off('coins:updated' as any, onCoinsUpdated); };
  }, [profile]);

  const claimDaily = async () => {
    setDailyClaiming(true);
    setDailyMsg(null);
    try {
      const res = await emitWithAck<null, Res<{ coins: number; balance: number; alreadyClaimed: boolean }>>('coins:daily_reward');
      if (res.ok) {
        setCoins(res.data.balance);
        setDailyMsg(res.data.alreadyClaimed ? 'Already claimed today. Come back tomorrow!' : `+${res.data.coins} coins claimed!`);
      }
    } finally {
      setDailyClaiming(false);
      setTimeout(() => setDailyMsg(null), 3000);
    }
  };

  const handleLinkOAuth = async (provider: 'google' | 'facebook' | 'apple') => {
    if (!uid) return;
    try {
      await fetch('/api/auth/init-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ uid }),
      });
      window.location.href = `/api/auth/${provider}?link=1`;
    } catch { setLinkError('Failed to start linking. Please try again.'); }
  };

  const handleUnlink = async (provider: string) => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/auth/unlink/${provider}?uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) setLinkedProviders(prev => prev.filter(p => p.provider !== provider));
      else setLinkError('Unlink failed.');
    } catch { setLinkError('Unlink failed.'); }
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

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
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
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-display font-bold border"
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
                  {profile.isModerator && profile.moderatorBadgeVisible && <ModBadge level={profile.moderatorLevel} />}
                  <button onClick={startEditName} title="Change username"
                    className="text-white/25 hover:text-neon-cyan/70 transition-colors text-sm">
                    ✎
                  </button>
                </div>
              )}
              {nameError && <p className="text-[10px] font-mono text-neon-red/80 mt-0.5">{nameError}</p>}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {profile.publicId != null && (
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(0,229,255,0.08)', color: 'rgba(0,229,255,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}>
                    ID #{profile.publicId}
                  </span>
                )}
                <span className="font-mono text-[10px] text-white/30">
                  Joined {new Date(profile.joinedAt).toLocaleDateString()}
                </span>
              </div>
              {/* Avatar actions */}
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={handleAvatarClick} disabled={uploadLoading}
                  className="font-mono text-[9px] uppercase tracking-wider text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors disabled:opacity-40">
                  {displayAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                {displayAvatar && (
                  <>
                    <span className="text-white/15 font-mono text-[9px]">·</span>
                    <button onClick={handleRemove} disabled={uploadLoading}
                      className="font-mono text-[9px] uppercase tracking-wider text-neon-red/40 hover:text-neon-red/70 transition-colors disabled:opacity-40">
                      Remove
                    </button>
                  </>
                )}
              </div>
              {uploadError && <p className="text-[10px] font-mono text-neon-red/80 mt-1">{uploadError}</p>}
            </div>
          </div>

          {/* XP bar */}
          <div className="mb-4 p-3 rounded-xl border border-white/8 bg-white/3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-display font-bold tracking-widest uppercase" style={{ color: `${col}90` }}>
                Level {level}
              </span>
              <span className="text-[10px] font-mono text-white/30">{xp} XP</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${xpPct}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
            </div>
            {level < MAX_LEVEL ? (
              <p className="text-[9px] font-mono text-white/20 mt-1 text-right">
                {xpMax - xp} XP to Level {level + 1}
              </p>
            ) : (
              <p className="text-[9px] font-mono text-yellow-400/40 mt-1 text-right uppercase tracking-widest">
                მაქსიმალური დონე
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
                <p className="text-white/30 text-[10px] font-mono mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {stats.gamesPlayed > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-white/30">
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
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider text-center">Frame</p>
                  <p className="text-[10px] font-mono text-white/60 text-center truncate w-full">
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
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Title</p>
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
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Card</p>
                  <p className="text-[10px] font-mono text-white/60 text-center truncate w-full">
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
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Wall</p>
                  <p className="text-[10px] font-mono text-white/60 text-center truncate w-full">
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
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all ${
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
                          <p className="font-mono text-[9px]" style={{ color: RARITY_COLOR[f.rarity] }}>
                            {RARITY_LABEL[f.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('frame', isEquipped ? null : f.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40"
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
                          <p className="font-mono text-[9px]" style={{ color: RARITY_COLOR[t.rarity] }}>
                            {RARITY_LABEL[t.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('title', isEquipped ? null : t.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40"
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
                          <p className="font-mono text-[9px]" style={{ color: RARITY_COLOR[s.rarity] }}>
                            {RARITY_LABEL[s.rarity]}
                          </p>
                        </div>
                        <button
                          disabled={equipLoading}
                          onClick={() => handleEquip('role_skin', isEquipped ? null : s.id)}
                          className="flex-shrink-0 px-3 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40"
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

              {/* Wallpapers grid */}
              {cosmeticsTab === 'wallpapers' && (
                <div className="space-y-1.5">
                  {unlockedWallpapers.length === 0 && (
                    <p className="text-white/20 font-mono text-xs text-center py-3">No wallpapers unlocked yet</p>
                  )}
                  {unlockedWallpapers.map(w => {
                    const isEquipped = equippedWallpaper === w.id;
                    return (
                      <div key={w.id}
                        className="flex items-center gap-3 rounded-xl p-2.5 border transition-all"
                        style={isEquipped ? { borderColor: `${w.accent}40`, background: `${w.accent}08` } : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="w-10 h-10 rounded-lg shrink-0 border border-white/10" style={{ background: w.gradient }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold text-white/80 truncate">{w.name}</p>
                          <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[w.rarity] }}>{RARITY_LABEL[w.rarity]}</p>
                        </div>
                        <button
                          onClick={() => handleEquip('wallpaper', isEquipped ? null : w.id)}
                          className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition-all"
                          style={isEquipped
                            ? { background: `${w.accent}20`, color: w.accent, border: `1px solid ${w.accent}40` }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {isEquipped ? 'Unequip' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
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
                          <div className="w-full h-full rounded-full bg-void flex items-center justify-center text-sm">👤</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold text-white/80 truncate">{b.name}</p>
                          <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[b.rarity] }}>{RARITY_LABEL[b.rarity]}</p>
                        </div>
                        <button
                          onClick={() => handleEquip('border', isEquipped ? null : b.id)}
                          className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition-all"
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
                          <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: RARITY_COLOR[nc.rarity] }}>{RARITY_LABEL[nc.rarity]}</p>
                        </div>
                        <button
                          onClick={() => handleEquip('name_color', isEquipped ? null : nc.id)}
                          className="shrink-0 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition-all"
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

        {/* ── Clan section ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
          <SectionHeader icon="🏰" title="Clan" />
          {clan === undefined && (
            <p className="text-white/20 font-mono text-xs text-center py-2">Loading…</p>
          )}
          {clan === null && (
            <p className="text-white/20 font-mono text-xs text-center py-2">Not in a clan</p>
          )}
          {clan && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold text-neon-cyan">[{clan.tag}]</span>
                <span className="font-mono text-sm text-white/70 truncate">{clan.name}</span>
              </div>
              <StatRow label="Role"        value={clan.memberRole.charAt(0).toUpperCase() + clan.memberRole.slice(1)} />
              <StatRow label="Joined clan" value={new Date(clan.joinedAt).toLocaleDateString()} />
              <StatRow label="Members"     value={clan.memberCount} />
              <StatRow label="Clan wins"   value={clan.wins} />
              <StatRow label="Clan losses" value={clan.losses} />
            </>
          )}
        </motion.div>

        {/* ── Coin Wallet ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass-panel border border-amber-400/15 rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="🪙" title="Coins" />
            <span className="font-mono text-lg font-bold text-amber-400">
              {coins != null ? coins.toLocaleString() : '—'}
            </span>
          </div>
          <button
            onClick={claimDaily}
            disabled={dailyClaiming}
            className="w-full py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-400/20 transition-all disabled:opacity-50"
          >
            {dailyClaiming ? 'Claiming...' : '☀ Claim Daily Reward (50 🪙)'}
          </button>
          <AnimatePresence>
            {dailyMsg && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-center font-mono text-xs mt-2 text-amber-400/70">
                {dailyMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Gift Gallery ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.085 }}
          className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
          <SectionHeader icon="🎁" title="Gifts" />
          {profile && <GiftGallery profileId={profile.id} viewerId={profile.id} />}
        </motion.div>

        {/* ── Games by team ──────────────────────────────────────────── */}
        {roleStats && roleStats.byTeam.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            className="glass-panel border border-white/8 rounded-2xl p-4 mb-3">
            <SectionHeader icon="🎮" title="Games by Team" />
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
                    <span className="font-mono text-[10px] text-white/40">
                      {t.games}g · {t.wins}W · {t.survived}sur
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `${tc}80` }} />
                  </div>
                  <p className="text-right font-mono text-[9px] mt-0.5" style={{ color: `${tc}80` }}>{wr}% win rate</p>
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
                    <span className="font-mono text-[10px] text-white/30">{r.games}g</span>
                    <span className="font-mono text-[10px] text-neon-green/70">{r.wins}W</span>
                    <span className="font-mono text-[10px] text-white/50">{wr}%</span>
                  </div>
                </div>
              );
            })}
            {roleStats.byRole.length > 10 && (
              <p className="text-[9px] font-mono text-white/20 text-center mt-2">+{roleStats.byRole.length - 10} more roles</p>
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
              {t === 'achievements' ? `🏅 (${achievements.length})` : t === 'history' ? '📋 History' : '👥 Friends'}
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
                <p className="text-3xl mb-2">🏅</p>
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
                      <p className="font-mono text-[9px] text-white/35 leading-tight mt-0.5">{a.description}</p>
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
                      <p className="font-mono text-[10px] text-white/30">Room #{g.roomCode} · Day {g.dayReached} · {g.playerCount}p</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-display font-bold text-sm ${g.won ? 'text-neon-green' : 'text-neon-red/70'}`}>{g.won ? 'WIN' : 'LOSS'}</p>
                      <p className="font-mono text-[9px] text-white/20">{new Date(g.endedAt).toLocaleDateString()}</p>
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

        {/* ── Connected accounts ─────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mt-4 glass-panel border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/25 mb-3">Connected Accounts</p>
          {linkMsg   && <p className="text-neon-green text-xs font-mono mb-2">{linkMsg}</p>}
          {linkError && <p className="text-neon-red text-xs font-mono mb-2">{linkError}</p>}

          {/* Google */}
          {(() => {
            const linked = linkedProviders.find(p => p.provider === 'google');
            return (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <div>
                    <p className="text-white/60 font-mono text-xs">Google</p>
                    {linked && <p className="text-white/25 font-mono text-[9px]">{linked.email ?? linked.displayName ?? 'Connected'}</p>}
                  </div>
                </div>
                {linked ? (
                  <button onClick={() => handleUnlink('google')} className="text-[9px] font-mono text-neon-red/50 hover:text-neon-red/80 transition-colors uppercase tracking-wider">Disconnect</button>
                ) : (
                  <button onClick={() => handleLinkOAuth('google')} className="text-[9px] font-mono text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors uppercase tracking-wider">Connect</button>
                )}
              </div>
            );
          })()}

          {/* Facebook */}
          {(() => {
            const linked = linkedProviders.find(p => p.provider === 'facebook');
            return (
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 fill-current text-[#1877F2]" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <div>
                    <p className="text-white/60 font-mono text-xs">Facebook</p>
                    {linked && <p className="text-white/25 font-mono text-[9px]">{linked.email ?? linked.displayName ?? 'Connected'}</p>}
                  </div>
                </div>
                {linked ? (
                  <button onClick={() => handleUnlink('facebook')} className="text-[9px] font-mono text-neon-red/50 hover:text-neon-red/80 transition-colors uppercase tracking-wider">Disconnect</button>
                ) : (
                  <button onClick={() => handleLinkOAuth('facebook')} className="text-[9px] font-mono text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors uppercase tracking-wider">Connect</button>
                )}
              </div>
            );
          })()}

          {/* Apple */}
          {(() => {
            const linked = linkedProviders.find(p => p.provider === 'apple');
            return (
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 fill-current text-white/80" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
                  </svg>
                  <div>
                    <p className="text-white/60 font-mono text-xs">Apple</p>
                    {linked && <p className="text-white/25 font-mono text-[9px]">{linked.email ?? linked.displayName ?? 'Connected'}</p>}
                  </div>
                </div>
                {linked ? (
                  <button onClick={() => handleUnlink('apple')} className="text-[9px] font-mono text-neon-red/50 hover:text-neon-red/80 transition-colors uppercase tracking-wider">Disconnect</button>
                ) : (
                  <button onClick={() => handleLinkOAuth('apple')} className="text-[9px] font-mono text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors uppercase tracking-wider">Connect</button>
                )}
              </div>
            );
          })()}
        </motion.div>

        {/* ── Actions ────────────────────────────────────────────────── */}
        <div className="mt-4 mb-4 space-y-2">
          <button onClick={() => setShowRoleGuide(true)}
            className="w-full py-3 border border-neon-cyan/20 text-neon-cyan/70 font-display font-bold tracking-widest rounded-xl hover:bg-neon-cyan/8 transition-all text-sm flex items-center justify-center gap-2">
            📖 Role Guide
          </button>
          <button onClick={logout}
            className="w-full py-3 border border-neon-red/30 text-neon-red font-display font-bold tracking-widest rounded-xl hover:bg-neon-red/10 transition-all text-sm">
            Log Out
          </button>
        </div>
      </div>

      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />

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

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { FriendsPanel } from '@/components/ui/FriendsPanel';
import { emitWithAck } from '@/lib/socket';
import { AchievementEarned, GameHistoryEntry } from '@/types/index';
import type { Res } from '@/types/index';

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400];
function xpForLevel(level: number): number { return LEVEL_THRESHOLDS[level - 1] ?? 0; }
function xpForNextLevel(level: number): number { return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]; }

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

const MAX_SIZE = 5 * 1024 * 1024; // 5MB original file limit
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function TeamBadge({ team }: { team: string | null }) {
  const colors: Record<string, string> = {
    mafia: 'text-neon-red/80', town: 'text-neon-green/80',
    neutral: 'text-yellow-400/80', cult: 'text-neon-purple/80',
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
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/webp', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image.')); };
    img.src = url;
  });
}

export function ProfilePage() {
  const { profile, username, logout, localAvatar, uploadAvatar, removeAvatar } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [achievements, setAchievements] = useState<AchievementEarned[]>([]);
  const [history, setHistory]           = useState<GameHistoryEntry[]>([]);
  const [tab, setTab] = useState<'achievements' | 'history' | 'friends'>('achievements');
  const [loadingAch, setLoadingAch] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setLoadingAch(true);
    Promise.all([
      emitWithAck<{ profileId: string }, Res<AchievementEarned[]>>('player:achievements', { profileId: profile.id }),
      emitWithAck<{ profileId: string }, Res<GameHistoryEntry[]>>('player:history', { profileId: profile.id }),
    ]).then(([achRes, histRes]) => {
      if (achRes.ok) setAchievements(achRes.data);
      if (histRes.ok) setHistory(histRes.data);
    }).finally(() => setLoadingAch(false));
  }, [profile]);

  if (!profile) return null;

  const { stats } = profile;
  const displayAvatar = previewSrc ?? localAvatar;

  const handleAvatarClick = () => {
    if (!uploadLoading) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError('');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Unsupported image type. Use JPG, PNG, or WebP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Image is too large. Max 5MB.');
      return;
    }

    setUploadLoading(true);
    try {
      const resized = await resizeImage(file);
      setPreviewSrc(resized);
      const result = await uploadAvatar(resized);
      if (!result.ok) {
        setUploadError(result.error ?? 'Upload failed.');
        setPreviewSrc(null);
      } else {
        setPreviewSrc(null); // profile.avatarUrl now updated in store
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
      setPreviewSrc(null);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRemove = async () => {
    setUploadLoading(true);
    setUploadError('');
    setPreviewSrc(null);
    const result = await removeAvatar();
    if (!result.ok) setUploadError(result.error ?? 'Remove failed.');
    setUploadLoading(false);
  };

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <PoweredBy className="block mt-0.5" />
        </div>

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border border-neon-purple/20 rounded-2xl p-6 mb-4"
        >
          <div className="flex items-center gap-4 mb-4">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadLoading}
                className="relative w-16 h-16 rounded-full group"
                title="Click to upload profile picture"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,0,128,0.6), rgba(138,43,226,0.6))',
                    boxShadow: displayAvatar ? '0 0 16px rgba(138,43,226,0.5)' : '0 0 8px rgba(138,43,226,0.3)',
                    border: '2px solid rgba(138,43,226,0.4)',
                  }}
                >
                  {displayAvatar
                    ? <img src={displayAvatar} alt={profile.username} className="w-full h-full object-cover rounded-full" />
                    : <span>{profile.avatar}</span>
                  }
                </div>
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadLoading
                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  }
                </div>
              </button>
              {/* Level badge */}
              <div
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display font-bold border"
                style={{
                  background: 'rgba(155,0,255,0.4)',
                  borderColor: 'rgba(155,0,255,0.7)',
                  color: '#c084fc',
                  boxShadow: '0 0 8px rgba(155,0,255,0.5)',
                }}
              >
                {profile.level ?? 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className={`font-display font-bold text-xl ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>{profile.username}</h2>
                {profile.isModerator && profile.moderatorBadgeVisible && <ModBadge level={profile.moderatorLevel} />}
              </div>
              <p className="text-neon-cyan/60 font-display font-bold text-sm mt-0.5 tracking-widest">
                {profile.publicId != null ? `#${profile.publicId}` : (profile.friendCode ? `#${profile.friendCode}` : '')}
              </p>
              <p className="text-white/20 font-mono text-xs">Joined {new Date(profile.joinedAt).toLocaleDateString()}</p>
              {/* Avatar actions */}
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={handleAvatarClick}
                  disabled={uploadLoading}
                  className="font-mono text-[9px] uppercase tracking-wider text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors disabled:opacity-40"
                >
                  {displayAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                {displayAvatar && (
                  <>
                    <span className="text-white/15 font-mono text-[9px]">·</span>
                    <button
                      onClick={handleRemove}
                      disabled={uploadLoading}
                      className="font-mono text-[9px] uppercase tracking-wider text-neon-red/40 hover:text-neon-red/70 transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              {uploadError && (
                <p className="text-[10px] font-mono text-neon-red/80 mt-1">{uploadError}</p>
              )}
            </div>
          </div>

          {/* XP bar */}
          {(() => {
            const xp = profile.xp ?? 0;
            const level = profile.level ?? 1;
            const levelMin = xpForLevel(level);
            const levelMax = xpForNextLevel(level);
            const pct = levelMax > levelMin ? Math.min(1, (xp - levelMin) / (levelMax - levelMin)) * 100 : 100;
            return (
              <div className="mb-4 p-3 rounded-xl border border-neon-purple/15 bg-neon-purple/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-display font-bold tracking-widest uppercase text-neon-purple/60">
                    Level {level}
                  </span>
                  <span className="text-[10px] font-mono text-white/30">{xp} XP</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #9b00ff, #c084fc)' }}
                  />
                </div>
                {level < 10 && (
                  <p className="text-[9px] font-mono text-white/20 mt-1 text-right">
                    {levelMax - xp} XP to Level {level + 1}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
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
        </motion.div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl bg-white/4 border border-white/6">
          {(['achievements', 'history', 'friends'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all ${
                tab === t ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'text-white/30 hover:text-white/50'
              }`}
            >
              {t === 'achievements' ? `🏅 (${achievements.length})` : t === 'history' ? `📋 History` : `👥 Friends`}
            </button>
          ))}
        </div>

        {/* Achievements tab */}
        {tab === 'achievements' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loadingAch ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" /></div>
            ) : achievements.length === 0 ? (
              <div className="text-center py-10 text-white/20 font-mono text-sm">
                <p className="text-3xl mb-2">🏅</p>
                <p>Play games to earn achievements</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {achievements.map(a => (
                  <div
                    key={a.key}
                    className="rounded-2xl p-3 flex items-center gap-3"
                    style={{
                      background: `linear-gradient(135deg, rgba(8,4,20,0.9), rgba(8,4,20,0.7))`,
                      border: `1px solid ${RARITY_BORDER[a.rarity] ?? RARITY_BORDER.common}`,
                      boxShadow: `0 0 20px ${RARITY_GLOW[a.rarity] ?? RARITY_GLOW.common}`,
                    }}
                  >
                    <span className="text-2xl flex-shrink-0">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-white text-sm leading-tight truncate">{a.name}</p>
                      <p className="font-mono text-[9px] text-white/35 leading-tight truncate mt-0.5">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* History tab */}
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
                  <div
                    key={g.id}
                    className="rounded-2xl px-4 py-3 flex items-center gap-3 border"
                    style={{
                      background: g.won ? 'rgba(0,255,136,0.04)' : 'rgba(255,30,60,0.04)',
                      borderColor: g.won ? 'rgba(0,255,136,0.15)' : 'rgba(255,30,60,0.15)',
                    }}
                  >
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

        {/* Friends tab */}
        {tab === 'friends' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FriendsPanel />
          </motion.div>
        )}

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <button
            onClick={() => setShowRoleGuide(true)}
            className="w-full py-3 border border-neon-cyan/20 text-neon-cyan/70 font-display font-bold tracking-widest rounded-xl hover:bg-neon-cyan/8 transition-all text-sm flex items-center justify-center gap-2"
          >
            📖 Role Guide
          </button>
          <button
            onClick={logout}
            className="w-full py-3 border border-neon-red/30 text-neon-red font-display font-bold tracking-widest rounded-xl hover:bg-neon-red/10 transition-all text-sm"
          >
            Change Name / Logout
          </button>
        </div>
      </div>

      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />
    </div>
  );
}

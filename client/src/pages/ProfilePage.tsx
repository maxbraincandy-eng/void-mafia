import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { emitWithAck } from '@/lib/socket';
import { AchievementEarned, GameHistoryEntry } from '@/types/index';
import type { Res } from '@/types/index';

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

function TeamBadge({ team }: { team: string | null }) {
  const colors: Record<string, string> = {
    mafia: 'text-neon-red/80', town: 'text-neon-green/80',
    neutral: 'text-yellow-400/80', cult: 'text-neon-purple/80',
  };
  return <span className={`font-mono text-[9px] uppercase tracking-wider ${colors[team ?? ''] ?? 'text-white/30'}`}>{team ?? '—'}</span>;
}

export function ProfilePage() {
  const { profile, username, logout, localAvatar, setLocalAvatar } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [achievements, setAchievements] = useState<AchievementEarned[]>([]);
  const [history, setHistory]           = useState<GameHistoryEntry[]>([]);
  const [tab, setTab] = useState<'achievements' | 'history'>('achievements');
  const [loadingAch, setLoadingAch] = useState(false);

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

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) setLocalAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
          <div className="flex items-center gap-4 mb-6">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button type="button" onClick={handleAvatarClick} className="relative w-16 h-16 rounded-full group flex-shrink-0" title="Click to upload profile picture">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-2xl font-bold text-white shadow-neon-purple overflow-hidden">
                {localAvatar ? <img src={localAvatar} alt={profile.username} className="w-full h-full object-cover rounded-full" /> : profile.avatar}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xl">📷</span>
              </div>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`font-display font-bold text-xl ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>{profile.username}</h2>
                {profile.isModerator && profile.moderatorBadgeVisible && <ModBadge level={profile.moderatorLevel} />}
              </div>
              <p className="text-white/30 font-mono text-xs mt-0.5">ID: {profile.id.slice(0, 12)}…</p>
              <p className="text-white/20 font-mono text-xs">Joined {new Date(profile.joinedAt).toLocaleDateString()}</p>
            </div>
          </div>

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
          {(['achievements', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all ${
                tab === t ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'text-white/30 hover:text-white/50'
              }`}
            >
              {t === 'achievements' ? `🏅 Achievements (${achievements.length})` : `📋 History`}
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

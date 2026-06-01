import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';

export function ProfilePage() {
  const { profile, username, logout, localAvatar, setLocalAvatar } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRoleGuide, setShowRoleGuide] = useState(false);

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
    // reset so the same file can be re-selected if needed
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
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {/* Clickable avatar circle */}
            <button
              type="button"
              onClick={handleAvatarClick}
              className="relative w-16 h-16 rounded-full group flex-shrink-0"
              title="Click to upload profile picture"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-2xl font-bold text-white shadow-neon-purple overflow-hidden">
                {localAvatar
                  ? <img src={localAvatar} alt={profile.username} className="w-full h-full object-cover rounded-full" />
                  : profile.avatar
                }
              </div>
              {/* Camera icon overlay */}
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xl">📷</span>
              </div>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`font-display font-bold text-xl ${profile.isModerator ? 'text-neon-green' : 'text-white'}`}>
                  {profile.username}
                </h2>
                {profile.isModerator && profile.moderatorBadgeVisible && (
                  <ModBadge level={profile.moderatorLevel} />
                )}
              </div>
              <p className="text-white/30 font-mono text-xs mt-0.5">
                ID: {profile.id.slice(0, 12)}…
              </p>
              <p className="text-white/20 font-mono text-xs">
                Joined {new Date(profile.joinedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Stats grid */}
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

          {/* Win/Loss bar */}
          {stats.gamesPlayed > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-white/30">
                <span>{stats.wins} wins</span>
                <span>{stats.losses} losses</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-l-full transition-all"
                  style={{ width: `${stats.winRate}%` }}
                />
                <div
                  className="h-full bg-neon-red/40 rounded-r-full flex-1"
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* Role Guide */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.25 } }} className="mb-3">
          <button
            onClick={() => setShowRoleGuide(true)}
            className="w-full py-3 border border-neon-cyan/20 text-neon-cyan/70 font-display font-bold tracking-widest rounded-xl hover:bg-neon-cyan/8 transition-all text-sm flex items-center justify-center gap-2"
          >
            📖 Role Guide
          </button>
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }}>
          <button
            onClick={logout}
            className="w-full py-3 border border-neon-red/30 text-neon-red font-display font-bold tracking-widest rounded-xl hover:bg-neon-red/10 transition-all text-sm"
          >
            Change Name / Logout
          </button>
        </motion.div>
      </div>

      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />
    </div>
  );
}

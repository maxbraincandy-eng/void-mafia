import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { ModBadge } from '@/components/ui/ModBadge';

export function ProfilePage() {
  const { profile, username, logout, localAvatar, setLocalAvatar } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <p className="text-neon-green/50 font-mono text-xs tracking-widest">powered by ბატონი მაქსი</p>
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Games', value: stats.gamesPlayed, color: 'text-neon-cyan' },
              { label: 'Wins', value: stats.wins, color: 'text-neon-green' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-neon-pink' },
            ].map(s => (
              <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-3 text-center">
                <p className={`font-display font-bold text-2xl ${s.color}`}>{s.value}</p>
                <p className="text-white/30 text-xs font-mono mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }}>
          <button
            onClick={logout}
            className="w-full py-3 border border-neon-red/30 text-neon-red font-display font-bold tracking-widest rounded-xl hover:bg-neon-red/10 transition-all text-sm"
          >
            Change Name / Logout
          </button>
        </motion.div>
      </div>
    </div>
  );
}

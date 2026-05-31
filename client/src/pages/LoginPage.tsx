import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';

type Tab = 'guest' | 'signin' | 'register';

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('guest');

  // Guest fields
  const [name, setName] = useState('');

  // Email fields (shared for signin + register)
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName]   = useState('');
  const [showPass, setShowPass] = useState(false);

  const { login, loginEmail, register, isLoading, error } = useAuthStore();
  const t = useT();

  const handleGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;
    await login(trimmed);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginEmail(email.trim(), password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await register(email.trim(), password, regName.trim());
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'guest',    label: '👤 Guest'    },
    { id: 'signin',   label: '🔑 Sign In'  },
    { id: 'register', label: '✉️ Register' },
  ];

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-purple/15 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <div className="text-5xl mb-4 animate-float inline-block"
            style={{ filter: 'drop-shadow(0 0 30px #00f5ff) drop-shadow(0 0 60px #ff00cc60)' }}>
            ◆
          </div>
          <h1 className="font-display text-6xl font-black gradient-text tracking-wider animate-glitch" data-text="VOID">
            VOID
          </h1>
          <h1 className="font-display text-6xl font-black gradient-text tracking-wider">
            MAFIA
          </h1>
          <p className="text-white/30 font-mono text-xs tracking-widest mt-3">{t.login.subtitle}</p>
          <p className="text-neon-green/60 font-mono text-xs tracking-widest mt-1">{t.common.poweredBy}</p>
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex gap-1 mb-3 glass-panel border border-white/8 rounded-xl p-1"
        >
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold tracking-wider transition-all ${
                tab === t.id
                  ? 'bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel border border-neon-cyan/20 rounded-2xl p-6 shadow-glass"
        >
          <AnimatePresence mode="wait">

            {/* ── Guest ── */}
            {tab === 'guest' && (
              <motion.form
                key="guest"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleGuest}
              >
                <p className="text-white/40 text-xs font-mono mb-4 text-center">
                  No account needed — just pick a name and play.
                </p>
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">
                  {t.login.nameLabel}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t.login.namePlaceholder}
                  maxLength={24}
                  minLength={2}
                  autoFocus
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/50 transition-all mb-4"
                />
                {error && <p className="text-neon-red text-xs font-mono mb-3 text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={name.trim().length < 2 || isLoading}
                  className="w-full bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan text-white font-display font-bold tracking-widest py-3 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-neon-cyan active:scale-95"
                >
                  {isLoading ? t.login.connecting : t.login.enterBtn}
                </button>
              </motion.form>
            )}

            {/* ── Sign In ── */}
            {tab === 'signin' && (
              <motion.form
                key="signin"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleSignIn}
              >
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoFocus
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/50 transition-all mb-3"
                />
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Password</label>
                <div className="relative mb-4">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/50 transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs">
                    {showPass ? '🙈' : '👁'}
                  </button>
                </div>
                {error && <p className="text-neon-red text-xs font-mono mb-3 text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={!email || !password || isLoading}
                  className="w-full bg-gradient-to-r from-neon-cyan to-neon-purple text-white font-display font-bold tracking-widest py-3 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-neon-cyan active:scale-95"
                >
                  {isLoading ? t.login.connecting : 'Sign In'}
                </button>
                <p className="text-white/25 text-xs font-mono text-center mt-3">
                  No account?{' '}
                  <button type="button" onClick={() => setTab('register')} className="text-neon-cyan hover:underline">
                    Register
                  </button>
                </p>
              </motion.form>
            )}

            {/* ── Register ── */}
            {tab === 'register' && (
              <motion.form
                key="register"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleRegister}
              >
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Username</label>
                <input
                  type="text"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={24}
                  autoFocus
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-purple/50 transition-all mb-3"
                />
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-purple/50 transition-all mb-3"
                />
                <label className="block text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Password</label>
                <div className="relative mb-4">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-purple/50 transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs">
                    {showPass ? '🙈' : '👁'}
                  </button>
                </div>
                {error && <p className="text-neon-red text-xs font-mono mb-3 text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={regName.trim().length < 2 || !email || password.length < 6 || isLoading}
                  className="w-full bg-gradient-to-r from-neon-purple to-neon-pink text-white font-display font-bold tracking-widest py-3 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-neon-purple active:scale-95"
                >
                  {isLoading ? t.login.connecting : 'Create Account'}
                </button>
                <p className="text-white/25 text-xs font-mono text-center mt-3">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setTab('signin')} className="text-neon-cyan hover:underline">
                    Sign In
                  </button>
                </p>
              </motion.form>
            )}

          </AnimatePresence>
        </motion.div>

        <p className="text-white/15 text-xs font-mono text-center mt-6">{t.login.noAccount}</p>
      </div>
    </div>
  );
}

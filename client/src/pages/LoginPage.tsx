import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { PoweredBy } from '@/components/ui/PoweredBy';

type Tab = 'signin' | 'register';

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('signin');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError]     = useState('');

  const { loginEmail, register, loginOAuth, isLoading, error } = useAuthStore();
  const t = useT();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      setOauthLoading(true);
      loginOAuth().catch(e => setOauthError(e.message ?? 'OAuth login failed.')).finally(() => setOauthLoading(false));
    }
    if (params.get('oauth_error')) {
      window.history.replaceState({}, '', window.location.pathname);
      const msg = params.get('oauth_error');
      setOauthError(msg === '1' ? 'OAuth login failed. Please try again.' : decodeURIComponent(msg ?? ''));
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginEmail(email.trim(), password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await register(email.trim(), password, regName.trim());
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'signin',   label: '🔑 Sign In'  },
    { id: 'register', label: '✉️ Register' },
  ];

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-purple/15 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
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
          <PoweredBy className="block mt-1.5" />
        </motion.div>

        {/* ── Google — primary CTA ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4"
        >
          {oauthError && (
            <p className="text-neon-red text-xs font-mono text-center mb-3">{oauthError}</p>
          )}

          <button
            onClick={() => { window.location.href = '/api/auth/google'; }}
            disabled={oauthLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.18)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            {oauthLoading ? (
              <span className="text-white/50 text-sm font-mono tracking-wide">Signing in…</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-white/80 text-sm font-mono font-bold tracking-wide">Continue with Google</span>
              </>
            )}
          </button>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 mb-4"
        >
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-white/20 text-[10px] font-mono tracking-widest uppercase">or with email</span>
          <div className="flex-1 h-px bg-white/8" />
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
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
          transition={{ delay: 0.25 }}
          className="glass-panel border border-neon-cyan/20 rounded-2xl p-6 shadow-glass"
        >
          <AnimatePresence mode="wait">

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

        <p className="text-white/15 text-xs font-mono text-center mt-4">{t.login.noAccount}</p>

        {/* ── App download strip ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-5 flex items-center gap-2"
        >
          <a
            href="/downloads/void-mafia.apk"
            download="void-mafia.apk"
            className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.04] transition-all group"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#3ddc84] fill-current opacity-80 group-hover:opacity-100 transition-opacity" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.523 15.341a1 1 0 1 1 0-2 1 1 0 0 1 0 2m-11.046 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2m11.4-6.021-.022.038-1.892-3.272a.5.5 0 0 0-.862.5l1.908 3.3A10.9 10.9 0 0 0 12 9c-1.684 0-3.273.384-4.7 1.065l1.909-3.302a.5.5 0 0 0-.862-.498L6.444 9.539A10.96 10.96 0 0 0 2 18.5h20a10.96 10.96 0 0 0-4.123-9.18" />
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] font-mono text-white/70 group-hover:text-white/90 transition-colors leading-tight">Download for Android</p>
              <p className="text-[9px] font-mono text-white/28 leading-tight">APK · voidmafia.one</p>
            </div>
            <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0 text-white/20 group-hover:text-white/45 fill-current transition-colors ml-auto" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 12L2 6h12z"/>
            </svg>
          </a>

          <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/[0.05] opacity-40 cursor-not-allowed select-none">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-white/50 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] font-mono text-white/45 leading-tight">iOS coming soon</p>
              <p className="text-[9px] font-mono text-white/20 leading-tight">TestFlight planned</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

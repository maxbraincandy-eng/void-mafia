/**
 * M.A.R.S. — standalone site entry.
 *
 * A second Vite entry rather than a second project. It shares the components,
 * the socket client and the server with the main app, so a record created here
 * is the same record seen there — one archive, two front doors. What it does
 * NOT share is the shell: no games navigation, no mafia branding, its own
 * landing page and its own sign-in.
 *
 * Served at /mars, and at the root of any host beginning with "mars." — so
 * pointing a subdomain at the same deployment makes this the whole site with no
 * further work.
 */
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { socket, connectSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { MarsLanding } from '@/components/mars/MarsLanding';
import { MarsTerminal } from '@/components/mars/MarsTerminal';
import { MarsRecordView } from '@/components/mars/MarsRecordView';
import '@/styles/globals.css';

type Screen = 'landing' | 'auth' | 'console';

function MarsApp() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  const isAuthed = useAuthStore(s => s.isAuthed);
  const isLoading = useAuthStore(s => s.isLoading);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    connectSocket();
    if (socket.connected) setConnected(true);
    return () => { socket.off('connect', on); socket.off('disconnect', off); };
  }, []);

  // A deep link to a record works before sign-in — a memorial shared with the
  // family must open for people who will never make an account.
  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/^#\/?r\/([\w-]+)/i);
      setOpenCode(m ? m[1].toUpperCase() : null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const openRecord = useCallback((code: string) => {
    window.location.hash = `/r/${code}`;
    setOpenCode(code);
  }, []);
  const closeRecord = useCallback(() => {
    if (window.location.hash) window.location.hash = '';
    setOpenCode(null);
  }, []);

  const enter = useCallback(() => {
    setScreen(isAuthed ? 'console' : 'auth');
  }, [isAuthed]);

  // Signing in from the auth screen lands you where you were going.
  useEffect(() => {
    if (isAuthed && screen === 'auth') setScreen('console');
  }, [isAuthed, screen]);

  if (!connected || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: '#01060a' }}>
        <p className="font-mono text-[12px]" style={{ color: 'rgba(57,255,106,0.5)' }}>კავშირი…</p>
      </div>
    );
  }

  return (
    <>
      <ThemeProvider />

      {screen === 'landing' && (
        <MarsLanding onEnter={enter} onOpenRecord={openRecord} authed={isAuthed} />
      )}
      {screen === 'auth' && <MarsAuth onDone={() => setScreen('console')} onBack={() => setScreen('landing')} />}
      {screen === 'console' && <MarsTerminal onClose={() => setScreen('landing')} />}

      {/* A shared record opens over whatever is behind it. */}
      <AnimatePresence>
        {openCode && (
          <div className="fixed inset-0" style={{ zIndex: 2147483000 }}>
            <MarsRecordView code={openCode} onClose={closeRecord} />
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Sign-in for this site alone: email only, no game vocabulary. */
function MarsAuth({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuthStore(s => s.register);
  const loginEmail = useAuthStore(s => s.loginEmail);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === 'register') await register(email.trim(), password, username.trim());
      else await loginEmail(email.trim(), password);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'ვერ შესრულდა');
    } finally { setBusy(false); }
  };

  const ready = mode === 'register'
    ? email.includes('@') && password.length >= 6 && username.trim().length >= 2
    : email.includes('@') && password.length >= 6;

  const field = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(57,255,106,0.25)',
    color: '#d9ffe4',
  } as const;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-5" style={{ background: '#01060a' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-2xl p-5" style={{
          maxWidth: 400,
          border: '1px solid rgba(57,255,106,0.3)',
          background: 'linear-gradient(165deg, #04140c, #010806)',
        }}>
        <p className="font-mono text-[13px] font-bold tracking-[0.3em]" style={{ color: '#39ff6a' }}>M.A.R.S.</p>
        <p className="font-mono text-[12px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {mode === 'register'
            ? 'ანგარიში სჭირდება მხოლოდ იმისთვის, რომ ჩანაწერი შენი დარჩეს და მოგვიანებით შეცვალო.'
            : 'შედი შენს ანგარიშში.'}
        </p>

        <div className="space-y-2 mt-4">
          {mode === 'register' && (
            <input value={username} onChange={e => setUsername(e.target.value.slice(0, 24))}
              placeholder="სახელი" autoComplete="nickname"
              className="w-full rounded-lg px-3 py-2.5 font-mono text-[13px] outline-none" style={field} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email"
            placeholder="ელფოსტა"
            className="w-full rounded-lg px-3 py-2.5 font-mono text-[13px] outline-none" style={field} />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="პაროლი (მინ. 6 სიმბოლო)"
            onKeyDown={e => { if (e.key === 'Enter' && ready) void submit(); }}
            className="w-full rounded-lg px-3 py-2.5 font-mono text-[13px] outline-none" style={field} />
        </div>

        {error && <p className="font-mono text-[11px] mt-2" style={{ color: '#ff5f6d' }}>{error}</p>}

        <button onClick={() => void submit()} disabled={busy || !ready}
          className="w-full mt-4 py-3 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ border: '1px solid rgba(57,255,106,0.5)', background: 'rgba(57,255,106,0.16)', color: '#39ff6a' }}>
          {busy ? '…' : mode === 'register' ? 'ანგარიშის შექმნა' : 'შესვლა'}
        </button>

        <div className="flex justify-between mt-3">
          <button onClick={onBack} className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            ← უკან
          </button>
          <button onClick={() => { setMode(m => (m === 'register' ? 'login' : 'register')); setError(null); }}
            className="font-mono text-[11px]" style={{ color: 'rgba(125,249,255,0.75)' }}>
            {mode === 'register' ? 'უკვე მაქვს ანგარიში' : 'ანგარიშის შექმნა'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<MarsApp />);

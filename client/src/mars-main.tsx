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
import { socket, connectSocket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { MarsLanding } from '@/components/mars/MarsLanding';
import { MarsTerminal } from '@/components/mars/MarsTerminal';
import { MarsRecordView } from '@/components/mars/MarsRecordView';
import { MarsLegal } from '@/components/mars/MarsLegal';
import type { Res } from '@/types/index';
import '@/styles/globals.css';

type Screen = 'landing' | 'auth' | 'console';

/**
 * Where "close this record" goes back to. The site answers at /mars on the main
 * domain and at the root of a mars.* host, so the base is whichever one this
 * page was actually loaded from.
 */
const BASE = /^\/mars(\/|$)/i.test(window.location.pathname) ? '/mars' : '/';

/**
 * A record's address, read from the real path first.
 *
 * The hash form still works because links shared before this existed use it,
 * but /mars/r/CODE is canonical: it is the only form the server can recognise
 * server-side, and a crawler building a link preview never sees a fragment.
 */
function readCode(): string | null {
  const p = /^\/(?:mars\/)?r\/([\w-]+)/i.exec(window.location.pathname);
  if (p) return p[1].toUpperCase();
  const h = /^#\/?r\/([\w-]+)/i.exec(window.location.hash);
  return h ? h[1].toUpperCase() : null;
}

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
    const read = () => setOpenCode(readCode());
    read();
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => {
      window.removeEventListener('hashchange', read);
      window.removeEventListener('popstate', read);
    };
  }, []);

  // pushState, so the back button closes the record instead of leaving the site.
  const openRecord = useCallback((code: string) => {
    window.history.pushState({}, '', `/mars/r/${encodeURIComponent(code)}`);
    setOpenCode(code);
  }, []);
  const closeRecord = useCallback(() => {
    if (readCode()) window.history.pushState({}, '', BASE);
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
  const [mode, setMode] = useState<'register' | 'login' | 'recover'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legal, setLegal] = useState<null | 'terms' | 'privacy'>(null);

  const register = useAuthStore(s => s.register);
  const loginEmail = useAuthStore(s => s.loginEmail);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === 'recover') {
        // Reset with a code the account holder saved earlier. There is no mail
        // sender in this deployment, so a "reset link" button would be a lie;
        // see recoveryService for the whole reasoning.
        const res = await emitWithAck<{ email: string; code: string; password: string }, Res<{ reset: boolean }>>(
          'recovery:reset', { email: email.trim(), code: recoveryCode.trim(), password });
        if (!('ok' in res) || !res.ok) throw new Error(('error' in res && res.error) || 'ვერ შესრულდა');
        // Straight in — the new password is right here, so making them retype
        // it on a login form serves nobody.
        await loginEmail(email.trim(), password);
        onDone();
        return;
      }
      if (mode === 'register') await register(email.trim(), password, username.trim());
      else await loginEmail(email.trim(), password);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'ვერ შესრულდა');
    } finally { setBusy(false); }
  };

  const ready = mode === 'register'
    ? email.includes('@') && password.length >= 6 && username.trim().length >= 2
    : mode === 'recover'
      ? email.includes('@') && password.length >= 6 && recoveryCode.replace(/[^A-Za-z0-9]/g, '').length >= 8
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
            : mode === 'recover'
              ? 'შეიყვანე აღდგენის კოდი, რომელიც ანგარიშის შექმნის შემდეგ შეინახე, და დააყენე ახალი პაროლი.'
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
          {mode === 'recover' && (
            <input value={recoveryCode} onChange={e => setRecoveryCode(e.target.value.toUpperCase().slice(0, 20))}
              placeholder="აღდგენის კოდი (მაგ. M4KZ-7QPT-R9WD)" autoComplete="one-time-code"
              spellCheck={false} autoCapitalize="characters"
              className="w-full rounded-lg px-3 py-2.5 font-mono text-[13px] tracking-[0.12em] outline-none" style={field} />
          )}
          <input value={password} onChange={e => setPassword(e.target.value)} type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'recover' ? 'ახალი პაროლი (მინ. 6 სიმბოლო)' : 'პაროლი (მინ. 6 სიმბოლო)'}
            onKeyDown={e => { if (e.key === 'Enter' && ready) void submit(); }}
            className="w-full rounded-lg px-3 py-2.5 font-mono text-[13px] outline-none" style={field} />
        </div>

        {error && <p className="font-mono text-[11px] mt-2" style={{ color: '#ff5f6d' }}>{error}</p>}

        <button onClick={() => void submit()} disabled={busy || !ready}
          className="w-full mt-4 py-3 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ border: '1px solid rgba(57,255,106,0.5)', background: 'rgba(57,255,106,0.16)', color: '#39ff6a' }}>
          {busy ? '…' : mode === 'register' ? 'ანგარიშის შექმნა' : mode === 'recover' ? 'პაროლის შეცვლა' : 'შესვლა'}
        </button>

        {mode === 'login' && (
          <button onClick={() => { setMode('recover'); setError(null); setPassword(''); }}
            className="w-full mt-2 font-mono text-[11px]" style={{ color: 'rgba(255,212,90,0.75)' }}>
            პაროლი დამავიწყდა
          </button>
        )}
        {mode === 'recover' && (
          <p className="font-mono text-[10px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
            კოდი არ გაქვს? ელფოსტით აღდგენა ჯერ არ არის — დაგვიკავშირდი და ხელით მოვაგვარებთ.
            კოდის აღება ნებისმიერ დროს შეგიძლია არქივში, ბარათის გვერდზე.
          </p>
        )}

        <div className="flex justify-between mt-3">
          <button onClick={() => (mode === 'recover' ? (setMode('login'), setError(null)) : onBack())}
            className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            ← უკან
          </button>
          <button onClick={() => { setMode(m => (m === 'register' ? 'login' : 'register')); setError(null); }}
            className="font-mono text-[11px]" style={{ color: 'rgba(125,249,255,0.75)' }}>
            {mode === 'register' ? 'უკვე მაქვს ანგარიში' : 'ანგარიშის შექმნა'}
          </button>
        </div>

        {/* The consent has to be where the account is created, not only in a
            footer on a page they may never have opened. */}
        <p className="font-mono text-[10px] mt-4 pt-3 leading-relaxed"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>
          გაგრძელებით ეთანხმები{' '}
          <button onClick={() => setLegal('terms')} style={{ color: 'rgba(125,249,255,0.8)' }}>წესებს</button>
          {' '}და{' '}
          <button onClick={() => setLegal('privacy')} style={{ color: 'rgba(125,249,255,0.8)' }}>კონფიდენციალურობის პოლიტიკას</button>.
        </p>

        <AnimatePresence>
          {legal && <MarsLegal initial={legal} onClose={() => setLegal(null)} />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<MarsApp />);

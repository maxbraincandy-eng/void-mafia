import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const NeoBandicoot = lazy(() => import('@/components/platformer/NeoBandicoot').then(m => ({ default: m.NeoBandicoot })));
const AristocracyTest = lazy(() => import('@/components/quiz/AristocracyTest').then(m => ({ default: m.AristocracyTest })));
const DilemmasHub = lazy(() => import('@/components/dilemmas/DilemmasHub').then(m => ({ default: m.DilemmasHub })));
const VoidIQHub = lazy(() => import('@/components/iq/VoidIQHub').then(m => ({ default: m.VoidIQHub })));
import { IQLogo } from '@/components/iq/IQLogo';
import { DILEMMAS } from '@/components/dilemmas/registry';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCheckersStore } from '@/store/checkersStore';
import { useJokerStore } from '@/store/jokerStore';
import { useLudoStore } from '@/store/ludoStore';
import { useWWWStore } from '@/store/wwwStore';
import { useUnoStore } from '@/store/unoStore';
import { useBlackoutStore } from '@/store/blackoutStore';
import { useAliasStore } from '@/store/aliasStore';
import type { AliasListItem } from '@/types/alias';
import { useSpyfallStore } from '@/store/spyfallStore';
import type { SpyfallListItem } from '@/types/spyfall';
import { useDrawStore } from '@/store/drawStore';
import type { DrawListItem } from '@/types/draw';
import { useCodenamesStore } from '@/store/codenamesStore';
import type { CnListItem } from '@/types/codenames';
import { useSocialStore } from '@/store/socialStore';
import type { BlackoutListItem } from '@/types/blackout';
import type { CheckersMatchListItem } from '@/types/checkers';
import type { JokerMatchListItem } from '@/types/joker';
import type { LudoMatchListItem } from '@/types/ludo';
import type { WWWListItem } from '@/types/www';
import type { UnoListItem } from '@/types/uno';

export function GamesTab({ onOpenSpace, onOpenBackrooms, onOpenPremium }: { onOpenSpace?: () => void; onOpenBackrooms?: () => void; onOpenPremium?: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';
  const [bandicootOpen, setBandicootOpen] = useState(false);
  const [aristocracyOpen, setAristocracyOpen] = useState(false);
  const [dilemmasHubOpen, setDilemmasHubOpen] = useState(false);
  const [voidIqOpen, setVoidIqOpen] = useState(false);

  // ── Checkers ────────────────────────────────────────────────────────
  const {
    match: ckMatch, matchList: ckList, isLoading: ckLoading, error: ckError,
    fetchList: ckFetch, createMatch: ckCreate, joinMatch: ckJoin, clearError: ckClear,
  } = useCheckersStore();

  const [ckShowJoin, setCkShowJoin] = useState(false);
  const [ckJoinCode, setCkJoinCode] = useState('');

  // ── Joker ───────────────────────────────────────────────────────────
  const {
    match: jkMatch, matchList: jkList, isLoading: jkLoading, error: jkError,
    fetchList: jkFetch, createMatch: jkCreate, joinMatch: jkJoin, clearError: jkClear,
  } = useJokerStore();

  const [jkShowJoin, setJkShowJoin] = useState(false);
  const [jkJoinCode, setJkJoinCode] = useState('');
  const [jkMode, setJkMode] = useState<'classic' | 'nines_only'>('classic');

  // ── Ludo ────────────────────────────────────────────────────────────
  const {
    match: ldMatch, matchList: ldList, isLoading: ldLoading, error: ldError,
    fetchList: ldFetch, createMatch: ldCreate, joinMatch: ldJoin, clearError: ldClear,
  } = useLudoStore();

  const [ldShowJoin, setLdShowJoin] = useState(false);
  const [ldJoinCode, setLdJoinCode] = useState('');
  const [ldMaxPlayers, setLdMaxPlayers] = useState<2 | 3 | 4>(2);

  // ── What? Where? When? ───────────────────────────────────────────────
  const {
    match: wwMatch, matchList: wwList, isLoading: wwLoading, error: wwError,
    fetchList: wwFetch, createMatch: wwCreate, joinMatch: wwJoin, clearError: wwClear,
  } = useWWWStore();
  const [wwShowJoin, setWwShowJoin] = useState(false);
  const [wwJoinCode, setWwJoinCode] = useState('');

  // ── UNO ─────────────────────────────────────────────────────────────
  const {
    match: unoMatch, matchList: unoList, isLoading: unoLoading, error: unoError,
    fetchList: unoFetch, createMatch: unoCreate, joinMatch: unoJoin,
    spectateMatch: unoSpectate, clearError: unoClear,
  } = useUnoStore();
  const [unoShowJoin, setUnoShowJoin] = useState(false);
  const [unoJoinCode, setUnoJoinCode] = useState('');
  const [unoMaxPlayers, setUnoMaxPlayers] = useState(4);

  // ── Blackout ────────────────────────────────────────────────────────
  const {
    matchList: boList, isLoading: boLoading, error: boError,
    fetchList: boFetch, createMatch: boCreate, joinMatch: boJoin, clearError: boClear,
  } = useBlackoutStore();
  const [boShowJoin, setBoShowJoin] = useState(false);
  const [boJoinCode, setBoJoinCode] = useState('');

  // ── Alias ───────────────────────────────────────────────────────────
  const {
    matchList: alList, isLoading: alLoading, error: alError,
    fetchList: alFetch, createMatch: alCreate, joinMatch: alJoin, clearError: alClear,
  } = useAliasStore();
  const [alShowJoin, setAlShowJoin] = useState(false);
  const [alJoinCode, setAlJoinCode] = useState('');

  // ── ჯაშუში (Spyfall) ────────────────────────────────────────────────
  const {
    matchList: spList, isLoading: spLoading, error: spError,
    fetchList: spFetch, createMatch: spCreate, joinMatch: spJoin, clearError: spClear,
  } = useSpyfallStore();
  const [spShowJoin, setSpShowJoin] = useState(false);
  const [spJoinCode, setSpJoinCode] = useState('');

  // ── Draw & Guess ────────────────────────────────────────────────────
  const {
    matchList: drList, isLoading: drLoading, error: drError,
    fetchList: drFetch, createMatch: drCreate, joinMatch: drJoin, clearError: drClear,
  } = useDrawStore();
  const [drShowJoin, setDrShowJoin] = useState(false);
  const [drJoinCode, setDrJoinCode] = useState('');

  // ── Codenames ───────────────────────────────────────────────────────
  const {
    matchList: cnList, isLoading: cnLoading, error: cnError,
    fetchList: cnFetch, createMatch: cnCreate, joinMatch: cnJoin, clearError: cnClear,
  } = useCodenamesStore();
  const [cnShowJoin, setCnShowJoin] = useState(false);
  const [cnJoinCode, setCnJoinCode] = useState('');

  // ── "Other games" collapsible group (Joker + UNO) ───────────────────
  const [showOther, setShowOther] = useState(false);

  const handleRefresh = useCallback(() => {
    ckClear(); jkClear(); ldClear(); wwClear(); unoClear(); boClear(); alClear(); drClear(); cnClear(); spClear();
    ckFetch();
    jkFetch();
    ldFetch();
    wwFetch();
    unoFetch();
    boFetch();
    alFetch();
    drFetch();
    cnFetch();
    spFetch();
  }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, ckClear, jkClear, ldClear, wwClear, unoClear, boClear, alClear, drClear, cnClear, spClear]);

  useEffect(() => { ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch]);

  // Refresh on visibility change
  useEffect(() => {
    const handler = () => { if (!document.hidden) handleRefresh(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [handleRefresh]);

  // Auto-retry after auth restores (post-reconnect, after player:auth succeeds)
  useEffect(() => {
    const hasError = ckError || jkError || ldError || wwError || unoError;
    if (!hasError) return;
    const onAuthReady = () => handleRefresh();
    window.addEventListener('vm:auth-ready', onAuthReady);
    return () => window.removeEventListener('vm:auth-ready', onAuthReady);
  }, [ckError, jkError, ldError, wwError, unoError, handleRefresh]);

  async function handleCkCreate() {
    await ckCreate(playerName);
  }

  async function handleCkJoin() {
    if (!ckJoinCode.trim()) return;
    setCkShowJoin(false);
    await ckJoin(ckJoinCode.trim().toUpperCase(), playerName);
    setCkJoinCode('');
  }

  async function handleJkCreate() {
    await jkCreate(playerName, { mode: jkMode });
  }

  async function handleJkJoin() {
    if (!jkJoinCode.trim()) return;
    setJkShowJoin(false);
    await jkJoin(jkJoinCode.trim().toUpperCase(), playerName);
    setJkJoinCode('');
  }

  async function handleLdCreate() {
    await ldCreate(playerName, ldMaxPlayers);
  }

  async function handleLdJoin() {
    if (!ldJoinCode.trim()) return;
    setLdShowJoin(false);
    await ldJoin(ldJoinCode.trim().toUpperCase(), playerName);
    setLdJoinCode('');
  }

  async function handleWwCreate() {
    await wwCreate(playerName);
  }

  async function handleWwJoin() {
    if (!wwJoinCode.trim()) return;
    setWwShowJoin(false);
    await wwJoin(wwJoinCode.trim().toUpperCase(), playerName);
    setWwJoinCode('');
  }

  async function handleUnoCreate() {
    await unoCreate(playerName, unoMaxPlayers);
  }

  async function handleUnoJoin() {
    if (!unoJoinCode.trim()) return;
    setUnoShowJoin(false);
    await unoJoin(unoJoinCode.trim().toUpperCase(), playerName);
    setUnoJoinCode('');
  }

  async function handleBoCreate() {
    await boCreate(playerName, 8);
  }

  async function handleBoJoin() {
    if (!boJoinCode.trim()) return;
    setBoShowJoin(false);
    await boJoin(boJoinCode.trim().toUpperCase(), playerName);
    setBoJoinCode('');
  }

  async function handleAlCreate() { await alCreate(playerName); }
  async function handleAlJoin() {
    if (!alJoinCode.trim()) return;
    setAlShowJoin(false);
    await alJoin(alJoinCode.trim().toUpperCase(), playerName);
    setAlJoinCode('');
  }

  async function handleSpCreate() { await spCreate(playerName); }
  async function handleSpJoin() {
    if (!spJoinCode.trim()) return;
    setSpShowJoin(false);
    await spJoin(spJoinCode.trim().toUpperCase(), playerName);
    setSpJoinCode('');
  }

  async function handleDrCreate() { await drCreate(playerName); }
  async function handleDrJoin() {
    if (!drJoinCode.trim()) return;
    setDrShowJoin(false);
    await drJoin(drJoinCode.trim().toUpperCase(), playerName);
    setDrJoinCode('');
  }

  async function handleCnCreate() { await cnCreate(playerName); }
  async function handleCnJoin() {
    if (!cnJoinCode.trim()) return;
    setCnShowJoin(false);
    await cnJoin(cnJoinCode.trim().toUpperCase(), playerName);
    setCnJoinCode('');
  }

  return (
    <div className="space-y-4">

      {/* ── VOID IQ (flagship cognitive lab — top-level) ─────────────────── */}
      <button onClick={() => setVoidIqOpen(true)}
        className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
        style={{ border: '1px solid rgba(79,184,255,0.45)', boxShadow: '0 6px 34px rgba(0,150,255,0.18)' }}>
        <div style={{ height: 92, background: 'linear-gradient(135deg, #0a2a4a 0%, #1a1a4a 55%, #2a1a5a 100%)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', position: 'relative' }}>
          <IQLogo size={58} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-black text-white text-base leading-tight tracking-[0.12em]" style={{ background: 'linear-gradient(90deg,#eaffff,#4fb8ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>VOID IQ</p>
            <p className="font-mono text-[12px] text-white/55 mt-0.5">გაზომე შენი გონება · ლიდერბორდი</p>
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(0,150,255,0.9)', borderRadius: 8, padding: '3px 8px' }}>NEW</span>
        </div>
      </button>
      {voidIqOpen && (
        <Suspense fallback={null}>
          <VoidIQHub onClose={() => setVoidIqOpen(false)} />
        </Suspense>
      )}

      {/* ── Premium Worlds card (flagship 3D social worlds) ─────────────── */}
      {onOpenPremium && (
        <button onClick={onOpenPremium}
          className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
          style={{ border: '1px solid rgba(192,132,252,0.4)', boxShadow: '0 6px 30px rgba(124,58,237,0.18)' }}>
          <div style={{ height: 84, background: 'linear-gradient(135deg, #1a2b4a 0%, #4a2c1a 55%, #6b3a1a 100%)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', position: 'relative' }}>
            <span style={{ fontSize: 38, filter: 'drop-shadow(0 4px 14px rgba(255,140,60,0.6))' }}>🔥</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-white text-sm leading-tight">Premium Worlds ✨</p>
              <p className="font-mono text-[12px] text-white/60">Beach Camp 3D · {t.commB.premiumSub}</p>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px' }}>NEW</span>
          </div>
        </button>
      )}

      {/* ── განაბ სიმულატორი card (text roguelike) ──────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(26,20,8,0.9), rgba(10,8,5,0.9))', border: '1px solid rgba(217,162,74,0.35)' }}>
        <div className="px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(217,162,74,0.05)' }}>
          <img src="/ganab-star.png" alt="" className="w-8 h-8 object-contain flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(217,162,74,0.5))' }} />
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-sm leading-tight" style={{ color: '#d9a24a' }}>
              {t.games.ganab.title}
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">{t.games.ganab.subtitle}</p>
          </div>
          <button
            onClick={() => useSocialStore.getState().requestOpenGanab()}
            className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(217,162,74,0.12)', border: '1px solid rgba(217,162,74,0.5)', color: '#d9a24a' }}>
            {t.games.ganab.play}
          </button>
        </div>
      </div>

      {/* ── დილემები category — opens a full-screen hub (Premium-Worlds style) ── */}
      <button onClick={() => setDilemmasHubOpen(true)}
        className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
        style={{ border: '1px solid rgba(124,156,255,0.4)', boxShadow: '0 6px 30px rgba(124,156,255,0.14)' }}>
        <div style={{ height: 84, background: 'linear-gradient(135deg, #1a1b3a 0%, #2a1a4a 55%, #3a2a6b 100%)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', position: 'relative' }}>
          <span style={{ fontSize: 38, filter: 'drop-shadow(0 4px 14px rgba(124,156,255,0.6))' }}>⚖️</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">დილემები ⚖</p>
            <p className="font-mono text-[12px] text-white/60">მორალური არჩევანი · {DILEMMAS.length} თამაში</p>
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px' }}>NEW</span>
        </div>
      </button>
      {dilemmasHubOpen && (
        <Suspense fallback={null}>
          <DilemmasHub onClose={() => setDilemmasHubOpen(false)} />
        </Suspense>
      )}

      {/* ── Virtual Space card ──────────────────────────────────────────── */}
      {onOpenSpace && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(0,229,255,0.2)' }}>
          <div className="px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(0,229,255,0.04)' }}>
            <span className="text-2xl">🌐</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-white text-sm leading-tight">Virtual Space</p>
              <p className="font-mono text-[12px] text-white/35">{t.commB.spaceSub}</p>
            </div>
            <button
              onClick={onOpenSpace}
              className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.35)', color: '#00e5ff' }}>
              {t.commB.enter}
            </button>
          </div>
        </div>
      )}

      {bandicootOpen && (
        <Suspense fallback={null}>
          <NeoBandicoot onClose={() => setBandicootOpen(false)} />
        </Suspense>
      )}

      {/* ── Aristocracy Test card (solo taste/etiquette quiz) ───────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(212,175,55,0.3)' }}>
        <div className="px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(212,175,55,0.05)' }}>
          <span className="text-2xl">👑</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.aristocracy.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.aristocracy.subtitle}</p>
          </div>
          <button
            onClick={() => setAristocracyOpen(true)}
            className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(212,175,55,0.14)', border: '1px solid rgba(212,175,55,0.5)', color: '#e8cf7a' }}>
            {t.games.aristocracy.play}
          </button>
        </div>
      </div>
      {aristocracyOpen && (
        <Suspense fallback={null}>
          <AristocracyTest onClose={() => setAristocracyOpen(false)} />
        </Suspense>
      )}

      {/* Consolidated connection error banner */}
      <AnimatePresence>
        {(ckError || jkError || ldError || wwError || unoError) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="text-base">📡</span>
            <span className="font-mono text-xs flex-1">{t.commB.listError}</span>
            <button
              onClick={handleRefresh}
              className="font-mono text-xs px-2.5 py-1 rounded-lg transition-all active:scale-95"
              style={{ background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.4)' }}
            >
              {t.commB.retry}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── What? Where? When? card ───────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.05)' }}>
          <span className="text-2xl">🧠</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.www.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.www.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(192,132,252,0.6)' }}
            title="Refresh">
            ↻
          </button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!wwShowJoin ? (
            <>
              <ActionButton onClick={handleWwCreate} accent="purple" loading={wwLoading}>
                {t.games.www.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setWwShowJoin(true)} accent="cyan">
                {t.games.www.joinMatch}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={wwJoinCode}
                onChange={e => setWwJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleWwJoin(); }}
                placeholder="XXXXXX"
                maxLength={6}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleWwJoin} disabled={!wwJoinCode.trim() || wwLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: '#c084fc' }}>
                {wwLoading ? '…' : t.games.www.joinMatch}
              </button>
              <button onClick={() => { setWwShowJoin(false); setWwJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
        </div>
        {wwList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.www.openMatches}</p>
            {wwList.map(m => <WWWRow key={m.id} match={m} onJoin={code => wwJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Blackout card (social deduction · real-time) ─────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,211,77,0.25)', boxShadow: '0 4px 24px rgba(155,0,255,0.10)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,211,77,0.15)', background: 'rgba(255,211,77,0.04)' }}>
          <span className="text-2xl">🔦</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              {t.games.blackout.title}
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">{t.games.blackout.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(255,211,77,0.08)', border: '1px solid rgba(255,211,77,0.2)', color: 'rgba(255,224,138,0.6)' }}
            title="Refresh">
            ↻
          </button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!boShowJoin ? (
            <>
              <ActionButton onClick={handleBoCreate} accent="purple" loading={boLoading}>
                {t.games.blackout.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setBoShowJoin(true)} accent="cyan">
                {t.games.blackout.joinMatch}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={boJoinCode}
                onChange={e => setBoJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleBoJoin(); }}
                placeholder="XXXXXX"
                maxLength={6}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleBoJoin} disabled={!boJoinCode.trim() || boLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(255,211,77,0.12)', border: '1px solid rgba(255,211,77,0.35)', color: '#ffd34d' }}>
                {boLoading ? '…' : t.games.blackout.joinMatch}
              </button>
              <button onClick={() => { setBoShowJoin(false); setBoJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
          {boError && <p className="w-full font-mono text-[12px] text-neon-red" onClick={boClear}>{boError}</p>}
        </div>
        {boList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.blackout.openMatches}</p>
            {boList.map(m => <BlackoutRow key={m.id} match={m} onJoin={code => boJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── ჯაშუში (Spyfall) card — social deduction + voice ────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(16,8,14,0.75)', border: '1px solid rgba(255,45,85,0.3)', boxShadow: '0 4px 24px rgba(255,45,85,0.08)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,45,85,0.15)', background: 'rgba(255,45,85,0.04)' }}>
          <span className="text-2xl">🕵️</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              ჯაშუში
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">იპოვე ჯაშუში ხმით 🎙 · 3-10 მოთ.</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.2)', color: 'rgba(255,140,163,0.6)' }} title="Refresh">↻</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!spShowJoin ? (
            <>
              <ActionButton onClick={handleSpCreate} accent="purple" loading={spLoading}>შექმნა</ActionButton>
              <ActionButton onClick={() => setSpShowJoin(true)} accent="cyan">შეუერთდი</ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input value={spJoinCode} onChange={e => setSpJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') handleSpJoin(); }}
                placeholder="XXXXXX" maxLength={6} autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest" />
              <button onClick={handleSpJoin} disabled={!spJoinCode.trim() || spLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(255,45,85,0.12)', border: '1px solid rgba(255,45,85,0.35)', color: '#ff5d6c' }}>
                {spLoading ? '…' : 'შეუერთდი'}
              </button>
              <button onClick={() => { setSpShowJoin(false); setSpJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
          {spError && <p className="w-full font-mono text-[12px] text-neon-red" onClick={spClear}>{spError}</p>}
        </div>
        {spList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">ღია თამაშები</p>
            {spList.map(m => <SpyfallRow key={m.id} match={m} onJoin={code => spJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Alias card (team word game) ─────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,10,24,0.7)', border: '1px solid rgba(77,159,255,0.25)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(77,159,255,0.15)', background: 'rgba(77,159,255,0.04)' }}>
          <span className="text-2xl">🗣</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              ალიასი
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">გუნდური სიტყვების თამაში · 4-12 მოთ.</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', color: 'rgba(150,190,255,0.6)' }} title="Refresh">↻</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!alShowJoin ? (
            <>
              <ActionButton onClick={handleAlCreate} accent="cyan" loading={alLoading}>შექმნა</ActionButton>
              <ActionButton onClick={() => setAlShowJoin(true)} accent="purple">შეუერთდი</ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input value={alJoinCode} onChange={e => setAlJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') handleAlJoin(); }}
                placeholder="XXXXXX" maxLength={6} autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest" />
              <button onClick={handleAlJoin} disabled={!alJoinCode.trim() || alLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(77,159,255,0.12)', border: '1px solid rgba(77,159,255,0.35)', color: '#4d9fff' }}>
                {alLoading ? '…' : 'შეუერთდი'}
              </button>
              <button onClick={() => { setAlShowJoin(false); setAlJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
          {alError && <p className="w-full font-mono text-[12px] text-neon-red" onClick={alClear}>{alError}</p>}
        </div>
        {alList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">ღია თამაშები</p>
            {alList.map(m => <AliasRow key={m.id} match={m} onJoin={code => alJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Draw & Guess card ───────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,8,22,0.7)', border: '1px solid rgba(255,140,38,0.28)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,140,38,0.15)', background: 'rgba(255,140,38,0.04)' }}>
          <span className="text-2xl">🎨</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              დახაზე & გამოიცანი
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">ხატავ და გამოიცნობ · 2-12 მოთ.</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(255,140,38,0.08)', border: '1px solid rgba(255,140,38,0.2)', color: 'rgba(255,180,106,0.6)' }} title="Refresh">↻</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!drShowJoin ? (
            <>
              <ActionButton onClick={handleDrCreate} accent="orange" loading={drLoading}>შექმნა</ActionButton>
              <ActionButton onClick={() => setDrShowJoin(true)} accent="cyan">შეუერთდი</ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input value={drJoinCode} onChange={e => setDrJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') handleDrJoin(); }}
                placeholder="XXXXXX" maxLength={6} autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest" />
              <button onClick={handleDrJoin} disabled={!drJoinCode.trim() || drLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(255,140,38,0.12)', border: '1px solid rgba(255,140,38,0.35)', color: '#ff8c26' }}>
                {drLoading ? '…' : 'შეუერთდი'}
              </button>
              <button onClick={() => { setDrShowJoin(false); setDrJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
          {drError && <p className="w-full font-mono text-[12px] text-neon-red" onClick={drClear}>{drError}</p>}
        </div>
        {drList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">ღია თამაშები</p>
            {drList.map(m => <DrawRow key={m.id} match={m} onJoin={code => drJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Codenames card ──────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,9,20,0.7)', border: '1px solid rgba(155,0,255,0.28)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(155,0,255,0.15)', background: 'rgba(155,0,255,0.04)' }}>
          <span className="text-2xl">🕵️</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">
              Codenames
              <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px', marginLeft: 8, verticalAlign: 'middle' }}>NEW</span>
            </p>
            <p className="font-mono text-[12px] text-white/35">2 გუნდი · მინიშნებები · 4-16 მოთ.</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: 'rgba(192,132,252,0.6)' }} title="Refresh">↻</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!cnShowJoin ? (
            <>
              <ActionButton onClick={handleCnCreate} accent="purple" loading={cnLoading}>შექმნა</ActionButton>
              <ActionButton onClick={() => setCnShowJoin(true)} accent="cyan">შეუერთდი</ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input value={cnJoinCode} onChange={e => setCnJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') handleCnJoin(); }}
                placeholder="XXXXXX" maxLength={6} autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest" />
              <button onClick={handleCnJoin} disabled={!cnJoinCode.trim() || cnLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}>
                {cnLoading ? '…' : 'შეუერთდი'}
              </button>
              <button onClick={() => { setCnShowJoin(false); setCnJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
          {cnError && <p className="w-full font-mono text-[12px] text-neon-red" onClick={cnClear}>{cnError}</p>}
        </div>
        {cnList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">ღია თამაშები</p>
            {cnList.map(m => <CodenamesRow key={m.id} match={m} onJoin={code => cnJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Checkers card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(155,0,255,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(155,0,255,0.15)', background: 'rgba(155,0,255,0.05)' }}>
          <span className="text-2xl">♟</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.checkers.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.checkers.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: 'rgba(192,132,252,0.6)' }}
            title="Refresh">
            ↻
          </button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!ckShowJoin ? (
            <>
              <ActionButton onClick={handleCkCreate} accent="purple" loading={ckLoading}>
                {t.games.checkers.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setCkShowJoin(true)} accent="cyan">
                {t.games.checkers.joinMatch}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={ckJoinCode}
                onChange={e => setCkJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleCkJoin(); }}
                placeholder="CK-0000"
                maxLength={7}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleCkJoin} disabled={!ckJoinCode.trim() || ckLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00f5ff' }}>
                {ckLoading ? '…' : t.games.checkers.joinMatch}
              </button>
              <button onClick={() => { setCkShowJoin(false); setCkJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
        </div>
        {/* Open checkers matches */}
        {ckList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.checkers.openMatches}</p>
            {ckList.map(m => <CheckersRow key={m.id} match={m} onJoin={code => ckJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Other games (collapsible: Joker · UNO · Ludo · Bandicoot · Backrooms) ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => setShowOther(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left transition-all active:scale-[0.99]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <span className="text-2xl">🎮</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.commB.otherGames}</p>
            <p className="font-mono text-[12px] text-white/35">{t.commB.jokerUno}</p>
          </div>
          <span className="font-mono text-white/40 text-xs transition-transform duration-200"
            style={{ transform: showOther ? 'rotate(180deg)' : 'none' }}>▼</span>
        </button>
      </div>

      <AnimatePresence>
      {showOther && (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

      {/* ── Joker card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,165,0,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,165,0,0.15)', background: 'rgba(255,165,0,0.04)' }}>
          <span className="text-2xl">🃏</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.joker.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.joker.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)', color: 'rgba(251,191,36,0.6)' }}
            title="Refresh">
            ↻
          </button>
        </div>

        {/* Mode selector */}
        <div className="px-4 pt-3 flex gap-2">
          {(['classic', 'nines_only'] as const).map(m => (
            <button
              key={m}
              onClick={() => setJkMode(m)}
              className="px-3 py-1 rounded-full font-mono text-[12px] uppercase tracking-wider transition-all"
              style={{
                background: jkMode === m ? 'rgba(255,165,0,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${jkMode === m ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: jkMode === m ? '#fbbf24' : 'rgba(255,255,255,0.35)',
              }}
            >
              {m === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!jkShowJoin ? (
            <>
              <ActionButton onClick={handleJkCreate} accent="gold" loading={jkLoading}>
                {t.games.joker.createTable}
              </ActionButton>
              <ActionButton onClick={() => setJkShowJoin(true)} accent="cyan">
                {t.games.joker.joinTable}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={jkJoinCode}
                onChange={e => setJkJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleJkJoin(); }}
                placeholder="JK-0000"
                maxLength={7}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleJkJoin} disabled={!jkJoinCode.trim() || jkLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.4)', color: '#fbbf24' }}>
                {jkLoading ? '…' : t.games.joker.joinTable}
              </button>
              <button onClick={() => { setJkShowJoin(false); setJkJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
        </div>

        {/* Open joker tables */}
        {jkList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.joker.openTables}</p>
            {jkList.map(m => <JokerRow key={m.id} match={m} onJoin={code => jkJoin(code, playerName)} />)}
          </div>
        )}
      </div>


      {/* ── UNO card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,100,0,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,100,0,0.15)', background: 'rgba(255,100,0,0.04)' }}>
          <span className="text-2xl">🃠</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.uno.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.uno.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(255,100,0,0.08)', border: '1px solid rgba(255,100,0,0.2)', color: 'rgba(251,146,60,0.6)' }}
            title="Refresh">
            ↻
          </button>
        </div>

        {/* Max players selector */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <span className="font-mono text-[12px] text-white/30 uppercase tracking-wider">{t.games.uno.maxPlayers}:</span>
          {([2, 3, 4, 6, 8, 10] as const).map(n => (
            <button key={n} onClick={() => setUnoMaxPlayers(n)}
              className="px-2 py-0.5 rounded-full font-mono text-[12px] transition-all"
              style={{
                background: unoMaxPlayers === n ? 'rgba(255,100,0,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${unoMaxPlayers === n ? 'rgba(255,100,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: unoMaxPlayers === n ? '#fb923c' : 'rgba(255,255,255,0.35)',
              }}>
              {n}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!unoShowJoin ? (
            <>
              <ActionButton onClick={handleUnoCreate} accent="orange" loading={unoLoading}>
                {t.games.uno.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setUnoShowJoin(true)} accent="cyan">
                {t.games.uno.joinMatch}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={unoJoinCode}
                onChange={e => setUnoJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleUnoJoin(); }}
                placeholder="UN-0000"
                maxLength={7}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleUnoJoin} disabled={!unoJoinCode.trim() || unoLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(255,100,0,0.15)', border: '1px solid rgba(255,100,0,0.4)', color: '#fb923c' }}>
                {unoLoading ? '…' : t.games.uno.joinMatch}
              </button>
              <button onClick={() => { setUnoShowJoin(false); setUnoJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
        </div>

        {unoList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.uno.openMatches}</p>
            {unoList.map(m => (
              <UnoRow key={m.id} match={m}
                onJoin={code => unoJoin(code, playerName)}
                onSpectate={code => unoSpectate(code)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Ludo card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.04)' }}>
          <span className="text-2xl">🎲</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.ludo.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.ludo.subtitle}</p>
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg font-mono text-sm transition-all active:scale-95"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'rgba(34,197,94,0.6)' }}
            title={t.games.ludo.refresh}>
            ↻
          </button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!ldShowJoin ? (
            <>
              <div className="w-full flex items-center gap-2 mb-1">
                <span className="font-mono text-[12px] text-white/30 uppercase tracking-wider">Max Players:</span>
                {([2, 3, 4] as const).map(n => (
                  <button key={n} onClick={() => setLdMaxPlayers(n)}
                    className="px-2 py-0.5 rounded-full font-mono text-[12px] transition-all"
                    style={{
                      background: ldMaxPlayers === n ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${ldMaxPlayers === n ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      color: ldMaxPlayers === n ? '#22c55e' : 'rgba(255,255,255,0.35)',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              <ActionButton onClick={handleLdCreate} accent="green" loading={ldLoading}>
                {t.games.ludo.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setLdShowJoin(true)} accent="cyan">
                {t.games.ludo.joinMatch}
              </ActionButton>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={ldJoinCode}
                onChange={e => setLdJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleLdJoin(); }}
                placeholder="LD-0000"
                maxLength={7}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button onClick={handleLdJoin} disabled={!ldJoinCode.trim() || ldLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                {ldLoading ? '…' : t.games.ludo.joinMatch}
              </button>
              <button onClick={() => { setLdShowJoin(false); setLdJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors">✕</button>
            </div>
          )}
        </div>
        {ldList.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25">{t.games.ludo.openMatches}</p>
            {ldList.map(m => <LudoRow key={m.id} match={m} onJoin={code => ldJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Neo Bandicoot card (solo 2D platformer) ─────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,140,38,0.3)' }}>
        <div className="px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(255,140,38,0.05)' }}>
          <span className="text-2xl">🦊</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.bandicoot.title}</p>
            <p className="font-mono text-[12px] text-white/35">{t.games.bandicoot.subtitle}</p>
          </div>
          <button
            onClick={() => setBandicootOpen(true)}
            className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(255,140,38,0.12)', border: '1px solid rgba(255,140,38,0.45)', color: '#ffb46a' }}>
            {t.games.bandicoot.play}
          </button>
        </div>
      </div>

      {/* ── Backrooms card (3D horror mode) ─────────────────────────────── */}
      {onOpenBackrooms && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(20,16,4,0.85), rgba(8,6,2,0.85))', border: '1px solid rgba(255,214,90,0.25)' }}>
          <div className="px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(255,214,90,0.04)' }}>
            <span className="text-2xl">🟨</span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm leading-tight" style={{ color: '#f5de80' }}>Backrooms</p>
              <p className="font-mono text-[12px] text-white/35">{t.commB.backroomsSub}</p>
            </div>
            <button
              onClick={onOpenBackrooms}
              className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(255,214,90,0.1)', border: '1px solid rgba(255,214,90,0.4)', color: '#f5de80' }}>
              {t.commB.enter}
            </button>
          </div>
        </div>
      )}

      </motion.div>
      )}
      </AnimatePresence>

    </div>
  );
}

function ActionButton({ children, onClick, accent = 'purple', loading }: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: 'purple' | 'cyan' | 'gold' | 'green' | 'orange';
  loading?: boolean;
}) {
  const colors = {
    purple: { bg: 'rgba(155,0,255,0.12)', border: 'rgba(155,0,255,0.35)', color: '#c084fc' },
    cyan:   { bg: 'rgba(0,245,255,0.08)', border: 'rgba(0,245,255,0.25)', color: '#00f5ff' },
    gold:   { bg: 'rgba(255,165,0,0.12)', border: 'rgba(255,165,0,0.35)',  color: '#fbbf24' },
    green:  { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)',  color: '#22c55e' },
    orange: { bg: 'rgba(255,100,0,0.12)', border: 'rgba(255,100,0,0.35)',  color: '#fb923c' },
  };
  const c = colors[accent];
  return (
    <button onClick={onClick} disabled={loading}
      className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {loading ? '…' : children}
    </button>
  );
}

function CheckersRow({ match, onJoin }: { match: CheckersMatchListItem; onJoin: (code: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white">
          {match.redName} vs {match.blackName ?? <span className="text-white/30">{t.games.checkers.waiting}</span>}
        </p>
        <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
      </div>
      {match.status === 'waiting' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}>
          {t.games.checkers.join}
        </button>
      )}
      {match.status === 'active' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.checkers.spectate}
        </button>
      )}
    </div>
  );
}

function LudoRow({ match, onJoin }: { match: LudoMatchListItem; onJoin: (code: string) => void }) {
  const t = useT();
  const canJoin = match.status === 'waiting' && match.playerCount < match.maxPlayers;
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">
          {match.playerNames.length > 0 ? match.playerNames.join(', ') : '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
          {match.status === 'waiting' && (
            <span className="font-mono text-[12px] text-white/20">{t.games.ludo.waiting}</span>
          )}
        </div>
      </div>
      {canJoin && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
          {t.games.ludo.join}
        </button>
      )}
      {match.status === 'active' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.ludo.spectate}
        </button>
      )}
    </div>
  );
}

function CodenamesRow({ match, onJoin }: { match: CnListItem; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(155,0,255,0.1)', border: '1px solid rgba(155,0,255,0.25)', color: '#c084fc' }}>
        შეუერთდი
      </button>
    </div>
  );
}

function DrawRow({ match, onJoin }: { match: DrawListItem; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(255,140,38,0.1)', border: '1px solid rgba(255,140,38,0.25)', color: '#ff8c26' }}>
        შეუერთდი
      </button>
    </div>
  );
}

function SpyfallRow({ match, onJoin }: { match: SpyfallListItem; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.25)', color: '#ff5d6c' }}>
        შეუერთდი
      </button>
    </div>
  );
}

function AliasRow({ match, onJoin }: { match: AliasListItem; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.25)', color: '#4d9fff' }}>
        შეუერთდი
      </button>
    </div>
  );
}

function BlackoutRow({ match, onJoin }: { match: BlackoutListItem; onJoin: (code: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers} {t.commB.plAbbr}</span>
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(255,211,77,0.1)', border: '1px solid rgba(255,211,77,0.25)', color: '#ffd34d' }}>
        {t.games.blackout.join}
      </button>
    </div>
  );
}

function WWWRow({ match, onJoin }: { match: WWWListItem; onJoin: (code: string) => void }) {
  const t = useT();
  const isWaiting = match.status === 'waiting';
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">
          {match.hostNickname}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount} {t.commB.plAbbr}</span>
          <span className="font-mono text-[12px] text-white/20">{match.questionsCount} {t.commB.qAbbr}</span>
        </div>
      </div>
      {isWaiting && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
          {t.games.www.join}
        </button>
      )}
      {!isWaiting && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(192,132,252,0.6)' }}>
          {t.games.www.spectate}
        </button>
      )}
    </div>
  );
}

function UnoRow({ match, onJoin, onSpectate }: { match: UnoListItem; onJoin: (code: string) => void; onSpectate: (code: string) => void }) {
  const t = useT();
  const canJoin = match.status === 'waiting' && match.playerCount < match.maxPlayers;
  const isActive = match.status === 'active';
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">
          {match.playerNicknames.length > 0 ? match.playerNicknames.join(', ') : '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
          {match.status === 'waiting' && (
            <span className="font-mono text-[12px] text-white/20">{t.games.uno.waitingForPlayers}</span>
          )}
        </div>
      </div>
      {canJoin && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(255,100,0,0.12)', border: '1px solid rgba(255,100,0,0.3)', color: '#fb923c' }}>
          {t.games.uno.join}
        </button>
      )}
      {isActive && (
        <button onClick={() => onSpectate(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.uno.spectate}
        </button>
      )}
    </div>
  );
}

function JokerRow({ match, onJoin }: { match: JokerMatchListItem; onJoin: (code: string) => void }) {
  const t = useT();
  const isWaiting = match.status === 'waiting';
  const isActive  = ['declaration', 'playing', 'round_end'].includes(match.status);
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">
          {match.playerNames.join(', ') || '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/4</span>
          <span className="font-mono text-[12px] text-white/20">
            {match.mode === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
          </span>
        </div>
      </div>
      {isWaiting && match.playerCount < 4 && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.3)', color: '#fbbf24' }}>
          {t.games.joker.join}
        </button>
      )}
      {isActive && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.joker.spectate}
        </button>
      )}
    </div>
  );
}

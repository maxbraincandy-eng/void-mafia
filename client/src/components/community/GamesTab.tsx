import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCheckersStore } from '@/store/checkersStore';
import { useJokerStore } from '@/store/jokerStore';
import { useLudoStore } from '@/store/ludoStore';
import { useWWWStore } from '@/store/wwwStore';
import { useUnoStore } from '@/store/unoStore';
import { CheckersGame } from '@/components/checkers/CheckersGame';
import { JokerGame } from '@/components/joker/JokerGame';
import { LudoGame } from '@/components/ludo/LudoGame';
import { WWWGame } from '@/components/www/WWWGame';
import { UnoGame } from '@/components/uno/UnoGame';
import type { CheckersMatchListItem } from '@/types/checkers';
import type { JokerMatchListItem } from '@/types/joker';
import type { LudoMatchListItem } from '@/types/ludo';
import type { WWWListItem } from '@/types/www';
import type { UnoListItem } from '@/types/uno';

export function GamesTab() {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';

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

  const handleRefresh = useCallback(() => {
    ckFetch();
    jkFetch();
    ldFetch();
    wwFetch();
    unoFetch();
  }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch]);

  useEffect(() => { ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch]);

  // Refresh on visibility change
  useEffect(() => {
    const handler = () => { if (!document.hidden) handleRefresh(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [handleRefresh]);

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

  return (
    <div className="space-y-4">
      {/* WWW error */}
      <AnimatePresence>
        {wwError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={wwClear}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="font-mono text-xs flex-1">{wwError}</span>
            <span className="text-xs opacity-60">✕</span>
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
            <p className="font-mono text-[10px] text-white/35">{t.games.www.subtitle}</p>
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">{t.games.www.openMatches}</p>
            {wwList.map(m => <WWWRow key={m.id} match={m} onJoin={code => wwJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* Checkers error */}
      <AnimatePresence>
        {ckError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={ckClear}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="font-mono text-xs flex-1">{ckError}</span>
            <span className="text-xs opacity-60">✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Joker error */}
      <AnimatePresence>
        {jkError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={jkClear}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="font-mono text-xs flex-1">{jkError}</span>
            <span className="text-xs opacity-60">✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Checkers card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(155,0,255,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(155,0,255,0.15)', background: 'rgba(155,0,255,0.05)' }}>
          <span className="text-2xl">♟</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.checkers.title}</p>
            <p className="font-mono text-[10px] text-white/35">{t.games.checkers.subtitle}</p>
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">{t.games.checkers.openMatches}</p>
            {ckList.map(m => <CheckersRow key={m.id} match={m} onJoin={code => ckJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Joker card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,165,0,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,165,0,0.15)', background: 'rgba(255,165,0,0.04)' }}>
          <span className="text-2xl">🃏</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.joker.title}</p>
            <p className="font-mono text-[10px] text-white/35">{t.games.joker.subtitle}</p>
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
              className="px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all"
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">{t.games.joker.openTables}</p>
            {jkList.map(m => <JokerRow key={m.id} match={m} onJoin={code => jkJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── Ludo error ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {ldError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={ldClear}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="font-mono text-xs flex-1">{ldError}</span>
            <span className="text-xs opacity-60">✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ludo card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.04)' }}>
          <span className="text-2xl">🎲</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.ludo.title}</p>
            <p className="font-mono text-[10px] text-white/35">{t.games.ludo.subtitle}</p>
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
                <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Max Players:</span>
                {([2, 3, 4] as const).map(n => (
                  <button key={n} onClick={() => setLdMaxPlayers(n)}
                    className="px-2 py-0.5 rounded-full font-mono text-[10px] transition-all"
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">{t.games.ludo.openMatches}</p>
            {ldList.map(m => <LudoRow key={m.id} match={m} onJoin={code => ldJoin(code, playerName)} />)}
          </div>
        )}
      </div>

      {/* ── UNO error ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {unoError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={unoClear}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            <span className="font-mono text-xs flex-1">{unoError}</span>
            <span className="text-xs opacity-60">✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── UNO card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(255,100,0,0.2)' }}>
        <div className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(255,100,0,0.15)', background: 'rgba(255,100,0,0.04)' }}>
          <span className="text-2xl">🃠</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.uno.title}</p>
            <p className="font-mono text-[10px] text-white/35">{t.games.uno.subtitle}</p>
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
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">{t.games.uno.maxPlayers}:</span>
          {([2, 3, 4, 6, 8, 10] as const).map(n => (
            <button key={n} onClick={() => setUnoMaxPlayers(n)}
              className="px-2 py-0.5 rounded-full font-mono text-[10px] transition-all"
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">{t.games.uno.openMatches}</p>
            {unoList.map(m => (
              <UnoRow key={m.id} match={m}
                onJoin={code => unoJoin(code, playerName)}
                onSpectate={code => unoSpectate(code)} />
            ))}
          </div>
        )}
      </div>

      {/* Checkers game overlay */}
      <AnimatePresence>
        {ckMatch && <CheckersGame />}
      </AnimatePresence>

      {/* Joker game overlay */}
      <AnimatePresence>
        {jkMatch && <JokerGame />}
      </AnimatePresence>

      {/* Ludo game overlay */}
      <AnimatePresence>
        {ldMatch && <LudoGame />}
      </AnimatePresence>

      {/* WWW game overlay */}
      <AnimatePresence>
        {wwMatch && <WWWGame />}
      </AnimatePresence>

      {/* UNO game overlay */}
      <AnimatePresence>
        {unoMatch && <UnoGame />}
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
        <span className="font-mono text-[9px] text-white/25 tracking-widest">{match.code}</span>
      </div>
      {match.status === 'waiting' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}>
          {t.games.checkers.join}
        </button>
      )}
      {match.status === 'active' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
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
          <span className="font-mono text-[9px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[9px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
          {match.status === 'waiting' && (
            <span className="font-mono text-[9px] text-white/20">{t.games.ludo.waiting}</span>
          )}
        </div>
      </div>
      {canJoin && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
          {t.games.ludo.join}
        </button>
      )}
      {match.status === 'active' && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.ludo.spectate}
        </button>
      )}
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
          <span className="font-mono text-[9px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[9px] text-white/20">{match.playerCount} მოთ.</span>
          <span className="font-mono text-[9px] text-white/20">{match.questionsCount} შეკ.</span>
        </div>
      </div>
      {isWaiting && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
          {t.games.www.join}
        </button>
      )}
      {!isWaiting && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
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
          <span className="font-mono text-[9px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[9px] text-white/20">{match.playerCount}/{match.maxPlayers}</span>
          {match.status === 'waiting' && (
            <span className="font-mono text-[9px] text-white/20">{t.games.uno.waitingForPlayers}</span>
          )}
        </div>
      </div>
      {canJoin && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(255,100,0,0.12)', border: '1px solid rgba(255,100,0,0.3)', color: '#fb923c' }}>
          {t.games.uno.join}
        </button>
      )}
      {isActive && (
        <button onClick={() => onSpectate(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
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
          <span className="font-mono text-[9px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[9px] text-white/20">{match.playerCount}/4</span>
          <span className="font-mono text-[9px] text-white/20">
            {match.mode === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
          </span>
        </div>
      </div>
      {isWaiting && match.playerCount < 4 && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.3)', color: '#fbbf24' }}>
          {t.games.joker.join}
        </button>
      )}
      {isActive && (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}>
          {t.games.joker.spectate}
        </button>
      )}
    </div>
  );
}

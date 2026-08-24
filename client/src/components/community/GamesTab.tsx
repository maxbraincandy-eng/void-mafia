import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

const AristocracyTest = lazy(() => import('@/components/quiz/AristocracyTest').then(m => ({ default: m.AristocracyTest })));
const DilemmasHub = lazy(() => import('@/components/dilemmas/DilemmasHub').then(m => ({ default: m.DilemmasHub })));
const PhilosophyHub = lazy(() => import('@/components/philosophy/PhilosophyHub').then(m => ({ default: m.PhilosophyHub })));
const PhiloTestExperience = lazy(() => import('@/components/philotest/PhiloTestExperience').then(m => ({ default: m.PhiloTestExperience })));
const VoidIQHub = lazy(() => import('@/components/iq/VoidIQHub').then(m => ({ default: m.VoidIQHub })));
const WatchPartyLauncher = lazy(() => import('@/components/watchparty/WatchPartyLauncher').then(m => ({ default: m.WatchPartyLauncher })));
const LogicAcademy = lazy(() => import('@/components/logic/LogicAcademy').then(m => ({ default: m.LogicAcademy })));
const MergeEvolution = lazy(() => import('@/components/merge/MergeEvolution').then(m => ({ default: m.MergeEvolution })));
const MaxPuzzleExperience = lazy(() => import('@/components/maxpuzzle/MaxPuzzleExperience').then(m => ({ default: m.MaxPuzzleExperience })));
const NoirAdventure = lazy(() => import('@/components/noir/NoirAdventure').then(m => ({ default: m.NoirAdventure })));
const SkyMap = lazy(() => import('@/components/sky/SkyMap'));
const MarsTerminal = lazy(() => import('@/components/mars/MarsTerminal').then(m => ({ default: m.MarsTerminal })));
import { IQLogo } from '@/components/iq/IQLogo';
import { LogicLogo } from '@/components/logic/LogicLogo';
import { MaxSeal } from '@/components/maxpuzzle/MaxSeal';
import { VRBustIcon } from '@/components/ui/VRBustIcon';
import { PhilosopherIcon } from '@/components/philosophy/PhilosopherIcon';
import { UnoLogo } from '@/components/ui/UnoLogo';
import { NinjaEmblem } from '@/components/ui/NinjaEmblem';
import { SageIcon } from '@/components/philotest/SageIcon';
import { CrossedFingersIcon } from '@/components/lies/CrossedFingersIcon';
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
import { usePokerStore } from '@/store/pokerStore';
import type { SpyfallListItem } from '@/types/spyfall';
import { useLiesStore } from '@/store/liesStore';
import type { LiesListItem } from '@/types/lies';
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
import { T } from '@/design/tokens';
import { haptic } from '@/lib/haptics';


// ── Sections ─────────────────────────────────────────────────────────────────
// The hub used to open on nine category strips, a carousel and a chip row, and
// finding a particular game meant scrolling past all of it. It is three
// sections now, each one a header you tap to fold open, and membership is this
// list rather than a `cat` field spread across the catalogue — the order below
// IS the order on screen, so rearranging is editing one array.
type SectionId = 'fun' | 'mind' | 'spaces';

interface SectionDef {
  id: SectionId;
  title: string;
  emoji: string;
  accent: string;
  /** Two per row, in this order. */
  ids: string[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'fun', title: 'გართობა', emoji: '🎉', accent: '#ff8c26',
    ids: [
      'checkers', 'ludo',
      'uno', 'joker',
      'draw', 'spyfall',
      'lies', 'codenames',
      'poker', 'www',
      'alias', 'blackout',
      'mergeevo',
    ],
  },
  {
    id: 'mind', title: 'გონება', emoji: '🧠', accent: '#7c9cff',
    ids: [
      'voidiq', 'logic',
      'philosophy', 'philotest',
      'aristocracy', 'noir',
      'ganab', 'maxpuzzle',
      'dilemmas',
    ],
  },
  {
    id: 'spaces', title: 'სივრცეები', emoji: '🌐', accent: '#4a76c4',
    ids: [
      'space', 'watchparty',
      'backrooms', 'mars',
      'sky',
    ],
  },
];

interface GameDef {
  id: string;
  title: string;
  sub: string;
  kind: 'match' | 'launch';
  accent: string;
  emoji?: string;
  logo?: 'iq' | 'logic' | 'ganab' | 'vspace' | 'philosophy' | 'uno' | 'codenames' | 'sage' | 'maxseal' | 'liar' | 'mafianight';
  badge?: boolean;
  keywords: string;
  launch?: () => void;
}

// Recently-played (localStorage)
const RECENT_KEY = 'vm-recent-games';
function loadRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } }
function pushRecent(id: string): string[] {
  const next = [id, ...loadRecent().filter(x => x !== id)].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function GamesTab({ onOpenSpace, onOpenBackrooms }: { onOpenSpace?: () => void; onOpenBackrooms?: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';
  const [aristocracyOpen, setAristocracyOpen] = useState(false);
  const [dilemmasHubOpen, setDilemmasHubOpen] = useState(false);
  const [philoHubOpen, setPhiloHubOpen] = useState(false);
  const [philoTestOpen, setPhiloTestOpen] = useState(false);
  const [voidIqOpen, setVoidIqOpen] = useState(false);
  const [maxPuzzleOpen, setMaxPuzzleOpen] = useState(false);
  const [watchPartyOpen, setWatchPartyOpen] = useState(false);
  const [logicOpen, setLogicOpen] = useState(false);
  const [noirOpen, setNoirOpen] = useState(false);
  const [marsOpen, setMarsOpen] = useState(false);
  const [skyOpen, setSkyOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  // ── Checkers ────────────────────────────────────────────────────────
  const {
    matchList: ckList, isLoading: ckLoading, error: ckError,
    fetchList: ckFetch, createMatch: ckCreate, joinMatch: ckJoin, clearError: ckClear,
  } = useCheckersStore();
  const [ckJoinCode, setCkJoinCode] = useState('');

  // ── Joker ───────────────────────────────────────────────────────────
  const {
    matchList: jkList, isLoading: jkLoading, error: jkError,
    fetchList: jkFetch, createMatch: jkCreate, joinMatch: jkJoin, clearError: jkClear,
  } = useJokerStore();
  const [jkJoinCode, setJkJoinCode] = useState('');
  const [jkMode, setJkMode] = useState<'classic' | 'nines_only'>('classic');
  // The host settles ხიშტი before the first deal — tables disagree about it.
  const [jkKhishti, setJkKhishti] = useState<number>(200);

  // ── Ludo ────────────────────────────────────────────────────────────
  const {
    matchList: ldList, isLoading: ldLoading, error: ldError,
    fetchList: ldFetch, createMatch: ldCreate, joinMatch: ldJoin, clearError: ldClear,
  } = useLudoStore();
  const [ldJoinCode, setLdJoinCode] = useState('');
  const [ldMaxPlayers, setLdMaxPlayers] = useState<2 | 3 | 4>(2);

  // ── What? Where? When? ───────────────────────────────────────────────
  const {
    matchList: wwList, isLoading: wwLoading, error: wwError,
    fetchList: wwFetch, createMatch: wwCreate, joinMatch: wwJoin, clearError: wwClear,
  } = useWWWStore();
  const [wwJoinCode, setWwJoinCode] = useState('');

  // ── UNO ─────────────────────────────────────────────────────────────
  const {
    matchList: unoList, isLoading: unoLoading, error: unoError,
    fetchList: unoFetch, createMatch: unoCreate, joinMatch: unoJoin,
    spectateMatch: unoSpectate, clearError: unoClear,
  } = useUnoStore();
  const [unoJoinCode, setUnoJoinCode] = useState('');
  const [unoMaxPlayers, setUnoMaxPlayers] = useState(4);

  // ── Blackout ────────────────────────────────────────────────────────
  const {
    matchList: boList, isLoading: boLoading, error: boError,
    fetchList: boFetch, createMatch: boCreate, joinMatch: boJoin, clearError: boClear,
  } = useBlackoutStore();
  const [boJoinCode, setBoJoinCode] = useState('');

  // ── Alias ───────────────────────────────────────────────────────────
  const {
    matchList: alList, isLoading: alLoading, error: alError,
    fetchList: alFetch, createMatch: alCreate, joinMatch: alJoin, clearError: alClear,
  } = useAliasStore();
  const [alJoinCode, setAlJoinCode] = useState('');

  // ── სოციალური პოკერი ────────────────────────────────────────────────
  const {
    tables: pkList, isLoading: pkLoading, error: pkError,
    fetchList: pkFetch, createTable: pkCreate, joinTable: pkJoin, clearError: pkClear,
  } = usePokerStore();
  const [pkJoinCode, setPkJoinCode] = useState('');
  const [pkBlind, setPkBlind] = useState(10);
  const [pkSeats, setPkSeats] = useState(6);

  // ── ჯაშუში (Spyfall) ────────────────────────────────────────────────
  const {
    matchList: spList, isLoading: spLoading, error: spError,
    fetchList: spFetch, createMatch: spCreate, joinMatch: spJoin, clearError: spClear,
  } = useSpyfallStore();
  const [spJoinCode, setSpJoinCode] = useState('');

  // ── ტყუილების ოსტატი (Master of Lies) ───────────────────────────────
  const {
    matchList: liList, isLoading: liLoading, error: liError,
    fetchList: liFetch, createMatch: liCreate, joinMatch: liJoin, clearError: liClear,
  } = useLiesStore();
  const [liJoinCode, setLiJoinCode] = useState('');

  // მაფია ჰოსტით used to live here. It is a mafia game, so it now opens from
  // the Mafia tab alongside the classic rooms — see RoomsPage.

  // ── Draw & Guess ────────────────────────────────────────────────────
  const {
    matchList: drList, isLoading: drLoading, error: drError,
    fetchList: drFetch, createMatch: drCreate, joinMatch: drJoin, clearError: drClear,
  } = useDrawStore();
  const [drJoinCode, setDrJoinCode] = useState('');

  // ── Codenames ───────────────────────────────────────────────────────
  const {
    matchList: cnList, isLoading: cnLoading, error: cnError,
    fetchList: cnFetch, createMatch: cnCreate, joinMatch: cnJoin, clearError: cnClear,
  } = useCodenamesStore();
  const [cnJoinCode, setCnJoinCode] = useState('');

  // ── Hub UI state ─────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  // გართობა is open on arrival: a hub whose every drawer is shut shows the
  // visitor nothing but three headers.
  const [openSection, setOpenSection] = useState<SectionId | null>('fun');
  const [sheet, setSheet] = useState<string | null>(null); // open match-game launcher
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const recordRecent = useCallback((id: string) => setRecent(pushRecent(id)), []);

  const handleRefresh = useCallback(() => {
    ckClear(); jkClear(); ldClear(); wwClear(); unoClear(); boClear(); alClear(); drClear(); cnClear(); spClear(); liClear();
    ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); liFetch(); pkFetch();
  }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, liFetch, pkFetch, ckClear, jkClear, ldClear, wwClear, unoClear, boClear, alClear, drClear, cnClear, spClear, liClear]);

  useEffect(() => { ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); liFetch(); pkFetch(); }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, liFetch, pkFetch]);

  useEffect(() => {
    const handler = () => { if (!document.hidden) handleRefresh(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [handleRefresh]);

  useEffect(() => {
    const hasError = ckError || jkError || ldError || wwError || unoError;
    if (!hasError) return;
    const onAuthReady = () => handleRefresh();
    window.addEventListener('vm:auth-ready', onAuthReady);
    return () => window.removeEventListener('vm:auth-ready', onAuthReady);
  }, [ckError, jkError, ldError, wwError, unoError, handleRefresh]);

  // ── Create/join handlers (behaviour preserved) ───────────────────────
  const handleCkCreate = () => ckCreate(playerName);
  const handleCkJoin = () => { if (ckJoinCode.trim()) { ckJoin(ckJoinCode.trim().toUpperCase(), playerName); setCkJoinCode(''); } };
  const handleJkCreate = () => jkCreate(playerName, { mode: jkMode, khishtiPenalty: jkKhishti });
  const handleJkJoin = () => { if (jkJoinCode.trim()) { jkJoin(jkJoinCode.trim().toUpperCase(), playerName); setJkJoinCode(''); } };
  const handleLdCreate = () => ldCreate(playerName, ldMaxPlayers);
  const handleLdJoin = () => { if (ldJoinCode.trim()) { ldJoin(ldJoinCode.trim().toUpperCase(), playerName); setLdJoinCode(''); } };
  const handleWwCreate = () => wwCreate(playerName);
  const handleWwJoin = () => { if (wwJoinCode.trim()) { wwJoin(wwJoinCode.trim().toUpperCase(), playerName); setWwJoinCode(''); } };
  const handleUnoCreate = () => unoCreate(playerName, unoMaxPlayers);
  const handleUnoJoin = () => { if (unoJoinCode.trim()) { unoJoin(unoJoinCode.trim().toUpperCase(), playerName); setUnoJoinCode(''); } };
  const handleBoCreate = () => boCreate(playerName, 8);
  const handleBoJoin = () => { if (boJoinCode.trim()) { boJoin(boJoinCode.trim().toUpperCase(), playerName); setBoJoinCode(''); } };
  const handleAlCreate = () => alCreate(playerName);
  const handleAlJoin = () => { if (alJoinCode.trim()) { alJoin(alJoinCode.trim().toUpperCase(), playerName); setAlJoinCode(''); } };
  const handlePkCreate = () => pkCreate({
    smallBlind: pkBlind, bigBlind: pkBlind * 2, buyIn: pkBlind * 200, maxSeats: pkSeats,
  });
  const handlePkJoin = () => { if (pkJoinCode.trim()) { pkJoin(pkJoinCode.trim().toUpperCase()); setPkJoinCode(''); } };
  const handleSpCreate = () => spCreate(playerName);
  const handleSpJoin = () => { if (spJoinCode.trim()) { spJoin(spJoinCode.trim().toUpperCase(), playerName); setSpJoinCode(''); } };
  const handleLiCreate = () => liCreate(playerName);
  const handleLiJoin = () => { if (liJoinCode.trim()) { liJoin(liJoinCode.trim().toUpperCase(), playerName); setLiJoinCode(''); } };
  const handleDrCreate = () => drCreate(playerName);
  const handleDrJoin = () => { if (drJoinCode.trim()) { drJoin(drJoinCode.trim().toUpperCase(), playerName); setDrJoinCode(''); } };
  const handleCnCreate = () => cnCreate(playerName);
  const handleCnJoin = () => { if (cnJoinCode.trim()) { cnJoin(cnJoinCode.trim().toUpperCase(), playerName); setCnJoinCode(''); } };

  // ── Launcher configs for match games ─────────────────────────────────
  const MATCH: Record<string, LauncherCfg> = {
    checkers: {
      accent: '#b06cff', onCreate: handleCkCreate, loading: ckLoading, joinCode: ckJoinCode, setJoinCode: setCkJoinCode,
      onJoin: handleCkJoin, codeMax: 7, codePh: 'CK-0000', list: ckList, error: ckError, clearError: ckClear,
      renderRow: (m, done) => <CheckersRow key={m.id} match={m} onJoin={code => { recordRecent('checkers'); ckJoin(code, playerName); done(); }} />,
    },
    ludo: {
      accent: '#22c55e', onCreate: handleLdCreate, loading: ldLoading, joinCode: ldJoinCode, setJoinCode: setLdJoinCode,
      onJoin: handleLdJoin, codeMax: 7, codePh: 'LD-0000', list: ldList, error: ldError, clearError: ldClear,
      renderRow: (m, done) => <LudoRow key={m.id} match={m} onJoin={code => { recordRecent('ludo'); ldJoin(code, playerName); done(); }} />,
      extra: <NumPicker label="Max" accent="#22c55e" values={[2, 3, 4]} value={ldMaxPlayers} onChange={n => setLdMaxPlayers(n as 2 | 3 | 4)} />,
    },
    joker: {
      accent: '#fbbf24', onCreate: handleJkCreate, loading: jkLoading, joinCode: jkJoinCode, setJoinCode: setJkJoinCode,
      onJoin: handleJkJoin, codeMax: 7, codePh: 'JK-0000', list: jkList, error: jkError, clearError: jkClear,
      renderRow: (m, done) => <JokerRow key={m.id} match={m} onJoin={code => { recordRecent('joker'); jkJoin(code, playerName); done(); }} />,
      extra: (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            {(['classic', 'nines_only'] as const).map(m => (
              <button key={m} onClick={() => setJkMode(m)} className="px-3 py-1 rounded-full font-mono text-[12px] tracking-wider transition-all"
                style={{ background: jkMode === m ? 'rgba(255,165,0,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${jkMode === m ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.08)'}`, color: jkMode === m ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>
                {m === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
              </button>
            ))}
          </div>
          {/* ხიშტი: what a broken word costs. The host decides, once. */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <span className="font-mono text-[11px] text-white/35">ხიშტი:</span>
            {[0, 100, 200, 500].map(v => (
              <button key={v} onClick={() => setJkKhishti(v)} className="px-2.5 py-1 rounded-full font-mono text-[11px] transition-all"
                style={{ background: jkKhishti === v ? 'rgba(255,165,0,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${jkKhishti === v ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.08)'}`, color: jkKhishti === v ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>
                {v === 0 ? '10/ხელი' : `−${v}`}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    uno: {
      accent: '#fb923c', onCreate: handleUnoCreate, loading: unoLoading, joinCode: unoJoinCode, setJoinCode: setUnoJoinCode,
      onJoin: handleUnoJoin, codeMax: 7, codePh: 'UN-0000', list: unoList, error: unoError, clearError: unoClear,
      renderRow: (m, done) => <UnoRow key={m.id} match={m} onJoin={code => { recordRecent('uno'); unoJoin(code, playerName); done(); }} onSpectate={code => { unoSpectate(code); done(); }} />,
      extra: <NumPicker label={t.games.uno.maxPlayers} accent="#fb923c" values={[2, 3, 4, 6, 8, 10]} value={unoMaxPlayers} onChange={setUnoMaxPlayers} />,
    },
    www: {
      accent: '#c084fc', onCreate: handleWwCreate, loading: wwLoading, joinCode: wwJoinCode, setJoinCode: setWwJoinCode,
      onJoin: handleWwJoin, codeMax: 6, codePh: 'XXXXXX', list: wwList, error: wwError, clearError: wwClear,
      renderRow: (m, done) => <WWWRow key={m.id} match={m} onJoin={code => { recordRecent('www'); wwJoin(code, playerName); done(); }} />,
    },
    blackout: {
      accent: '#ffd34d', onCreate: handleBoCreate, loading: boLoading, joinCode: boJoinCode, setJoinCode: setBoJoinCode,
      onJoin: handleBoJoin, codeMax: 6, codePh: 'XXXXXX', list: boList, error: boError, clearError: boClear,
      renderRow: (m, done) => <BlackoutRow key={m.id} match={m} onJoin={code => { recordRecent('blackout'); boJoin(code, playerName); done(); }} />,
    },
    poker: {
      accent: '#38bdf8', onCreate: handlePkCreate, loading: pkLoading, joinCode: pkJoinCode, setJoinCode: setPkJoinCode,
      onJoin: handlePkJoin, codeMax: 6, codePh: 'XXXXXX', list: pkList, error: pkError, clearError: pkClear,
      renderRow: (m, done) => <PokerRow key={m.id} table={m} onJoin={code => { recordRecent('poker'); pkJoin(code); done(); }} />,
      extra: (
        <div className="space-y-2">
          <NumPicker label="ბლაინდი" accent="#38bdf8" values={[5, 10, 25, 50]} value={pkBlind} onChange={n => setPkBlind(n)} />
          <NumPicker label="ადგილი" accent="#38bdf8" values={[6, 9, 10, 12]} value={pkSeats} onChange={n => setPkSeats(n)} />
        </div>
      ),
    },
    spyfall: {
      accent: '#ff5d6c', onCreate: handleSpCreate, loading: spLoading, joinCode: spJoinCode, setJoinCode: setSpJoinCode,
      onJoin: handleSpJoin, codeMax: 6, codePh: 'XXXXXX', list: spList, error: spError, clearError: spClear,
      renderRow: (m, done) => <SpyfallRow key={m.id} match={m} onJoin={code => { recordRecent('spyfall'); spJoin(code, playerName); done(); }} />,
    },
    lies: {
      accent: '#a855f7', onCreate: handleLiCreate, loading: liLoading, joinCode: liJoinCode, setJoinCode: setLiJoinCode,
      onJoin: handleLiJoin, codeMax: 6, codePh: 'XXXXXX', list: liList, error: liError, clearError: liClear,
      renderRow: (m, done) => <LiesRow key={m.id} match={m} onJoin={code => { recordRecent('lies'); liJoin(code, playerName); done(); }} />,
    },
    alias: {
      accent: '#4d9fff', onCreate: handleAlCreate, loading: alLoading, joinCode: alJoinCode, setJoinCode: setAlJoinCode,
      onJoin: handleAlJoin, codeMax: 6, codePh: 'XXXXXX', list: alList, error: alError, clearError: alClear,
      renderRow: (m, done) => <AliasRow key={m.id} match={m} onJoin={code => { recordRecent('alias'); alJoin(code, playerName); done(); }} />,
    },
    draw: {
      accent: '#ff8c26', onCreate: handleDrCreate, loading: drLoading, joinCode: drJoinCode, setJoinCode: setDrJoinCode,
      onJoin: handleDrJoin, codeMax: 6, codePh: 'XXXXXX', list: drList, error: drError, clearError: drClear,
      renderRow: (m, done) => <DrawRow key={m.id} match={m} onJoin={code => { recordRecent('draw'); drJoin(code, playerName); done(); }} />,
    },
    codenames: {
      accent: '#c084fc', onCreate: handleCnCreate, loading: cnLoading, joinCode: cnJoinCode, setJoinCode: setCnJoinCode,
      onJoin: handleCnJoin, codeMax: 6, codePh: 'XXXXXX', list: cnList, error: cnError, clearError: cnClear,
      renderRow: (m, done) => <CodenamesRow key={m.id} match={m} onJoin={code => { recordRecent('codenames'); cnJoin(code, playerName); done(); }} />,
    },
  };

  // ── Catalog ──────────────────────────────────────────────────────────
  const defs: GameDef[] = [
    { id: 'voidiq', title: 'VOID IQ', sub: 'გაზომე შენი გონება · ლიდერბორდი', kind: 'launch', accent: '#4fb8ff', logo: 'iq', badge: true, keywords: 'iq ინტელექტი ტესტი leaderboard', launch: () => setVoidIqOpen(true) },
    { id: 'www', title: t.games.www.title, sub: t.games.www.subtitle, kind: 'match', accent: '#c084fc', emoji: '🧠', keywords: 'www ვიქტორინა quiz რა სად როდის' },
    { id: 'dilemmas', title: 'დილემები', sub: `მორალური არჩევანი`, kind: 'launch', accent: '#7c9cff', emoji: '⚖️', badge: true, keywords: 'dilemma მორალი ეთიკა', launch: () => setDilemmasHubOpen(true) },
    { id: 'philosophy', title: 'ფილოსოფიური ცდები', sub: `აზროვნების ექსპერიმენტები`, kind: 'launch', accent: '#a88cff', logo: 'philosophy', emoji: '🌀', badge: true, keywords: 'philosophy ფილოსოფია ცდა thought experiment ცნობიერება', launch: () => setPhiloHubOpen(true) },
    { id: 'philotest', title: 'ფილოსოფიური პიროვნების ტესტი', sub: 'ვინ ხარ, როცა ირჩევ', kind: 'launch', accent: '#8b5cff', logo: 'sage', emoji: '🎭', badge: true, keywords: 'personality პიროვნება ტესტი ფილოსოფია არქეტიპი profile', launch: () => setPhiloTestOpen(true) },
    { id: 'aristocracy', title: t.games.aristocracy.title, sub: t.games.aristocracy.subtitle, kind: 'launch', accent: '#e8cf7a', emoji: '👑', keywords: 'aristocracy ტესტი quiz', launch: () => setAristocracyOpen(true) },

    { id: 'mars', title: 'M.A.R.S.', sub: 'ატვირთე ცნობიერება · ტერმინალი', kind: 'launch', accent: '#39ff6a', emoji: '🖥', badge: true, keywords: 'mars terminal matrix cyberpunk ცნობიერება ატვირთვა სიმულაცია ტერმინალი მატრიცა', launch: () => setMarsOpen(true) },

    { id: 'maxpuzzle', title: 'ბატონი მაქსის თავსატეხი', sub: 'კითხვები სწორი პასუხების გარეშე', kind: 'launch', accent: '#d9b45a', logo: 'maxseal', badge: true, keywords: 'max puzzle თავსატეხი დილემა ფსიქოლოგია პროფილი არქეტიპი mr max', launch: () => setMaxPuzzleOpen(true) },

    { id: 'poker', title: 'სოციალური პოკერი', sub: 'ტეხასური ჰოლდემი · უფასო ჩიპები · 2-12 მოთ.', kind: 'match', accent: '#38bdf8', emoji: '♠️', badge: true, keywords: 'poker პოკერი holdem ჰოლდემი texas ტეხასი კარტი social სოციალური' },
    { id: 'spyfall', title: 'ჯაშუში', sub: 'იპოვე ჯაშუში ხმით · 3-10 მოთ.', kind: 'match', accent: '#ff5d6c', emoji: '🕵️', badge: true, keywords: 'spyfall ჯაშუში დედუქცია' },
    { id: 'codenames', title: 'Codenames', sub: '2 გუნდი · მინიშნებები · 4-16 მოთ.', kind: 'match', accent: '#25c8f2', logo: 'codenames', emoji: '🔤', badge: true, keywords: 'codenames კოდი გუნდი' },
    { id: 'blackout', title: t.games.blackout.title, sub: t.games.blackout.subtitle, kind: 'match', accent: '#ffd34d', emoji: '🔦', badge: true, keywords: 'blackout impostor დედუქცია' },

    { id: 'lies', title: 'ტყუილების ოსტატი', sub: 'მოატყუე ან იპოვე სიმართლე · 3-12 მოთ.', kind: 'match', accent: '#a855f7', logo: 'liar', emoji: '🎭', badge: true, keywords: 'lies ტყუილი fibbage ბლეფი bluff სიმართლე' },
    { id: 'alias', title: 'ალიასი', sub: 'გუნდური სიტყვების თამაში · 4-12 მოთ.', kind: 'match', accent: '#4d9fff', emoji: '🗣', badge: true, keywords: 'alias სიტყვები taboo' },
    { id: 'draw', title: 'დახაზე & გამოიცანი', sub: 'ხატავ და გამოიცნობ · 2-12 მოთ.', kind: 'match', accent: '#ff8c26', emoji: '🎨', badge: true, keywords: 'draw ხატვა pictionary' },

    { id: 'checkers', title: t.games.checkers.title, sub: t.games.checkers.subtitle, kind: 'match', accent: '#b06cff', emoji: '♟', keywords: 'checkers დამკა' },
    { id: 'ludo', title: t.games.ludo.title, sub: t.games.ludo.subtitle, kind: 'match', accent: '#22c55e', emoji: '🎲', keywords: 'ludo ლუდო' },
    { id: 'joker', title: t.games.joker.title, sub: t.games.joker.subtitle, kind: 'match', accent: '#fbbf24', emoji: '🃏', keywords: 'joker ჯოკერი კარტი' },
    { id: 'uno', title: t.games.uno.title, sub: t.games.uno.subtitle, kind: 'match', accent: '#e3243b', logo: 'uno', emoji: '🃠', keywords: 'uno უნო კარტი' },

    { id: 'ganab', title: t.games.ganab.title, sub: t.games.ganab.subtitle, kind: 'launch', accent: '#d9a24a', logo: 'ganab', badge: true, keywords: 'ganab განაბ roguelike', launch: () => useSocialStore.getState().requestOpenGanab() },
  ];
  if (onOpenSpace) defs.push({ id: 'space', title: 'Virtual Space', sub: t.commB.spaceSub, kind: 'launch', accent: '#4a76c4', logo: 'vspace', emoji: '🌐', keywords: 'space virtual სივრცე vr', launch: onOpenSpace });
  if (onOpenBackrooms) defs.push({ id: 'backrooms', title: 'Backrooms', sub: t.commB.backroomsSub, kind: 'launch', accent: '#f5de80', emoji: '🟨', keywords: 'backrooms horror', launch: onOpenBackrooms });
  defs.push({ id: 'mergeevo', title: 'Merge Evolution', sub: 'გაზარდე ციფრული ორგანიზმი · ყუთები · შერწყმა', kind: 'launch', accent: '#4dd4c4', emoji: '🧬', badge: true, keywords: 'merge evolution ევოლუცია შერწყმა dna დნმ ორგანიზმი ყუთი chest idle კლიკერი განვითარება', launch: () => setMergeOpen(true) });
  defs.push({ id: 'logic', title: 'ფორმალური ლოგიკის აკადემია', sub: 'სილოგიზმები · არგუმენტაცია · Logic Rating', kind: 'launch', accent: '#F9C81C', logo: 'logic', emoji: '🧠', badge: true, keywords: 'logic ლოგიკა სილოგიზმი არგუმენტი დედუქცია აკადემია რეიტინგი formal ფორმალური მსჯელობა fallacy შეცდომა', launch: () => setLogicOpen(true) });
  defs.push({ id: 'noir', title: 'ნუარი', sub: 'ინტერაქტიული თავგადასავალი · შენ წყვეტ', kind: 'launch', accent: '#ff2d55', emoji: '🌃', badge: true, keywords: 'noir ნუარი თავგადასავალი ამბავი არჩევანი ისტორია adventure story choice მაფია დეტექტივი', launch: () => setNoirOpen(true) });
  defs.push({ id: 'sky', title: 'ცის რუკა', sub: 'მიმართე ცას · პლანეტები რეალურ პოზიციაზე', kind: 'launch', accent: '#7c9cff', emoji: '🔭', badge: true, keywords: 'sky ცა ვარსკვლავი პლანეტა სატურნი ტელესკოპი ასტრონომია star planet saturn telescope astronomy ღამე', launch: () => setSkyOpen(true) });
  defs.push({ id: 'watchparty', title: 'კინო სივრცე', sub: 'ერთად უყურეთ ვიდეოს · სინქრონში + ხმა', kind: 'launch', accent: '#ff5d5d', emoji: '🎬', badge: true, keywords: 'watch party კინო ფილმი youtube ვიდეო together სინქრონი co-watch cinema', launch: () => setWatchPartyOpen(true) });

  const byId = (id: string) => defs.find(d => d.id === id);
  // Every game reachable from the hub, in the order the sections declare. An
  // id in SECTIONS with no matching entry here is simply skipped, so a game
  // that is conditional on a prop (Backrooms, Virtual Space) can be listed
  // unconditionally above.
  const sectionGames = (sec: SectionDef) => sec.ids.map(byId).filter(Boolean) as GameDef[];

  const q = query.trim().toLowerCase();
  const matchesQ = (d: GameDef) => !q || d.title.toLowerCase().includes(q) || d.keywords.toLowerCase().includes(q) || d.sub.toLowerCase().includes(q);
  const liveCount = (d: GameDef) => d.kind === 'match' ? (MATCH[d.id]?.list.length ?? 0) : 0;

  const openGame = (d: GameDef) => {
    recordRecent(d.id);
    if (d.kind === 'launch') d.launch?.();
    else setSheet(d.id);
  };

  const Tile = ({ d }: { d: GameDef }) => {
    const live = liveCount(d);
    return (
      <button onClick={() => openGame(d)}
        className="relative flex flex-col justify-between rounded-2xl p-3 text-left overflow-hidden transition-all active:scale-[0.97]"
        style={{ minHeight: 118, background: 'rgba(12,10,24,0.72)', border: `1px solid ${d.accent}40`, boxShadow: `0 4px 18px ${d.accent}12` }}>
        {NEW_GAMES.has(d.id) && <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'monospace', fontSize: 8, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 6, padding: '2px 6px' }}>NEW</span>}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2" style={{ background: `${d.accent}1f` }}>
          <GameArt d={d} size={34} />
        </div>
        <div className="min-w-0">
          {/* Two lines, not truncate: Georgian sets wider than Latin, so real
              titles like "ფილოსოფიური ცნობიერება" lost their second half. */}
          <p className="font-display font-bold text-white text-[13px] leading-tight"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.title}</p>
          <p className="font-mono text-[10px] text-white/35 leading-tight mt-0.5 truncate">{d.sub}</p>
          {live > 0 && <p className="font-mono text-[9px] mt-1" style={{ color: '#7fe0a0' }}>🔴 {live} ღია</p>}
        </div>
      </button>
    );
  };

  const Grid = ({ items }: { items: GameDef[] }) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">{items.map(d => <Tile key={d.id} d={d} />)}</div>
  );

  return (
    <div className="space-y-4">

      {/* ── The newest thing ──────────────────────────────────────────────
          ცის რუკა shipped into სივრცეები, which is the third section and
          closed until you open it, below twelve tiles. That is a fine place
          for the fifth-most-used thing on the page and no place at all for
          something nobody has seen yet. When it stops being new, delete this
          block; the tile in its section is still there. */}
      {!q && (
        <button
          onClick={() => { haptic('selection'); setSkyOpen(true); }}
          className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all active:scale-[0.99] relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #16213f 0%, #221a3e 55%, #12101f 100%)',
            border: '1px solid rgba(124,156,255,0.42)',
            boxShadow: '0 6px 26px rgba(80,110,220,0.18)',
          }}
        >
          <span className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(120% 140% at 88% 0%, rgba(160,190,255,0.20), transparent 60%)' }} />
          <span className="relative flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(124,156,255,0.16)', border: '1px solid rgba(124,156,255,0.34)', fontSize: 24 }}>
            🔭
          </span>
          <span className="relative flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-display font-black text-white text-[15px] leading-tight">ცის რუკა</span>
              <span className="font-mono text-[8px] tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(124,156,255,0.9)', color: '#0b1020' }}>ახალი</span>
            </span>
            <span className="block font-mono text-[10.5px] text-white/45 mt-1 leading-snug">
              მიმართე ტელეფონი ცას · პლანეტები და ვარსკვლავები რეალურ პოზიციაზე
            </span>
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="relative flex-shrink-0 text-white/25"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}

      {/* Search + refresh */}
      <div className="flex gap-2 items-center">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="text-white/30 text-sm">🔍</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="მოძებნე თამაში…"
            className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/25 outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-white/40 text-sm">✕</button>}
        </div>
        <button onClick={handleRefresh} title="Refresh"
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl font-mono text-sm transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>↻</button>
      </div>

      {/* Recently played */}
      {!q && recent.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 mb-2">🕹 ბოლოს ნათამაშები</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {recent.map(id => byId(id)).filter(Boolean).map(d => (
              <button key={d!.id} onClick={() => openGame(d!)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[68px]" >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${d!.accent}1f`, border: `1px solid ${d!.accent}40` }}>
                  <GameArt d={d!} size={38} />
                </div>
                <span className="font-mono text-[9px] text-white/50 text-center leading-tight truncate w-full">{d!.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Searching cuts across every section — the point of a search box is not
          to care which drawer a thing lives in. */}
      {q ? (
        (() => {
          const items = defs.filter(matchesQ);
          return items.length
            ? <Grid items={items} />
            : <p className="text-center font-mono text-[12px] text-white/30 py-10">ვერაფერი მოიძებნა „{query}"</p>;
        })()
      ) : (
        <div className="space-y-3">
          {/* გართობა and გონება side by side, as headers you tap; სივრცეები is
              the short one and sits full width beneath them. */}
          <div className="grid grid-cols-2 gap-2.5">
            {SECTIONS.filter(sec => sec.id !== 'spaces').map(sec => (
              <SectionHeader
                key={sec.id}
                sec={sec}
                count={sectionGames(sec).length}
                open={openSection === sec.id}
                onToggle={() => setOpenSection(openSection === sec.id ? null : sec.id)}
              />
            ))}
          </div>
          {SECTIONS.filter(sec => sec.id !== 'spaces').map(sec => (
            openSection === sec.id ? <Grid key={sec.id} items={sectionGames(sec)} /> : null
          ))}

          {SECTIONS.filter(sec => sec.id === 'spaces').map(sec => (
            <div key={sec.id} className="space-y-3">
              <SectionHeader
                sec={sec}
                count={sectionGames(sec).length}
                open={openSection === sec.id}
                onToggle={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                wide
              />
              {openSection === sec.id && <Grid items={sectionGames(sec)} />}
            </div>
          ))}
        </div>
      )}

      {/* ── Centered launcher modal for match games ───────────────────── */}
      {/* Portaled to <body>: an ancestor transform would otherwise re-anchor
          the fixed overlay to the page (forcing the user to scroll to it). */}
      {createPortal(
      <AnimatePresence>
        {sheet && MATCH[sheet] && (
          <motion.div className="fixed inset-0 z-[520] flex items-center justify-center px-4 py-6 overflow-y-auto" style={{ background: 'rgba(4,4,10,0.72)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)}
            onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            <motion.div className="w-full max-w-lg rounded-3xl p-5 my-auto max-h-[calc(100vh-48px)] overflow-y-auto" onClick={e => e.stopPropagation()}
              initial={{ y: 24, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.96, opacity: 0 }}
              style={{ background: 'rgba(12,10,24,0.99)', border: `1px solid ${MATCH[sheet].accent}55`, boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${MATCH[sheet].accent}18` }}>
              {(() => {
                const d = byId(sheet)!; const cfg = MATCH[sheet];
                return (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: `${cfg.accent}1f` }}>
                        {d.logo === 'mafianight' ? <img src="/mafia-night.webp" alt="" className="w-11 h-11 object-contain" /> : d.logo === 'logic' ? <LogicLogo size={42} label={false} /> : <span className="text-2xl">{d.emoji}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-white text-base leading-tight">{d.title}</p>
                        <p className="font-mono text-[11px] text-white/40 truncate">{d.sub}</p>
                      </div>
                      <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
                    </div>
                    <MatchLauncher cfg={cfg} onDone={() => setSheet(null)} onRecord={() => recordRecent(sheet)} />
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}

      {/* Overlays */}
      {voidIqOpen && <Suspense fallback={null}><VoidIQHub onClose={() => setVoidIqOpen(false)} /></Suspense>}
      {maxPuzzleOpen && <Suspense fallback={null}><MaxPuzzleExperience onClose={() => setMaxPuzzleOpen(false)} /></Suspense>}
      {dilemmasHubOpen && <Suspense fallback={null}><DilemmasHub onClose={() => setDilemmasHubOpen(false)} /></Suspense>}
      {philoHubOpen && <Suspense fallback={null}><PhilosophyHub onClose={() => setPhiloHubOpen(false)} /></Suspense>}
      {philoTestOpen && <Suspense fallback={null}><PhiloTestExperience onClose={() => setPhiloTestOpen(false)} /></Suspense>}
      {watchPartyOpen && <Suspense fallback={null}><WatchPartyLauncher onClose={() => setWatchPartyOpen(false)} /></Suspense>}
      {logicOpen && <Suspense fallback={null}><LogicAcademy onClose={() => setLogicOpen(false)} /></Suspense>}
      {noirOpen && <Suspense fallback={null}><NoirAdventure onClose={() => setNoirOpen(false)} /></Suspense>}
      {marsOpen && <Suspense fallback={null}><MarsTerminal onClose={() => setMarsOpen(false)} /></Suspense>}
      {skyOpen && <Suspense fallback={null}><SkyMap onClose={() => setSkyOpen(false)} /></Suspense>}
      {mergeOpen && <Suspense fallback={null}><MergeEvolution onClose={() => setMergeOpen(false)} /></Suspense>}
      {aristocracyOpen && <Suspense fallback={null}><AristocracyTest onClose={() => setAristocracyOpen(false)} /></Suspense>}
    </div>
  );
}

/**
 * A section header that is also its own switch.
 *
 * The lit edge and the chevron both turn with the open state, so the thing you
 * pressed visibly is the thing that opened — with two of these side by side and
 * one grid appearing below them, that feedback is the only way to tell which
 * one you are looking at.
 */
function SectionHeader({ sec, count, open, onToggle, wide }: {
  sec: SectionDef; count: number; open: boolean; onToggle: () => void; wide?: boolean;
}) {
  return (
    <button
      onClick={() => { haptic('selection'); onToggle(); }}
      className={`w-full flex items-center rounded-2xl transition-all active:scale-[0.98] ${wide ? 'gap-3 px-3.5 py-2.5' : 'gap-2.5 px-3 py-3'}`}
      style={{
        background: open
          ? `linear-gradient(150deg, ${sec.accent}22, rgba(255,255,255,0.02))`
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${open ? `${sec.accent}66` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: open ? `0 6px 20px ${sec.accent}1f` : 'none',
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: wide ? 30 : 34, height: wide ? 30 : 34, fontSize: wide ? 15 : 17,
          background: `${sec.accent}${open ? '26' : '14'}`,
          border: `1px solid ${sec.accent}${open ? '4d' : '26'}`,
        }}
      >{sec.emoji}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-display font-bold leading-tight truncate"
          style={{ fontSize: wide ? 13.5 : 14, color: open ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)' }}>
          {sec.title}
        </span>
        <span className="block font-mono text-[10px] leading-none mt-1"
          style={{ color: open ? `${sec.accent}cc` : 'rgba(255,255,255,0.25)' }}>
          {count} თამაში
        </span>
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        className="flex-shrink-0"
        style={{
          color: open ? sec.accent : 'rgba(255,255,255,0.25)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 180ms ease, color 180ms ease',
        }}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
interface LauncherCfg {
  accent: string;
  onCreate: () => void;
  loading: boolean;
  joinCode: string;
  setJoinCode: (v: string) => void;
  onJoin: () => void;
  codeMax: number;
  codePh: string;
  list: any[];
  error: any;
  clearError: () => void;
  /** `done` closes the launcher — a row that takes you into a game must call it. */
  renderRow: (m: any, done: () => void) => JSX.Element;
  extra?: JSX.Element;
}

function MatchLauncher({ cfg, onDone, onRecord }: { cfg: LauncherCfg; onDone: () => void; onRecord: () => void }) {
  const create = () => { onRecord(); cfg.onCreate(); onDone(); };
  const join = () => { if (!cfg.joinCode.trim()) return; onRecord(); cfg.onJoin(); onDone(); };
  return (
    <div className="space-y-3">
      {cfg.extra}
      <button onClick={create} disabled={cfg.loading}
        className="w-full py-3 rounded-2xl font-display font-bold text-white text-sm disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${cfg.accent}, #5e5ce6)` }}>
        {cfg.loading ? '…' : '＋ შექმნა'}
      </button>
      <div className="flex gap-2">
        <input value={cfg.joinCode} onChange={e => cfg.setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') join(); }}
          placeholder={cfg.codePh} maxLength={cfg.codeMax}
          className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2.5 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest" />
        <button onClick={join} disabled={!cfg.joinCode.trim() || cfg.loading}
          className="px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
          style={{ background: `${cfg.accent}22`, border: `1px solid ${cfg.accent}66`, color: cfg.accent }}>
          შეუერთდი
        </button>
      </div>
      {cfg.error && <p className="font-mono text-[12px] text-neon-red" onClick={cfg.clearError}>{cfg.error}</p>}
      {cfg.list.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto pt-1">
          <p className="font-mono text-[11px] uppercase tracking-widest text-white/25">ღია თამაშები</p>
          {cfg.list.map((m: any) => cfg.renderRow(m, onDone))}
        </div>
      )}
    </div>
  );
}

/**
 * One game's artwork: dedicated logo component, bundled image, or emoji.
 *
 * Extracted because this exact switch was pasted twice at different sizes — the
 * grid tile and the recently-played rail — so adding a logo meant remembering
 * both. Sizes that need to run slightly larger to look optically equal (square
 * emblems next to round ones) offset from the caller's size here.
 */
function GameArt({ d, size }: { d: GameDef; size: number }) {
  switch (d.logo) {
    case 'iq':         return <IQLogo size={size} />;
    case 'logic':      return <LogicLogo size={size} label={false} />;
    case 'vspace':     return <VRBustIcon size={size + 2} />;
    case 'philosophy': return <PhilosopherIcon size={size} />;
    case 'uno':        return <UnoLogo size={size + 2} />;
    case 'codenames':  return <NinjaEmblem size={size + 2} />;
    case 'sage':       return <SageIcon size={size + 2} />;
    case 'maxseal':    return <MaxSeal size={size} />;
    case 'liar':       return <CrossedFingersIcon size={size} mask="#181026" />;
    case 'mafianight': return <img src="/mafia-night.webp" alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
    case 'ganab':      return <img src="/ganab-star.png" alt="" style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }} />;
    default:           return <span style={{ fontSize: Math.round(size * 0.68), lineHeight: 1 }}>{d.emoji}</span>;
  }
}

/**
 * NEW means "added recently", not "we are proud of it". 18 of the 27 games
 * carried the badge, which is the same as none of them carrying it. Keep this
 * list short and prune it as things stop being new.
 */
const NEW_GAMES = new Set(['noir', 'mergeevo', 'logic', 'poker']);

function NumPicker({ label, values, value, onChange, accent }: { label: string; values: number[]; value: number; onChange: (n: number) => void; accent: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[12px] text-white/30 uppercase tracking-wider">{label}:</span>
      {values.map(n => (
        <button key={n} onClick={() => onChange(n)} className="px-2.5 py-0.5 rounded-full font-mono text-[12px] transition-all"
          style={{ background: value === n ? `${accent}33` : 'rgba(255,255,255,0.03)', border: `1px solid ${value === n ? accent : 'rgba(255,255,255,0.08)'}`, color: value === n ? accent : 'rgba(255,255,255,0.35)' }}>
          {n}
        </button>
      ))}
    </div>
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
          {match.status === 'waiting' && <span className="font-mono text-[12px] text-white/20">{t.games.ludo.waiting}</span>}
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

/**
 * A poker table in the lobby list.
 *
 * Shows the blinds and how full it is — never a chip count and never a "prize".
 * A lobby row is where a social product either reads as social or does not.
 */
function PokerRow({ table, onJoin }: { table: any; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{table.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{table.code}</span>
          <span className="font-mono text-[12px] text-white/20">{table.seated}/{table.maxSeats}</span>
          <span className="font-mono text-[12px] text-white/20">{table.smallBlind}/{table.bigBlind}</span>
        </div>
      </div>
      <button onClick={() => onJoin(table.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#38bdf8' }}>
        შესვლა
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

function LiesRow({ match, onJoin }: { match: LiesListItem; onJoin: (code: string) => void }) {
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
        style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}>
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
        <p className="font-mono text-xs text-white truncate">{match.hostNickname}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount} {t.commB.plAbbr}</span>
          <span className="font-mono text-[12px] text-white/20">{match.questionsCount} {t.commB.qAbbr}</span>
        </div>
      </div>
      {isWaiting ? (
        <button onClick={() => onJoin(match.code)}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
          {t.games.www.join}
        </button>
      ) : (
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
          {match.status === 'waiting' && <span className="font-mono text-[12px] text-white/20">{t.games.uno.waitingForPlayers}</span>}
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
  const isActive = ['declaration', 'playing', 'round_end'].includes(match.status);
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.playerNames.join(', ') || '—'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.playerCount}/4</span>
          <span className="font-mono text-[12px] text-white/20">{match.mode === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}</span>
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

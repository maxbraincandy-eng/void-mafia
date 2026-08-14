import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

const NeoBandicoot = lazy(() => import('@/components/platformer/NeoBandicoot').then(m => ({ default: m.NeoBandicoot })));
const AristocracyTest = lazy(() => import('@/components/quiz/AristocracyTest').then(m => ({ default: m.AristocracyTest })));
const DilemmasHub = lazy(() => import('@/components/dilemmas/DilemmasHub').then(m => ({ default: m.DilemmasHub })));
const PhilosophyHub = lazy(() => import('@/components/philosophy/PhilosophyHub').then(m => ({ default: m.PhilosophyHub })));
const PhiloTestExperience = lazy(() => import('@/components/philotest/PhiloTestExperience').then(m => ({ default: m.PhiloTestExperience })));
const VoidIQHub = lazy(() => import('@/components/iq/VoidIQHub').then(m => ({ default: m.VoidIQHub })));
const WatchPartyLauncher = lazy(() => import('@/components/watchparty/WatchPartyLauncher').then(m => ({ default: m.WatchPartyLauncher })));
const DeathrunGame = lazy(() => import('@/components/deathrun/DeathrunGame'));
const LogicAcademy = lazy(() => import('@/components/logic/LogicAcademy').then(m => ({ default: m.LogicAcademy })));
const MergeEvolution = lazy(() => import('@/components/merge/MergeEvolution').then(m => ({ default: m.MergeEvolution })));
const MaxPuzzleExperience = lazy(() => import('@/components/maxpuzzle/MaxPuzzleExperience').then(m => ({ default: m.MaxPuzzleExperience })));
const NoirAdventure = lazy(() => import('@/components/noir/NoirAdventure').then(m => ({ default: m.NoirAdventure })));
import { IQLogo } from '@/components/iq/IQLogo';
import { LogicLogo } from '@/components/logic/LogicLogo';
import { EvolutionCore } from '@/components/merge/art';
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
import type { SpyfallListItem } from '@/types/spyfall';
import { useLiesStore } from '@/store/liesStore';
import type { LiesListItem } from '@/types/lies';
import { useSxvaMafiaStore } from '@/store/sxvaMafiaStore';
import type { XmListItem } from '@/types/sxvaMafia';
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

const RED_XM = '#ff3b47'; // სხვა მაფია accent

// ── Categories ───────────────────────────────────────────────────────────────
type GCat = 'mind' | 'logic' | 'maxpuzzle' | 'deduction' | 'party' | 'classic' | 'bhop' | 'worlds' | 'solo';
const CAT_ORDER: GCat[] = ['logic', 'mind', 'maxpuzzle', 'deduction', 'party', 'classic', 'bhop', 'worlds', 'solo'];
const CAT_META: Record<GCat, { section: string; chip: string; emoji: string }> = {
  // `section` is a CATEGORY name, not a game name — two of these used to repeat
  // the title of their single game. Icons must also be distinct: logic and mind
  // both showed 🧠, so the two chips were indistinguishable at a glance.
  mind:      { section: 'გონება & ცოდნა',      chip: 'ინტელექტი', emoji: '🧠' },
  logic:     { section: 'ლოგიკა & მსჯელობა',   chip: 'ლოგიკა',    emoji: '🧩' },
  maxpuzzle: { section: 'ბატონი მაქსი',        chip: 'ბ. მაქსი',  emoji: '🎩' },
  deduction: { section: 'სოციალური დედუქცია', chip: 'დედუქცია',  emoji: '🕵️' },
  party:     { section: 'წვეულება & გუნდური', chip: 'წვეულება',  emoji: '🎉' },
  classic:   { section: 'კლასიკა',            chip: 'კლასიკა',   emoji: '♟' },
  bhop:      { section: 'ბჰოპი & დეთრანი',     chip: 'ბჰოპი',     emoji: '🏃' },
  worlds:    { section: 'სამყაროები',          chip: 'სამყაროები', emoji: '🌐' },
  solo:      { section: 'სოლო',               chip: 'სოლო',      emoji: '🎮' },
};

interface GameDef {
  id: string;
  title: string;
  sub: string;
  cat: GCat;
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

export function GamesTab({ onOpenSpace, onOpenBackrooms, onOpenPremium }: { onOpenSpace?: () => void; onOpenBackrooms?: () => void; onOpenPremium?: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';
  const [bandicootOpen, setBandicootOpen] = useState(false);
  const [aristocracyOpen, setAristocracyOpen] = useState(false);
  const [dilemmasHubOpen, setDilemmasHubOpen] = useState(false);
  const [philoHubOpen, setPhiloHubOpen] = useState(false);
  const [philoTestOpen, setPhiloTestOpen] = useState(false);
  const [voidIqOpen, setVoidIqOpen] = useState(false);
  const [maxPuzzleOpen, setMaxPuzzleOpen] = useState(false);
  const [watchPartyOpen, setWatchPartyOpen] = useState(false);
  const [deathrunOpen, setDeathrunOpen] = useState(false);
  const [logicOpen, setLogicOpen] = useState(false);
  const [noirOpen, setNoirOpen] = useState(false);
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

  // ── სხვა მაფია (Other Mafia) ─────────────────────────────────────────
  const {
    matchList: xmList, isLoading: xmLoading, error: xmError,
    fetchList: xmFetch, createMatch: xmCreate, joinMatch: xmJoin, clearError: xmClear,
  } = useSxvaMafiaStore();
  const [xmJoinCode, setXmJoinCode] = useState('');

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
  const [cat, setCat] = useState<'all' | GCat>('all');
  const [sheet, setSheet] = useState<string | null>(null); // open match-game launcher
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const recordRecent = useCallback((id: string) => setRecent(pushRecent(id)), []);

  const handleRefresh = useCallback(() => {
    ckClear(); jkClear(); ldClear(); wwClear(); unoClear(); boClear(); alClear(); drClear(); cnClear(); spClear(); liClear(); xmClear();
    ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); liFetch(); xmFetch();
  }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, liFetch, xmFetch, ckClear, jkClear, ldClear, wwClear, unoClear, boClear, alClear, drClear, cnClear, spClear, liClear, xmClear]);

  useEffect(() => { ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); liFetch(); xmFetch(); }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, liFetch, xmFetch]);

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
  const handleJkCreate = () => jkCreate(playerName, { mode: jkMode });
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
  const handleSpCreate = () => spCreate(playerName);
  const handleSpJoin = () => { if (spJoinCode.trim()) { spJoin(spJoinCode.trim().toUpperCase(), playerName); setSpJoinCode(''); } };
  const handleLiCreate = () => liCreate(playerName);
  const handleLiJoin = () => { if (liJoinCode.trim()) { liJoin(liJoinCode.trim().toUpperCase(), playerName); setLiJoinCode(''); } };
  const handleXmCreate = () => xmCreate(playerName);
  const handleXmJoin = () => { if (xmJoinCode.trim()) { xmJoin(xmJoinCode.trim().toUpperCase(), playerName); setXmJoinCode(''); } };
  const handleDrCreate = () => drCreate(playerName);
  const handleDrJoin = () => { if (drJoinCode.trim()) { drJoin(drJoinCode.trim().toUpperCase(), playerName); setDrJoinCode(''); } };
  const handleCnCreate = () => cnCreate(playerName);
  const handleCnJoin = () => { if (cnJoinCode.trim()) { cnJoin(cnJoinCode.trim().toUpperCase(), playerName); setCnJoinCode(''); } };

  // ── Launcher configs for match games ─────────────────────────────────
  const MATCH: Record<string, LauncherCfg> = {
    checkers: {
      accent: '#b06cff', onCreate: handleCkCreate, loading: ckLoading, joinCode: ckJoinCode, setJoinCode: setCkJoinCode,
      onJoin: handleCkJoin, codeMax: 7, codePh: 'CK-0000', list: ckList, error: ckError, clearError: ckClear,
      renderRow: m => <CheckersRow key={m.id} match={m} onJoin={code => { recordRecent('checkers'); ckJoin(code, playerName); }} />,
    },
    ludo: {
      accent: '#22c55e', onCreate: handleLdCreate, loading: ldLoading, joinCode: ldJoinCode, setJoinCode: setLdJoinCode,
      onJoin: handleLdJoin, codeMax: 7, codePh: 'LD-0000', list: ldList, error: ldError, clearError: ldClear,
      renderRow: m => <LudoRow key={m.id} match={m} onJoin={code => { recordRecent('ludo'); ldJoin(code, playerName); }} />,
      extra: <NumPicker label="Max" accent="#22c55e" values={[2, 3, 4]} value={ldMaxPlayers} onChange={n => setLdMaxPlayers(n as 2 | 3 | 4)} />,
    },
    joker: {
      accent: '#fbbf24', onCreate: handleJkCreate, loading: jkLoading, joinCode: jkJoinCode, setJoinCode: setJkJoinCode,
      onJoin: handleJkJoin, codeMax: 7, codePh: 'JK-0000', list: jkList, error: jkError, clearError: jkClear,
      renderRow: m => <JokerRow key={m.id} match={m} onJoin={code => { recordRecent('joker'); jkJoin(code, playerName); }} />,
      extra: (
        <div className="flex gap-2">
          {(['classic', 'nines_only'] as const).map(m => (
            <button key={m} onClick={() => setJkMode(m)} className="px-3 py-1 rounded-full font-mono text-[12px] uppercase tracking-wider transition-all"
              style={{ background: jkMode === m ? 'rgba(255,165,0,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${jkMode === m ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.08)'}`, color: jkMode === m ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>
              {m === 'classic' ? t.games.joker.modeClassic : t.games.joker.modeNines}
            </button>
          ))}
        </div>
      ),
    },
    uno: {
      accent: '#fb923c', onCreate: handleUnoCreate, loading: unoLoading, joinCode: unoJoinCode, setJoinCode: setUnoJoinCode,
      onJoin: handleUnoJoin, codeMax: 7, codePh: 'UN-0000', list: unoList, error: unoError, clearError: unoClear,
      renderRow: m => <UnoRow key={m.id} match={m} onJoin={code => { recordRecent('uno'); unoJoin(code, playerName); }} onSpectate={code => unoSpectate(code)} />,
      extra: <NumPicker label={t.games.uno.maxPlayers} accent="#fb923c" values={[2, 3, 4, 6, 8, 10]} value={unoMaxPlayers} onChange={setUnoMaxPlayers} />,
    },
    www: {
      accent: '#c084fc', onCreate: handleWwCreate, loading: wwLoading, joinCode: wwJoinCode, setJoinCode: setWwJoinCode,
      onJoin: handleWwJoin, codeMax: 6, codePh: 'XXXXXX', list: wwList, error: wwError, clearError: wwClear,
      renderRow: m => <WWWRow key={m.id} match={m} onJoin={code => { recordRecent('www'); wwJoin(code, playerName); }} />,
    },
    blackout: {
      accent: '#ffd34d', onCreate: handleBoCreate, loading: boLoading, joinCode: boJoinCode, setJoinCode: setBoJoinCode,
      onJoin: handleBoJoin, codeMax: 6, codePh: 'XXXXXX', list: boList, error: boError, clearError: boClear,
      renderRow: m => <BlackoutRow key={m.id} match={m} onJoin={code => { recordRecent('blackout'); boJoin(code, playerName); }} />,
    },
    spyfall: {
      accent: '#ff5d6c', onCreate: handleSpCreate, loading: spLoading, joinCode: spJoinCode, setJoinCode: setSpJoinCode,
      onJoin: handleSpJoin, codeMax: 6, codePh: 'XXXXXX', list: spList, error: spError, clearError: spClear,
      renderRow: m => <SpyfallRow key={m.id} match={m} onJoin={code => { recordRecent('spyfall'); spJoin(code, playerName); }} />,
    },
    lies: {
      accent: '#a855f7', onCreate: handleLiCreate, loading: liLoading, joinCode: liJoinCode, setJoinCode: setLiJoinCode,
      onJoin: handleLiJoin, codeMax: 6, codePh: 'XXXXXX', list: liList, error: liError, clearError: liClear,
      renderRow: m => <LiesRow key={m.id} match={m} onJoin={code => { recordRecent('lies'); liJoin(code, playerName); }} />,
    },
    othermafia: {
      accent: RED_XM, onCreate: handleXmCreate, loading: xmLoading, joinCode: xmJoinCode, setJoinCode: setXmJoinCode,
      onJoin: handleXmJoin, codeMax: 6, codePh: 'XXXXXX', list: xmList, error: xmError, clearError: xmClear,
      renderRow: m => <XmRow key={m.id} match={m} onJoin={code => { recordRecent('othermafia'); xmJoin(code, playerName); }} />,
    },
    alias: {
      accent: '#4d9fff', onCreate: handleAlCreate, loading: alLoading, joinCode: alJoinCode, setJoinCode: setAlJoinCode,
      onJoin: handleAlJoin, codeMax: 6, codePh: 'XXXXXX', list: alList, error: alError, clearError: alClear,
      renderRow: m => <AliasRow key={m.id} match={m} onJoin={code => { recordRecent('alias'); alJoin(code, playerName); }} />,
    },
    draw: {
      accent: '#ff8c26', onCreate: handleDrCreate, loading: drLoading, joinCode: drJoinCode, setJoinCode: setDrJoinCode,
      onJoin: handleDrJoin, codeMax: 6, codePh: 'XXXXXX', list: drList, error: drError, clearError: drClear,
      renderRow: m => <DrawRow key={m.id} match={m} onJoin={code => { recordRecent('draw'); drJoin(code, playerName); }} />,
    },
    codenames: {
      accent: '#c084fc', onCreate: handleCnCreate, loading: cnLoading, joinCode: cnJoinCode, setJoinCode: setCnJoinCode,
      onJoin: handleCnJoin, codeMax: 6, codePh: 'XXXXXX', list: cnList, error: cnError, clearError: cnClear,
      renderRow: m => <CodenamesRow key={m.id} match={m} onJoin={code => { recordRecent('codenames'); cnJoin(code, playerName); }} />,
    },
  };

  // ── Catalog ──────────────────────────────────────────────────────────
  const defs: GameDef[] = [
    { id: 'voidiq', title: 'VOID IQ', sub: 'გაზომე შენი გონება · ლიდერბორდი', cat: 'mind', kind: 'launch', accent: '#4fb8ff', logo: 'iq', badge: true, keywords: 'iq ინტელექტი ტესტი leaderboard', launch: () => setVoidIqOpen(true) },
    { id: 'www', title: t.games.www.title, sub: t.games.www.subtitle, cat: 'mind', kind: 'match', accent: '#c084fc', emoji: '🧠', keywords: 'www ვიქტორინა quiz რა სად როდის' },
    { id: 'dilemmas', title: 'დილემები', sub: `მორალური არჩევანი`, cat: 'mind', kind: 'launch', accent: '#7c9cff', emoji: '⚖️', badge: true, keywords: 'dilemma მორალი ეთიკა', launch: () => setDilemmasHubOpen(true) },
    { id: 'philosophy', title: 'ფილოსოფიური ცდები', sub: `აზროვნების ექსპერიმენტები`, cat: 'mind', kind: 'launch', accent: '#a88cff', logo: 'philosophy', emoji: '🌀', badge: true, keywords: 'philosophy ფილოსოფია ცდა thought experiment ცნობიერება', launch: () => setPhiloHubOpen(true) },
    { id: 'philotest', title: 'ფილოსოფიური პიროვნების ტესტი', sub: 'ვინ ხარ, როცა ირჩევ', cat: 'mind', kind: 'launch', accent: '#8b5cff', logo: 'sage', emoji: '🎭', badge: true, keywords: 'personality პიროვნება ტესტი ფილოსოფია არქეტიპი profile', launch: () => setPhiloTestOpen(true) },
    { id: 'aristocracy', title: t.games.aristocracy.title, sub: t.games.aristocracy.subtitle, cat: 'mind', kind: 'launch', accent: '#e8cf7a', emoji: '👑', keywords: 'aristocracy ტესტი quiz', launch: () => setAristocracyOpen(true) },

    { id: 'maxpuzzle', title: 'ბატონი მაქსის თავსატეხი', sub: 'კითხვები სწორი პასუხების გარეშე', cat: 'maxpuzzle', kind: 'launch', accent: '#d9b45a', logo: 'maxseal', badge: true, keywords: 'max puzzle თავსატეხი დილემა ფსიქოლოგია პროფილი არქეტიპი mr max', launch: () => setMaxPuzzleOpen(true) },

    { id: 'spyfall', title: 'ჯაშუში', sub: 'იპოვე ჯაშუში ხმით · 3-10 მოთ.', cat: 'deduction', kind: 'match', accent: '#ff5d6c', emoji: '🕵️', badge: true, keywords: 'spyfall ჯაშუში დედუქცია' },
    { id: 'codenames', title: 'Codenames', sub: '2 გუნდი · მინიშნებები · 4-16 მოთ.', cat: 'deduction', kind: 'match', accent: '#25c8f2', logo: 'codenames', emoji: '🔤', badge: true, keywords: 'codenames კოდი გუნდი' },
    { id: 'blackout', title: t.games.blackout.title, sub: t.games.blackout.subtitle, cat: 'solo', kind: 'match', accent: '#ffd34d', emoji: '🔦', badge: true, keywords: 'blackout impostor დედუქცია' },

    { id: 'lies', title: 'ტყუილების ოსტატი', sub: 'მოატყუე ან იპოვე სიმართლე · 3-12 მოთ.', cat: 'party', kind: 'match', accent: '#a855f7', logo: 'liar', emoji: '🎭', badge: true, keywords: 'lies ტყუილი fibbage ბლეფი bluff სიმართლე' },
    { id: 'alias', title: 'ალიასი', sub: 'გუნდური სიტყვების თამაში · 4-12 მოთ.', cat: 'party', kind: 'match', accent: '#4d9fff', emoji: '🗣', badge: true, keywords: 'alias სიტყვები taboo' },
    { id: 'draw', title: 'დახაზე & გამოიცანი', sub: 'ხატავ და გამოიცნობ · 2-12 მოთ.', cat: 'party', kind: 'match', accent: '#ff8c26', emoji: '🎨', badge: true, keywords: 'draw ხატვა pictionary' },

    { id: 'checkers', title: t.games.checkers.title, sub: t.games.checkers.subtitle, cat: 'classic', kind: 'match', accent: '#b06cff', emoji: '♟', keywords: 'checkers დამკა' },
    { id: 'ludo', title: t.games.ludo.title, sub: t.games.ludo.subtitle, cat: 'classic', kind: 'match', accent: '#22c55e', emoji: '🎲', keywords: 'ludo ლუდო' },
    { id: 'joker', title: t.games.joker.title, sub: t.games.joker.subtitle, cat: 'classic', kind: 'match', accent: '#fbbf24', emoji: '🃏', keywords: 'joker ჯოკერი კარტი' },
    { id: 'uno', title: t.games.uno.title, sub: t.games.uno.subtitle, cat: 'classic', kind: 'match', accent: '#e3243b', logo: 'uno', emoji: '🃠', keywords: 'uno უნო კარტი' },

    { id: 'ganab', title: t.games.ganab.title, sub: t.games.ganab.subtitle, cat: 'mind', kind: 'launch', accent: '#d9a24a', logo: 'ganab', badge: true, keywords: 'ganab განაბ roguelike', launch: () => useSocialStore.getState().requestOpenGanab() },
    { id: 'bandicoot', title: t.games.bandicoot.title, sub: t.games.bandicoot.subtitle, cat: 'solo', kind: 'launch', accent: '#ffb46a', emoji: '🦊', keywords: 'bandicoot platformer', launch: () => setBandicootOpen(true) },
  ];
  if (onOpenPremium) defs.push({ id: 'premium', title: 'Premium Worlds', sub: 'Beach Camp 3D · ' + t.commB.premiumSub, cat: 'worlds', kind: 'launch', accent: '#ff8c3c', emoji: '🔥', badge: true, keywords: 'premium worlds 3d beach', launch: onOpenPremium });
  if (onOpenSpace) defs.push({ id: 'space', title: 'Virtual Space', sub: t.commB.spaceSub, cat: 'worlds', kind: 'launch', accent: '#4a76c4', logo: 'vspace', emoji: '🌐', keywords: 'space virtual სივრცე vr', launch: onOpenSpace });
  if (onOpenBackrooms) defs.push({ id: 'backrooms', title: 'Backrooms', sub: t.commB.backroomsSub, cat: 'solo', kind: 'launch', accent: '#f5de80', emoji: '🟨', keywords: 'backrooms horror', launch: onOpenBackrooms });
  defs.push({ id: 'othermafia', title: 'თუჯიტური მაფია', sub: 'ვიდეო-მაფია ჰოსტით · 4-14 მოთ.', cat: 'worlds', kind: 'match', accent: RED_XM, logo: 'mafianight', emoji: '🎭', badge: true, keywords: 'mafia მაფია თუჯიტური tujituri video ვიდეო table host' });
  defs.push({ id: 'mergeevo', title: 'Merge Evolution', sub: 'გაზარდე ციფრული ორგანიზმი · ყუთები · შერწყმა', cat: 'solo', kind: 'launch', accent: '#4dd4c4', emoji: '🧬', badge: true, keywords: 'merge evolution ევოლუცია შერწყმა dna დნმ ორგანიზმი ყუთი chest idle კლიკერი განვითარება', launch: () => setMergeOpen(true) });
  defs.push({ id: 'logic', title: 'ფორმალური ლოგიკის აკადემია', sub: 'სილოგიზმები · არგუმენტაცია · Logic Rating', cat: 'logic', kind: 'launch', accent: '#F9C81C', logo: 'logic', emoji: '🧠', badge: true, keywords: 'logic ლოგიკა სილოგიზმი არგუმენტი დედუქცია აკადემია რეიტინგი formal ფორმალური მსჯელობა fallacy შეცდომა', launch: () => setLogicOpen(true) });
  defs.push({ id: 'noir', title: 'ნუარი', sub: 'ინტერაქტიული თავგადასავალი · შენ წყვეტ', cat: 'solo', kind: 'launch', accent: '#ff2d55', emoji: '🌃', badge: true, keywords: 'noir ნუარი თავგადასავალი ამბავი არჩევანი ისტორია adventure story choice მაფია დეტექტივი', launch: () => setNoirOpen(true) });
  defs.push({ id: 'deathrun', title: 'Deathrun · ბჰოპი', sub: '10 ხაფანგი · ბჰოპ სექცია · ხმალაობა · 2-16 მოთ.', cat: 'bhop', kind: 'launch', accent: '#ff6b4a', emoji: '🏁', badge: true, keywords: 'deathrun bhop ბჰოპი ხაფანგი temple ტაძარი სირბილი ხმალი surf დეთრანი', launch: () => setDeathrunOpen(true) });
  defs.push({ id: 'watchparty', title: 'კინო სივრცე', sub: 'ერთად უყურეთ ვიდეოს · სინქრონში + ხმა', cat: 'worlds', kind: 'launch', accent: '#ff5d5d', emoji: '🎬', badge: true, keywords: 'watch party კინო ფილმი youtube ვიდეო together სინქრონი co-watch cinema', launch: () => setWatchPartyOpen(true) });

  const byId = (id: string) => defs.find(d => d.id === id);
  // Order here is the order on screen. Adding a game to the hub's flagship strip
  // is one entry — the card and the "remove from its category" behaviour both
  // follow from it.
  // The three that never require a scroll or a swipe — see QuickTiles.
  const QUICK_CARDS: QuickDef[] = [
    {
      id: 'voidiq', label: 'VOID IQ', sub: 'IQ ტესტი',
      art: <IQLogo size={42} />,
      bg: 'linear-gradient(150deg, #0a2a4a 0%, #1a1a4a 60%, #12122e 100%)',
      edge: 'rgba(79,184,255,0.45)',
    },
    {
      id: 'logic', label: 'ლოგიკის ტესტი', sub: 'აკადემია',
      art: <LogicLogo size={42} label={false} />,
      bg: 'linear-gradient(150deg, #3a2f08 0%, #241a2e 60%, #14121c 100%)',
      edge: 'rgba(249,200,28,0.45)',
    },
    // Premium Worlds only exists when the host screen can open it.
    ...(onOpenPremium ? [{
      id: 'premium', label: 'Premium Worlds', sub: '3D სივრცე',
      art: <span style={{ fontSize: 34, filter: 'drop-shadow(0 4px 12px rgba(255,140,60,0.55))' }}>🔥</span>,
      bg: 'linear-gradient(150deg, #1a2b4a 0%, #4a2c1a 60%, #2e1c10 100%)',
      edge: 'rgba(192,132,252,0.42)',
    } as QuickDef] : []),
  ];

  // Order here is the order in the carousel.
  const FEATURED_CARDS: FeaturedDef[] = [
    {
      id: 'watchparty', title: 'კინო სივრცე', sub: 'ერთად უყურეთ ვიდეოს · სინქრონში + ხმა',
      art: <span style={{ fontSize: 44, filter: 'drop-shadow(0 4px 14px rgba(255,93,93,0.5))' }}>🎬</span>,
      titleGrad: 'linear-gradient(90deg,#ffe3e3,#ff5d5d)', tracking: '0.1em',
      bg: 'linear-gradient(135deg, #3a0f14 0%, #24101c 55%, #120a10 100%)',
      edge: 'rgba(255,93,93,0.45)', glow: 'rgba(255,60,70,0.18)',
      badgeBg: 'rgba(255,60,70,0.9)', badgeFg: '#fff',
    },
    {
      id: 'mergeevo', title: 'MERGE EVOLUTION', sub: 'გაზარდე ციფრული ორგანიზმი · ყუთები',
      art: <EvolutionCore stage={3} hue={188} size={64} />,
      titleGrad: 'linear-gradient(90deg,#d8fffa,#4dd4c4)', tracking: '0.08em',
      bg: 'linear-gradient(135deg, #082b32 0%, #101a34 55%, #0c1020 100%)',
      edge: 'rgba(77,212,196,0.45)', glow: 'rgba(77,212,196,0.16)',
      badgeBg: 'rgba(77,212,196,0.92)', badgeFg: '#04211f',
    },
    {
      id: 'maxpuzzle', title: 'ბატონი მაქსის თავსატეხი', sub: 'კითხვები სწორი პასუხების გარეშე',
      art: <MaxSeal size={52} />,
      titleGrad: 'linear-gradient(90deg,#f7ecd0,#d9b45a)',
      bg: 'linear-gradient(135deg, #2a1f4a 0%, #1c1230 55%, #2e2410 100%)',
      edge: 'rgba(217,180,90,0.45)', glow: 'rgba(217,180,90,0.14)',
      badgeBg: 'rgba(217,180,90,0.92)', badgeFg: '#1a1206',
    },
  ];
  // Both strips feed this: a game promoted to either one is removed from its
  // category section, so nothing on the page appears twice.
  const FEATURED = [...QUICK_CARDS.map(c => c.id), ...FEATURED_CARDS.map(c => c.id)];

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

      {/* Flagship banners — only in the default view */}
      {cat === 'all' && !q && (
        <>
          <QuickTiles items={QUICK_CARDS} onOpen={id => openGame(byId(id)!)} />
          <FeaturedCarousel cards={FEATURED_CARDS} onOpen={id => openGame(byId(id)!)} />

        </>
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

      {/* Filter chips */}
      {!q && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>ყველა</Chip>
          {CAT_ORDER.map(c => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{CAT_META[c].emoji} {CAT_META[c].chip}</Chip>
          ))}
        </div>
      )}

      {/* Recently played */}
      {cat === 'all' && !q && recent.length > 0 && (
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

      {/* Grid */}
      {q ? (
        (() => { const items = defs.filter(matchesQ); return items.length ? <Grid items={items} /> : <p className="text-center font-mono text-[12px] text-white/30 py-10">ვერაფერი მოიძებნა „{query}"</p>; })()
      ) : cat === 'all' ? (
        CAT_ORDER.map(c => {
          const items = defs.filter(d => d.cat === c && !FEATURED.includes(d.id));
          if (!items.length) return null;
          return (
            <div key={c}>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/35 mb-2">{CAT_META[c].emoji} {CAT_META[c].section}</p>
              <Grid items={items} />
            </div>
          );
        })
      ) : (
        <Grid items={defs.filter(d => d.cat === cat)} />
      )}

      {/* ── Centered launcher modal for match games ───────────────────── */}
      {/* Portaled to <body>: an ancestor transform would otherwise re-anchor
          the fixed overlay to the page (forcing the user to scroll to it). */}
      {createPortal(
      <AnimatePresence>
        {sheet && sheet !== 'othermafia' && MATCH[sheet] && (
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
      <AnimatePresence>
        {sheet === 'othermafia' && MATCH.othermafia && (
          <TujituriLauncher cfg={MATCH.othermafia} onClose={() => setSheet(null)} onRecord={() => recordRecent('othermafia')} />
        )}
      </AnimatePresence>
      {voidIqOpen && <Suspense fallback={null}><VoidIQHub onClose={() => setVoidIqOpen(false)} /></Suspense>}
      {maxPuzzleOpen && <Suspense fallback={null}><MaxPuzzleExperience onClose={() => setMaxPuzzleOpen(false)} /></Suspense>}
      {dilemmasHubOpen && <Suspense fallback={null}><DilemmasHub onClose={() => setDilemmasHubOpen(false)} /></Suspense>}
      {philoHubOpen && <Suspense fallback={null}><PhilosophyHub onClose={() => setPhiloHubOpen(false)} /></Suspense>}
      {philoTestOpen && <Suspense fallback={null}><PhiloTestExperience onClose={() => setPhiloTestOpen(false)} /></Suspense>}
      {bandicootOpen && <Suspense fallback={null}><NeoBandicoot onClose={() => setBandicootOpen(false)} /></Suspense>}
      {watchPartyOpen && <Suspense fallback={null}><WatchPartyLauncher onClose={() => setWatchPartyOpen(false)} /></Suspense>}
      {deathrunOpen && <Suspense fallback={null}><DeathrunGame nickname={playerName} onClose={() => setDeathrunOpen(false)} /></Suspense>}
      {logicOpen && <Suspense fallback={null}><LogicAcademy onClose={() => setLogicOpen(false)} /></Suspense>}
      {noirOpen && <Suspense fallback={null}><NoirAdventure onClose={() => setNoirOpen(false)} /></Suspense>}
      {mergeOpen && <Suspense fallback={null}><MergeEvolution onClose={() => setMergeOpen(false)} /></Suspense>}
      {aristocracyOpen && <Suspense fallback={null}><AristocracyTest onClose={() => setAristocracyOpen(false)} /></Suspense>}
    </div>
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
  renderRow: (m: any) => JSX.Element;
  extra?: JSX.Element;
}

// თუჯიტური მაფია — a tongue-in-cheek "tech support" error shown on entry.
function TujituriSplash({ onAgree, onClose }: { onAgree: () => void; onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-2 -mt-1 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-lg">⚙️</span>
        <span className="font-mono text-[12px] text-white/60 flex-1 text-left">billing-system.exe</span>
        <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-white/40 text-xs" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
      </div>
      <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', damping: 11 }} className="text-5xl mb-2">⚠️</motion.div>
      <p className="font-display font-black" style={{ fontSize: 20, color: '#ffcc33' }}>შეცდომა 404</p>
      <p className="font-mono text-[13px] mt-1" style={{ color: RED_XM }}>50 ლარი ვერ მოიძებნა</p>
      <div className="mt-4 rounded-xl p-3.5 text-left font-mono text-[12.5px] leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}>
        <p><span style={{ color: RED_XM }}>&gt;</span> სამწუხაროდ, ჩვენმა ბილინგის სისტემამ ვერ იპოვა ფუნქცია, სადაც მოთამაშეს თვეში <b style={{ color: '#fff' }}>50 ლარს</b> ვართმევთ.</p>
        <p className="mt-2"><span style={{ color: RED_XM }}>&gt;</span> დეველოპერებმა განაცხადეს, რომ „<b style={{ color: '#fff' }}>თუჯიტურ მაფიაში</b>" თამაში <b style={{ color: '#7fe0a0' }}>უფასოა</b> და ასეც დარჩება.</p>
      </div>
      <button onClick={onAgree} className="mt-4 w-full py-3.5 rounded-2xl font-display font-bold text-white text-[14px] active:scale-[0.98]" style={{ background: `linear-gradient(135deg, ${RED_XM}, #b81020)` }}>
        ❌ ხარვეზის იგნორირება / თამაშის დაწყება
      </button>
      <p className="font-mono text-[9px] text-white/25 mt-2.5">error_id: 0x7A3F · თუჯიტური მაფია™</p>
    </div>
  );
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
          {cfg.list.map(cfg.renderRow)}
        </div>
      )}
    </div>
  );
}

// თუჯიტური მაფია — a dedicated, full-screen themed launcher (splash → create/join).
function TujituriLauncher({ cfg, onClose, onRecord }: { cfg: LauncherCfg; onClose: () => void; onRecord: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const create = () => { onRecord(); cfg.onCreate(); onClose(); };
  const join = () => { if (!cfg.joinCode.trim()) return; onRecord(); cfg.onJoin(); onClose(); };
  return createPortal(
    <motion.div className="fixed inset-0 z-[545] flex flex-col select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'radial-gradient(ellipse 120% 60% at 50% -8%, #2a0a14 0%, #08060a 60%)', fontFamily: 'Rajdhani, "Noto Sans Georgian", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div className="flex-shrink-0 flex justify-end p-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col">
        <AnimatePresence mode="wait">
          {!agreed ? (
            <motion.div key="splash" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm rounded-3xl p-5" style={{ background: 'rgba(12,10,24,0.92)', border: `1px solid ${RED_XM}44`, boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${RED_XM}14` }}>
                <TujituriSplash onAgree={() => setAgreed(true)} onClose={onClose} />
              </div>
            </motion.div>
          ) : (
            <motion.div key="launch" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1 max-w-sm w-full mx-auto flex flex-col">
              <div className="text-center pt-1">
                <motion.img src="/mafia-night.webp" alt="" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 12 }} className="xm-float" style={{ width: 148, height: 148, objectFit: 'contain', margin: '0 auto', filter: 'drop-shadow(0 8px 30px rgba(255,59,71,0.35))' }} />
                <h1 className="font-display font-black text-white mt-2" style={{ fontSize: 26 }}>თუჯიტური მაფია</h1>
                <p className="font-mono text-[12px] text-white/50 mt-1">ვიდეო-მაფია ჰოსტით · 4–14 მოთამაშე</p>
              </div>
              <div className="mt-6 space-y-3">
                <button onClick={create} disabled={cfg.loading} className="w-full py-3.5 rounded-2xl font-display font-black text-white text-[15px] disabled:opacity-50 active:scale-[0.98]" style={{ background: `linear-gradient(135deg, ${RED_XM}, #b81020)`, boxShadow: `0 8px 26px ${RED_XM}44` }}>
                  {cfg.loading ? '…' : '🎬 ოთახის შექმნა'}
                </button>
                <div className="flex items-center gap-2 text-white/25 font-mono text-[10px]"><div className="flex-1 h-px bg-white/10" />ან შეუერთდი კოდით<div className="flex-1 h-px bg-white/10" /></div>
                <div className="flex gap-2">
                  <input value={cfg.joinCode} onChange={e => cfg.setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') join(); }} placeholder="XXXXXX" maxLength={cfg.codeMax}
                    className="flex-1 bg-transparent font-mono text-center text-lg text-white placeholder-white/20 outline-none px-3 py-3 rounded-xl transition-colors tracking-[0.3em]" style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
                  <button onClick={join} disabled={!cfg.joinCode.trim() || cfg.loading} className="px-5 rounded-xl font-mono text-xs uppercase tracking-wider active:scale-95 disabled:opacity-40" style={{ background: `${RED_XM}22`, border: `1px solid ${RED_XM}66`, color: '#ff8a92' }}>შესვლა</button>
                </div>
                {cfg.error && <p className="font-mono text-[12px] text-center" style={{ color: RED_XM }} onClick={cfg.clearError}>{cfg.error}</p>}
              </div>
              {cfg.list.length > 0 && (
                <div className="mt-6 space-y-1.5">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-white/30">🟢 ღია ოთახები</p>
                  {cfg.list.map(cfg.renderRow)}
                </div>
              )}
              <p className="font-mono text-[10px] text-white/20 text-center mt-auto pt-6">ჰოსტი მართავს თამაშს · მინ. 4 მოთამაშე</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body,
  );
}

/**
 * A flagship banner in the Games hub.
 *
 * Extracted because the five of these were hand-written copies that had drifted
 * apart — minHeight 92 vs 84, gap 14 vs 12, padding 13/18 vs 12/16, glow 34 vs
 * 30px — which is precisely what makes a hub read as assembled rather than
 * designed. More importantly, the old arrangement had a trap: `FEATURED` only
 * REMOVES an id from its category section, so adding one there without also
 * hand-writing a card here made the game disappear from the hub completely.
 * That happened twice. Now the card list IS the FEATURED list, so the two
 * cannot disagree.
 *
 * Per-game gradients stay bespoke on purpose: this is cover art, and a hub of
 * identical cards is a worse hub. The structure around the art is what's shared.
 */
interface FeaturedDef {
  id: string;
  art: React.ReactNode;
  title: string;
  /** Two stops for the title's gradient text — the game's own colours. */
  titleGrad: string;
  sub: string;
  /** Hero background. */
  bg: string;
  /** Border + outer glow, from the game's accent. */
  edge: string;
  glow: string;
  /** The NEW pill. */
  badgeBg: string;
  badgeFg: string;
  /** Georgian titles are already wide; extra tracking wraps them to a second
   *  line, so it is opt-in per card rather than a default. */
  tracking?: string;
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
const NEW_GAMES = new Set(['noir', 'mergeevo', 'logic', 'deathrun']);

function FeaturedCard({ def, onClick }: { def: FeaturedDef; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
      style={{ border: `1px solid ${def.edge}`, boxShadow: `0 6px 34px ${def.glow}` }}>
      {/* minHeight (never a fixed height) + vertical padding: Georgian wraps to
          two lines on narrow phones and a fixed height clipped it at both ends. */}
      <div style={{
        minHeight: 92, background: def.bg, display: 'flex', alignItems: 'center',
        gap: 14, padding: '13px 18px', position: 'relative',
      }}>
        <div style={{ width: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {def.art}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black text-white text-base leading-tight"
            style={{ background: def.titleGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: def.tracking }}>
            {def.title}
          </p>
          <p className="font-mono text-[12px] text-white/55 mt-0.5">{def.sub}</p>
        </div>
        {/* Being featured already says "look at this" — the pill is reserved for
            genuinely recent additions so it keeps meaning something. */}
        {NEW_GAMES.has(def.id) && (
          <span style={{
            fontFamily: 'monospace', fontSize: T.font.micro, letterSpacing: 1,
            color: def.badgeFg, background: def.badgeBg, borderRadius: T.radius.sm, padding: '3px 8px',
          }}>NEW</span>
        )}
      </div>
    </button>
  );
}

/**
 * Flagship carousel.
 *
 * The six banners used to stack vertically at 632-776px — more than a phone's
 * visible area — so the search box and the entire catalogue sat below the fold
 * and every session started with a scroll past six adverts. One card at a time
 * with a peek at the next brings that to ~190px including the dots.
 *
 * Horizontal scrolling is safe here specifically because the games tab opts out
 * of the app's swipe-to-change-tab gesture (NO_SWIPE_NAV in App.tsx); a sideways
 * drag on this screen belongs to a rail and nothing else.
 */
/**
 * Primary picks — the three experiences that must never cost a scroll or a
 * swipe to reach.
 *
 * They used to sit at positions 2, 3 and 5 of the flagship carousel, so after
 * the carousel landed Premium Worlds was four sideways drags out of view. This
 * is the trade: less artwork per item than a hero banner, but all three visible
 * the instant the tab opens, which is what they are actually for.
 *
 * Their ids stay in FEATURED, so they are still removed from the category grids
 * below and each game appears exactly once on the screen.
 */
interface QuickDef {
  id: string;
  label: string;
  sub: string;
  art: React.ReactNode;
  bg: string;
  edge: string;
}

function QuickTiles({ items, onOpen }: { items: QuickDef[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(q => (
        <button
          key={q.id}
          onClick={() => onOpen(q.id)}
          className="vm-quick-tile rounded-2xl px-2 pt-3 pb-2.5 flex flex-col items-center gap-1.5 text-center transition-all active:scale-[0.97]"
          // minHeight, never a fixed height: at ~114px wide these labels wrap to
          // two lines in Georgian and a fixed box would clip them.
          style={{ background: q.bg, border: `1px solid ${q.edge}`, minHeight: 112 }}
        >
          <div className="flex items-center justify-center" style={{ height: 44 }}>{q.art}</div>
          <div className="w-full min-w-0">
            <p className="font-display font-bold text-white leading-tight"
              style={{ fontSize: T.font.caption, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {q.label}
            </p>
            <p className="font-mono leading-tight mt-0.5 truncate" style={{ fontSize: T.font.micro, color: T.text.faint }}>
              {q.sub}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function FeaturedCarousel({ cards, onOpen }: { cards: FeaturedDef[]; onOpen: (id: string) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const syncActive = () => {
    const el = railRef.current;
    if (!el || cards.length === 0) return;
    // Every card has the same width, so the scroll pitch is the full scrollable
    // width divided by the card count — no per-card measuring needed.
    const pitch = el.scrollWidth / cards.length;
    setActive(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / pitch))));
  };

  return (
    <div>
      <div
        ref={railRef}
        onScroll={syncActive}
        className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1"
        style={{
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y',
        }}
      >
        {cards.map(def => (
          // 88% leaves a sliver of the next card visible, which is what tells a
          // first-time viewer the rail scrolls at all.
          <div key={def.id} className="vm-featured-card" style={{ scrollSnapAlign: 'center' }}>
            <FeaturedCard def={def} onClick={() => onOpen(def.id)} />
          </div>
        ))}
      </div>
      <div className="flex justify-center items-center gap-1.5 mt-2">
        {cards.map((c, i) => (
          <span key={c.id} style={{
            width: i === active ? 16 : 5, height: 5, borderRadius: 999,
            background: i === active ? T.color.accent : T.surface.lineStrong,
            transition: 'width .22s ease, background .22s ease',
          }} />
        ))}
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0"
      style={{ background: active ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)', border: active ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(255,255,255,0.1)', color: active ? '#8ee9ff' : 'rgba(255,255,255,0.45)' }}>
      {children}
    </button>
  );
}

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

function XmRow({ match, onJoin }: { match: XmListItem; onJoin: (code: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white truncate">{match.hostName} <span className="text-white/30">(ჰოსტი)</span></p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[12px] text-white/25 tracking-widest">{match.code}</span>
          <span className="font-mono text-[12px] text-white/20">{match.seatCount}/{match.maxSeats}</span>
          {match.phase !== 'lobby' && <span className="font-mono text-[10px] text-amber-400/60">მიმდინარეობს</span>}
        </div>
      </div>
      <button onClick={() => onJoin(match.code)}
        className="px-2.5 py-1 rounded-lg font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
        style={{ background: 'rgba(255,59,71,0.12)', border: '1px solid rgba(255,59,71,0.3)', color: '#ff8a92' }}>
        {match.phase === 'lobby' ? 'შესვლა' : 'ყურება'}
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

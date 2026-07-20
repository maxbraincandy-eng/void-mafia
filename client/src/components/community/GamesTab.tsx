import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const NeoBandicoot = lazy(() => import('@/components/platformer/NeoBandicoot').then(m => ({ default: m.NeoBandicoot })));
const AristocracyTest = lazy(() => import('@/components/quiz/AristocracyTest').then(m => ({ default: m.AristocracyTest })));
const DilemmasHub = lazy(() => import('@/components/dilemmas/DilemmasHub').then(m => ({ default: m.DilemmasHub })));
const VoidIQHub = lazy(() => import('@/components/iq/VoidIQHub').then(m => ({ default: m.VoidIQHub })));
import { IQLogo } from '@/components/iq/IQLogo';
import { VRBustIcon } from '@/components/ui/VRBustIcon';
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

// ── Categories ───────────────────────────────────────────────────────────────
type GCat = 'mind' | 'deduction' | 'party' | 'classic' | 'worlds' | 'solo';
const CAT_ORDER: GCat[] = ['mind', 'deduction', 'party', 'classic', 'worlds', 'solo'];
const CAT_META: Record<GCat, { section: string; chip: string; emoji: string }> = {
  mind:      { section: 'გონება & ცოდნა',     chip: 'ინტელექტი', emoji: '🧠' },
  deduction: { section: 'სოციალური დედუქცია', chip: 'დედუქცია',  emoji: '🕵️' },
  party:     { section: 'წვეულება & გუნდური', chip: 'წვეულება',  emoji: '🎉' },
  classic:   { section: 'კლასიკა',            chip: 'კლასიკა',   emoji: '♟' },
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
  logo?: 'iq' | 'ganab' | 'vspace';
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
  const [voidIqOpen, setVoidIqOpen] = useState(false);

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
    ckClear(); jkClear(); ldClear(); wwClear(); unoClear(); boClear(); alClear(); drClear(); cnClear(); spClear();
    ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch();
  }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch, ckClear, jkClear, ldClear, wwClear, unoClear, boClear, alClear, drClear, cnClear, spClear]);

  useEffect(() => { ckFetch(); jkFetch(); ldFetch(); wwFetch(); unoFetch(); boFetch(); alFetch(); drFetch(); cnFetch(); spFetch(); }, [ckFetch, jkFetch, ldFetch, wwFetch, unoFetch, boFetch, alFetch, drFetch, cnFetch, spFetch]);

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
    { id: 'aristocracy', title: t.games.aristocracy.title, sub: t.games.aristocracy.subtitle, cat: 'mind', kind: 'launch', accent: '#e8cf7a', emoji: '👑', keywords: 'aristocracy ტესტი quiz', launch: () => setAristocracyOpen(true) },

    { id: 'spyfall', title: 'ჯაშუში', sub: 'იპოვე ჯაშუში ხმით · 3-10 მოთ.', cat: 'deduction', kind: 'match', accent: '#ff5d6c', emoji: '🕵️', badge: true, keywords: 'spyfall ჯაშუში დედუქცია' },
    { id: 'codenames', title: 'Codenames', sub: '2 გუნდი · მინიშნებები · 4-16 მოთ.', cat: 'deduction', kind: 'match', accent: '#c084fc', emoji: '🔤', badge: true, keywords: 'codenames კოდი გუნდი' },
    { id: 'blackout', title: t.games.blackout.title, sub: t.games.blackout.subtitle, cat: 'solo', kind: 'match', accent: '#ffd34d', emoji: '🔦', badge: true, keywords: 'blackout impostor დედუქცია' },

    { id: 'alias', title: 'ალიასი', sub: 'გუნდური სიტყვების თამაში · 4-12 მოთ.', cat: 'party', kind: 'match', accent: '#4d9fff', emoji: '🗣', badge: true, keywords: 'alias სიტყვები taboo' },
    { id: 'draw', title: 'დახაზე & გამოიცანი', sub: 'ხატავ და გამოიცნობ · 2-12 მოთ.', cat: 'party', kind: 'match', accent: '#ff8c26', emoji: '🎨', badge: true, keywords: 'draw ხატვა pictionary' },

    { id: 'checkers', title: t.games.checkers.title, sub: t.games.checkers.subtitle, cat: 'classic', kind: 'match', accent: '#b06cff', emoji: '♟', keywords: 'checkers დამკა' },
    { id: 'ludo', title: t.games.ludo.title, sub: t.games.ludo.subtitle, cat: 'classic', kind: 'match', accent: '#22c55e', emoji: '🎲', keywords: 'ludo ლუდო' },
    { id: 'joker', title: t.games.joker.title, sub: t.games.joker.subtitle, cat: 'classic', kind: 'match', accent: '#fbbf24', emoji: '🃏', keywords: 'joker ჯოკერი კარტი' },
    { id: 'uno', title: t.games.uno.title, sub: t.games.uno.subtitle, cat: 'classic', kind: 'match', accent: '#fb923c', emoji: '🃠', keywords: 'uno უნო კარტი' },

    { id: 'ganab', title: t.games.ganab.title, sub: t.games.ganab.subtitle, cat: 'mind', kind: 'launch', accent: '#d9a24a', logo: 'ganab', badge: true, keywords: 'ganab განაბ roguelike', launch: () => useSocialStore.getState().requestOpenGanab() },
    { id: 'bandicoot', title: t.games.bandicoot.title, sub: t.games.bandicoot.subtitle, cat: 'solo', kind: 'launch', accent: '#ffb46a', emoji: '🦊', keywords: 'bandicoot platformer', launch: () => setBandicootOpen(true) },
  ];
  if (onOpenPremium) defs.push({ id: 'premium', title: 'Premium Worlds', sub: 'Beach Camp 3D · ' + t.commB.premiumSub, cat: 'worlds', kind: 'launch', accent: '#ff8c3c', emoji: '🔥', badge: true, keywords: 'premium worlds 3d beach', launch: onOpenPremium });
  if (onOpenSpace) defs.push({ id: 'space', title: 'Virtual Space', sub: t.commB.spaceSub, cat: 'worlds', kind: 'launch', accent: '#4a76c4', logo: 'vspace', emoji: '🌐', keywords: 'space virtual სივრცე vr', launch: onOpenSpace });
  if (onOpenBackrooms) defs.push({ id: 'backrooms', title: 'Backrooms', sub: t.commB.backroomsSub, cat: 'solo', kind: 'launch', accent: '#f5de80', emoji: '🟨', keywords: 'backrooms horror', launch: onOpenBackrooms });

  const byId = (id: string) => defs.find(d => d.id === id);
  const FEATURED = ['voidiq', ...(onOpenPremium ? ['premium'] : [])];

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
        style={{ minHeight: 104, background: 'rgba(12,10,24,0.72)', border: `1px solid ${d.accent}40`, boxShadow: `0 4px 18px ${d.accent}12` }}>
        {d.badge && <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'monospace', fontSize: 8, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 6, padding: '2px 6px' }}>NEW</span>}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2" style={{ background: `${d.accent}1f` }}>
          {d.logo === 'iq' ? <IQLogo size={34} /> : d.logo === 'vspace' ? <VRBustIcon size={36} /> : d.logo === 'ganab' ? <img src="/ganab-star.png" alt="" className="w-7 h-7 object-contain" /> : <span className="text-2xl leading-none">{d.emoji}</span>}
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold text-white text-[13px] leading-tight truncate">{d.title}</p>
          <p className="font-mono text-[10px] text-white/35 leading-tight mt-0.5 truncate">{d.sub}</p>
          {live > 0 && <p className="font-mono text-[9px] mt-1" style={{ color: '#7fe0a0' }}>🔴 {live} ღია</p>}
        </div>
      </button>
    );
  };

  const Grid = ({ items }: { items: GameDef[] }) => (
    <div className="grid grid-cols-2 gap-2.5">{items.map(d => <Tile key={d.id} d={d} />)}</div>
  );

  return (
    <div className="space-y-4">

      {/* Flagship banners — only in the default view */}
      {cat === 'all' && !q && (
        <>
          <button onClick={() => openGame(byId('voidiq')!)} className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
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

          {onOpenPremium && (
            <button onClick={() => openGame(byId('premium')!)} className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
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
                  {d!.logo === 'iq' ? <IQLogo size={38} /> : d!.logo === 'vspace' ? <VRBustIcon size={40} /> : d!.logo === 'ganab' ? <img src="/ganab-star.png" alt="" className="w-7 h-7 object-contain" /> : <span className="text-2xl">{d!.emoji}</span>}
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

      {/* ── Bottom-sheet launcher for match games ─────────────────────── */}
      <AnimatePresence>
        {sheet && MATCH[sheet] && (
          <motion.div className="fixed inset-0 z-[520] flex items-end justify-center" style={{ background: 'rgba(4,4,10,0.72)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)}
            onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            <motion.div className="w-full max-w-lg rounded-t-3xl p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]" onClick={e => e.stopPropagation()}
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              style={{ background: 'rgba(12,10,24,0.99)', border: `1px solid ${MATCH[sheet].accent}55`, borderBottom: 'none' }}>
              {(() => {
                const d = byId(sheet)!; const cfg = MATCH[sheet];
                return (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${cfg.accent}1f` }}>
                        <span className="text-2xl">{d.emoji}</span>
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
      </AnimatePresence>

      {/* Overlays */}
      {voidIqOpen && <Suspense fallback={null}><VoidIQHub onClose={() => setVoidIqOpen(false)} /></Suspense>}
      {dilemmasHubOpen && <Suspense fallback={null}><DilemmasHub onClose={() => setDilemmasHubOpen(false)} /></Suspense>}
      {bandicootOpen && <Suspense fallback={null}><NeoBandicoot onClose={() => setBandicootOpen(false)} /></Suspense>}
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

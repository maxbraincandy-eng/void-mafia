import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoomListItem, Season, ClanPublic, PlayerProfilePublic } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import { MorePanel } from '@/components/ui/MorePanel';
import { useT } from '@/store/langStore';
import { useAmbientDrone } from '@/hooks/useAudio';
import { Button } from '@/components/ui/Button';
import { SkeletonRoomCard } from '@/components/ui/Skeleton';
import { DailyChallengeCard } from '@/components/ui/DailyChallengeCard';
import { NewsCard } from '@/components/ui/NewsCard';
import { LobbyChatPanel } from '@/components/social/LobbyChatPanel';
import { VoidClansIcon } from '@/components/ui/VoidClansIcon';
import { VoidStatsIcon } from '@/components/ui/VoidStatsIcon';
import { haptic } from '@/lib/haptics';
import { useSxvaMafiaStore } from '@/store/sxvaMafiaStore';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

function SeasonBanner() {
  const [season, setSeason] = useState<Season | null>(null);

  useEffect(() => {
    emitWithAck<null, Res<Season | null>>('season:current' as any).then(res => {
      if (res.ok && res.data) setSeason(res.data);
    }).catch(() => {});
  }, []);

  if (!season) return null;

  const now = Date.now();
  const total = season.endAt - season.startAt;
  const elapsed = Math.max(0, Math.min(total, now - season.startAt));
  const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((season.endAt - now) / (1000 * 60 * 60 * 24)));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-2xl overflow-hidden"
      style={{
        border: '1px solid var(--vm-season-border)',
        background: 'var(--vm-season-bg)',
      }}
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-display font-bold text-xs text-white/80 uppercase tracking-widest truncate pr-2">
            {season.name.toUpperCase()}
          </p>
          <span className="flex-shrink-0 font-mono text-[12px] text-neon-cyan/70 bg-neon-cyan/8 border border-neon-cyan/15 rounded-lg px-2 py-0.5 whitespace-nowrap">
            {daysLeft}d left
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--vm-progress-track)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: 'var(--vm-progress-fill)',
              boxShadow: `0 0 6px var(--vm-progress-glow)`,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

const SURFACE = 'rounded-2xl border border-white/[0.06]';
const SURFACE_BG = { background: 'var(--vm-surface-bg)' } as const;

// ── Quick access: Clans & Top ───────────────────────────────────────────────
// Both used to be tabs in the bottom bar. They belong to the Mafia side of the
// app, so they live here now — one tap from the first thing you see, and each
// card carries a live line so it reads as part of the page rather than a link
// bolted on top of it.
function QuickCard({
  accent, icon, title, sub, onClick, delay,
}: {
  accent: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      onClick={() => { haptic('selection'); onClick(); }}
      className="relative flex items-center gap-2 rounded-2xl px-2.5 py-2.5 text-left overflow-hidden transition-all active:scale-[0.97]"
      style={{ background: 'var(--vm-surface-bg)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Accent wash — keeps the two cards distinguishable at a glance */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(120% 110% at 0% 0%, ${accent}1f, transparent 62%)` }}
      />
      <span
        className="relative flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}14`, border: `1px solid ${accent}30` }}
      >
        {icon}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display font-bold text-[13px] text-white/85 leading-none truncate">
          {title}
        </span>
        <span
          className="block font-mono text-[10.5px] leading-none truncate"
          style={{ color: `${accent}cc`, marginTop: 5 }}
        >
          {sub}
        </span>
      </span>
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        className="relative flex-shrink-0 text-white/20"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </motion.button>
  );
}

function QuickAccessRow({ onOpenClans, onOpenLeaderboard }: { onOpenClans: () => void; onOpenLeaderboard: () => void }) {
  const t = useT();
  const myId = useAuthStore(s => s.profile?.id ?? null);
  const [clanLine, setClanLine] = useState('');
  const [topLine, setTopLine] = useState('');

  useEffect(() => {
    let alive = true;
    emitWithAck<null, Res<ClanPublic | null>>('clan:mine' as any)
      .then(res => {
        // The name alone; the card is half a phone wide and the tag pushed it
        // past the ellipsis.
        if (!alive || !res.ok || !res.data) return;   // no clan → the invite line stays
        setClanLine(res.data.name);
      })
      .catch(() => {});

    emitWithAck<null, Res<PlayerProfilePublic[]>>('leaderboard:get' as any)
      .then(res => {
        if (!alive || !res.ok || !Array.isArray(res.data) || res.data.length === 0) return;
        const rank = myId ? res.data.findIndex(p => p.id === myId) : -1;
        setTopLine(rank >= 0
          ? `${t.rooms.quickYourRank} #${rank + 1}`
          : `#1 ${res.data[0].username}`);
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [myId]);

  return (
    <div className="grid grid-cols-2 gap-2.5 mb-3">
      <QuickCard
        accent="#ef4444"
        icon={<VoidClansIcon size={17} color="#ef4444" />}
        title={t.nav.clans}
        sub={clanLine || t.rooms.quickClansHint}
        onClick={onOpenClans}
        delay={0.04}
      />
      <QuickCard
        accent="#facc15"
        icon={<VoidStatsIcon size={17} color="#facc15" />}
        title={t.nav.leaderboard}
        sub={topLine || t.rooms.quickTopHint}
        onClick={onOpenLeaderboard}
        delay={0.09}
      />
    </div>
  );
}

// ── The two mafias ──────────────────────────────────────────────────────────
// The hosted table used to be a card in the games hub, next to Merge Evolution
// and the philosophy quizzes, which is not where anyone looks for a game of
// mafia. Both live under the Mafia tab now and this is what chooses between
// them: the page below the picker changes, the page around it does not.
type Family = 'classic' | 'host';

const HOST_ACCENT = '#ff3b47';

function FamilyPicker({ value, onChange, classic, classicSub, host, hostSub }: {
  value: Family;
  onChange: (f: Family) => void;
  classic: string; classicSub: string; host: string; hostSub: string;
}) {
  const OPTS: { id: Family; icon: React.ReactNode; label: string; sub: string; accent: string }[] = [
    { id: 'classic', icon: <span style={{ fontSize: 19, lineHeight: 1 }}>🎩</span>, label: classic, sub: classicSub, accent: '#00e5ff' },
    { id: 'host',    icon: <span style={{ fontSize: 19, lineHeight: 1 }}>🎬</span>, label: host,    sub: hostSub,    accent: HOST_ACCENT },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 mb-4">
      {OPTS.map(o => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => { if (!on) { haptic('selection'); onChange(o.id); } }}
            className="relative rounded-2xl px-3 py-3 text-left overflow-hidden transition-all active:scale-[0.98]"
            style={{
              background: on ? `linear-gradient(160deg, ${o.accent}1c, rgba(255,255,255,0.02))` : 'var(--vm-surface-bg)',
              border: `1px solid ${on ? `${o.accent}55` : 'rgba(255,255,255,0.06)'}`,
              boxShadow: on ? `0 6px 22px ${o.accent}1f` : 'none',
            }}
          >
            {/* The chosen one carries a lit edge — at a glance you can tell
                which table the list below belongs to. */}
            {on && (
              <span className="absolute top-0 left-3 right-3 h-px rounded-full"
                style={{ background: o.accent, boxShadow: `0 0 8px ${o.accent}` }} />
            )}
            {/* Stacked, not icon-beside-label: half a phone minus a 32px badge
                leaves too little for "კლასიკური მაფია", which was arriving as
                "კლასიკური …". On its own line the whole name fits. */}
            <span
              className="flex w-8 h-8 rounded-xl items-center justify-center mb-2"
              style={{ background: `${o.accent}${on ? '1f' : '12'}`, border: `1px solid ${o.accent}${on ? '3d' : '20'}` }}
            >
              {o.icon}
            </span>
            <span className="block font-display font-bold text-[13px] leading-tight"
              style={{ color: on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)' }}>
              {o.label}
            </span>
            <span className="block font-mono text-[10px] leading-snug mt-1 truncate"
              style={{ color: on ? `${o.accent}cc` : 'rgba(255,255,255,0.22)' }}>
              {o.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RoomsPage({ onOpenClans, onOpenLeaderboard }: { onOpenClans?: () => void; onOpenLeaderboard?: () => void } = {}) {
  type GameStyle = 'classic' | 'don';

  // Base timers (the former "classic" pace). Don mode's engine drives its own
  // phase timings (60s speeches, 30s checks) on top of these.
  const BASE_TIMERS = { nightDuration: 45, dayDuration: 90, voteDuration: 45, speechDuration: 40 };

  const [mode, setMode] = useState<'browse' | 'create' | 'join'>('browse');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [style, setStyle] = useState<GameStyle>('classic');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinChoice, setJoinChoice] = useState<{ code: string; isLobby: boolean; password?: string } | null>(null);

  // ── Hosted mafia ──────────────────────────────────────────────────────
  const [family, setFamily] = useState<Family>('classic');
  const [hostSeats, setHostSeats] = useState(10);
  const [hostCode, setHostCode] = useState('');
  const hostList    = useSxvaMafiaStore(s => s.matchList);
  const hostLoading = useSxvaMafiaStore(s => s.isLoading);
  const hostError   = useSxvaMafiaStore(s => s.error);
  const hostFetch   = useSxvaMafiaStore(s => s.fetchList);
  const hostCreate  = useSxvaMafiaStore(s => s.createMatch);
  const hostJoin    = useSxvaMafiaStore(s => s.joinMatch);
  const hostClear   = useSxvaMafiaStore(s => s.clearError);

  const { createRoom, joinRoom, isLoading, joinError, clearJoinError } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
    joinError: s.error,
    clearJoinError: s.clearError,
  }));
  const username = useAuthStore(s => s.username) ?? '';
  const { onlineCount, openMoreMenu, openLobbyChat, lobbyChatUnread, openDmList, unreadDmCount } = useSocialStore(s => ({
    onlineCount: s.onlineCount,
    openMoreMenu: s.openMoreMenu,
    openLobbyChat: s.openLobbyChat,
    lobbyChatUnread: s.lobbyChatUnread,
    openDmList: s.openDmList,
    unreadDmCount: s.unreadDmCount,
  }));
  const t = useT();
  // Music now handled at MainApp level

  const STYLE_META: Record<GameStyle, { icon: string; label: string; desc: string }> = {
    classic: { icon: '🎩', label: t.misc.styleClassic, desc: t.misc.styleClassicDesc },
    don:     { icon: '🏆', label: t.misc.styleDon,     desc: t.misc.styleDonDesc },
  };

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.ok) setRooms(data.data);
    } catch {}
    setLoadingRooms(false);
  };

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 5000);
    const onFocus = () => fetchRooms();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRoom(username, {
      ...BASE_TIMERS,
      isPrivate,
      donMode: style === 'don',
      ...(style === 'don' ? { minPlayers: 10 } : {}),
    }, false, roomName);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    await joinRoom(code.toUpperCase(), username, joinAsSpectator, joinPassword);
  };

  // The hosted list is pushed over the socket on every change, but a poll keeps
  // it honest for anyone who opened the tab while disconnected.
  useEffect(() => {
    if (family !== 'host') return;
    hostFetch();
    const id = setInterval(hostFetch, 6000);
    return () => clearInterval(id);
  }, [family, hostFetch]);

  const handleHostCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await hostCreate(username || 'Host', { maxSeats: hostSeats });
  };

  const handleHostJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hostCode.length < 6) return;
    await hostJoin(hostCode.toUpperCase(), username || 'Player');
  };

  // Server rejects a non-spectator join to a room whose game already started, asking
  // the client to let the player pick a mode — surface that as the same choice modal.
  useEffect(() => {
    if (joinError === 'GAME_ALREADY_STARTED_CHOOSE_MODE') {
      setJoinChoice({ code: code.toUpperCase(), isLobby: false, password: joinPassword });
      clearJoinError();
    }
  }, [joinError]);

  const handleJoinWithMode = async (choice: { code: string; password?: string }, joinMode: 'player' | 'spectator' | 'next_round') => {
    setJoinChoice(null);
    await joinRoom(choice.code, username, joinMode === 'spectator', choice.password ?? '', joinMode);
  };

  const phaseLabel: Record<string, string> = t.rooms.phase;

  const timeSince = (ts: number): string => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  const MODES: { id: typeof mode; label: string }[] = [
    { id: 'browse', label: t.rooms.browse },
    { id: 'create', label: t.rooms.create },
    { id: 'join',   label: t.rooms.joinCode },
  ];

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-24"
      style={{ background: 'var(--vm-page-gradient)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'var(--vm-page-radial)' }}
      />

      <MorePanel />
      <LobbyChatPanel />

      <div className="relative z-10 vm-page px-4 pt-7">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          {/* More / hamburger button */}
          <button
            onClick={openMoreMenu}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex flex-col items-center justify-center gap-[4px] transition-all hover:bg-white/5 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
            aria-label="More options"
          >
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-2.5 h-[1.5px] rounded-full bg-white/25" />
          </button>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h1
              className="font-display font-bold gradient-text tracking-wide leading-none truncate"
              style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}
            >
              VOID MAFIA
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <p className="text-[12px] font-mono text-white/20 tracking-wider truncate">
                SOCIAL DEDUCTION
              </p>
              {onlineCount > 0 && (
                <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[12px] text-neon-green/60">
                  <span className="w-1.5 h-1.5 bg-neon-green rounded-full animate-pulse" />
                  {onlineCount}
                </span>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={openDmList}
              className="relative w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'var(--vm-btn-icon-bg)', border: '1px solid var(--vm-btn-icon-border)' }}
              title="Direct Messages"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {unreadDmCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full bg-neon-pink text-void text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
                  style={{ boxShadow: '0 0 6px rgba(255,0,204,0.6)' }}
                >
                  {unreadDmCount > 9 ? '9+' : unreadDmCount}
                </span>
              )}
            </button>
            <button
              onClick={openLobbyChat}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-sm transition-all active:scale-95"
              style={lobbyChatUnread > 0
                ? { border: '1px solid rgba(255,45,85,0.5)', color: 'rgba(255,45,85,0.9)', background: 'rgba(255,45,85,0.08)' }
                : { border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.28)' }}
              title="Lobby Chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {lobbyChatUnread > 0 && (
                <span className="font-bold text-[12px]">
                  +{lobbyChatUnread > 99 ? '99' : lobbyChatUnread}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Which mafia ─────────────────────────────────────── */}
        <FamilyPicker
          value={family}
          onChange={setFamily}
          classic={t.rooms.familyClassic}
          classicSub={t.rooms.familyClassicSub}
          host={t.rooms.familyHost}
          hostSub={t.rooms.familyHostSub}
        />

        {/* Clans & Top — moved out of the bottom bar, one tap from the top */}
        {(onOpenClans || onOpenLeaderboard) && (
          <QuickAccessRow
            onOpenClans={onOpenClans ?? (() => {})}
            onOpenLeaderboard={onOpenLeaderboard ?? (() => {})}
          />
        )}

        {/* News stays above the list: it is a few lines and it is the one
            thing here that is genuinely new information. The season bar and
            the daily quests moved below the rooms — see the foot of the page. */}
        {family === 'classic' && <NewsCard />}

        {/* ── Mode tabs — underline style ─────────────────────── */}
        <div className="flex border-b border-white/[0.06] mb-5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 py-2.5 text-xs font-mono tracking-widest uppercase transition-all relative ${
                mode === m.id ? 'text-white/75' : 'text-white/22 hover:text-white/45'
              }`}
            >
              {m.label}
              {/* The underline takes the chosen table's colour, so the tabs
                  never look like they belong to the other one. */}
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-px rounded-full transition-all duration-200"
                style={{ background: mode === m.id ? (family === 'host' ? `${HOST_ACCENT}aa` : 'rgba(0,229,255,0.6)') : 'transparent' }}
              />
            </button>
          ))}
        </div>

        {/* ── Browse ──────────────────────────────────────────── */}
        {family === 'classic' && mode === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono text-white/28">
                {rooms.length} {rooms.length === 1 ? t.rooms.activeRooms : t.rooms.activeRoomsPlural}
              </span>
              <button
                onClick={fetchRooms}
                className="text-[11px] font-mono text-white/22 hover:text-white/55 transition-colors"
              >
                {t.rooms.refresh}
              </button>
            </div>

            {loadingRooms && rooms.length === 0 && (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }, (_, i) => <SkeletonRoomCard key={i} />)}
              </div>
            )}

            {!loadingRooms && rooms.length === 0 && (
              <div className="text-center py-14">
                <p className="text-white/22 font-mono text-sm">{t.rooms.noRooms}</p>
                <p className="text-white/12 font-mono text-xs mt-1.5">{t.rooms.noRoomsHint}</p>
              </div>
            )}

            <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2">
              {rooms.map((room, i) => {
                const isLobby = room.phase === 'lobby';
                return (
                  <motion.div
                    key={room.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`${SURFACE} px-4 py-3.5 flex items-center gap-3`}
                    style={room.spotlight
                      ? { ...SURFACE_BG, border: '1px solid rgba(250,204,21,0.35)', boxShadow: '0 0 18px rgba(250,204,21,0.12)' }
                      : SURFACE_BG}
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isLobby ? 'bg-neon-cyan/50' : 'bg-neon-red/50'}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {room.spotlight && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono tracking-wider uppercase flex-shrink-0 flex items-center gap-0.5"
                            style={{ background: 'rgba(250,204,21,0.12)', color: '#facc15', border: '1px solid rgba(250,204,21,0.3)' }}>
                            📡 VIP
                          </span>
                        )}
                        <span className="font-medium text-sm text-white/70 truncate">
                          {room.name || room.hostName}
                        </span>
                        <span className={`text-[12px] px-1.5 py-0.5 rounded font-mono tracking-wider uppercase flex-shrink-0 ${
                          isLobby
                            ? 'bg-neon-cyan/[0.08] text-neon-cyan/60 border border-neon-cyan/[0.12]'
                            : 'bg-neon-red/[0.08] text-neon-red/55 border border-neon-red/[0.12]'
                        }`}>
                          {phaseLabel[room.phase] ?? room.phase}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        {room.name && (
                          <>
                            <span className="text-white/30 truncate">{room.hostName}</span>
                            <span className="text-white/12">·</span>
                          </>
                        )}
                        <span className="text-neon-cyan/50 font-bold tracking-widest">{room.code}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/30">{room.playerCount} {t.rooms.players}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/18">{timeSince(room.createdAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        size="sm"
                        variant={isLobby ? 'neon-cyan' : 'ghost'}
                        loading={isLoading}
                        onClick={() => setJoinChoice({ code: room.code, isLobby })}
                      >
                        {isLobby ? t.rooms.joinCode : t.rooms.watch}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Create ──────────────────────────────────────────── */}
        {family === 'classic' && mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-5">
                {t.rooms.createRoom}
              </h3>

              {/* Room name */}
              <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                {t.rooms.roomNameLabel}
              </label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value.slice(0, 30))}
                placeholder={t.rooms.roomNamePlaceholder}
                maxLength={30}
                className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-2.5 mb-5 text-white/70 placeholder-white/15 font-mono text-sm focus:outline-none focus:border-white/20 transition-colors"
              />

              {/* Public / Private toggle */}
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">Visibility</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { val: false, label: t.rooms.publicRoom, desc: 'Visible in browser' },
                  { val: true,  label: t.rooms.privateRoom, desc: 'Share code to invite' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setIsPrivate(opt.val)}
                    className={`py-3 px-3 rounded-xl border text-left transition-all ${
                      isPrivate === opt.val
                        ? 'border-white/20 bg-white/[0.04] text-white/70'
                        : 'border-white/[0.06] text-white/28 hover:border-white/12 hover:text-white/45'
                    }`}
                  >
                    <p className="text-xs font-mono font-bold">{opt.label}</p>
                    <p className="text-[12px] font-mono text-white/30 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Style selector — Sports is temporarily locked (coming soon) */}
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2 mt-1">{t.misc.styleLabel}</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {(['classic', 'don'] as GameStyle[]).map(id => {
                  const m = STYLE_META[id];
                  const locked = id === 'don';
                  const selected = style === id && !locked;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={locked}
                      onClick={() => !locked && setStyle(id)}
                      className="py-3 px-3 rounded-xl border text-left transition-all disabled:cursor-not-allowed"
                      style={locked
                        ? { borderColor: 'rgba(255,255,255,0.05)', opacity: 0.5 }
                        : selected
                          ? { borderColor: 'rgba(255,215,0,0.35)', background: 'rgba(255,215,0,0.05)' }
                          : { borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <p className="text-xs font-mono font-bold flex items-center gap-1.5"
                        style={{ color: locked ? 'rgba(255,255,255,0.3)' : selected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>
                        <span>{m.icon}</span>{m.label}{locked && ' 🔒'}
                      </p>
                      <p className="text-[12px] font-mono mt-0.5" style={{ color: locked ? 'rgba(255,180,80,0.55)' : selected ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)' }}>
                        {locked ? t.misc.tempUnavailable : m.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleCreate}>
                <Button fullWidth variant="primary" loading={isLoading}>
                  {t.rooms.createRoom}
                </Button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ── Join by code ─────────────────────────────────────── */}
        {family === 'classic' && mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-5">
                {t.rooms.joinRoom}
              </h3>

              <form onSubmit={handleJoin} className="space-y-3">
                <div>
                  <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                    {t.rooms.roomCodeLabel}
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder={t.rooms.roomCodePlaceholder}
                    maxLength={6}
                    autoFocus
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-neon-cyan/80 placeholder-white/15 font-mono text-2xl tracking-[0.4em] text-center focus:outline-none focus:border-neon-cyan/28 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={e => setJoinPassword(e.target.value)}
                    placeholder="Leave blank if none"
                    maxLength={64}
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-2.5 text-white/60 placeholder-white/15 font-mono text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                {/* Spectator toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none py-1">
                  <button
                    type="button"
                    onClick={() => setJoinAsSpectator(v => !v)}
                    className={`w-9 h-5 rounded-full flex items-center relative transition-colors shrink-0 ${
                      joinAsSpectator ? 'bg-neon-purple/50' : 'bg-white/[0.07]'
                    }`}
                  >
                    <div className={`absolute w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${
                      joinAsSpectator ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-xs font-mono text-white/40">Watch as spectator</span>
                </label>

                <Button fullWidth variant="neon-cyan" loading={isLoading} disabled={code.length < 6}>
                  {t.rooms.joinRoom}
                </Button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ── Hosted: browse ──────────────────────────────────── */}
        {/* Deliberately the same furniture as the classic browse above — the
            count line, the refresh link, the row shape — so switching tables
            does not feel like switching apps. */}
        {family === 'host' && mode === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono text-white/28">
                {hostList.length} {hostList.length === 1 ? t.rooms.activeRooms : t.rooms.activeRoomsPlural}
              </span>
              <button
                onClick={() => hostFetch()}
                className="text-[11px] font-mono text-white/22 hover:text-white/55 transition-colors"
              >
                {t.rooms.refresh}
              </button>
            </div>

            {hostList.length === 0 && (
              <div className="text-center py-14">
                <p className="text-white/22 font-mono text-sm">{t.rooms.hostNoRooms}</p>
                <p className="text-white/12 font-mono text-xs mt-1.5">{t.rooms.hostNoRoomsHint}</p>
              </div>
            )}

            <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2">
              {hostList.map((m, i) => {
                const isLobby = m.phase === 'lobby';
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`${SURFACE} px-4 py-3.5 flex items-center gap-3`}
                    style={SURFACE_BG}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: isLobby ? `${HOST_ACCENT}88` : 'rgba(250,204,21,0.5)' }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-white/70 truncate">{m.hostName}</span>
                        <span className="text-[12px] px-1.5 py-0.5 rounded font-mono tracking-wider uppercase flex-shrink-0"
                          style={isLobby
                            ? { background: `${HOST_ACCENT}14`, color: `${HOST_ACCENT}cc`, border: `1px solid ${HOST_ACCENT}26` }
                            : { background: 'rgba(250,204,21,0.08)', color: 'rgba(250,204,21,0.7)', border: '1px solid rgba(250,204,21,0.2)' }}>
                          {isLobby ? t.rooms.hostBadge : t.rooms.hostRunning}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="font-bold tracking-widest" style={{ color: `${HOST_ACCENT}99` }}>{m.code}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/30">{m.seatCount}/{m.maxSeats} {t.rooms.players}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        size="sm"
                        variant={isLobby ? 'danger' : 'ghost'}
                        loading={hostLoading}
                        onClick={() => hostJoin(m.code, username || 'Player')}
                      >
                        {isLobby ? t.rooms.joinCode : t.rooms.hostSpectate}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {hostError && (
              <p className="font-mono text-[12px] text-neon-red mt-3 text-center" onClick={hostClear}>{hostError}</p>
            )}
          </motion.div>
        )}

        {/* ── Hosted: create ──────────────────────────────────── */}
        {family === 'host' && mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-2">
                {t.rooms.hostCreateRoom}
              </h3>
              <p className="font-mono text-[11px] text-white/30 leading-relaxed mb-5">{t.rooms.hostAbout}</p>

              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">{t.rooms.hostSeats}</p>
              {/* A stepper rather than a dropdown: the useful range is eleven
                  values wide and the number is the whole decision. */}
              <div className="flex items-center gap-3 mb-1.5">
                <button
                  type="button"
                  onClick={() => setHostSeats(v => Math.max(4, v - 1))}
                  disabled={hostSeats <= 4}
                  className="w-11 h-11 rounded-xl font-mono text-lg text-white/60 transition-all active:scale-95 disabled:opacity-25"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >−</button>
                <div className="flex-1 text-center">
                  <p className="font-display font-black leading-none" style={{ fontSize: 30, color: HOST_ACCENT }}>{hostSeats}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHostSeats(v => Math.min(14, v + 1))}
                  disabled={hostSeats >= 14}
                  className="w-11 h-11 rounded-xl font-mono text-lg text-white/60 transition-all active:scale-95 disabled:opacity-25"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >＋</button>
              </div>
              <p className="text-[11px] font-mono text-white/22 text-center mb-5">{t.rooms.hostSeatsHint}</p>

              <form onSubmit={handleHostCreate}>
                <Button fullWidth variant="danger" loading={hostLoading}>
                  {t.rooms.hostCreateRoom}
                </Button>
              </form>

              {hostError && (
                <p className="font-mono text-[12px] text-neon-red mt-3 text-center" onClick={hostClear}>{hostError}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Hosted: join by code ────────────────────────────── */}
        {family === 'host' && mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-5">
                {t.rooms.hostJoinRoom}
              </h3>

              <form onSubmit={handleHostJoin} className="space-y-3">
                <div>
                  <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                    {t.rooms.roomCodeLabel}
                  </label>
                  <input
                    type="text"
                    value={hostCode}
                    onChange={e => setHostCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder={t.rooms.roomCodePlaceholder}
                    maxLength={6}
                    className="w-full bg-white/[0.03] rounded-xl px-4 py-3 placeholder-white/15 font-mono text-2xl tracking-[0.4em] text-center focus:outline-none transition-colors"
                    style={{ color: `${HOST_ACCENT}dd`, border: '1px solid rgba(255,255,255,0.07)' }}
                  />
                </div>

                <Button fullWidth variant="danger" loading={hostLoading} disabled={hostCode.length < 6}>
                  {t.rooms.hostJoinRoom}
                </Button>
              </form>

              {hostError && (
                <p className="font-mono text-[12px] text-neon-red mt-3 text-center" onClick={hostClear}>{hostError}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* The season bar and the daily quests used to sit between the header
            and the room list, and between them they pushed the first room
            past the fold — someone could open a room and the person waiting
            for it would never see it appear. They are status, not the reason
            anyone came to this page, so they read at the foot of it. */}
        {family === 'classic' && (
          <div className="mt-7 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <SeasonBanner />
            <DailyChallengeCard />
          </div>
        )}
      </div>

      {/* Join mode choice modal */}
      <AnimatePresence>
        {joinChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
            onClick={() => setJoinChoice(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`${SURFACE} p-5 w-full max-w-xs`}
              style={SURFACE_BG}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-0.5">
                {joinChoice.isLobby ? t.rooms.join : t.rooms.gameInProgress}
              </p>
              <p className="font-mono font-bold text-neon-cyan/75 tracking-[0.25em] text-xl mb-5">
                {joinChoice.code}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  fullWidth
                  variant="neon-cyan"
                  loading={isLoading}
                  onClick={() => handleJoinWithMode(joinChoice, joinChoice.isLobby ? 'player' : 'next_round')}
                >
                  {joinChoice.isLobby ? t.rooms.joinAsPlayer : t.rooms.joinNextRound}
                </Button>
                {!joinChoice.isLobby && (
                  <p className="text-[12px] font-mono text-white/30 -mt-0.5 mb-1">{t.rooms.joinNextRoundHint}</p>
                )}
                <Button
                  fullWidth
                  variant="ghost"
                  loading={isLoading}
                  onClick={() => handleJoinWithMode(joinChoice, 'spectator')}
                >
                  {t.rooms.watchAsSpectator}
                </Button>
                {!joinChoice.isLobby && (
                  <p className="text-[12px] font-mono text-white/25 -mt-0.5">{t.rooms.watchSpectatorHint}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

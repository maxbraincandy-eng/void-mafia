import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { GameReplaySummary, GameReplayFull, ReplayEvent, Res } from '@/types/index';

// ── Helpers ────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const WINNER_COLOR: Record<string, string> = {
  town: '#00ff88',
  mafia: '#ff4444',
  draw: '#facc15',
};

const TEAM_COLOR: Record<string, string> = {
  mafia: '#ff1e3c',
  town: '#00ff88',
  neutral: '#facc15',
  cult: '#9b00ff',
  yakuza: '#00e5ff',
  unknown: 'rgba(255,255,255,0.4)',
};

const ROLE_LABEL: Record<string, string> = {
  citizen: 'Citizen', mafia: 'Mafia', sheriff: 'Sheriff', doctor: 'Doctor', don: 'Don',
  maniac: 'Maniac', jester: 'Jester', bodyguard: 'Bodyguard', spy: 'Spy', escort: 'Escort',
  vigilante: 'Vigilante', cult_leader: 'Cult Leader', cultist: 'Cultist', veteran: 'Veteran',
  tracker: 'Tracker', arsonist: 'Arsonist', mayor: 'Mayor', yakuza: 'Yakuza', shogun: 'Shogun',
  unknown: 'Unknown',
};

function eventIcon(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'game_start':    return '🎮';
    case 'phase_change':
      if (data.phase === 'night')   return '🌙';
      if (data.phase === 'day')     return '☀️';
      return '⏱️';
    case 'death':         return '💀';
    case 'vote':          return '🗳️';
    case 'kill':          return '🔪';
    case 'save':          return '💊';
    case 'investigate':   return '🔍';
    case 'game_end':      return '🏆';
    case 'chat':          return '💬';
    default:              return '•';
  }
}

function eventDescription(event: ReplayEvent): string {
  const { type, data } = event;
  switch (type) {
    case 'game_start':
      return `Game started with ${data.playerCount} players`;
    case 'phase_change':
      return `${data.phase.charAt(0).toUpperCase() + data.phase.slice(1).replace('_', ' ')} — Round ${data.round}`;
    case 'death':
      return `${data.username} was eliminated (${data.cause === 'night_kill' ? 'Night Kill' : 'Vote'}) · ${ROLE_LABEL[data.role] ?? data.role ?? 'Unknown'}`;
    case 'game_end':
      return `Game over — ${data.winner ? data.winner.charAt(0).toUpperCase() + data.winner.slice(1) : '?'} wins`;
    default:
      return type;
  }
}

// ── ReplaySummaryCard ──────────────────────────────────────────────────
function ReplaySummaryCard({
  replay,
  onClick,
}: {
  replay: GameReplaySummary;
  onClick: () => void;
}) {
  const winColor = WINNER_COLOR[replay.winner] ?? '#fff';
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-4 py-3 border transition-all active:scale-[0.98] hover:border-white/20"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: `${winColor}20`,
        boxShadow: `0 0 0 0 ${winColor}00`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${winColor}40`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${winColor}20`; }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl flex-shrink-0">{replay.winner === 'town' ? '🏙️' : replay.winner === 'mafia' ? '🎩' : '⚖️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-sm text-white/90 truncate">#{replay.roomName}</span>
            <span
              className="text-[12px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: `${winColor}15`, color: winColor, border: `1px solid ${winColor}30` }}
            >
              {replay.winner} win
            </span>
          </div>
          <p className="font-mono text-[12px] text-white/30">
            {replay.playerCount}p · {formatDuration(replay.durationMs)} · {formatDate(replay.createdAt)}
          </p>
        </div>
        <span className="text-white/20 text-lg flex-shrink-0">›</span>
      </div>
    </button>
  );
}

// ── ReplayViewer ───────────────────────────────────────────────────────
function ReplayViewer({
  replayId,
  onBack,
}: {
  replayId: string;
  onBack: () => void;
}) {
  const [replay, setReplay] = useState<GameReplayFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    emitWithAck<{ replayId: string }, Res<GameReplayFull>>('replay:get', { replayId })
      .then(res => {
        if (!res.ok) { setError(res.error); return; }
        setReplay(res.data);
      })
      .catch(() => setError('Failed to load replay'))
      .finally(() => setLoading(false));
  }, [replayId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !replay) {
    return (
      <div className="text-center py-10">
        <p className="text-neon-red font-mono text-sm">{error ?? 'Replay not found'}</p>
        <button onClick={onBack} className="mt-4 text-white/40 font-mono text-xs underline">← Back</button>
      </div>
    );
  }

  const winColor = WINNER_COLOR[replay.winner] ?? '#fff';
  const playerList = Object.entries(replay.playerRoles);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white/70 transition-colors font-mono text-sm"
        >
          ← Back
        </button>
      </div>

      <div
        className="rounded-2xl p-4 mb-4 border"
        style={{
          background: `${winColor}08`,
          borderColor: `${winColor}30`,
          boxShadow: `0 0 30px ${winColor}10`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-display font-bold text-lg text-white/90">#{replay.roomName}</span>
          <span
            className="text-sm font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full"
            style={{ background: `${winColor}20`, color: winColor, border: `1px solid ${winColor}40` }}
          >
            {replay.winner} wins
          </span>
        </div>
        <div className="flex gap-4 font-mono text-[12px] text-white/35">
          <span>{replay.playerCount} players</span>
          <span>{formatDuration(replay.durationMs)}</span>
          <span>{formatDate(replay.startedAt)}</span>
        </div>
      </div>

      {/* Player Roster */}
      {playerList.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-white/25 mb-2">Players</p>
          <div className="grid grid-cols-2 gap-1.5">
            {playerList.map(([profileId, info]) => {
              const teamColor = TEAM_COLOR[info.team] ?? TEAM_COLOR.unknown;
              return (
                <div
                  key={profileId}
                  className="rounded-xl px-3 py-2 border flex items-center gap-2"
                  style={{
                    background: `${teamColor}08`,
                    borderColor: `${teamColor}20`,
                    opacity: info.alive ? 1 : 0.5,
                  }}
                >
                  <span className="text-sm">{info.alive ? '🟢' : '💀'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] text-white/80 font-bold truncate">{info.username}</p>
                    <p className="font-mono text-[12px] truncate" style={{ color: teamColor }}>
                      {ROLE_LABEL[info.role] ?? info.role}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-white/25 mb-2">Timeline</p>
        <div className="space-y-1">
          {replay.events.map((event, idx) => {
            const isPhaseChange = event.type === 'phase_change';
            const isDeath = event.type === 'death';
            const isGameEnd = event.type === 'game_end';
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl px-3 py-2"
                style={{
                  background: isGameEnd
                    ? `${winColor}08`
                    : isDeath
                    ? 'rgba(255,30,60,0.06)'
                    : isPhaseChange
                    ? 'rgba(255,255,255,0.02)'
                    : 'transparent',
                  borderLeft: isDeath ? '2px solid rgba(255,30,60,0.3)' : isPhaseChange ? '2px solid rgba(255,255,255,0.08)' : '2px solid transparent',
                }}
              >
                <span className="text-sm flex-shrink-0 mt-0.5">{eventIcon(event.type, event.data)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] text-white/70 leading-snug">
                    {eventDescription(event)}
                  </p>
                </div>
                <span className="font-mono text-[12px] text-white/20 flex-shrink-0 mt-0.5">
                  {formatTime(event.t)}
                </span>
              </div>
            );
          })}
          {replay.events.length === 0 && (
            <p className="text-white/20 font-mono text-xs text-center py-4">No events recorded</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main ReplaysPage ───────────────────────────────────────────────────
type ReplaysTab = 'my' | 'all';

export function ReplaysPage({ initialReplayId }: { initialReplayId?: string }) {
  const [tab, setTab] = useState<ReplaysTab>('my');
  const [myReplays, setMyReplays] = useState<GameReplaySummary[]>([]);
  const [allReplays, setAllReplays] = useState<GameReplaySummary[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allOffset, setAllOffset] = useState(0);
  const [hasMoreAll, setHasMoreAll] = useState(true);
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(initialReplayId ?? null);

  const loadMyReplays = useCallback(async () => {
    setLoadingMy(true);
    try {
      const res = await emitWithAck<undefined, Res<GameReplaySummary[]>>('replay:my', undefined as any);
      if (res.ok) setMyReplays(res.data);
    } finally {
      setLoadingMy(false);
    }
  }, []);

  const loadAllReplays = useCallback(async (offset = 0, append = false) => {
    setLoadingAll(true);
    try {
      const res = await emitWithAck<{ limit: number; offset: number }, Res<GameReplaySummary[]>>(
        'replay:list',
        { limit: 20, offset },
      );
      if (res.ok) {
        if (append) {
          setAllReplays(prev => [...prev, ...res.data]);
        } else {
          setAllReplays(res.data);
        }
        setHasMoreAll(res.data.length === 20);
        setAllOffset(offset + res.data.length);
      }
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    loadMyReplays();
    loadAllReplays(0, false);
  }, [loadMyReplays, loadAllReplays]);

  if (selectedReplayId) {
    return (
      <motion.div
        key="viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-4 pt-4 pb-8 max-w-lg mx-auto"
      >
        <ReplayViewer replayId={selectedReplayId} onBack={() => setSelectedReplayId(null)} />
      </motion.div>
    );
  }

  const TABS: { id: ReplaysTab; label: string }[] = [
    { id: 'my',  label: '🎮 My Games' },
    { id: 'all', label: '🌐 All Games' },
  ];

  return (
    <motion.div
      key="list"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 pt-4 pb-8 max-w-lg mx-auto"
    >
      {/* Title */}
      <div className="mb-5">
        <p className="font-display font-bold text-2xl tracking-wide"
          style={{ color: 'rgba(0,229,255,0.9)', textShadow: '0 0 20px rgba(0,229,255,0.3)' }}>
          Game Replays
        </p>
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/25 mt-0.5">
          Review past games
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-xl font-mono text-xs transition-all"
            style={{
              background: tab === t.id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
              color: tab === t.id ? '#00e5ff' : 'rgba(255,255,255,0.35)',
              border: tab === t.id ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.07)',
              boxShadow: tab === t.id ? '0 0 14px rgba(0,229,255,0.1)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'my' && (
          <motion.div key="my" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loadingMy ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
              </div>
            ) : myReplays.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-4xl mb-3">📺</p>
                <p className="font-mono text-sm text-white/25">No replays yet</p>
                <p className="font-mono text-[12px] text-white/15 mt-1">Play a game to see replays here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myReplays.map(r => (
                  <ReplaySummaryCard key={r.id} replay={r} onClick={() => setSelectedReplayId(r.id)} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'all' && (
          <motion.div key="all" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loadingAll && allReplays.length === 0 ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
              </div>
            ) : allReplays.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-4xl mb-3">📺</p>
                <p className="font-mono text-sm text-white/25">No replays yet</p>
                <p className="font-mono text-[12px] text-white/15 mt-1">Replays appear here after games finish</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {allReplays.map(r => (
                    <ReplaySummaryCard key={r.id} replay={r} onClick={() => setSelectedReplayId(r.id)} />
                  ))}
                </div>
                {hasMoreAll && (
                  <button
                    onClick={() => loadAllReplays(allOffset, true)}
                    disabled={loadingAll}
                    className="w-full py-3 rounded-xl font-mono text-xs text-white/40 border border-white/08 hover:border-white/20 hover:text-white/60 transition-all disabled:opacity-40"
                  >
                    {loadingAll ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

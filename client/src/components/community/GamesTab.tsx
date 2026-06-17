import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCheckersStore } from '@/store/checkersStore';
import { CheckersGame } from '@/components/checkers/CheckersGame';
import type { CheckersMatchListItem } from '@/types/checkers';

export function GamesTab() {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const { match, matchList, isLoading, error, fetchList, createMatch, joinMatch, clearError } = useCheckersStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => { fetchList(); }, [fetchList]);

  const playerName = profile?.username ?? 'Player';

  async function handleCreate() {
    setShowCreate(false);
    await createMatch(playerName);
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setShowJoin(false);
    await joinMatch(joinCode.trim().toUpperCase(), playerName);
    setJoinCode('');
  }

  return (
    <div className="space-y-4">
      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={clearError}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.08)', borderColor: 'rgba(255,45,85,0.3)', color: '#ff2d55' }}
          >
            <span className="font-mono text-xs flex-1">{error}</span>
            <span className="text-xs opacity-60">✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkers Game Card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,6,28,0.7)', border: '1px solid rgba(155,0,255,0.2)' }}
      >
        {/* Card header */}
        <div
          className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ borderColor: 'rgba(155,0,255,0.15)', background: 'rgba(155,0,255,0.05)' }}
        >
          <span className="text-2xl">♟</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm leading-tight">{t.games.checkers.title}</p>
            <p className="font-mono text-[10px] text-white/35">{t.games.checkers.subtitle}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {!showCreate && !showJoin ? (
            <>
              <ActionButton onClick={handleCreate} accent="purple" loading={isLoading}>
                {t.games.checkers.createMatch}
              </ActionButton>
              <ActionButton onClick={() => setShowJoin(true)} accent="cyan">
                {t.games.checkers.joinMatch}
              </ActionButton>
            </>
          ) : showCreate ? (
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="flex-1 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.35), rgba(0,245,255,0.2))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
              >
                {isLoading ? '…' : t.games.checkers.createMatch}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                placeholder="CK-0000"
                maxLength={7}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors tracking-widest"
              />
              <button
                onClick={handleJoin}
                disabled={!joinCode.trim() || isLoading}
                className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00f5ff' }}
              >
                {isLoading ? '…' : t.games.checkers.joinMatch}
              </button>
              <button
                onClick={() => { setShowJoin(false); setJoinCode(''); }}
                className="px-3 py-2 rounded-xl font-mono text-xs text-white/40 border border-white/10 hover:text-white/70 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Open matches */}
      <OpenMatchesList
        matches={matchList}
        playerName={playerName}
        onJoin={code => joinMatch(code, playerName)}
      />

      {/* Checkers Game overlay */}
      <AnimatePresence>
        {match && <CheckersGame />}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({
  children, onClick, accent = 'purple', loading,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: 'purple' | 'cyan';
  loading?: boolean;
}) {
  const colors = {
    purple: { bg: 'rgba(155,0,255,0.12)', border: 'rgba(155,0,255,0.35)', color: '#c084fc' },
    cyan:   { bg: 'rgba(0,245,255,0.08)', border: 'rgba(0,245,255,0.25)', color: '#00f5ff' },
  };
  const c = colors[accent];
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
    >
      {loading ? '…' : children}
    </button>
  );
}

function OpenMatchesList({
  matches, playerName, onJoin,
}: {
  matches: CheckersMatchListItem[];
  playerName: string;
  onJoin: (code: string) => void;
}) {
  const t = useT();
  if (matches.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="font-mono text-xs text-white/25">{t.games.checkers.noOpenMatches}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 px-1">
        {t.games.checkers.openMatches}
      </p>
      {matches.map(m => (
        <MatchRow key={m.id} match={m} playerName={playerName} onJoin={onJoin} />
      ))}
    </div>
  );
}

function MatchRow({
  match, playerName, onJoin,
}: {
  match: CheckersMatchListItem;
  playerName: string;
  onJoin: (code: string) => void;
}) {
  const t = useT();
  const isWaiting = match.status === 'waiting';
  const isActive  = match.status === 'active';

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-white">
          {match.redName} vs {match.blackName ?? <span className="text-white/30">{t.games.checkers.waiting}</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[9px] text-white/30 tracking-widest">{match.code}</span>
          {isActive && (
            <span className="font-mono text-[9px] text-white/25">
              Turn: {match.currentTurn === 'red' ? match.redName : match.blackName}
            </span>
          )}
          {match.spectatorCount > 0 && (
            <span className="font-mono text-[9px] text-white/20">{match.spectatorCount} watching</span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {isWaiting && (
          <button
            onClick={() => onJoin(match.code)}
            className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}
          >
            {t.games.checkers.join}
          </button>
        )}
        {isActive && (
          <button
            onClick={() => onJoin(match.code)}
            className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: '#c084fc' }}
          >
            {t.games.checkers.spectate}
          </button>
        )}
      </div>
    </div>
  );
}

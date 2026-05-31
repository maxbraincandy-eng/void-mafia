import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { SFX } from '@/hooks/useSoundFX';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

export function VotingPanel() {
  const { room, myPlayer, submitVote, isLoading } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    submitVote: s.submitVote,
    isLoading: s.isLoading,
  }));
  const t = useT();

  // Two-tap: pendingId = first tap selection, confirmed by tapping the confirm card
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!room || !myPlayer) return null;

  if (!myPlayer.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="text-3xl">💀</div>
        <p className="text-white/40 font-mono text-sm">{t.game.voting.eliminated}</p>
      </div>
    );
  }

  const aliveAll = room.players.filter(p => p.isAlive && !p.isSpectator);
  const alivePlayers = aliveAll.filter(p => p.id !== myPlayer.id);
  const selectableIds = new Set(alivePlayers.map(p => p.id));
  const majorityThreshold = Math.ceil(aliveAll.length / 2);

  // Live vote counts
  const voteCounts: Record<string, number> = {};
  for (const p of room.players) {
    if (p.voteTarget) voteCounts[p.voteTarget] = (voteCounts[p.voteTarget] ?? 0) + 1;
  }
  const topVotes = Math.max(0, ...Object.values(voteCounts));
  const condemnedId = Object.entries(voteCounts).find(([, c]) => c >= majorityThreshold)?.[0] ?? null;

  const pendingPlayer = pendingId ? room.players.find(p => p.id === pendingId) : null;
  const hasVoted = !!myPlayer.voteTarget;

  const handleSelect = (id: string) => {
    if (id === pendingId) {
      SFX.voteConfirm();
      submitVote(id);
      setPendingId(null);
    } else {
      setPendingId(id);
    }
  };

  const handleConfirm = () => {
    if (!pendingId) return;
    SFX.voteConfirm();
    submitVote(pendingId);
    setPendingId(null);
  };

  return (
    <div className="space-y-3">
      {/* Vote status banner */}
      <div className={clsx(
        'px-3 py-2 rounded-xl border text-xs font-mono flex items-center gap-2',
        hasVoted
          ? 'border-neon-green/30 bg-neon-green/8 text-neon-green'
          : 'border-neon-red/20 bg-neon-red/5 text-white/50',
      )}>
        <span>{hasVoted ? '✓' : '○'}</span>
        <span>
          {hasVoted
            ? `${t.game.voting.voteOut}: ${room.players.find(p => p.id === myPlayer.voteTarget)?.name ?? '?'} · ${t.game.voting.changeVote}`
            : t.game.voting.instruction}
        </span>
      </div>

      {/* Majority reached alarm */}
      <AnimatePresence>
        {condemnedId && (
          <motion.div
            key="condemned"
            initial={{ opacity: 0, scaleX: 0.9, y: -6 }}
            animate={{ opacity: 1, scaleX: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', damping: 16 }}
            className="relative rounded-2xl overflow-hidden"
            style={{
              border: '1px solid rgba(255,45,85,0.5)',
              background: 'rgba(255,45,85,0.10)',
              boxShadow: '0 0 24px rgba(255,45,85,0.25)',
            }}
          >
            {/* Animated left stripe */}
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.7 }}
              className="absolute left-0 top-0 bottom-0 w-1 bg-neon-red"
            />
            <div className="pl-4 pr-3 py-2.5 flex items-center gap-3">
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
                className="text-xl"
              >
                ⚖️
              </motion.span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-red/70">Majority Reached</p>
                <p className="text-sm font-display font-bold text-white truncate">
                  {room.players.find(p => p.id === condemnedId)?.name} — Condemned
                </p>
              </div>
              <span
                className="font-mono font-bold text-lg"
                style={{ color: '#ff2d55', textShadow: '0 0 10px rgba(255,45,85,0.8)' }}
              >
                {voteCounts[condemnedId!]}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote tally */}
      {Object.keys(voteCounts).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {room.players
            .filter(p => voteCounts[p.id])
            .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
            .map(p => {
              const isCondemned = p.id === condemnedId;
              return (
                <motion.div
                  key={p.id}
                  animate={isCondemned ? { borderColor: ['rgba(255,45,85,0.3)', 'rgba(255,45,85,0.8)', 'rgba(255,45,85,0.3)'] } : {}}
                  transition={isCondemned ? { repeat: Infinity, duration: 0.9 } : {}}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/4 border border-white/6"
                >
                  <span className={clsx('text-xs truncate flex-1', isCondemned ? 'text-neon-red font-semibold' : 'text-white/60')}>
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <div
                      className={clsx('h-1 rounded-full', isCondemned ? 'bg-neon-red shadow-[0_0_6px_rgba(255,45,85,0.8)]' : 'bg-neon-red/60')}
                      style={{ width: `${((voteCounts[p.id] ?? 0) / topVotes) * 48}px` }}
                    />
                    <span className={clsx('font-bold font-mono text-xs w-4 text-right', isCondemned ? 'text-neon-red' : 'text-neon-red/70')}>
                      {voteCounts[p.id]}
                    </span>
                  </div>
                </motion.div>
              );
            })}
        </div>
      )}

      <PlayerList
        players={room.players}
        phase="voting"
        onSelectTarget={p => handleSelect(p.id)}
        selectableIds={selectableIds}
        selectedId={pendingId}
        showVotes
      />

      {/* Confirm / abstain row */}
      <AnimatePresence>
        {pendingPlayer && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="p-4 rounded-xl border border-neon-red/40 bg-neon-red/10 space-y-3"
          >
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">{t.game.voting.confirmTitle}</p>
            <p className="text-white font-semibold">
              {t.game.voting.confirmQuestion.replace('{name}', pendingPlayer.name)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                fullWidth
                loading={isLoading}
                onClick={handleConfirm}
              >
                {hasVoted ? t.game.voting.changeVote : t.game.voting.voteOut} {t.game.voting.confirm}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPendingId(null)}
              >
                {t.game.voting.cancel}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Abstain button always visible */}
      {!pendingId && (
        <div className="text-center">
          <button
            onClick={() => { submitVote(null); }}
            disabled={isLoading}
            className="text-xs text-white/30 font-mono hover:text-white/60 transition-colors disabled:opacity-40"
          >
            {myPlayer.voteTarget ? t.game.voting.clearVote : t.game.voting.abstain}
          </button>
        </div>
      )}
    </div>
  );
}

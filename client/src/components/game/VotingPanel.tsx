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

  const alivePlayers = room.players.filter(p => p.isAlive && p.id !== myPlayer.id);
  const selectableIds = new Set(alivePlayers.map(p => p.id));

  // Live vote counts
  const voteCounts: Record<string, number> = {};
  for (const p of room.players) {
    if (p.voteTarget) voteCounts[p.voteTarget] = (voteCounts[p.voteTarget] ?? 0) + 1;
  }
  const topVotes = Math.max(0, ...Object.values(voteCounts));

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
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-neon-red/20 bg-neon-red/5">
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">{t.game.voting.townVote}</p>
        <p className="text-sm text-white/80">{t.game.voting.instruction}</p>
      </div>

      {/* Vote tally */}
      {Object.keys(voteCounts).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {room.players
            .filter(p => voteCounts[p.id])
            .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
            .map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/4 border border-white/6">
                <span className="text-xs text-white/60 truncate flex-1">{p.name}</span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1 bg-neon-red rounded-full"
                    style={{ width: `${((voteCounts[p.id] ?? 0) / topVotes) * 48}px` }}
                  />
                  <span className="text-neon-red font-bold font-mono text-xs w-4 text-right">
                    {voteCounts[p.id]}
                  </span>
                </div>
              </div>
            ))}
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

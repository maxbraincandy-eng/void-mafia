import { useState } from 'react';
import { motion } from 'framer-motion';
import { PlayerPublic } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

export function VotingPanel() {
  const { room, myPlayer, submitVote, isLoading } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    submitVote: s.submitVote,
    isLoading: s.isLoading,
  }));

  const [selectedId, setSelectedId] = useState<string | null>(myPlayer?.voteTarget ?? null);

  if (!room || !myPlayer) return null;

  if (!myPlayer.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="text-3xl">💀</div>
        <p className="text-white/40 font-mono text-sm">Eliminated players cannot vote.</p>
      </div>
    );
  }

  const alivePlayers = room.players.filter(p => p.isAlive && p.id !== myPlayer.id);
  const selectableIds = new Set(alivePlayers.map(p => p.id));
  const hasVoted = !!myPlayer.voteTarget;

  // Live vote counts
  const voteCounts: Record<string, number> = {};
  for (const p of room.players) {
    if (p.voteTarget) {
      voteCounts[p.voteTarget] = (voteCounts[p.voteTarget] ?? 0) + 1;
    }
  }
  const topVotes = Math.max(0, ...Object.values(voteCounts));

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-neon-red/20 bg-neon-red/5">
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">Town Vote</p>
        <p className="text-sm text-white/80">
          Choose a player to eliminate. You can change your vote before time runs out.
        </p>
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
        onSelectTarget={p => setSelectedId(p.id)}
        selectableIds={selectableIds}
        selectedId={selectedId}
        showVotes
      />

      <div className="flex gap-2">
        {selectedId && selectedId !== myPlayer.voteTarget && (
          <motion.div className="flex-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              fullWidth
              variant="danger"
              loading={isLoading}
              onClick={() => submitVote(selectedId)}
            >
              {hasVoted ? 'Change Vote' : 'Vote Out'}: {room.players.find(p => p.id === selectedId)?.name}
            </Button>
          </motion.div>
        )}
        <Button
          variant="ghost"
          loading={isLoading}
          onClick={() => { setSelectedId(null); submitVote(null); }}
        >
          Abstain
        </Button>
      </div>
    </div>
  );
}

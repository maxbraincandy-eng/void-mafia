import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export function DoubleEliminationPanel() {
  const { room, myPlayer, submitDoubleElimVote, skipPhase, isLoading } = useGameStore();
  const [voted, setVoted] = useState(false);

  if (!room || !room.donModeState) return null;

  const me = myPlayer();
  const amAlive = me?.isAlive ?? false;
  const amSpectator = me?.isSpectator ?? false;
  const amHost = me?.isHost ?? false;
  const dm = room.donModeState;
  const candidates = dm.tieCandidates
    .map(id => room.players.find(p => p.id === id))
    .filter(Boolean);

  const totalVoters = room.players.filter(p => p.isAlive && !p.isSpectator).length;
  const yesVotes = dm.doubleElimYes;
  const noVotes = dm.doubleElimNo;

  const handleVote = async (yes: boolean) => {
    await submitDoubleElimVote(yes);
    setVoted(true);
  };

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-red/70" style={{ boxShadow: '0 0 6px rgba(221,17,68,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase text-neon-red/70">
            ორმაგი ელიმინაცია
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(221,17,68,0.25), transparent)' }} />
        </div>

        <div className="pl-4 space-y-1">
          <p className="text-white/60 text-sm font-mono">ხელახლა ფრე. ქალაქი წყვეტს — გამოვრიცხოთ ორივე?</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {candidates.map(p => p && (
              <span
                key={p.id}
                className="px-3 py-1 rounded-full text-xs font-mono border border-neon-red/30 text-neon-red/70 bg-neon-red/10"
              >
                {p.seat}. {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Vote progress */}
      <div className="rounded-xl border border-white/[0.06] px-4 py-3" style={{ background: 'rgba(10,6,28,0.5)' }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-mono text-white/30 uppercase tracking-widest">ხმები</span>
          <span className="text-xs font-mono text-white/25">{yesVotes + noVotes}/{totalVoters}</span>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="text-neon-red/80 text-sm font-mono font-bold">✓ {yesVotes}</span>
            <span className="text-white/25 text-xs font-mono">დიახ</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-sm font-mono font-bold">✗ {noVotes}</span>
            <span className="text-white/25 text-xs font-mono">არა</span>
          </div>
        </div>
      </div>

      {amAlive && !amSpectator && !voted && (
        <div className="flex gap-3">
          <button
            onClick={() => handleVote(true)}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-mono font-semibold transition-all disabled:opacity-40"
            style={{ background: 'rgba(221,17,68,0.2)', border: '1px solid rgba(221,17,68,0.4)', color: 'rgba(255,80,100,0.9)' }}
          >
            ✓ დიახ, ამოვრიცხოთ ორივე
          </button>
          <button
            onClick={() => handleVote(false)}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-mono transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
          >
            ✗ არა
          </button>
        </div>
      )}

      {voted && (
        <div className="rounded-xl border border-white/10 px-4 py-3" style={{ background: 'rgba(10,6,28,0.4)' }}>
          <p className="text-xs font-mono text-white/30">✓ ხმა მიცემულია. ელოდე სხვებს.</p>
        </div>
      )}

      {amHost && (
        <button
          onClick={() => skipPhase()}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-white/10 text-white/30 text-xs font-mono rounded-xl hover:border-neon-red/30 hover:text-neon-red/50 transition-all disabled:opacity-40"
        >
          ⏭ გამოტოვება
        </button>
      )}
    </div>
  );
}

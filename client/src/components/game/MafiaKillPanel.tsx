import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export function MafiaKillPanel() {
  const { room, myPlayer, submitMafiaKillVote, skipPhase, isLoading } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!room) return null;

  const me = myPlayer();
  const myRole = me?.role;
  const isMafia = myRole === 'mafia' || myRole === 'don';
  const amAlive = me?.isAlive ?? false;
  const amHost = me?.isHost ?? false;

  const alivePlayers = room.players.filter(p => p.isAlive && !p.isSpectator && p.team !== 'mafia');
  const myVote = me ? (room.mafiaVotes?.[me.id] ?? null) : null;
  const alreadyVoted = submitted || !!myVote;

  const handleSubmit = async () => {
    if (!selectedId) return;
    await submitMafiaKillVote(selectedId);
    setSubmitted(true);
  };

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-purple/70" style={{ boxShadow: '0 0 6px rgba(85,0,153,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase" style={{ color: 'rgba(155,0,255,0.7)' }}>
            მაფიის ქილი
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(85,0,153,0.25), transparent)' }} />
        </div>
        <p className="text-white/40 text-sm font-mono pl-4">
          {isMafia && amAlive
            ? 'ყველამ დამოუკიდებლად აირჩიოს ერთი და იგივე მსხვერპლი. თანხვედრა = ქილი.'
            : 'მაფია ირჩევს მსხვერპლს. მოიცადე.'}
        </p>
      </div>

      {isMafia && amAlive && !alreadyVoted && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest">
            მიუთითე სამიზნე — ყველა მაფიელი ერთსა და იმავეს უნდა ირჩევდეს
          </p>
          <div className="space-y-2">
            {alivePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                style={{
                  background: selectedId === p.id ? 'rgba(155,0,255,0.15)' : 'rgba(10,6,28,0.5)',
                  borderColor: selectedId === p.id ? 'rgba(155,0,255,0.5)' : 'rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-sm font-mono text-white/80">
                  {p.seat}. {p.name}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedId || isLoading}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-mono transition-all disabled:opacity-40"
            style={{
              background: selectedId ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(155,0,255,0.35)',
              color: selectedId ? 'rgba(200,130,255,0.9)' : 'rgba(255,255,255,0.3)',
            }}
          >
            🎯 ჩემი ქილი
          </button>
        </div>
      )}

      {alreadyVoted && isMafia && amAlive && (
        <div className="rounded-xl border border-neon-purple/20 px-4 py-3" style={{ background: 'rgba(20,0,30,0.5)' }}>
          <p className="text-xs font-mono text-neon-purple/60">
            ✓ ხმა მიცემულია. ელოდე სხვა მაფიელებს — ქილი მოხდება მხოლოდ სრული თანხვედრისას.
          </p>
        </div>
      )}

      {amHost && (
        <button
          onClick={() => skipPhase()}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-white/10 text-white/30 text-xs font-mono rounded-xl hover:border-neon-purple/30 hover:text-neon-purple/50 transition-all disabled:opacity-40"
        >
          ⏭ გამოტოვება
        </button>
      )}
    </div>
  );
}

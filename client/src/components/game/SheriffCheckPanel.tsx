import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export function SheriffCheckPanel() {
  const { room, myPlayer, submitSheriffCheck, skipPhase, isLoading } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!room) return null;

  const me = myPlayer();
  const isSheriff = me?.role === 'sheriff';
  const amHost = me?.isHost ?? false;
  const amAlive = me?.isAlive ?? false;

  const alivePlayers = room.players.filter(p => p.isAlive && !p.isSpectator && p.id !== me?.id);
  const sheriffCheckDone = room.donModeState?.sheriffCheckDone ?? false;

  const handleSubmit = async () => {
    if (!selectedId) return;
    await submitSheriffCheck(selectedId);
    setSubmitted(true);
  };

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.9)', boxShadow: '0 0 6px rgba(59,130,246,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase" style={{ color: 'rgba(96,165,250,0.85)' }}>
            შერიფის შემოწმება
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.25), transparent)' }} />
        </div>
        <p className="text-white/40 text-sm font-mono pl-4">
          {isSheriff && amAlive
            ? sheriffCheckDone
              ? 'შემოწმება შესრულებულია. ღამე მთავრდება.'
              : 'აირჩიე ერთი მოთამაშე შესამოწმებლად — მაფიაა თუ არა.'
            : 'შერიფი ამოწმებს მოთამაშეს. მოიცადე.'}
        </p>
      </div>

      {isSheriff && amAlive && !sheriffCheckDone && !submitted && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest">აირჩიე სამოწმებელი მოთამაშე</p>
          <div className="space-y-2">
            {alivePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                style={{
                  background: selectedId === p.id ? 'rgba(59,130,246,0.2)' : 'rgba(10,6,28,0.5)',
                  borderColor: selectedId === p.id ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-sm font-mono text-white/80">
                  {p.seat}. {p.name}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!selectedId || isLoading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono transition-all disabled:opacity-40"
              style={{
                background: selectedId ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(59,130,246,0.4)',
                color: selectedId ? 'rgba(147,197,253,0.95)' : 'rgba(255,255,255,0.3)',
              }}
            >
              🔎 შემოწმება
            </button>
            <button
              onClick={() => { submitSheriffCheck(null); setSubmitted(true); }}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-mono text-white/30 border border-white/10 hover:border-white/20 hover:text-white/50 transition-all disabled:opacity-40"
            >
              გამოტოვება
            </button>
          </div>
        </div>
      )}

      {(submitted || sheriffCheckDone) && isSheriff && amAlive && (
        <div className="rounded-xl border px-4 py-3" style={{ background: 'rgba(10,20,40,0.5)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <p className="text-xs font-mono" style={{ color: 'rgba(96,165,250,0.7)' }}>✓ შემოწმება შესრულებულია. შედეგი გამოჩნდა პირადად.</p>
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

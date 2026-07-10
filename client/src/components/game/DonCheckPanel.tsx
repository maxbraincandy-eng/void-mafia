import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';

export function DonCheckPanel() {
  const t = useT();
  const { room, myPlayer, submitDonCheck, skipPhase, isLoading } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!room) return null;

  const me = myPlayer();
  const myRole = me?.role;
  const isDon = myRole === 'don';
  const amHost = me?.isHost ?? false;
  const amAlive = me?.isAlive ?? false;

  const alivePlayers = room.players.filter(p => p.isAlive && !p.isSpectator && p.id !== me?.id);
  const donCheckDone = room.donModeState?.donCheckDone ?? false;

  const handleSubmit = async () => {
    if (!selectedId) return;
    await submitDonCheck(selectedId);
    setSubmitted(true);
  };

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(102,0,204,0.9)', boxShadow: '0 0 6px rgba(102,0,204,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase" style={{ color: 'rgba(102,0,204,0.8)' }}>
            {t.gamePanels.donTitle}
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(102,0,204,0.25), transparent)' }} />
        </div>
        <p className="text-white/40 text-sm font-mono pl-4">
          {isDon && amAlive
            ? donCheckDone
              ? t.gamePanels.donDone
              : t.gamePanels.donPick
            : t.gamePanels.donWait}
        </p>
      </div>

      {isDon && amAlive && !donCheckDone && !submitted && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest">{t.gamePanels.pickTarget}</p>
          <div className="space-y-2">
            {alivePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                style={{
                  background: selectedId === p.id ? 'rgba(102,0,204,0.2)' : 'rgba(10,6,28,0.5)',
                  borderColor: selectedId === p.id ? 'rgba(102,0,204,0.6)' : 'rgba(255,255,255,0.06)',
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
                background: selectedId ? 'rgba(102,0,204,0.25)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(102,0,204,0.4)',
                color: selectedId ? 'rgba(200,130,255,0.9)' : 'rgba(255,255,255,0.3)',
              }}
            >
              {t.gamePanels.donCheckBtn}
            </button>
            <button
              onClick={() => { submitDonCheck(null); setSubmitted(true); }}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-mono text-white/30 border border-white/10 hover:border-white/20 hover:text-white/50 transition-all disabled:opacity-40"
            >
              {t.gamePanels.skipPlain}
            </button>
          </div>
        </div>
      )}

      {(submitted || donCheckDone) && isDon && amAlive && (
        <div className="rounded-xl border border-neon-purple/20 px-4 py-3" style={{ background: 'rgba(20,0,30,0.5)' }}>
          <p className="text-xs font-mono text-neon-purple/60">{t.gamePanels.checkDonePrivate}</p>
        </div>
      )}

      {amHost && (
        <button
          onClick={() => skipPhase()}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-white/10 text-white/30 text-xs font-mono rounded-xl hover:border-neon-purple/30 hover:text-neon-purple/50 transition-all disabled:opacity-40"
        >
          {t.gamePanels.skip}
        </button>
      )}
    </div>
  );
}

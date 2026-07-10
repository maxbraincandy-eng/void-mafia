import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';

export function PlanningNightPanel() {
  const { room, myPlayer, skipPhase, isLoading } = useGameStore();
  const t = useT();

  if (!room) return null;

  const amHost = myPlayer()?.isHost ?? false;
  const amAlive = myPlayer()?.isAlive ?? false;
  const myRole = room.players.find(p => p.id === myPlayer()?.id)?.role;
  const isMafia = myRole === 'mafia' || myRole === 'don';

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-purple/70" style={{ boxShadow: '0 0 6px rgba(155,0,255,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase" style={{ color: 'rgba(155,0,255,0.8)' }}>
            {t.gamePanels.planTitle}
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(155,0,255,0.25), transparent)' }} />
        </div>
        <p className="text-white/40 text-sm font-mono pl-4">
          {isMafia
            ? t.gamePanels.planMafia
            : t.gamePanels.planWait}
        </p>
      </div>

      {isMafia && amAlive && (
        <div className="rounded-2xl border border-neon-purple/20 p-4" style={{ background: 'rgba(30,0,40,0.6)' }}>
          <p className="text-xs font-mono tracking-widest uppercase text-neon-purple/60 mb-2">{t.gamePanels.mafiaRoom}</p>
          <p className="text-white/50 text-sm font-mono">
            {t.gamePanels.planUseTime}
          </p>
        </div>
      )}

      {amHost && (
        <button
          onClick={() => skipPhase()}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-neon-purple/20 text-neon-purple/50 text-xs font-mono rounded-xl hover:border-neon-purple/50 hover:text-neon-purple/80 transition-all disabled:opacity-40"
        >
          {t.gamePanels.skipPhase}
        </button>
      )}
    </div>
  );
}

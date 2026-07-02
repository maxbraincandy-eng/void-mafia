import { useGameStore } from '@/store/gameStore';

export function TieDefensePanel() {
  const { room, myPlayer, skipPhase, isLoading } = useGameStore();

  if (!room || !room.donModeState) return null;

  const me = myPlayer();
  const amHost = me?.isHost ?? false;
  const dm = room.donModeState;
  const currentDefenderId = dm.defenseQueue[dm.currentDefenseIdx] ?? null;
  const currentDefender = room.players.find(p => p.id === currentDefenderId);
  const isMyDefense = currentDefenderId === me?.id && (me?.isAlive ?? false);
  const total = dm.defenseQueue.length;
  const current = dm.currentDefenseIdx + 1;

  return (
    <div className="space-y-4">
      <div className="py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-red/70" style={{ boxShadow: '0 0 6px rgba(255,45,85,0.8)' }} />
          <span className="font-mono text-[12px] tracking-[0.25em] uppercase text-neon-red/70">
            თავდაცვა (ფრე)
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(255,45,85,0.25), transparent)' }} />
          <span className="text-[12px] font-mono text-white/25">{current}/{total}</span>
        </div>

        {currentDefender ? (
          <div className="pl-4 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-base">{currentDefender.name}</p>
              <span className="px-2 py-0.5 rounded-full text-[12px] font-mono uppercase tracking-widest bg-neon-red/15 border border-neon-red/30 text-neon-red/80">
                ფრე
              </span>
            </div>
            <p className="text-white/35 text-xs font-mono">
              {isMyDefense
                ? 'შენ ხარ ახლა! გამოიყენე 30 წამი თავის გასამართლებლად.'
                : `${currentDefender.name} განმარტავს. ყურადღებით მოუსმინე.`}
            </p>
          </div>
        ) : (
          <p className="text-white/40 text-sm font-mono pl-4">იტვირთება...</p>
        )}
      </div>

      <div className="rounded-xl border border-neon-red/15 px-4 py-3" style={{ background: 'rgba(20,0,6,0.5)' }}>
        <p className="text-xs font-mono text-white/30">
          ⚖️ ფრეს შემდეგ — ხელახალი კენჭისყრა ორ კანდიდატს შორის.
        </p>
      </div>

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

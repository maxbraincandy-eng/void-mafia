import { useHermesStore, HermesMode } from '@/store/hermesStore';
import { useT } from '@/store/langStore';

const MODES: HermesMode[] = [
  'general', 'philosopher', 'mafia_coach', 'debate_helper', 'recommendations', 'void_oracle',
];

export function HermesModeSelector() {
  const { mode, setMode } = useHermesStore();
  const t = useT();

  const labels: Record<HermesMode, string> = {
    general:        t.hermes.modes.general,
    philosopher:    t.hermes.modes.philosopher,
    mafia_coach:    t.hermes.modes.mafiaCoach,
    debate_helper:  t.hermes.modes.debateHelper,
    recommendations: t.hermes.modes.recommendations,
    void_oracle:    t.hermes.modes.voidOracle,
  };

  return (
    <div className="px-4 pb-3 flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-2" style={{ width: 'max-content' }}>
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`
              px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-widest whitespace-nowrap
              transition-all duration-150
              ${mode === m
                ? 'bg-neon-cyan/12 border border-neon-cyan/45 text-neon-cyan'
                : 'bg-white/4 border border-white/10 text-white/35 hover:text-white/55 hover:border-white/18'}
            `}
          >
            {labels[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

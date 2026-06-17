import { useHermesStore, HermesMode } from '@/store/hermesStore';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';

export function HermesQuickPrompts() {
  const { mode, context, sendMessage } = useHermesStore();
  const profile = useAuthStore(s => s.profile);
  const t = useT();
  const uid = profile?.id ?? '';

  const prompts = resolvePrompts(mode, context?.source, t.hermes.quickPromptsData);
  if (prompts.length === 0) return null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-white/18 mb-2.5">
        {t.hermes.quickPromptsLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.map(p => (
          <button
            key={p}
            onClick={() => sendMessage(p, uid)}
            className="px-3 py-2 rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/14 transition-colors font-mono text-[10px] text-white/38 hover:text-white/62 text-left"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function resolvePrompts(
  mode: HermesMode,
  source: string | undefined,
  data: Record<string, readonly string[]>,
): readonly string[] {
  if (source === 'debate') return data.debate ?? [];
  if (source === 'game')   return data.game   ?? [];

  switch (mode) {
    case 'philosopher':    return data.philosopher    ?? [];
    case 'mafia_coach':    return data.game           ?? [];
    case 'debate_helper':  return data.debate         ?? [];
    case 'recommendations':return data.recommendations ?? [];
    case 'void_oracle':    return data.voidOracle     ?? [];
    default:               return data.general        ?? [];
  }
}

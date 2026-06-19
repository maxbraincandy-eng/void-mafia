import { useLangStore } from '@/store/langStore';

export function LanguageSwitcher() {
  const { lang, setLang } = useLangStore();

  return (
    <div className="flex items-center gap-0.5 bg-void-50/60 border border-white/8 rounded-lg p-0.5">
      <button
        onClick={() => setLang('en')}
        className={`px-2 py-1 rounded text-[12px] font-mono font-bold tracking-wider transition-all ${
          lang === 'en'
            ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/25'
            : 'text-white/25 hover:text-white/50'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLang('ka')}
        className={`px-2 py-1 rounded text-[12px] font-mono font-bold tracking-wider transition-all ${
          lang === 'ka'
            ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/25'
            : 'text-white/25 hover:text-white/50'
        }`}
      >
        ქარ
      </button>
    </div>
  );
}

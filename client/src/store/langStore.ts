import { create } from 'zustand';
import { TRANSLATIONS, Lang, T } from '@/i18n/translations';

interface LangStore {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const KEY = 'void-mafia-lang';

export const useLangStore = create<LangStore>((set) => ({
  lang: (localStorage.getItem(KEY) as Lang | null) ?? 'ka',
  setLang: (lang) => {
    localStorage.setItem(KEY, lang);
    set({ lang });
  },
}));

export function useT(): T {
  const lang = useLangStore(s => s.lang);
  return TRANSLATIONS[lang] as unknown as T;
}

/**
 * Non-reactive accessor for code that can't call hooks (stores, engines,
 * toasts, class components, module-level helpers). Reads the CURRENT
 * language at call time — call it inside the function that builds the
 * string, not at module scope.
 */
export function tNow(): T {
  return TRANSLATIONS[useLangStore.getState().lang] as unknown as T;
}

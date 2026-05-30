import { create } from 'zustand';
import { TRANSLATIONS, Lang, T } from '@/i18n/translations';

interface LangStore {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const KEY = 'void-mafia-lang';

export const useLangStore = create<LangStore>((set) => ({
  lang: (localStorage.getItem(KEY) as Lang | null) ?? 'en',
  setLang: (lang) => {
    localStorage.setItem(KEY, lang);
    set({ lang });
  },
}));

export function useT(): T {
  const lang = useLangStore(s => s.lang);
  return TRANSLATIONS[lang] as unknown as T;
}

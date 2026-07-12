// Tiny shared i18n for the standalone tool pages (they don't use the main app's
// LanguageContext). Language is shared with the main site via localStorage 'language'.
export type Lang = 'sk' | 'en';

export function getLang(): Lang {
  try {
    return localStorage.getItem('language') === 'en' ? 'en' : 'sk';
  } catch {
    return 'sk';
  }
}

export function persistLang(l: Lang) {
  try {
    localStorage.setItem('language', l);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.lang = l;
    document.documentElement.lang = l; // keep <html lang> honest for SEO/a11y
  }
}

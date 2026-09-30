export const APP_LANG_STORAGE_KEY = 'araf_lang';
export const APP_THEME_STORAGE_KEY = 'araf_theme_mode';

// [TR] İlk dil kararını SSR-safe şekilde hesaplar:
//      1) localStorage tercihi (EN/TR) 2) yoksa EN fallback.
// [EN] Computes initial language in an SSR-safe way:
//      1) persisted localStorage preference (EN/TR) 2) fallback EN.
export const getInitialLang = () => {
  if (typeof window === 'undefined') return 'EN';
  const savedLang = window.localStorage.getItem(APP_LANG_STORAGE_KEY);
  if (savedLang === 'TR' || savedLang === 'EN') return savedLang;
  return 'EN';
};

// [TR] Kullanım koşulları kabulü artık cüzdan+sürüm başına: bkz. app/legal/terms.js.

// [TR] Tema modunu SSR-safe şekilde hydrate eder (system/day/night).
// [EN] Hydrates theme mode in an SSR-safe manner (system/day/night).
export const getInitialThemeMode = () => {
  if (typeof window === 'undefined') return 'system';
  const savedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  if (savedTheme === 'system' || savedTheme === 'day' || savedTheme === 'night') return savedTheme;
  return 'system';
};

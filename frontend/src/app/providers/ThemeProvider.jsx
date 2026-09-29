import React from 'react';
import { APP_THEME_STORAGE_KEY, getInitialThemeMode } from '../bootstrapState';

const ThemeContext = React.createContext({ themeMode: 'system', setThemeMode: () => {} });

const resolveTheme = (mode) => {
  if (mode === 'day' || mode === 'night') return mode;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'night';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = React.useState(getInitialThemeMode);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const applyTheme = () => {
      const resolved = resolveTheme(themeMode);
      document.documentElement.dataset.theme = resolved;
      // [TR] Mobil tarayıcı/PWA durum çubuğu uygulama kabuğuyla aynı renkte olsun.
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'day' ? '#f1f5f9' : '#0c0c0e');
    };

    applyTheme();

    if (themeMode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [themeMode]);

  const value = React.useMemo(() => ({ themeMode, setThemeMode }), [themeMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = () => React.useContext(ThemeContext);

export default ThemeProvider;

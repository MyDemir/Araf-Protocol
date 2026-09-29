import React from 'react';

// [TR] Mobilde tarayıcı çubuklarını gizlemenin iki yolu var:
//      1) Fullscreen API (Android Chrome/Firefox; kullanıcı dokunuşu gerekir)
//      2) Ana ekrana ekleme (PWA, manifest display: standalone) — iOS'ta tek yol budur.
// [EN] Two ways to drop browser chrome on mobile: the Fullscreen API, or installing as a PWA.
const getFsElement = () => (typeof document === 'undefined' ? null : (document.fullscreenElement || document.webkitFullscreenElement || null));

// [TR] Chrome, Fullscreen API ile tam ekrana geçilince de `display-mode: fullscreen` eşleştirir. Önceden bu
//      durum "kurulu uygulama" sanılıyor, menüdeki tam ekran bölümü gizleniyor ve çıkış butonu kayboluyordu.
//      Artık yalnız gerçek kurulum (standalone / iOS ana ekran) sayılır; API ile tam ekran hariç tutulur.
// [EN] Chrome matches `display-mode: fullscreen` during Fullscreen API mode too; that hid the toggle.
export const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  const apiFullscreen = Boolean(getFsElement());
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches
    || (!apiFullscreen && window.matchMedia?.('(display-mode: fullscreen)').matches)
    || window.navigator?.standalone);
};

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = React.useState(() => Boolean(getFsElement()));
  const [installPrompt, setInstallPrompt] = React.useState(null);
  const supported = typeof document !== 'undefined'
    && Boolean(document.documentElement?.requestFullscreen || document.documentElement?.webkitRequestFullscreen);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setIsFullscreen(Boolean(getFsElement()));
    const onInstall = (event) => { event.preventDefault(); setInstallPrompt(event); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  const toggle = React.useCallback(async () => {
    const el = document.documentElement;
    try {
      if (getFsElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    } catch {
      // [TR] Tarayıcı reddederse sessiz geçilir; kullanıcı ana ekrana ekleme yolunu kullanabilir.
    }
  }, []);

  const install = React.useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    return true;
  }, [installPrompt]);

  return { supported, isFullscreen, toggle, canInstall: Boolean(installPrompt), install, isStandalone: isStandaloneDisplay() };
};

export default useFullscreen;

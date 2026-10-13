// [TR] Mobil tarayıcıda (iPhone Safari, Android Chrome) injected cüzdan yoktur; kullanıcı siteyi
//      cüzdan uygulamasının dahili tarayıcısında açmalıdır. Bu modül yalnız saf yardımcıları içerir.
// [EN] Mobile Safari/Chrome has no injected wallet; the user must open the site inside the wallet app's
//      in-app browser. This module only holds pure helpers.

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;

export const isMobileUserAgent = (ua = '') => MOBILE_UA.test(String(ua || ''));

// [TR] iPadOS 13+ masaüstü UA bildirir: MacIntel + dokunmatik noktası > 1.
export const isMobileEnvironment = (nav = typeof navigator !== 'undefined' ? navigator : null) => {
  if (!nav) return false;
  if (isMobileUserAgent(nav.userAgent)) return true;
  return nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1;
};

export const hasInjectedProvider = (win = typeof window !== 'undefined' ? window : null) => Boolean(win && win.ethereum);

// [TR] Seçim modalı yalnız: mobil + injected sağlayıcı yok.
export const shouldShowMobileWalletPicker = (nav, win) => isMobileEnvironment(nav) && !hasInjectedProvider(win);

// [TR] Yönlendirme URL'si YALNIZ location.origin + location.pathname'den üretilir; query/hash/kullanıcı girdisi
//      dahil edilmez (open redirect yok). Yalnız http(s) origin kabul edilir.
export const buildCurrentSiteUrl = (loc = typeof window !== 'undefined' ? window.location : null) => {
  if (!loc || typeof loc.origin !== 'string' || typeof loc.pathname !== 'string') return null;
  if (!/^https?:\/\/[^/?#\s]+$/i.test(loc.origin)) return null;
  const path = loc.pathname.startsWith('/') ? loc.pathname : `/${loc.pathname}`;
  return `${loc.origin}${path}`;
};

// [TR] Biçimler (resmi dokümanlarla doğrulanmalı):
//   MetaMask: https://metamask.app.link/dapp/<host><path>
//   OKX:      https://www.okx.com/download?deeplink=<enc(okx://wallet/dapp/url?dappUrl=<enc(url)>)>
//   Trust:    https://link.trustwallet.com/open_url?coin_id=60&url=<enc(url)>
//   Coinbase: https://go.cb-w.com/dapp?cb_url=<enc(url)>
export const buildWalletDeepLinks = (loc) => {
  const url = buildCurrentSiteUrl(loc);
  if (!url) return [];
  const withoutScheme = url.replace(/^https?:\/\//i, '');
  const enc = encodeURIComponent(url);
  return [
    { id: 'metamask', name: 'MetaMask', href: `https://metamask.app.link/dapp/${withoutScheme}` },
    { id: 'okx', name: 'OKX Wallet', href: `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${enc}`)}` },
    { id: 'trust', name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${enc}` },
    { id: 'coinbase', name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${enc}` },
  ];
};

// [TR] "Hiçbir şey olmuyor" yerine anlaşılır bağlantı hatası mesajı.
export const describeConnectError = (err, lang = 'TR') => {
  const tr = lang === 'TR';
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  if (err?.code === 4001 || /UserRejected|rejected|denied/i.test(`${name} ${msg}`)) {
    return tr ? 'Bağlantı isteği iptal edildi.' : 'Connection request was cancelled.';
  }
  if (/ProviderNotFound|not found/i.test(`${name} ${msg}`)) {
    return tr
      ? 'Bu tarayıcıda cüzdan bulunamadı. Siteyi cüzdan uygulamasının tarayıcısında açın veya Coinbase ile bağlanın.'
      : 'No wallet found in this browser. Open the site inside your wallet app browser or connect with Coinbase.';
  }
  return tr ? 'Cüzdan bağlanamadı. Lütfen tekrar deneyin.' : 'Could not connect the wallet. Please try again.';
};

const authenticatedFetch = React.useCallback(async (url, options = {}) => {
  const walletHeader = connectedWallet ? { 'x-wallet-address': connectedWallet } : {};
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...walletHeader,
    },
    credentials: 'include',
  });

  // Wallet mismatch yalnız UI temizliği değildir.
  // Önce backend session'ı kapatmayı dener, sonra local state temizlenir.
  if (res.status === 409) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (_) {
      // Logout başarısız olsa bile local session yine temizlenir.
    }

    clearLocalSessionState();
    showToast(
      lang === 'TR'
        ? 'Oturum cüzdan uyuşmazlığı nedeniyle sonlandırıldı. Lütfen yeniden giriş yapın.'
        : 'Session ended due to wallet mismatch. Please sign in again.',
      'error'
    );
    return res;
  }

  if (res.status !== 401) return res;

  try {
    const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ wallet: address?.toLowerCase() }),
    });

    if (!refreshRes.ok) {
      console.warn('[Auth] Refresh token expired — re-login required');
      clearLocalSessionState();
      showToast(
        lang === 'TR'
          ? 'Oturumunuz sona erdi. Lütfen tekrar imzalayın.'
          : 'Session expired. Please sign in again.',
        'error'
      );
      return res;
    }

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...walletHeader,
      },
      credentials: 'include',
    });
  } catch (err) {
    console.error('[Auth] Refresh failed:', err);
    return res;
  }
}, [connectedWallet, address, lang, clearLocalSessionState]);
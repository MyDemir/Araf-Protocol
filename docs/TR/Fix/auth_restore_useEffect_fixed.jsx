useEffect(() => {
  if (!isConnected || !connectedWallet) {
    clearLocalSessionState();
    setAuthChecked(true);
    return;
  }

  fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',
    headers: { 'x-wallet-address': connectedWallet },
  })
    .then(async (res) => {
      // Backend mismatch'i açıkça 409 ile bildirirse bunu sessizce restore etmeyiz.
      if (res.status === 409) {
        clearLocalSessionState();
        setAuthChecked(true);
        showToast(
          lang === 'TR'
            ? 'Oturum cüzdanınızla eşleşmiyor. Lütfen yeniden giriş yapın.'
            : 'Session does not match your wallet. Please sign in again.',
          'info'
        );
        return;
      }

      if (!res.ok) {
        clearLocalSessionState();
        setAuthChecked(true);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const sessionWallet = data?.wallet?.toLowerCase?.() || null;

      // Session yalnız exact wallet match varsa geçerli kabul edilir.
      if (!sessionWallet) {
        await bestEffortBackendLogout();
        clearLocalSessionState();
        setAuthChecked(true);
        return;
      }

      if (sessionWallet !== connectedWallet) {
        await bestEffortBackendLogout();
        clearLocalSessionState();
        showToast(
          lang === 'TR'
            ? 'Bağlı cüzdan oturumla eşleşmiyor. Lütfen yeniden imzalayın.'
            : 'Connected wallet does not match session. Please sign in again.',
          'info'
        );
        setAuthChecked(true);
        return;
      }

      setIsAuthenticated(true);
      setAuthenticatedWallet(sessionWallet);
      authenticatedWalletRef.current = sessionWallet;
      setAuthChecked(true);
    })
    .catch(() => {
      clearLocalSessionState();
      setAuthChecked(true);
    });
}, [isConnected, connectedWallet, clearLocalSessionState, bestEffortBackendLogout, lang]);
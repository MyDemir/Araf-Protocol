const handleStartTrade = async (order) => {
  if (!window.confirm(lang === 'TR' ? 'İşlemi onaylıyor musunuz?' : 'Do you confirm the transaction?')) return;
  if (isBanned) {
    showToast(
      lang === 'TR'
        ? '🚫 Taker kısıtlamanız aktif. Süre için on-chain kaydınızı kontrol edin.'
        : '🚫 Taker restriction active. Check on-chain record for duration.',
      'error'
    );
    return;
  }
  if (!order.onchainId) {
    showToast(
      lang === 'TR'
        ? 'Bu ilanın on-chain ID\'si henüz yok. Lütfen daha sonra tekrar deneyin.'
        : 'This listing has no on-chain ID yet. Please try again later.',
      'error'
    );
    return;
  }
  if (isContractLoading) return;

  let tokenAddress = null;
  let didIncreaseAllowance = false;

  try {
    setIsContractLoading(true);
    tokenAddress = SUPPORTED_TOKEN_ADDRESSES[order.crypto || 'USDT'];

    if (!tokenAddress) {
      showToast(
        lang === 'TR'
          ? `${order.crypto} token adresi .env dosyasında tanımlı değil.`
          : `${order.crypto} token address not configured.`,
        'error'
      );
      return;
    }

    if (!onchainBondMap) {
      showToast(lang === 'TR' ? 'Protokol ayarları yükleniyor...' : 'Loading protocol config...', 'info');
      setIsContractLoading(false);
      return;
    }

    const tier = order.tier ?? 1;
    let cryptoAmtRaw = 0n;

    // Öncelik on-chain trade verisinde.
    // Böylece fiat/crypto karışıklığında UI cache yerine contract state baz alınır.
    const onchainTrade = await getTrade(BigInt(order.onchainId));
    if (onchainTrade) {
      const amountFromChain = typeof onchainTrade.cryptoAmount !== 'undefined' ? onchainTrade.cryptoAmount : onchainTrade[4];
      const tokenFromChain = typeof onchainTrade.tokenAddress !== 'undefined' ? onchainTrade.tokenAddress : onchainTrade[3];

      if (amountFromChain && BigInt(amountFromChain) > 0n) {
        cryptoAmtRaw = BigInt(amountFromChain);
      }
      if (tokenFromChain && tokenFromChain !== '0x0000000000000000000000000000000000000000') {
        tokenAddress = tokenFromChain;
      }
    }

    if (cryptoAmtRaw === 0n) {
      showToast(
        lang === 'TR'
          ? 'On-chain işlem tutarı okunamadı. Lütfen daha sonra tekrar deneyin.'
          : 'Failed to read on-chain trade amount. Please try again.',
        'error'
      );
      return;
    }

    const takerBondBps = BigInt(onchainBondMap[tier]?.takerBps ?? 0);
    const takerBond = (cryptoAmtRaw * takerBondBps) / 10000n;

    if (takerBond > 0n) {
      const currentAllowance = await getAllowance(tokenAddress, address);
      if (currentAllowance < takerBond) {
        setLoadingText(
          lang === 'TR'
            ? `Adım 1/2: ${order.crypto} izni veriliyor...`
            : `Step 1/2: Approving ${order.crypto}...`
        );
        await approveToken(tokenAddress, takerBond);
        didIncreaseAllowance = true;
      }
    }

    setLoadingText(
      lang === 'TR'
        ? 'Adım 2/2: İşlem kilitleniyor...'
        : 'Step 2/2: Locking trade...'
    );
    await lockEscrow(BigInt(order.onchainId));

    // Backend trade kaydı listener gecikmesiyle gelebilir.
    // Bu yüzden birkaç deneme yapılır; gerçek trade ID yoksa sahte/fallback ID ile devam edilmez.
    let realTradeId = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await authenticatedFetch(`${API_URL}/api/trades/by-escrow/${order.onchainId}`);
        if (res.ok) {
          const data = await res.json();
          realTradeId = data.trade?._id;
          if (realTradeId) break;
        }
      } catch (_) {}
      if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
    }

    if (!realTradeId) {
      showToast(
        lang === 'TR'
          ? '⚠️ İşlem zincire yazıldı ancak backend kaydı henüz oluşmadı. Birkaç saniye sonra "Aktif İşlemler" ekranını kontrol edin.'
          : '⚠️ Trade was written on-chain but backend record is not ready yet. Check "Active Trades" in a few seconds.',
        'info'
      );

      setActiveTrade({
        ...order,
        id: null,
        onchainId: order.onchainId,
        _pendingBackendSync: true,
      });
      setTradeState('LOCKED');
      setCancelStatus(null);
      setChargebackAccepted(false);
      setCurrentView('tradeRoom');
      return;
    }

    setActiveTrade({ ...order, id: realTradeId, onchainId: order.onchainId });
    setTradeState('LOCKED');
    setCancelStatus(null);
    setChargebackAccepted(false);
    setCurrentView('tradeRoom');
    showToast(lang === 'TR' ? '🔒 İşlem başarıyla kilitlendi!' : '🔒 Trade locked successfully!', 'success');
  } catch (err) {
    console.error('handleStartTrade error:', err);

    if (didIncreaseAllowance && tokenAddress) {
      try { await approveToken(tokenAddress, 0n); } catch (_) {}
    }

    const errorMessage = err.shortMessage || err.reason || err.message || (lang === 'TR' ? 'İşlem kilitlenemedi.' : 'Failed to lock trade.');
    if (errorMessage.includes('rejected') || errorMessage.includes('User rejected')) {
      showToast(lang === 'TR' ? 'İşlem iptal edildi.' : 'Transaction cancelled.', 'error');
    } else {
      showToast(errorMessage, 'error');
    }
  } finally {
    setIsContractLoading(false);
    setLoadingText('');
  }
};
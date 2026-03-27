const handleCreateEscrow = async () => {
  if (!requireSignedSessionForActiveWallet()) return;

  let tokenAddress = SUPPORTED_TOKEN_ADDRESSES[makerToken];
  if (!tokenAddress) {
    showToast(
      lang === 'TR'
        ? `${makerToken} token adresi .env dosyasında tanımlı değil (VITE_${makerToken}_ADDRESS).`
        : `${makerToken} token address not configured in .env (VITE_${makerToken}_ADDRESS).`,
      'error'
    );
    return;
  }

  const cryptoAmt = parseFloat(makerAmount);
  if (!cryptoAmt || cryptoAmt <= 0) {
    showToast(lang === 'TR' ? 'Geçerli bir miktar girin.' : 'Enter a valid amount.', 'error');
    return;
  }

  if (!makerRate || parseFloat(makerRate) <= 0) {
    showToast(lang === 'TR' ? 'Kur fiyatı girilmeli.' : 'Enter an exchange rate.', 'error');
    return;
  }

  if (isContractLoading) return;

  let didIncreaseAllowance = false;
  let pendingListingId = null;
  let pendingListingRef = null;

  try {
    const preCreateRes = await authenticatedFetch(`${API_URL}/api/listings`, {
      method: 'POST',
      body: JSON.stringify({
        crypto_asset: makerToken,
        fiat_currency: makerFiat,
        exchange_rate: parseFloat(makerRate),
        limits: { min: parseFloat(makerMinLimit), max: parseFloat(makerMaxLimit) },
        tier: makerTier,
        token_address: SUPPORTED_TOKEN_ADDRESSES[makerToken],
      }),
    });

    const preCreateData = await preCreateRes.json().catch(() => ({}));
    if (!preCreateRes.ok) {
      throw new Error(preCreateData?.error || 'İlan hazırlığı başarısız.');
    }

    pendingListingId = preCreateData?.listing?._id || null;
    pendingListingRef = preCreateData?.listing?.listing_ref || null;

    // Contract artık canonical listingRef bekliyor.
    // Ref yoksa on-chain create'e gitmek yerine hazırlanan ilan temizlenir.
    if (!pendingListingRef || !/^0x[a-f0-9]{64}$/.test(pendingListingRef)) {
      if (pendingListingId) {
        authenticatedFetch(`${API_URL}/api/listings/${pendingListingId}`, { method: 'DELETE' })
          .catch(() => {});
      }

      throw new Error(
        lang === 'TR'
          ? 'Listing referansı alınamadı. İlan tekrar oluşturulamadı.'
          : 'Failed to get listing reference. Please try again.'
      );
    }

    setIsContractLoading(true);

    const tokenDecimals = getTokenDecimals ? await getTokenDecimals(tokenAddress) : 6;
    const { parseUnits } = await import('viem');
    const cryptoAmountRaw = parseUnits(String(cryptoAmt), tokenDecimals);

    if (!onchainBondMap) {
      showToast(lang === 'TR' ? 'Protokol ayarları yükleniyor...' : 'Loading protocol config...', 'info');
      setIsContractLoading(false);
      return;
    }

    const bondBps = BigInt(onchainBondMap[makerTier]?.makerBps ?? 0);
    const makerBondRaw = (cryptoAmountRaw * bondBps) / 10000n;
    const totalLock = cryptoAmountRaw + makerBondRaw;

    const currentAllowance = await getAllowance(tokenAddress, address);
    if (currentAllowance < totalLock) {
      setLoadingText(
        lang === 'TR'
          ? `Adım 1/2: ${makerToken} izni veriliyor...`
          : `Step 1/2: Approving ${makerToken}...`
      );
      await approveToken(tokenAddress, totalLock);
      didIncreaseAllowance = true;
    }

    setLoadingText(
      lang === 'TR'
        ? 'Adım 2/2: Escrow oluşturuluyor...'
        : 'Step 2/2: Creating escrow...'
    );
    await createEscrow(tokenAddress, cryptoAmountRaw, makerTier, pendingListingRef);

    showToast(
      lang === 'TR'
        ? '✅ İlan başarıyla oluşturuldu! Fonlar kilitlendi.'
        : '✅ Listing created! Funds locked.',
      'success'
    );

    setShowMakerModal(false);
    setMakerAmount('');
    setMakerRate('');
    setMakerMinLimit('');
    setMakerMaxLimit('');
    setMakerFiat('TRY');
  } catch (err) {
    console.error('handleCreateEscrow error:', err);

    // On-chain create başarısızsa hazırlanmış listing'i temizlemeyi deneriz.
    if (pendingListingId) {
      try {
        await authenticatedFetch(`${API_URL}/api/listings/${pendingListingId}`, { method: 'DELETE' });
      } catch (_) {}
    }

    if (didIncreaseAllowance && tokenAddress) {
      try { await approveToken(tokenAddress, 0n); } catch (_) {}
    }

    let errorMessage = err.shortMessage || err.reason || err.message || (lang === 'TR' ? 'Escrow oluşturulamadı.' : 'Failed to create escrow.');
    if (errorMessage.includes('Efektif tier') || errorMessage.includes('effective tier')) {
      errorMessage += lang === 'TR'
        ? ' Not: Tier 1+ için ilk başarılı işlemden sonra 15 gün aktif dönem şartı da aranır.'
        : ' Note: Tier 1+ also requires a 15-day active period after first successful trade.';
    }

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
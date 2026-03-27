const fetchMyTrades = React.useCallback(async () => {
  if (!isAuthenticated || !isConnected) {
    setActiveEscrows([]);
    return;
  }

  try {
    const res = await authenticatedFetch(`${API_URL}/api/trades/my`);
    const data = await res.json();

    if (data.trades) {
      setActiveEscrows(data.trades.map(t => {
        const cryptoAmtRaw = t.financials?.crypto_amount || "0";
        const cryptoAsset = t.financials?.crypto_asset || 'USDT';
        const tokenDecimals = tokenDecimalsMap[cryptoAsset] ?? DEFAULT_TOKEN_DECIMALS;
        const cryptoAmtNum = rawTokenToDisplayNumber(cryptoAmtRaw, tokenDecimals);
        const rate = t.financials?.exchange_rate || 1;
        const fiatAmt = cryptoAmtNum * rate;

        return {
          id: `#${t.onchain_escrow_id}`,
          role: t.maker_address.toLowerCase() === address?.toLowerCase() ? 'maker' : 'taker',
          counterparty: formatAddress(
            t.maker_address.toLowerCase() === address?.toLowerCase()
              ? (t.taker_address || '')
              : t.maker_address
          ),
          state: t.status,
          paidAt: t.timers?.paid_at,
          lockedAt: t.timers?.locked_at,
          pingedAt: t.timers?.pinged_at,
          challengePingedAt: t.timers?.challenge_pinged_at,
          challengedAt: t.timers?.challenged_at,
          onchainId: t.onchain_escrow_id,
          amount: `${formatTokenAmountFromRaw(cryptoAmtRaw, tokenDecimals)} ${cryptoAsset}`,
          action: t.status === 'PAID'
            ? (lang === 'TR' ? 'Onay Bekliyor' : 'Pending Approval')
            : (lang === 'TR' ? 'İşlemde' : 'In Progress'),
          rawTrade: {
            id: t._id,
            onchainId: t.onchain_escrow_id,
            maker: formatAddress(t.maker_address),
            makerFull: t.maker_address,
            takerFull: t.taker_address,
            crypto: cryptoAsset,
            cryptoAmountRaw: cryptoAmtRaw,
            cryptoAmountUi: cryptoAmtNum,
            fiat: t.financials?.fiat_currency || 'TRY',
            rate,
            max: fiatAmt,
            tokenDecimals,
            paidAt: t.timers?.paid_at,
            lockedAt: t.timers?.locked_at,
            pingedAt: t.timers?.pinged_at,
            challengePingedAt: t.timers?.challenge_pinged_at,
            challengedAt: t.timers?.challenged_at,
            cancelProposedBy: t.cancel_proposal?.proposed_by,
            chargebackAcked: t.chargeback_ack?.acknowledged === true,
          }
        };
      }));

      // activeTrade polling ile canlı kalır.
      // Pending-sync durumundaysa gerçek trade kaydı gelince canonical ID'ye geçilir.
      setActiveTrade(prev => {
        if (!prev) return prev;

        const updated = data.trades.find(t => t.onchain_escrow_id === prev.onchainId);
        if (!updated) return prev;

        const wasPendingSync = prev._pendingBackendSync && !prev.id;
        if (wasPendingSync && updated._id) {
          showToast(
            lang === 'TR' ? '✅ İşlem odası hazır!' : '✅ Trade room ready!',
            'success'
          );
        }

        if (updated.status !== prev.state) {
          setTradeState(updated.status);
        }
        setChargebackAccepted(updated.chargeback_ack?.acknowledged === true);

        return {
          ...prev,
          id: prev.id || updated._id,
          _pendingBackendSync: false,
          state: updated.status,
          paidAt: updated.timers?.paid_at ?? prev.paidAt,
          lockedAt: updated.timers?.locked_at ?? prev.lockedAt,
          pingedAt: updated.timers?.pinged_at ?? prev.pingedAt,
          challengePingedAt: updated.timers?.challenge_pinged_at ?? prev.challengePingedAt,
          challengedAt: updated.timers?.challenged_at ?? prev.challengedAt,
          cancelProposedBy: updated.cancel_proposal?.proposed_by ?? prev.cancelProposedBy,
          chargebackAcked: updated.chargeback_ack?.acknowledged === true,
        };
      });
    }
  } catch (err) {
    console.error('Trades fetch error:', err);
  }
}, [isAuthenticated, isConnected, address, lang, authenticatedFetch, tokenDecimalsMap]);
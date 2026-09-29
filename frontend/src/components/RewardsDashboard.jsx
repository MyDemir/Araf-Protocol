import React from 'react';

const COPY = {
  title: { TR: 'Barış Ödülleri', EN: 'Proof of Peace Rewards' },
  policy: {
    TR: 'Ödüller yalnız zincirdeki işlem sonuçlarından hesaplanır. Sponsorlar alıcı, ağırlık veya çarpan seçemez.',
    EN: 'Rewards are epoch-based and derived only from ArafEscrow terminal outcomes. Sponsors cannot select recipients, weights, outcomes, multipliers, or claim lists.',
  },
  epoch: { TR: 'Dönem', EN: 'Epoch' },
  connect: { TR: 'Ödülleri görmek için cüzdan bağlayın.', EN: 'Connect wallet to view claimable rewards.' },
  wrongNetwork: { TR: 'Bu ağda ödüller kullanılamıyor.', EN: 'Rewards unavailable on current network.' },
  unavailable: { TR: 'Talep edilebilir tutar okunamadı', EN: 'Claimable unavailable' },
  loading: { TR: 'Talep edilebilir: yükleniyor…', EN: 'My Claimable: loading…' },
  claimable: { TR: 'Talep edilebilir', EN: 'My Claimable' },
  claim: { TR: 'Talep Et', EN: 'Claim' },
};

const pick = (key, lang) => COPY[key][lang === 'TR' ? 'TR' : 'EN'];

const isPositiveAmount = (value) => {
  try {
    return BigInt(value ?? 0) > 0n;
  } catch {
    return false;
  }
};

export default function RewardsDashboard({
  wallet,
  lang = 'EN',
  currentEpoch,
  claimableAmount,
  claimableDisplay,
  claimableState,
  claimableError,
  isClaiming = false,
  onClaim,
  onFundGlobal,
  onFundProduct,
  onRecordOutcome,
  children,
}) {
  const claimDisabled = isClaiming
    || claimableState === 'blocked'
    || claimableState === 'error'
    || claimableState === 'loading'
    || !isPositiveAmount(claimableAmount);
  // [TR] Sponsor/admin aksiyonları yalnız handler verildiğinde gösterilir; son kullanıcı arayüzünde
  //      işlevsiz butonlar (girdi almayan "Fund" / "Record") gösterilmez.
  // [EN] Sponsor/admin actions render only when handlers are provided.
  const hasOperatorActions = Boolean(onRecordOutcome || onFundGlobal || onFundProduct);

  return (
    <section className="bg-surface rounded-xl p-4 border border-borderSubtle space-y-3 max-w-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-textPrimary">{pick('title', lang)}</h2>
        <span className="text-xs text-textMuted">{pick('epoch', lang)} {String(currentEpoch ?? '—')}</span>
      </div>
      <p className="text-xs text-textMuted">{pick('policy', lang)}</p>
      {children}
      {!wallet ? (
        <p className="text-sm text-warning">{pick('connect', lang)}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {claimableState === 'blocked' ? (
            <p className="text-sm text-warning">{pick('wrongNetwork', lang)}</p>
          ) : claimableState === 'error' ? (
            <p className="text-sm text-danger">{pick('unavailable', lang)}: {String(claimableError || 'read failed')}</p>
          ) : claimableState === 'loading' ? (
            <p className="text-sm text-textSecondary">{pick('loading', lang)}</p>
          ) : (
            <p className="text-sm text-textPrimary">{pick('claimable', lang)}: <span className="font-mono font-bold">{claimableDisplay ?? String(claimableAmount ?? '0')}</span></p>
          )}
          <button
            className="px-4 py-2 rounded-lg bg-brand text-black font-bold text-sm disabled:opacity-40"
            disabled={claimDisabled}
            onClick={onClaim}
          >
            {isClaiming ? '⏳' : pick('claim', lang)}
          </button>
        </div>
      )}
      {hasOperatorActions && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-borderSubtle">
          {onRecordOutcome && <button className="px-2 py-1 rounded bg-elevated border border-borderStrong text-textPrimary text-xs" onClick={onRecordOutcome}>Record outcome</button>}
          {onFundGlobal && <button className="px-2 py-1 rounded bg-elevated border border-borderStrong text-textPrimary text-xs" onClick={onFundGlobal}>Fund global rewards</button>}
          {onFundProduct && <button className="px-2 py-1 rounded bg-elevated border border-borderStrong text-textPrimary text-xs" onClick={onFundProduct}>Fund product rewards</button>}
        </div>
      )}
    </section>
  );
}

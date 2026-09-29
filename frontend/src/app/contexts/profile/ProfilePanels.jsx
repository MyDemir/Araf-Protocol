import React from 'react';
import { formatUnits } from 'viem';
import { getStateLabel } from '../../copy';

export const profileTabs = [
  { key: 'account', label: { TR: 'Hesap', EN: 'Account' } },
  { key: 'payment', label: { TR: 'Ödeme Profili', EN: 'Payment Profile' } },
  { key: 'reputation', label: { TR: 'İtibar', EN: 'Reputation' } },
  { key: 'orders', label: { TR: 'Emirlerim', EN: 'My Orders' } },
  { key: 'active', label: { TR: 'Aktif İşlemler', EN: 'Active Trades' } },
  { key: 'history', label: { TR: 'Geçmiş', EN: 'History' } },
  { key: 'rewards', label: { TR: 'Ödüller', EN: 'Rewards' } },
  { key: 'security', label: { TR: 'Güvenlik', EN: 'Security' } },
];

export const getProfileTabLabel = (key, lang = 'EN') => {
  const tab = profileTabs.find((item) => item.key === key);
  return tab ? tab.label[lang === 'TR' ? 'TR' : 'EN'] : key;
};

export const ProfileNav = ({ lang = 'EN', activeTab, setActiveTab }) => (
  <div className="flex flex-wrap gap-2 mb-4">
    {profileTabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => setActiveTab(tab.key)}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${activeTab === tab.key ? 'bg-elevated text-textPrimary border-borderStrong' : 'bg-surface text-textSecondary border-borderSubtle hover:text-textPrimary hover:bg-elevated'}`}
      >
        {tab.label[lang === 'TR' ? 'TR' : 'EN']}
      </button>
    ))}
  </div>
);

export const AccountPanel = ({ lang, address, formatAddress, isConnected, isAuthenticated }) => (
  <div className="bg-surface border border-borderSubtle rounded-xl p-4">
    <p className="text-xs text-textMuted mb-2">{lang === 'TR' ? 'Bağlı Cüzdan' : 'Connected Wallet'}</p>
    <p className="text-sm font-mono text-brand">{address ? formatAddress(address) : '—'}</p>
    <p className="text-xs text-textSecondary mt-2">{isConnected && isAuthenticated ? (lang === 'TR' ? 'Oturum aktif' : 'Session active') : (lang === 'TR' ? 'Oturum pasif' : 'Session inactive')}</p>
  </div>
);

export const ReputationPanel = ({ userReputation, lang = 'EN' }) => {
  const isTR = lang === 'TR';
  const stats = [
    { label: 'Tier', value: `T${userReputation?.effectiveTier ?? 0}`, tone: 'text-brand' },
    { label: isTR ? 'Başarılı' : 'Successful', value: userReputation?.successful ?? 0, tone: 'text-textPrimary' },
    { label: isTR ? 'Başarısız' : 'Failed', value: userReputation?.failed ?? 0, tone: 'text-danger' },
    { label: isTR ? 'Uzlaşma' : 'Settled', value: userReputation?.authorityCounters?.partialSettlementCount ?? 0, tone: 'text-textPrimary' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-surface border border-borderSubtle rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-textMuted">{stat.label}</p>
          <p className={`text-xl font-bold mt-1 ${stat.tone}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
};

const formatHistoryAmount = (item, tokenDecimalsMap = {}) => {
  const asset = item?.financials?.crypto_asset || 'USDT';
  const decimals = Number(tokenDecimalsMap?.[asset]) || 6;
  try {
    const value = Number(formatUnits(BigInt(item?.financials?.crypto_amount || '0'), decimals));
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${asset}`;
  } catch {
    return `— ${asset}`;
  }
};

// [TR] Geçmiş API satırları ham backend kaydıdır (_id, onchain_escrow_id, financials...).
//      Önceki panel var olmayan item.id / item.onchainId alanlarını okuduğundan hep "-" gösteriyordu.
// [EN] History rows are raw backend records; the old panel read non-existent fields and showed "-".
export const HistoryPanel = ({ tradeHistory = [], lang = 'EN', mapResolutionTypeLabel, tokenDecimalsMap }) => {
  if (!tradeHistory.length) {
    return <p className="text-sm text-textMuted">{lang === 'TR' ? 'Henüz tamamlanmış işlem yok.' : 'No completed trades yet.'}</p>;
  }
  return (
    <div className="space-y-2 max-w-xl">
      {tradeHistory.map((item, idx) => {
        const resolutionType = item.resolutionType || item.resolution_type || null;
        return (
          <div key={`${item._id || item.id || idx}`} className="bg-surface border border-borderSubtle rounded-xl p-3 text-sm flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-textPrimary font-medium">{formatHistoryAmount(item, tokenDecimalsMap)}</p>
              <p className="text-textMuted text-xs font-mono">#{item.onchain_escrow_id ?? item.onchainId ?? '—'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-textSecondary">{getStateLabel(item.status || item.state, lang)}</p>
              {mapResolutionTypeLabel && resolutionType && (
                <p className="text-[11px] text-textMuted">{mapResolutionTypeLabel(resolutionType, lang)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const SecurityPanel = ({ lang = 'EN', handleLogoutAndDisconnect }) => (
  <div className="bg-surface border border-borderSubtle rounded-xl p-4">
    <button onClick={handleLogoutAndDisconnect} className="bg-red-900/20 border border-red-900/40 text-red-400 px-4 py-2 rounded-lg text-sm font-bold">
      {lang === 'TR' ? 'Çıkış Yap ve Cüzdanı Ayır' : 'Logout & Disconnect'}
    </button>
  </div>
);

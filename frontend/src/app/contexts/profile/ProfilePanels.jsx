import {
  ArrowDownLeft, ArrowUpRight, Ban, BadgeCheck, Check, ChevronLeft, ChevronRight, Clock, Copy, CreditCard, Gift,
  History, Hourglass, ListOrdered, LogOut, ShieldCheck, TrendingDown, TrendingUp, UserRound, Wallet, X, Zap,
} from 'lucide-react';
import React from 'react';
import { formatTokenAmount, mapOffchainHealthToUi } from '../../orderUiModel';
import { deriveReputationView, MIN_REPUTATION_NOTIONAL_USD } from './reputationModel';
import { WALLET_AGE_MIN_DAYS } from '../../walletAge';

export const profileTabs = [
  { key: 'account', icon: UserRound, label: { TR: 'Hesap', EN: 'Account' } },
  { key: 'payment', icon: CreditCard, label: { TR: 'Ödeme Profili', EN: 'Payment Profile' } },
  { key: 'reputation', icon: BadgeCheck, label: { TR: 'İtibar', EN: 'Reputation' } },
  { key: 'orders', icon: ListOrdered, label: { TR: 'Emirlerim', EN: 'My Orders' } },
  { key: 'active', icon: Zap, label: { TR: 'Aktif İşlemler', EN: 'Active Trades' } },
  { key: 'history', icon: History, label: { TR: 'Geçmiş', EN: 'History' } },
  { key: 'rewards', icon: Gift, label: { TR: 'Ödüller', EN: 'Rewards' } },
  { key: 'security', icon: ShieldCheck, label: { TR: 'Güvenlik', EN: 'Security' } },
];

const tx = (lang, tr, en) => (lang === 'TR' ? tr : en);
const ic = (Icon, cls = 'w-4 h-4') => <Icon className={cls} strokeWidth={1.8} aria-hidden="true" />;
const fmtDate = (sec, lang, withTime = false) => {
  if (!sec) return '—';
  const d = new Date(Number(sec) * 1000);
  return withTime ? d.toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US') : d.toLocaleDateString(lang === 'TR' ? 'tr-TR' : 'en-US');
};
const daysUntil = (sec, now = Date.now() / 1000) => Math.max(0, Math.ceil((Number(sec) - now) / 86400));

export const getProfileTabLabel = (key, lang = 'EN') => {
  const tab = profileTabs.find((item) => item.key === key);
  return tab ? tab.label[lang === 'TR' ? 'TR' : 'EN'] : key;
};

// [TR] Mobilde 8 sekme sarılıp iki-üç satır kaplıyordu; tek satır yatay kaydırma + ikon.
// [EN] On mobile the 8 tabs wrapped onto several rows; now a single scrollable row with icons.
export const ProfileNav = ({ lang = 'EN', activeTab, setActiveTab, badges = {} }) => (
  <nav className="-mx-4 px-4 md:mx-0 md:px-0 mb-4 overflow-x-auto no-scrollbar" aria-label={tx(lang, 'Profil sekmeleri', 'Profile tabs')}>
    <div className="flex gap-1.5 w-max md:w-auto md:flex-wrap" role="tablist">
      {profileTabs.map((tab) => {
        const active = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold border transition ${active ? 'bg-elevated text-textPrimary border-borderStrong' : 'bg-surface text-textSecondary border-borderSubtle hover:text-textPrimary hover:bg-elevated'}`}
          >
            <Icon className={`w-3.5 h-3.5 ${active ? 'text-brand' : ''}`} strokeWidth={1.8} aria-hidden="true" />
            {tab.label[lang === 'TR' ? 'TR' : 'EN']}
            {badges[tab.key] > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand/15 text-brand text-[10px] font-bold inline-flex items-center justify-center">{badges[tab.key]}</span>}
          </button>
        );
      })}
    </div>
  </nav>
);

const Card = ({ title, action, children, className = '', testId }) => (
  <section className={`bg-surface border border-borderSubtle rounded-xl p-4 ${className}`} data-testid={testId}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h3 className="text-sm font-bold text-textPrimary">{title}</h3>}
        {action}
      </div>
    )}
    {children}
  </section>
);

const CheckRow = ({ ok, label, detail, pending }) => (
  <div className="flex items-center justify-between gap-3 py-2 text-sm">
    <span className="flex items-center gap-2 text-textSecondary">
      <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center ${pending ? 'bg-elevated text-textMuted' : ok ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
        {pending ? ic(Clock, 'w-3 h-3') : ok ? ic(Check, 'w-3 h-3') : ic(X, 'w-3 h-3')}
      </span>
      {label}
    </span>
    {detail && <span className={`text-xs text-right ${ok ? 'text-textMuted' : 'text-warning'}`}>{detail}</span>}
  </div>
);

export const AccountPanel = ({
  lang = 'EN', address, isConnected, isAuthenticated, userReputation, reputationPolicy,
  sybilStatus, walletAgeRemainingDays, isBanned, activeEscrows = [], myOrders = [], onNavigateTab,
}) => {
  const [copied, setCopied] = React.useState(false);
  const rep = deriveReputationView({ reputation: userReputation, policy: reputationPolicy });
  const openOrders = myOrders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED').length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const sessionOk = isConnected && isAuthenticated;
  const tiles = [
    { key: 'reputation', label: 'Tier', value: rep ? `T${rep.tier}` : '—', tone: 'text-brand' },
    { key: 'active', label: tx(lang, 'Aktif işlem', 'Active trades'), value: activeEscrows.length, tone: 'text-textPrimary' },
    { key: 'orders', label: tx(lang, 'Açık emir', 'Open orders'), value: openOrders, tone: 'text-textPrimary' },
    { key: 'reputation', label: tx(lang, 'Risk puanı', 'Risk points'), value: rep ? rep.riskPoints : '—', tone: rep?.riskPoints > 0 ? 'text-warning' : 'text-success' },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 max-w-4xl" data-testid="profile-account">
      {isBanned && (
        <div className="md:col-span-2 bg-danger/10 border border-danger/40 rounded-xl p-4 flex items-start gap-3">
          <span className="text-danger shrink-0">{ic(Ban, 'w-5 h-5')}</span>
          <div>
            <p className="font-bold text-danger text-sm">{tx(lang, 'Alıcı kısıtlaması aktif', 'Taker restriction active')}</p>
            <p className="text-textSecondary text-xs mt-1">
              {tx(lang, 'Kontrat yasağı sürerken emir dolduramazsınız.', 'While the contract ban lasts you cannot fill orders.')}
              {rep?.bannedUntil ? ` ${tx(lang, 'Bitiş', 'Ends')}: ${fmtDate(rep.bannedUntil, lang, true)}` : ''}
            </p>
          </div>
        </div>
      )}

      <Card title={tx(lang, 'Cüzdan', 'Wallet')} action={
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${sessionOk ? 'bg-success/10 text-success border-success/40' : 'bg-elevated text-textMuted border-borderSubtle'}`}>
          {sessionOk ? tx(lang, 'Oturum aktif', 'Session active') : tx(lang, 'Oturum yok', 'No session')}
        </span>
      }>
        <div className="flex items-center gap-2 bg-elevated border border-borderSubtle rounded-lg px-3 py-2">
          <span className="text-textMuted shrink-0">{ic(Wallet)}</span>
          <span className="font-mono text-xs text-textPrimary break-all flex-1" data-testid="profile-address">{address || '—'}</span>
          {address && (
            <button type="button" onClick={copy} className="shrink-0 p-1.5 rounded-md text-textMuted hover:text-textPrimary hover:bg-surface" aria-label={tx(lang, 'Adresi kopyala', 'Copy address')}>
              {copied ? ic(Check, 'w-4 h-4 text-success') : ic(Copy)}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {tiles.map((tile) => (
            <button key={tile.label} type="button" onClick={() => onNavigateTab?.(tile.key)} className="text-left bg-elevated border border-borderSubtle rounded-lg px-3 py-2 hover:border-borderStrong transition">
              <p className="text-[10px] uppercase tracking-wider text-textMuted">{tile.label}</p>
              <p className={`text-lg font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card title={tx(lang, 'İşlem uygunluğu', 'Trading eligibility')} testId="profile-eligibility">
        <p className="text-xs text-textMuted -mt-1 mb-1">{tx(lang, 'Kontratın emir doldurmadan önce kontrol ettiği koşullar.', 'Conditions the contract checks before you fill an order.')}</p>
        <div className="divide-y divide-borderSubtle">
          <CheckRow
            pending={!sybilStatus}
            ok={Boolean(sybilStatus?.aged)}
            label={tx(lang, `Cüzdan yaşı (${WALLET_AGE_MIN_DAYS} gün)`, `Wallet age (${WALLET_AGE_MIN_DAYS} days)`)}
            detail={!sybilStatus ? '…' : sybilStatus.aged ? tx(lang, 'Tamam', 'OK') : (walletAgeRemainingDays != null ? tx(lang, `${walletAgeRemainingDays} gün kaldı`, `${walletAgeRemainingDays} days left`) : tx(lang, 'Kayıt gerekli', 'Registration needed'))}
          />
          <CheckRow
            pending={!sybilStatus}
            ok={Boolean(sybilStatus?.funded)}
            label={tx(lang, 'Gas bakiyesi', 'Gas balance')}
            detail={!sybilStatus ? '…' : sybilStatus.funded ? tx(lang, 'Yeterli', 'Enough') : tx(lang, 'Yetersiz', 'Too low')}
          />
          <CheckRow
            pending={!sybilStatus}
            ok={sybilStatus ? Boolean(sybilStatus.cooldownOk) : false}
            label={tx(lang, 'İşlem arası bekleme', 'Trade cooldown')}
            detail={!sybilStatus ? '…' : sybilStatus.cooldownOk ? tx(lang, 'Hazır', 'Ready') : tx(lang, `${Math.ceil((sybilStatus.cooldownRemaining || 0) / 60)} dk`, `${Math.ceil((sybilStatus.cooldownRemaining || 0) / 60)} min`)}
          />
          <CheckRow ok={!isBanned} label={tx(lang, 'Yasak durumu', 'Ban status')} detail={isBanned ? tx(lang, 'Yasaklı', 'Banned') : tx(lang, 'Temiz', 'Clear')} />
        </div>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, tone = 'text-textPrimary', hint }) => (
  <div className="bg-elevated border border-borderSubtle rounded-lg px-3 py-2.5">
    <p className="text-[10px] uppercase tracking-wider text-textMuted">{label}</p>
    <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className="text-[11px] text-textMuted mt-0.5">{hint}</p>}
  </div>
);

const Bar = ({ pct, tone = 'bg-brand' }) => (
  <div className="h-2 rounded-full bg-elevated border border-borderSubtle overflow-hidden">
    <div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

const TrustVisibility = ({ lang, activeEscrows = [] }) => {
  // [TR] Yalnız aktif maker işlemlerindeki offchain_health_score_input okunur; enforcement üretmez.
  const rows = activeEscrows
    .filter((escrow) => escrow?.role === 'maker')
    .map((escrow) => ({ escrowId: escrow.onchainId, ui: mapOffchainHealthToUi({ signal: escrow?.rawTrade?.offchainHealthScoreInput, lang }) }))
    .filter((row) => row.ui);
  return (
    <Card title="Trust Visibility" action={<span className="text-[10px] px-2 py-0.5 rounded border border-borderSubtle text-textMuted">{tx(lang, 'Yalnız bilgilendirme', 'Informational only')}</span>}>
      {rows.length === 0 ? (
        <p className="text-xs text-textMuted">{tx(lang, 'Gösterilecek sinyal yok.', 'No signals to show.')}</p>
      ) : (
        <div className="grid gap-2">
          {rows.map(({ escrowId, ui }) => (
            <div key={escrowId} className="rounded-lg border border-borderSubtle bg-elevated p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-textSecondary font-mono">#{escrowId}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${ui.severityChipClass}`}>{ui.severityBand} · {ui.severityLabel}</span>
              </div>
              {ui.reasonLabels.length > 0 ? (
                <ul className="text-xs text-textSecondary list-disc pl-4 space-y-1">
                  {ui.reasonLabels.map((reasonLabel, idx) => <li key={`${escrowId}-${idx}`}>{reasonLabel}</li>)}
                </ul>
              ) : <p className="text-xs text-textMuted">{tx(lang, 'Ek risk nedeni raporlanmadı.', 'No additional risk reason reported.')}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export const ReputationPanel = ({
  userReputation, reputationPolicy, lang = 'EN', address, activeEscrows = [],
  decayReputation, isContractLoading = false, setIsContractLoading, showToast,
}) => {
  const rep = deriveReputationView({ reputation: userReputation, policy: reputationPolicy });
  if (!rep) {
    return (
      <div className="grid gap-3 md:grid-cols-2 max-w-4xl" aria-busy="true">
        {[0, 1].map((i) => <div key={i} className="h-40 rounded-xl bg-surface border border-borderSubtle animate-pulse" />)}
      </div>
    );
  }

  const handleClearRecord = async () => {
    if (isContractLoading || typeof decayReputation !== 'function') return;
    try {
      setIsContractLoading?.(true);
      showToast?.(tx(lang, 'Sicil temizleme işlemi gönderiliyor…', 'Sending record clear transaction…'), 'info');
      await decayReputation(address);
      showToast?.(tx(lang, 'Siciliniz temizlendi.', 'Record cleared.'), 'success');
    } catch (err) {
      showToast?.(err?.shortMessage || tx(lang, 'İşlem başarısız oldu.', 'Transaction failed.'), 'error');
    } finally {
      setIsContractLoading?.(false);
    }
  };

  const bond = {
    discount: { icon: TrendingDown, tone: 'text-success', bg: 'bg-success/10 border-success/30', title: tx(lang, 'Teminat indirimi: −1%', 'Bond discount: −1%'), body: tx(lang, 'Risk puanınız 0; tier 1+ emirlerde teminat 100 bps düşer.', 'Zero risk points; tier 1+ bonds are 100 bps lower.') },
    penalty: { icon: TrendingUp, tone: 'text-warning', bg: 'bg-warning/10 border-warning/30', title: tx(lang, 'Teminat cezası: +3%', 'Bond surcharge: +3%'), body: tx(lang, 'Risk puanınız olduğu için tier 1+ emirlerde teminat 300 bps artar.', 'You have risk points, so tier 1+ bonds are 300 bps higher.') },
    tier0: { icon: BadgeCheck, tone: 'text-textSecondary', bg: 'bg-elevated border-borderSubtle', title: tx(lang, 'Tier 0: teminatsız', 'Tier 0: no bond'), body: rep.riskPoints > 0 ? tx(lang, 'Tier 1+ emirlerde risk puanınız nedeniyle +3% teminat uygulanır.', 'Tier 1+ orders carry a +3% bond because of your risk points.') : tx(lang, 'Tier 1\'e geçince temiz sicil −1% teminat indirimi sağlar.', 'At Tier 1, a clean record gives a −1% bond discount.') },
    none: { icon: BadgeCheck, tone: 'text-textSecondary', bg: 'bg-elevated border-borderSubtle', title: tx(lang, 'Standart teminat', 'Standard bond'), body: tx(lang, 'İlk başarılı işlemden sonra teminat indirimi başlar.', 'A bond discount starts after your first successful trade.') },
  }[rep.bondAdjustment];
  const outcomes = [
    { k: 'manualRelease', label: tx(lang, 'Manuel onay', 'Manual release') },
    { k: 'autoRelease', label: tx(lang, 'Otomatik serbest', 'Auto-release') },
    { k: 'partialSettlement', label: tx(lang, 'Uzlaşmalı kapanış', 'Agreed settlement') },
    { k: 'mutualCancel', label: tx(lang, 'Karşılıklı iptal', 'Mutual cancel') },
    { k: 'disputedResolved', label: tx(lang, 'İtirazla çözülen', 'Resolved after dispute') },
    { k: 'disputeWin', label: tx(lang, 'İtiraz kazanılan', 'Disputes won') },
    { k: 'disputeLoss', label: tx(lang, 'İtiraz kaybedilen', 'Disputes lost') },
    { k: 'burn', label: tx(lang, 'Yakılan', 'Burned') },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 max-w-4xl" data-testid="profile-reputation">
      <Card className="md:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center">
              <span className="text-2xl font-black text-brand">T{rep.tier}</span>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-textMuted">{tx(lang, 'Efektif tier', 'Effective tier')}</p>
              <p className="text-sm text-textSecondary">
                {rep.successRate == null ? tx(lang, 'Henüz sonuçlanmış işlem yok', 'No settled trades yet') : tx(lang, `Başarı oranı %${rep.successRate}`, `${rep.successRate}% success rate`)}
              </p>
            </div>
          </div>
          <div className={`sm:ml-auto flex items-start gap-2 rounded-lg border px-3 py-2 ${bond.bg}`} data-testid="reputation-bond-effect">
            <span className={bond.tone}>{ic(bond.icon)}</span>
            <div>
              <p className={`text-xs font-bold ${bond.tone}`}>{bond.title}</p>
              <p className="text-[11px] text-textSecondary">{bond.body}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat label={tx(lang, 'Başarılı', 'Successful')} value={rep.successful} tone="text-success" />
          <Stat label={tx(lang, 'Başarısız', 'Failed')} value={rep.failed} tone={rep.failed > 0 ? 'text-danger' : 'text-textPrimary'} />
          <Stat label={tx(lang, 'Risk puanı', 'Risk points')} value={rep.riskPoints} tone={rep.riskPoints > 0 ? 'text-warning' : 'text-textPrimary'} hint={rep.overBanThreshold ? tx(lang, 'Yasak eşiği aşıldı', 'Ban threshold reached') : tx(lang, `Yasağa ${rep.riskToBan} puan`, `${rep.riskToBan} pts to ban`)} />
          <Stat label={tx(lang, 'Ardışık yasak', 'Consecutive bans')} value={rep.consecutiveBans} tone={rep.consecutiveBans > 0 ? 'text-danger' : 'text-textPrimary'} />
        </div>
      </Card>

      <Card title={rep.nextTier ? tx(lang, `Tier ${rep.nextTier.tier} yolu`, `Path to Tier ${rep.nextTier.tier}`) : tx(lang, 'En üst tier', 'Top tier')} testId="reputation-next-tier">
        {rep.nextTier ? (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-textSecondary">{tx(lang, 'Başarılı işlem', 'Successful trades')}</span>
                <span className="font-mono text-textPrimary">{rep.successful} / {rep.nextTier.minTrades}</span>
              </div>
              <Bar pct={rep.nextTier.progressPct} />
            </div>
            <CheckRow ok={rep.nextTier.needTrades === 0} label={tx(lang, `${rep.nextTier.minTrades} başarılı işlem`, `${rep.nextTier.minTrades} successful trades`)} detail={rep.nextTier.needTrades === 0 ? tx(lang, 'Tamam', 'Done') : tx(lang, `${rep.nextTier.needTrades} kaldı`, `${rep.nextTier.needTrades} to go`)} />
            <p className="text-[11px] text-textMuted" data-testid="reputation-min-notional">
              {tx(lang, `${MIN_REPUTATION_NOTIONAL_USD} USD altındaki işlemler başarılı işlem sayısına eklenmez (cezalar yine uygulanır).`, `Trades under ${MIN_REPUTATION_NOTIONAL_USD} USD are not counted as successful trades (penalties still apply).`)}
            </p>
            <CheckRow ok={rep.nextTier.riskOk} label={tx(lang, `Risk puanı ≤ ${rep.nextTier.riskCap}`, `Risk points ≤ ${rep.nextTier.riskCap}`)} detail={rep.nextTier.riskOk ? tx(lang, 'Tamam', 'OK') : tx(lang, `Şu an ${rep.riskPoints}`, `Now ${rep.riskPoints}`)} />
            <CheckRow
              ok={!rep.activePeriodPending && rep.activeUntil > 0}
              pending={rep.activeUntil === 0}
              label={tx(lang, 'İlk başarılı işlemden 15 gün', '15 days since first success')}
              detail={rep.activeUntil === 0 ? tx(lang, 'Başlamadı', 'Not started') : rep.activePeriodPending ? tx(lang, `${daysUntil(rep.activeUntil)} gün kaldı`, `${daysUntil(rep.activeUntil)} days left`) : tx(lang, 'Tamam', 'Done')}
            />
            {rep.tierCapped && (
              <p className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-lg px-2.5 py-2">
                {tx(lang, `Sayılarınız Tier ${rep.tierByCounts} için yeterli; önceki bir yasak nedeniyle kontrat tier tavanı uyguluyor. Sicil temizlenince kalkar.`, `Your counts qualify for Tier ${rep.tierByCounts}; a past ban caps your tier on-chain. Clearing the record lifts it.`)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-textSecondary">{tx(lang, 'Tier 4: en düşük teminat, emir limiti yok.', 'Tier 4: lowest bonds, no order cap.')}</p>
        )}
      </Card>

      <Card title={tx(lang, 'Yasak ve sicil', 'Bans and record')} testId="reputation-clean-slate">
        {rep.cleanSlate === 'none' && !rep.banActive ? (
          <div className="flex items-center gap-2 text-sm text-success">{ic(ShieldCheck)}{tx(lang, 'Siciliniz temiz.', 'Your record is clean.')}</div>
        ) : (
          <div className="space-y-3">
            {rep.banActive && (
              <div className="bg-danger/10 border border-danger/40 rounded-lg p-3">
                <p className="text-xs font-semibold text-danger">{tx(lang, 'Yasak bitişi', 'Ban ends')}</p>
                <p className="text-sm font-bold text-textPrimary mt-0.5">{fmtDate(rep.bannedUntil, lang, true)}</p>
              </div>
            )}
            {rep.cleanSlate === 'ban_active' && (
              <p className="text-xs text-textSecondary">{tx(lang, `Yasak bittikten ${Math.round(rep.policy.cleanPeriodSec / 86400)} gün sonra sicilinizi sıfırlayabilirsiniz.`, `You can reset your record ${Math.round(rep.policy.cleanPeriodSec / 86400)} days after the ban ends.`)}</p>
            )}
            {rep.cleanSlate === 'waiting' && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-textSecondary flex items-center gap-1.5">{ic(Hourglass, 'w-3.5 h-3.5')}{tx(lang, 'Temiz sayfa açılışı', 'Clean slate unlocks')}</span>
                <span className="font-semibold text-textPrimary">{fmtDate(rep.cleanSlateAt, lang)}</span>
              </div>
            )}
            {rep.cleanSlate === 'eligible' && (
              <>
                <p className="text-xs text-success">{tx(lang, 'Bekleme süresi doldu. Ardışık yasak sayacı, risk puanı ve tier tavanı sıfırlanabilir.', 'Waiting period is over. Consecutive bans, risk points and the tier cap can be reset.')}</p>
                <button type="button" onClick={handleClearRecord} disabled={isContractLoading || typeof decayReputation !== 'function'} className="w-full py-2.5 rounded-lg text-sm font-bold bg-brand text-black hover:opacity-90 disabled:opacity-50">
                  {isContractLoading ? tx(lang, 'Onaylanıyor…', 'Confirming…') : tx(lang, 'Sicilimi temizle', 'Clear my record')}
                </button>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title={tx(lang, 'Sonuç dağılımı', 'Outcome breakdown')} className="md:col-span-2" testId="reputation-outcomes">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 divide-y divide-borderSubtle sm:divide-y-0">
          {outcomes.map((o) => (
            <div key={o.k} className="flex items-center justify-between py-2 text-sm">
              <span className="text-textSecondary">{o.label}</span>
              <span className={`font-semibold tabular-nums ${o.k === 'burn' || o.k === 'disputeLoss' ? (rep.outcomes[o.k] > 0 ? 'text-danger' : 'text-textMuted') : 'text-textPrimary'}`}>{rep.outcomes[o.k]}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-textMuted mt-2">
          {tx(lang, 'Uzlaşmalı kapanış ceza değildir; yalnız geçmiş göstergesidir.', 'Agreed settlement is not a penalty; it is only a history marker.')}
          {' '}
          {rep.policy.fromChain ? tx(lang, 'Eşikler: kontrat event\'i.', 'Thresholds: contract event.') : tx(lang, 'Eşikler: kontrat varsayılanı.', 'Thresholds: contract defaults.')}
        </p>
      </Card>

      <div className="md:col-span-2"><TrustVisibility lang={lang} activeEscrows={activeEscrows} /></div>
    </div>
  );
};

const formatHistoryAmount = (item, tokenDecimalsMap = {}) => {
  const asset = item?.financials?.crypto_asset || 'USDT';
  const decimals = Number(tokenDecimalsMap?.[asset]) || 6;
  return `${formatTokenAmount(item?.financials?.crypto_amount || '0', decimals, 2)} ${asset}`;
};

const STATUS_TONE = {
  RESOLVED: 'bg-success/10 text-success border-success/30',
  CANCELED: 'bg-elevated text-textSecondary border-borderSubtle',
  BURNED: 'bg-danger/10 text-danger border-danger/30',
};
const STATUS_LABEL = {
  RESOLVED: { TR: 'Tamamlandı', EN: 'Resolved' },
  CANCELED: { TR: 'İptal', EN: 'Canceled' },
  BURNED: { TR: 'Yakıldı', EN: 'Burned' },
};

// [TR] Geçmiş API satırları ham backend kaydıdır (_id, onchain_escrow_id, financials, timers...).
// [EN] History rows are raw backend records.
export const HistoryPanel = ({
  tradeHistory = [], lang = 'EN', address, mapResolutionTypeLabel, tokenDecimalsMap, historyLoading = false,
  tradeHistoryPage = 1, setTradeHistoryPage, tradeHistoryTotal = 0, tradeHistoryLimit = 10,
}) => {
  if (historyLoading && !tradeHistory.length) {
    return <div className="space-y-2 max-w-2xl" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-surface border border-borderSubtle animate-pulse" />)}</div>;
  }
  if (!tradeHistory.length) {
    return (
      <div className="bg-surface border border-borderSubtle rounded-xl p-6 text-center max-w-2xl">
        <div className="flex justify-center text-textMuted mb-2">{ic(History, 'w-8 h-8')}</div>
        <p className="text-sm text-textMuted">{tx(lang, 'Henüz tamamlanmış işlem yok.', 'No completed trades yet.')}</p>
      </div>
    );
  }
  const me = String(address || '').toLowerCase();
  const pages = Math.max(1, Math.ceil(tradeHistoryTotal / tradeHistoryLimit));
  return (
    <div className="space-y-2 max-w-2xl" data-testid="profile-history">
      {tradeHistory.map((item, idx) => {
        const resolutionType = item.resolutionType || item.resolution_type || null;
        const status = item.status || item.state;
        // [TR] Araf'ta maker her zaman kripto satıcısıdır; yön kullanıcının rolünden türetilir.
        const isMaker = me && String(item.maker_address || '').toLowerCase() === me;
        const resolvedAt = item.timers?.resolved_at ? Math.floor(new Date(item.timers.resolved_at).getTime() / 1000) : null;
        const fiat = item.financials?.fiat_amount && item.financials?.fiat_currency
          ? `${Number(item.financials.fiat_amount).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 })} ${item.financials.fiat_currency}`
          : null;
        return (
          <div key={`${item._id || item.id || idx}`} className="bg-surface border border-borderSubtle rounded-xl p-3 flex items-start gap-3">
            <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${isMaker ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
              {isMaker ? ic(ArrowUpRight) : ic(ArrowDownLeft)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-textPrimary">
                  {isMaker ? tx(lang, 'Sattınız', 'Sold') : tx(lang, 'Aldınız', 'Bought')} {formatHistoryAmount(item, tokenDecimalsMap)}
                </p>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${STATUS_TONE[status] || STATUS_TONE.CANCELED}`}>
                  {STATUS_LABEL[status]?.[lang === 'TR' ? 'TR' : 'EN'] || status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px] text-textMuted">
                <span className="truncate"><span className="font-mono">#{item.onchain_escrow_id ?? item.onchainId ?? '—'}</span>{fiat && ` · ${fiat}`}</span>
                {resolvedAt && <span className="shrink-0 tabular-nums">{fmtDate(resolvedAt, lang)}</span>}
              </div>
              {mapResolutionTypeLabel && resolutionType && (
                <p className="text-[11px] text-textSecondary mt-1">{mapResolutionTypeLabel(resolutionType, lang)}</p>
              )}
            </div>
          </div>
        );
      })}
      {tradeHistoryTotal > tradeHistoryLimit && typeof setTradeHistoryPage === 'function' && (
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={() => setTradeHistoryPage((p) => p - 1)} disabled={tradeHistoryPage <= 1 || historyLoading} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-borderSubtle bg-surface text-textSecondary hover:text-textPrimary disabled:opacity-40" aria-label={tx(lang, 'Önceki sayfa', 'Previous page')}>{ic(ChevronLeft, 'w-3.5 h-3.5')}</button>
          <span className="text-xs text-textMuted tabular-nums">{tradeHistoryPage} / {pages}</span>
          <button type="button" onClick={() => setTradeHistoryPage((p) => p + 1)} disabled={tradeHistoryPage >= pages || historyLoading} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-borderSubtle bg-surface text-textSecondary hover:text-textPrimary disabled:opacity-40" aria-label={tx(lang, 'Sonraki sayfa', 'Next page')}>{ic(ChevronRight, 'w-3.5 h-3.5')}</button>
        </div>
      )}
    </div>
  );
};

export const SecurityPanel = ({ lang = 'EN', handleLogoutAndDisconnect, address, authenticatedWallet }) => (
  <div className="grid gap-3 max-w-xl" data-testid="profile-security">
    <Card title={tx(lang, 'Oturum', 'Session')}>
      <ul className="space-y-2 text-xs text-textSecondary">
        <li className="flex items-start gap-2">{ic(ShieldCheck, 'w-4 h-4 text-success shrink-0')}{tx(lang, 'Giriş cüzdan imzasıyla (SIWE) yapılır; şifre tutulmaz.', 'Sign-in uses a wallet signature (SIWE); no password is stored.')}</li>
        <li className="flex items-start gap-2">{ic(ShieldCheck, 'w-4 h-4 text-success shrink-0')}{tx(lang, 'Oturum çerezi yalnız bu cüzdana bağlıdır; cüzdan değişirse oturum kapanır.', 'The session cookie is bound to this wallet; switching wallets ends it.')}</li>
        <li className="flex items-start gap-2">{ic(ShieldCheck, 'w-4 h-4 text-success shrink-0')}{tx(lang, 'Ödeme bilgileri şifreli saklanır ve zincire yazılmaz.', 'Payment details are stored encrypted and never on-chain.')}</li>
      </ul>
      {(authenticatedWallet || address) && (
        <p className="mt-3 text-[11px] text-textMuted">{tx(lang, 'Oturum cüzdanı', 'Session wallet')}: <span className="font-mono text-textSecondary break-all">{authenticatedWallet || address}</span></p>
      )}
    </Card>
    <button type="button" onClick={handleLogoutAndDisconnect} className="w-full inline-flex items-center justify-center gap-2 bg-danger/10 border border-danger/40 text-danger hover:bg-danger/20 px-4 py-2.5 rounded-lg text-sm font-bold transition">
      {ic(LogOut)}{tx(lang, 'Çıkış yap ve cüzdanı ayır', 'Log out & disconnect')}
    </button>
  </div>
);

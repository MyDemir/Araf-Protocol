import React from 'react';

const t = (lang, tr, en) => (lang === 'TR' ? tr : en);

// [TR] Özet kartı tek başlık + tek açıklama satırına indirildi. "Şimdi / Sonraki" kutuları ve durum/rol
//      çipleri, sayfa başlığı ve aksiyon paneliyle aynı bilgiyi tekrar ediyordu.
// [EN] Summary trimmed to a headline + one line; the Now/Next boxes and chips duplicated other panels.
export const TradeSummaryCard = ({
  headline,
  subheadline,
  nowDescription,
  roleLabel,
  lang = 'EN',
}) => (
  <section className="mb-4 text-textSecondary" data-testid="trade-summary-card">
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-lg md:text-xl font-bold leading-snug text-textPrimary">{headline || t(lang, 'İşlem durumunu kontrol edin', 'Review the trade status')}</h2>
      {roleLabel && <span className="shrink-0 rounded-full border border-borderSubtle px-2 py-0.5 text-xs text-textMuted">{roleLabel}</span>}
    </div>
    {(subheadline || nowDescription) && <p className="mt-1 text-sm leading-relaxed text-textSecondary">{subheadline || nowDescription}</p>}
  </section>
);

// [TR] Genel risk uyarıları (chargeback/settlement) her durumda tekrarlanıyordu; yalnız duruma özgü rehber kalır.
// [EN] Generic risk lines repeated in every state; only state-specific guidance remains.
export const StateGuidancePanel = ({ guidance = [] }) => {
  const lines = (Array.isArray(guidance) ? guidance : []).filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="mb-3 bg-surface border border-borderSubtle rounded-xl p-3 text-sm text-textSecondary space-y-1" data-testid="trade-guidance-panel">
      {lines.map((g, i) => <p key={i}>{g}</p>)}
    </div>
  );
};


export const ChallengedDecisionPanel = ({ details = null, primaryAction = null, lang = 'EN' }) => {
  if (!details) return null;
  const riskLines = Array.isArray(details.riskLines) && details.riskLines.length
    ? details.riskLines
    : [t(lang, 'Riskteki değer şu anda hesaplanamadı.', 'Risk value is currently unavailable.')];
  const timerLines = Array.isArray(details.timerLines) && details.timerLines.length
    ? details.timerLines
    : [t(lang, 'Kalan süre bilgisi şu anda hesaplanamadı.', 'Remaining time is currently unavailable.')];
  return (
    <section className="mb-3 bg-surface border border-danger/40 rounded-xl p-4 text-sm text-textSecondary" data-testid="challenged-decision-panel">
      <p className="text-xs font-bold uppercase tracking-wide text-danger mb-3">{t(lang, 'İtiraz karar paneli', 'Challenge decision panel')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-danger/30 bg-elevated p-3">
          <p className="text-xs font-bold text-danger mb-1">{t(lang, 'Ne oluyor?', 'What is happening?')}</p>
          <p className="text-textPrimary leading-relaxed">{details.whatHappening}</p>
        </div>
        <div className="rounded-lg border border-danger/30 bg-elevated p-3">
          <p className="text-xs font-bold text-danger mb-1">{t(lang, 'Riskteki değer', 'Value at risk')}</p>
          {riskLines.map((line, idx) => <p key={idx} className="text-textPrimary leading-relaxed">{line}</p>)}
        </div>
        <div className="rounded-lg border border-danger/30 bg-elevated p-3">
          <p className="text-xs font-bold text-danger mb-1">{t(lang, 'Kalan süre', 'Remaining time')}</p>
          {timerLines.map((line, idx) => <p key={idx} className="text-textPrimary leading-relaxed">{line}</p>)}
        </div>
        <div className="rounded-lg border border-danger/30 bg-elevated p-3">
          <p className="text-xs font-bold text-danger mb-1">{t(lang, 'Sonraki aksiyon', 'Next action')}</p>
          <p className="font-semibold text-textPrimary">{primaryAction?.label || details.nextActionLabel}</p>
          {(primaryAction?.description || details.nextActionDescription) && (
            <p className="mt-1 text-textSecondary leading-relaxed">{primaryAction?.description || details.nextActionDescription}</p>
          )}
        </div>
      </div>
    </section>
  );
};

// [TR] Süreler sade bir liste: dolan süre uyarı rengiyle "Süre doldu" olarak öne çıkar.
// [EN] Timers as a plain list; an elapsed timer is highlighted instead of a neutral "Finished".
export const TimerStack = ({ timerCards = [], lang = 'EN' }) => {
  if (!Array.isArray(timerCards) || timerCards.length === 0) return null;
  return (
    <div className="mb-4 text-sm text-textSecondary" data-testid="trade-timer-summaries">
      <p className="text-textMuted font-bold uppercase tracking-wide text-[11px] mb-1">{t(lang, 'Süreler', 'Timers')}</p>
      <ul className="divide-y divide-borderSubtle">
        {timerCards.map((timer) => (
          <li key={timer.key} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">{timer.label}</span>
            <span className={`shrink-0 font-mono tabular-nums ${timer.finished ? 'text-warning font-semibold' : 'text-textPrimary'}`}>{timer.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const TechnicalDetailsDisclosure = ({ technicalDetails, lang = 'EN' }) => {
  if (!technicalDetails) return null;
  return (
    <details className="mb-3 text-xs text-textMuted">
      <summary className="cursor-pointer">{t(lang, 'Teknik detaylar', 'Technical details')}</summary>
      <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words bg-surface border border-borderSubtle rounded-lg p-2">{JSON.stringify(technicalDetails, null, 2)}</pre>
    </details>
  );
};

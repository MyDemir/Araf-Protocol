import React from 'react';
import { getStateLabel } from '../../copy/states';
import { formatTokenAmount } from '../../orderUiModel';
import { tx as t } from '../../copy';

// [TR] Backend'e bağlı parçaların (ödeme bilgisi, sohbet, dekont) yerine gösterilen tek not.
// [EN] The single note shown in place of backend-bound parts (payment details, chat, receipt).
export const ChainFallbackNotice = ({ lang = 'EN', className = 'mb-4' }) => (
  <p data-testid="chain-fallback-notice" role="status" className={`${className} rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs md:text-sm text-textPrimary`}>
    {t(lang,
      'Sunucuya ulaşılamıyor; ödeme bilgileri gösterilemiyor. Kontrat işlemleri çalışır.',
      'The server is unreachable; payment details cannot be shown. Contract actions still work.')}
  </p>
);

const manualMessage = (status, lang) => {
  switch (status) {
    case 'invalid': return t(lang, 'Geçerli bir işlem numarası girin (pozitif tam sayı).', 'Enter a valid trade number (positive integer).');
    case 'not_party': return t(lang, 'Bu işlemde tarafınız yok.', 'You are not a party to this trade.');
    case 'not_found': return t(lang, 'Bu numarayla bir işlem bulunamadı.', 'No trade was found with this number.');
    case 'terminal': return t(lang, 'Bu işlem kapanmış; yapılacak kontrat işlemi yok.', 'This trade is closed; there is no contract action left.');
    case 'read_error': return t(lang, 'İşlem zincirden okunamadı. Biraz sonra tekrar deneyin.', 'The trade could not be read from the chain. Try again shortly.');
    case 'disabled': return t(lang, 'Sunucu yeniden erişilebilir; işlemleriniz normal listede.', 'The server is reachable again; your trades are in the normal list.');
    default: return null;
  }
};

/**
 * [TR] Yedek işlem listesi + "İşlem numarasıyla aç" alanı. Liste yalnız bağlı cüzdanın taraf olduğu, kapanmamış
 *      işlemleri içerir (filtre chainFallback.js'tedir). Açma eylemi işlem odasını zincir verisiyle açar.
 * [EN] Chain fallback list + "open by trade number". Only the viewer's open trades are listed.
 */
export const ChainFallbackTradesPanel = ({ lang = 'EN', chainFallback, compact = false }) => {
  const [input, setInput] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  if (!chainFallback?.active) return null;
  const { trades = [], loading = false, loadedAt = 0, submitManualId, openTrade } = chainFallback;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pending || typeof submitManualId !== 'function') return;
    setPending(true);
    setMessage(null);
    try {
      const result = await submitManualId(input);
      if (result?.status === 'ok' && result.trade) {
        setInput('');
        if (typeof openTrade === 'function') openTrade(result.trade);
      } else {
        setMessage({ status: result?.status || 'read_error', text: manualMessage(result?.status || 'read_error', lang) });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <section data-testid="chain-fallback-panel" className={`${compact ? 'mb-6' : 'mb-4'} min-w-0 rounded-2xl border border-warning/40 bg-surface p-4`}>
      <h2 className="text-sm font-bold text-textPrimary">{t(lang, 'Zincirden okunan işlemleriniz', 'Your trades read from the chain')}</h2>
      <p className="mt-1 text-xs text-textSecondary">
        {t(lang,
          'Sunucu işlem listesini veremiyor. Bu cihazda bilinen işlem numaraları doğrudan kontrattan okunur; kontrat son söz sahibidir.',
          'The server cannot provide your trade list. Trade numbers known on this device are read directly from the contract, which has the final say.')}
      </p>

      <ul className="mt-3 space-y-2" data-testid="chain-fallback-list" aria-busy={loading ? 'true' : 'false'}>
        {trades.map((trade) => (
          <li key={trade.onchainId} data-testid="chain-fallback-row" className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-borderSubtle bg-elevated/60 p-3">
            <div className="min-w-0">
              <p className="text-xs text-textMuted">#{trade.onchainId} · {trade.role === 'maker' ? t(lang, 'Satıcı', 'Maker') : t(lang, 'Alıcı', 'Taker')}</p>
              <p className="truncate text-sm font-semibold text-textPrimary">
                {formatTokenAmount(trade.cryptoAmountRaw, trade.tokenDecimals, 4, lang)} {trade.crypto}
                <span className="ml-2 text-xs font-normal text-warning">{getStateLabel(trade.state, lang)}</span>
              </p>
            </div>
            <button type="button" onClick={() => openTrade?.(trade)} className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-black hover:opacity-90">
              {t(lang, 'Odayı aç', 'Open room')}
            </button>
          </li>
        ))}
        {!trades.length && (
          <li className="rounded-xl border border-borderSubtle bg-elevated/40 p-3 text-xs italic text-textMuted">
            {loading || !loadedAt
              ? t(lang, 'Zincirden okunuyor…', 'Reading from the chain…')
              : t(lang, 'Bu cihazda bilinen açık işlem yok. İşlem numaranızı biliyorsanız aşağıdan açabilirsiniz.', 'No open trade is known on this device. If you know your trade number you can open it below.')}
          </li>
        )}
      </ul>

      <form onSubmit={onSubmit} className="mt-3" data-testid="chain-fallback-manual">
        <label htmlFor="chain-fallback-trade-id" className="block text-xs font-semibold text-textSecondary">{t(lang, 'İşlem numarasıyla aç', 'Open by trade number')}</label>
        <div className="mt-1 flex gap-2">
          <input
            id="chain-fallback-trade-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={78}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(lang, 'ör. 42', 'e.g. 42')}
            className="min-w-0 flex-1 rounded-lg border border-borderStrong bg-elevated px-3 py-2 text-sm text-textPrimary"
          />
          <button type="submit" disabled={pending || !input.trim()} className="shrink-0 rounded-lg border border-borderStrong bg-elevated px-4 py-2 text-sm font-bold text-textPrimary hover:bg-surface disabled:opacity-50">
            {pending ? '…' : t(lang, 'Aç', 'Open')}
          </button>
        </div>
        {message?.text && <p role="alert" data-testid="chain-fallback-manual-message" data-status={message.status} className="mt-1.5 text-xs text-warning">{message.text}</p>}
      </form>
    </section>
  );
};

export default ChainFallbackTradesPanel;

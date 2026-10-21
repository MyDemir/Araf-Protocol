import React from 'react';
import { useAccount, usePublicClient, WagmiContext } from 'wagmi';
import { formatTokenAmount } from '../app/orderUiModel';
import { tx } from '../app/copy';
import { buildTokenList, useTokenBalances, watchToken } from '../hooks/useTokenBalances';

const WATCH_MSG = {
  added: ['Cüzdana eklendi.', 'Added to wallet.'],
  rejected: null,
  unsupported: ['Cüzdanınız token eklemeyi desteklemiyor; adresi elle ekleyebilirsiniz.', 'Your wallet does not support adding tokens; you can add the address manually.'],
  error: ['Token eklenemedi.', 'Could not add the token.'],
};

export const TokenBalancesView = ({ lang = 'EN', tokens, balances, onWatch, notice }) => (
  <div className="mt-3" data-testid="token-balances">
    <p className="text-[10px] uppercase tracking-wider text-textMuted mb-1.5">{tx(lang, 'Token bakiyeleri', 'Token balances')}</p>
    <div className="grid gap-2">
      {tokens.map((t) => {
        const b = balances?.[t.key];
        let value = '…';
        if (b?.status === 'ok') value = formatTokenAmount(b.raw, t.decimals, 4, lang);
        else if (b?.status === 'error') value = tx(lang, 'okunamadı', 'unavailable');
        return (
          <div key={t.key} className="flex flex-wrap items-center justify-between gap-2 bg-elevated border border-borderSubtle rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-textMuted">{t.symbol}</p>
              <p className="text-sm font-bold tabular-nums text-textPrimary" data-testid={`token-balance-${t.key}`}>{value}</p>
            </div>
            <button type="button" onClick={() => onWatch(t)} data-testid={`token-watch-${t.key}`} className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold border border-borderSubtle bg-surface text-textSecondary hover:text-textPrimary hover:border-borderStrong">
              {tx(lang, 'Cüzdana ekle', 'Add to wallet')}
            </button>
          </div>
        );
      })}
    </div>
    {notice && <p className="text-[11px] text-textMuted mt-1.5" role="status" data-testid="token-watch-notice">{notice}</p>}
  </div>
);

const TokenBalancesLive = ({ lang, address, tokenDecimalsMap }) => {
  const publicClient = usePublicClient();
  const { connector } = useAccount();
  const tokens = React.useMemo(() => buildTokenList(import.meta.env, tokenDecimalsMap), [tokenDecimalsMap]);
  const { balances } = useTokenBalances({ publicClient, owner: address, tokens });
  const [notice, setNotice] = React.useState('');
  const onWatch = async (token) => {
    let provider;
    try { provider = (await connector?.getProvider?.()) || null; } catch { provider = null; }
    if (!provider && typeof window !== 'undefined') provider = window.ethereum || null;
    const result = await watchToken(provider, token);
    const msg = WATCH_MSG[result];
    setNotice(msg ? tx(lang, msg[0], msg[1]) : '');
  };
  if (!address || tokens.length === 0) return null;
  return <TokenBalancesView lang={lang} tokens={tokens} balances={balances} onWatch={onWatch} notice={notice} />;
};

// [TR] Wagmi sağlayıcısı yoksa (izole render/test) hiçbir şey çizmez.
// [EN] Renders nothing without a Wagmi provider (isolated renders/tests).
export const TokenBalances = (props) => {
  const hasWagmi = React.useContext(WagmiContext) !== undefined;
  return hasWagmi ? <TokenBalancesLive {...props} /> : null;
};

export default TokenBalances;

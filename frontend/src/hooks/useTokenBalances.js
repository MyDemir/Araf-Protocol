import { useCallback, useEffect, useRef, useState } from 'react';
import { getAddress, isAddress, zeroAddress } from 'viem';
import { isConfiguredTestToken } from '../app/chainPolicy';
import { isUserRejection } from '../app/walletRpcDiagnosis';

// [TR] Yalnız balanceOf: kontrat ABI'sinin tamamına gerek yok.
// [EN] balanceOf only: the full contract ABI is not needed.
export const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

export const MIN_REFRESH_MS = 30_000;
const DEFAULT_DECIMALS = 6;

// [TR] Token listesi yapılandırılmış env adreslerinden gelir (RewardsPanel ile aynı kaynak); sıfır/geçersiz adres atlanır.
// [EN] Token list comes from the configured env addresses (same source as RewardsPanel); zero/invalid addresses are skipped.
export const buildTokenList = (env = import.meta.env, decimalsMap = {}) =>
  [['USDT', env?.VITE_USDT_ADDRESS], ['USDC', env?.VITE_USDC_ADDRESS]]
    .filter(([, addr]) => isAddress(String(addr || ''), { strict: false }) && getAddress(String(addr)) !== zeroAddress)
    .map(([symbol, addr]) => {
      const d = Number(decimalsMap?.[symbol]);
      return {
        key: symbol,
        symbol: isConfiguredTestToken(addr, env) ? `t${symbol}` : symbol,
        address: getAddress(String(addr)),
        decimals: Number.isInteger(d) && d >= 0 && d <= 36 ? d : DEFAULT_DECIMALS,
      };
    });

const isHiddenDoc = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// [TR] Başarısız okuma 'error' olur; asla 0 gösterilmez. Sekme gizliyken okuma yapılmaz.
// [EN] A failed read becomes 'error', never 0. No reads while the tab is hidden.
export function useTokenBalances({ publicClient, owner, tokens, intervalMs = MIN_REFRESH_MS }) {
  const [stored, setStored] = useState({ scope: null, data: {} });
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const tokenKey = tokens.map((t) => `${t.key}:${t.address}`).join(',');
  // [TR] Bakiye owner + zincir + token listesi kapsamına bağlıdır; eşleşmeyen saklı değer çizilmez.
  // [EN] Balances are scoped to owner + chain + token list; a stored value from another scope is never rendered.
  const scope = `${String(owner || '').toLowerCase()}|${publicClient?.chain?.id ?? ''}|${tokenKey}`;
  const activeScopeRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!publicClient || !owner || isHiddenDoc()) return;
    const mine = activeScopeRef.current;
    if (!mine) return;
    const list = tokensRef.current;
    const results = await Promise.all(list.map(async (t) => {
      try {
        const raw = await publicClient.readContract({ address: t.address, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [owner] });
        return [t.key, { status: 'ok', raw: BigInt(raw) }];
      } catch {
        return [t.key, { status: 'error' }];
      }
    }));
    // [TR] Uçuştaki okuma, kapsam değiştiyse ya da unmount olduysa yazılmaz.
    // [EN] An in-flight read is dropped if the scope changed or the hook unmounted.
    if (activeScopeRef.current !== mine) return;
    setStored({ scope: mine, data: Object.fromEntries(results) });
  }, [publicClient, owner]);

  useEffect(() => {
    if (!publicClient || !owner || !tokenKey) return undefined;
    activeScopeRef.current = scope;
    refresh();
    const id = setInterval(refresh, Math.max(MIN_REFRESH_MS, intervalMs));
    const onVisible = () => { if (!isHiddenDoc()) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      activeScopeRef.current = null;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [publicClient, owner, tokenKey, scope, intervalMs, refresh]);

  const balances = stored.scope === scope ? stored.data : {};

  return { balances, refresh };
}

// [TR] EIP-747. Sonuç: 'added' | 'rejected' | 'unsupported' | 'error'. Ret hata olarak loglanmaz.
// [EN] EIP-747. Result: 'added' | 'rejected' | 'unsupported' | 'error'. A user rejection is not logged as an error.
export async function watchToken(provider, token) {
  if (!provider || typeof provider.request !== 'function') return 'unsupported';
  try {
    const ok = await provider.request({
      method: 'wallet_watchAsset',
      params: { type: 'ERC20', options: { address: token.address, symbol: token.symbol, decimals: token.decimals } },
    });
    return ok === false ? 'rejected' : 'added';
  } catch (error) {
    if (isUserRejection(error)) return 'rejected';
    if (error?.code === -32601 || error?.code === 4200 || /not supported|unsupported|not implemented|does not exist/i.test(String(error?.message || ''))) return 'unsupported';
    console.error('[watchToken] wallet_watchAsset failed', error);
    return 'error';
  }
}

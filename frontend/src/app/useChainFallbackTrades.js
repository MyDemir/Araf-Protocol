// [TR] Yedek işlem listesi durumu. Yalnız `enabled` (backend listesi alınamadı + cüzdan bağlı) VE `viewActive`
//      (listeyi/odayı gösteren görünüm açık) iken okuma yapar; sekme gizliyken ve 30 sn'den sık okumaz.
//      Backend toparlanınca `enabled` false olur, liste temizlenir ve mevcut akış aynen devam eder.
// [EN] Chain fallback list state. Reads only while enabled AND a view showing it is open; never from a hidden tab
//      and never more often than every 30s.
import React from 'react';
import { addKnownTradeIds, normalizeKnownTradeId, readKnownTradeIds, removeKnownTradeIds } from './knownTrades';
import {
  CHAIN_FALLBACK_REFRESH_MS,
  canRefreshChainFallback,
  classifyChainTrade,
  loadChainFallbackTrades,
  mapChainTradeToRoomTrade,
} from './chainFallback';

const isHidden = () => typeof document !== 'undefined' && Boolean(document.hidden);

export function useChainFallbackTrades({
  enabled = false,
  viewActive = false,
  address = null,
  chainId = null,
  escrowAddress = null,
  readTrade = null,
  readTrades = null,
  supportedTokens = {},
  tokenDecimalsMap = {},
  onRetryBackend = null,
  refreshMs = CHAIN_FALLBACK_REFRESH_MS,
  nowFn = Date.now,
} = {}) {
  const [trades, setTrades] = React.useState([]);
  const [states, setStates] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [loadedAt, setLoadedAt] = React.useState(0);
  const lastAtRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const seqRef = React.useRef(0);

  const scopeKey = `${chainId ?? ''}:${String(escrowAddress || '').toLowerCase()}:${String(address || '').toLowerCase()}`;
  const scope = React.useMemo(() => ({ wallet: address, escrow: escrowAddress, chainId }), [address, escrowAddress, chainId]);
  // [TR] Okuyucular ve token haritaları ref'te tutulur: kimlik değişimi yeni okuma tetiklemez (istek seli yok).
  const depsRef = React.useRef({});
  depsRef.current = { readTrade, readTrades, supportedTokens, tokenDecimalsMap, onRetryBackend };

  // Kapsam değişince ya da yedek mod kapanınca liste ve sayaç sıfırlanır.
  React.useEffect(() => {
    seqRef.current += 1;
    lastAtRef.current = 0;
    inFlightRef.current = false;
    setTrades([]);
    setStates({});
    setLoadedAt(0);
    setLoading(false);
  }, [scopeKey, enabled]);

  const load = React.useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    if (!canRefreshChainFallback({ lastAt: lastAtRef.current, now: nowFn(), hidden: isHidden(), minIntervalMs: refreshMs })) return;
    const seq = seqRef.current;
    inFlightRef.current = true;
    lastAtRef.current = nowFn();
    setLoading(true);
    try {
      const { readTrade: rt, readTrades: rts, supportedTokens: tokens, tokenDecimalsMap: decimals } = depsRef.current;
      const ids = readKnownTradeIds(scope);
      const result = await loadChainFallbackTrades({ ids, viewer: address, readTrade: rt, readTrades: rts, supportedTokens: tokens, tokenDecimalsMap: decimals });
      if (seq !== seqRef.current) return;
      if (result.terminalIds.length) removeKnownTradeIds(scope, result.terminalIds);
      setTrades(result.trades);
      setStates(result.states);
      setLoadedAt(nowFn());
    } finally {
      if (seq === seqRef.current) {
        inFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [enabled, scope, address, refreshMs, nowFn]);

  React.useEffect(() => {
    if (!enabled || !viewActive) return undefined;
    load();
    const timer = setInterval(() => {
      if (isHidden()) return;
      // [TR] Aynı tempoda backend'e tek bir yeniden deneme: liste gelirse yedek mod kendiliğinden kapanır.
      const retry = depsRef.current.onRetryBackend;
      if (typeof retry === 'function') {
        try { retry(); } catch { /* backend hâlâ yok; yedek görünüm sürer */ }
      }
      load();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [enabled, viewActive, load, refreshMs]);

  /**
   * [TR] Elle girilen işlem numarasını tek bir getTrade ile okur. Yalnız taraf olunan, terminal olmayan işlem
   *      listeye ve kalıcı kayda eklenir.
   * @returns {Promise<{ status: 'ok'|'invalid'|'not_found'|'not_party'|'terminal'|'read_error'|'disabled', trade?: object }>}
   */
  const submitManualId = React.useCallback(async (input) => {
    const id = normalizeKnownTradeId(input);
    if (!id) return { status: 'invalid' };
    if (!enabled) return { status: 'disabled' };
    const { readTrade: rt, supportedTokens: tokens, tokenDecimalsMap: decimals } = depsRef.current;
    if (typeof rt !== 'function') return { status: 'read_error' };
    let raw;
    try { raw = await rt(id); } catch { raw = null; }
    if (!raw) return { status: 'read_error' };
    const kind = classifyChainTrade(raw, address);
    if (kind !== 'ok') return { status: kind };
    const trade = mapChainTradeToRoomTrade(id, raw, { viewer: address, supportedTokens: tokens, tokenDecimalsMap: decimals });
    if (!trade) return { status: 'not_found' };
    addKnownTradeIds(scope, [id]);
    setTrades((prev) => [trade, ...prev.filter((t) => t.onchainId !== id)]);
    setStates((prev) => ({ ...prev, [id]: trade.state }));
    return { status: 'ok', trade };
  }, [enabled, address, scope]);

  return { active: Boolean(enabled), trades, states, loading, loadedAt, refresh: load, submitManualId };
}

export default useChainFallbackTrades;

import { CalendarClock, CheckCircle2, Coins, Gift, Hourglass, LoaderCircle, RefreshCw, TimerOff } from 'lucide-react';
import React from 'react';
import { formatUnits } from 'viem';
import { buildApiUrl } from '../../apiConfig';
import { useRewardsContract } from '../../../hooks/useRewardsContract';
import { deriveEpochReward, REWARD_STATUS, summarizeRewards } from './rewardsModel';

const TOKEN_ADDRESSES = {
  USDT: import.meta.env.VITE_USDT_ADDRESS || '',
  USDC: import.meta.env.VITE_USDC_ADDRESS || '',
};
const EPOCHS_BACK = 5;

const tx = (lang, tr, en) => (lang === 'TR' ? tr : en);
const fmtAmount = (raw, decimals = 6) => {
  try {
    return Number(formatUnits(BigInt(raw ?? 0), decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  } catch { return '—'; }
};
const fmtPct = (bps, lang) => {
  const v = Number(bps) / 100;
  const s = v.toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: v < 1 ? 2 : 1 });
  return lang === 'TR' ? `%${s}` : `${s}%`;
};
const fmtDate = (sec, lang) => new Date(Number(sec) * 1000).toLocaleDateString(lang === 'TR' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short' });
const fmtDateTime = (sec, lang) => new Date(Number(sec) * 1000).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS_META = {
  [REWARD_STATUS.ACCRUING]: { icon: Hourglass, tone: 'text-info bg-info/10 border-info/30', TR: 'Birikiyor', EN: 'Accruing' },
  [REWARD_STATUS.RECORDING]: { icon: CalendarClock, tone: 'text-warning bg-warning/10 border-warning/30', TR: 'Kesinleşiyor', EN: 'Finalizing' },
  [REWARD_STATUS.CLAIMABLE]: { icon: Gift, tone: 'text-success bg-success/10 border-success/30', TR: 'Talep edilebilir', EN: 'Claimable' },
  [REWARD_STATUS.CLAIMED]: { icon: CheckCircle2, tone: 'text-textSecondary bg-elevated border-borderSubtle', TR: 'Alındı', EN: 'Claimed' },
  [REWARD_STATUS.EXPIRED]: { icon: TimerOff, tone: 'text-textMuted bg-elevated border-borderSubtle', TR: 'Süresi doldu', EN: 'Expired' },
};

/**
 * [TR] Ödüller (Proof of Peace airdrop'u). Her dönem ve token için kontrattan: kullanıcı/toplam ağırlık,
 *      havuz, finalize ve talep durumu okunur; hak edilen tutar kontratın claim formülüyle hesaplanır.
 *      Alınanlar backend RewardClaim aynasından gelir. Önceden yalnız bir önceki dönemin talep edilebilir
 *      tutarı görünüyordu; hak kazanılan pay, havuz ve geçmiş hiç gösterilmiyordu.
 * [EN] Rewards (Proof of Peace airdrop): per-epoch share, pool, entitled amount and status from the contract;
 *      claimed history from the backend mirror. Sponsors cannot select recipients, weights, outcomes,
 *      multipliers, or claim lists.
 */
export const RewardsPanel = ({ lang = 'EN', address, showToast, tokenDecimalsMap = {}, rewardsReader = null, fetchClaimHistory = null, now: nowOverride = null }) => {
  const liveReader = useRewardsContract();
  const rewards = rewardsReader || liveReader;
  const tokens = React.useMemo(
    () => Object.entries(rewardsReader?.tokens || TOKEN_ADDRESSES).filter(([, addr]) => /^0x[0-9a-fA-F]{40}$/.test(addr)),
    [rewardsReader],
  );
  const [state, setState] = React.useState({ status: 'loading', rows: [], currentEpoch: null, timing: null, error: null });
  const [history, setHistory] = React.useState([]);
  const [busyKey, setBusyKey] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const decimalsOf = (sym) => Number(tokenDecimalsMap?.[sym]) || 6;
  const symbolOfAddress = React.useCallback((addr) => {
    const hit = tokens.find(([, a]) => a.toLowerCase() === String(addr || '').toLowerCase());
    return hit ? hit[0] : null;
  }, [tokens]);

  React.useEffect(() => {
    let cancelled = false;
    if (!address) return undefined;
    if (!rewards.isConfigured) { setState({ status: 'error', rows: [], error: tx(lang, 'Ödül kontratı yapılandırılmadı.', 'Rewards contract not configured.') }); return undefined; }
    if (!rewards.isSupportedChain) { setState({ status: 'blocked', rows: [], error: null }); return undefined; }
    (async () => {
      try {
        setState((s) => ({ ...s, status: s.rows.length ? 'refreshing' : 'loading', error: null }));
        const [cur, epochDuration, claimDelay, claimWindow] = await Promise.all([
          rewards.currentEpoch(), rewards.epochDuration(), rewards.claimDelay(), rewards.claimWindow(),
        ]);
        const current = BigInt(cur);
        const timing = { epochDuration: BigInt(epochDuration), claimDelay: BigInt(claimDelay), claimWindow: BigInt(claimWindow) };
        const now = nowOverride ?? Math.floor(Date.now() / 1000);
        const epochs = [];
        for (let i = 0n; i <= BigInt(EPOCHS_BACK) && current - i >= 0n; i += 1n) epochs.push(current - i);
        const rows = (await Promise.all(epochs.map(async (epoch) => {
          const [totalWeight, userWeight] = await Promise.all([rewards.totalWeight(epoch), rewards.userWeight(epoch, address)]);
          return Promise.all(tokens.map(async ([symbol, token]) => {
            const [pool, finalized, claimed] = await Promise.all([
              rewards.epochRewardPool(epoch, token), rewards.epochTokenFinalized(epoch, token), rewards.hasClaimed(epoch, address, token),
            ]);
            return { symbol, token, ...deriveEpochReward({ epoch, now, timing, totalWeight, userWeight, pool, finalized, claimed }) };
          }));
        }))).flat();
        if (!cancelled) setState({ status: 'ready', rows, currentEpoch: current, timing, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: err?.shortMessage || err?.message || 'read_failed' }));
      }
    })();
    return () => { cancelled = true; };
  }, [rewards, address, tokens, lang, refreshKey, nowOverride]);

  React.useEffect(() => {
    let cancelled = false;
    if (!address) return undefined;
    const load = fetchClaimHistory || (async (wallet) => {
      const res = await fetch(buildApiUrl(`rewards/${wallet}/history`), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json())?.claims || [];
    });
    load(address)
      .then((claims) => { if (!cancelled) setHistory(claims.map((c) => ({ ...c, symbol: symbolOfAddress(c.token) })).filter((c) => c.symbol)); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [address, fetchClaimHistory, symbolOfAddress, refreshKey]);

  const handleClaim = async (row) => {
    const key = `${row.epoch}-${row.symbol}`;
    try {
      setBusyKey(key);
      // [TR] Dönem finalize edilmediyse önce herkese açık finalize (owner beklenmez), sonra claim.
      if (row.needsFinalize && !(await rewards.epochTokenFinalized(row.epoch, row.token))) {
        await rewards.finalizeEpochToken(row.epoch, row.token);
      }
      await rewards.claim(row.epoch, row.token);
      showToast?.(tx(lang, 'Ödül cüzdanınıza gönderildi.', 'Reward sent to your wallet.'), 'success');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast?.(err?.shortMessage || err?.message || tx(lang, 'Talep başarısız.', 'Claim failed.'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const summary = summarizeRewards({ rows: state.rows, claimHistory: history, currentEpoch: state.currentEpoch });
  const currentRows = state.rows.filter((r) => state.currentEpoch != null && r.epoch === state.currentEpoch);
  const pastRows = state.rows.filter((r) => state.currentEpoch == null || r.epoch !== state.currentEpoch);
  const pastEpochs = [...new Set(pastRows.map((r) => r.epoch.toString()))];
  const epochRowsAll = (e) => pastRows.filter((r) => r.epoch.toString() === e);
  // [TR] Havuzu boş ve alınmamış token satırı ("≥ 0 USDC · havuz 0") bilgi taşımaz; gizlenir.
  const epochRows = (e) => epochRowsAll(e).filter((r) => r.pool > 0n || r.status === REWARD_STATUS.CLAIMED);
  const sumLine = (field) => tokens.map(([sym]) => `${fmtAmount(summary.byToken[sym]?.[field] ?? 0n, decimalsOf(sym))} ${sym}`).join(' · ');
  const current = currentRows[0];

  return (
    <div className="grid gap-3 max-w-4xl" data-testid="profile-rewards">
      <section className="bg-surface border border-borderSubtle rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-textPrimary flex items-center gap-2"><Gift className="w-4 h-4 text-brand" strokeWidth={1.8} aria-hidden="true" />{tx(lang, 'Barış ödülleri (airdrop)', 'Proof of Peace rewards (airdrop)')}</h3>
            <p className="text-xs text-textMuted mt-1 max-w-xl">
              {tx(lang,
                'Tier 1+ emirlerden doğan ve temiz kapanan işlemler ağırlık kazandırır; havuz, dönemin toplam ağırlığına göre paylaştırılır. Sponsorlar alıcı, ağırlık veya çarpan seçemez.',
                'Cleanly closed trades from Tier 1+ orders earn weight; each epoch pool is split by total weight. Sponsors cannot select recipients, weights, outcomes, multipliers, or claim lists.')}
            </p>
          </div>
          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={state.status === 'loading' || state.status === 'refreshing'} aria-label={tx(lang, 'Yenile', 'Refresh')} className="shrink-0 p-2 rounded-lg border border-borderSubtle text-textMuted hover:text-textPrimary hover:bg-elevated disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${state.status === 'refreshing' ? 'animate-spin' : ''}`} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        {state.status === 'blocked' && <p className="mt-3 text-sm text-warning">{tx(lang, 'Bu ağda ödüller kullanılamıyor. Cüzdanı doğru ağa geçirin.', 'Rewards are unavailable on this network. Switch your wallet network.')}</p>}
        {state.status === 'error' && <p className="mt-3 text-sm text-danger bg-danger/10 border border-danger/40 rounded-lg p-2">{tx(lang, 'Ödül verisi okunamadı', 'Could not read rewards')}: {String(state.error)}</p>}

        {(state.status === 'ready' || state.status === 'refreshing' || state.status === 'loading') && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4" data-testid="rewards-summary">
            {[
              { k: 'claimable', label: tx(lang, 'Talep edilebilir', 'Claimable now'), value: sumLine('claimable'), tone: 'text-success' },
              { k: 'claimed', label: tx(lang, 'Toplam alınan', 'Total received'), value: sumLine('claimed'), tone: 'text-textPrimary' },
              { k: 'current', label: tx(lang, `Bu dönem payın ${fmtPct(summary.currentShareBps, lang)}`, `This epoch share ${fmtPct(summary.currentShareBps, lang)}`), value: sumLine('currentEstimate'), tone: 'text-info', hint: tx(lang, 'Tahmini; dönem bitince kesinleşir', 'Estimate; final after the epoch ends') },
            ].map((tile) => (
              <div key={tile.k} className="bg-elevated border border-borderSubtle rounded-lg px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-textMuted">{tile.label}</p>
                {state.status === 'loading' ? <div className="h-6 w-28 mt-1 rounded bg-surface animate-pulse" /> : <p className={`text-base font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>}
                {tile.hint && <p className="text-[11px] text-textMuted">{tile.hint}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {current && state.timing && (
        <section className="bg-surface border border-borderSubtle rounded-xl p-4" data-testid="rewards-current-epoch">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-textPrimary">{tx(lang, 'Bu dönem', 'This epoch')} <span className="text-textMuted font-normal">#{String(current.epoch)}</span></h3>
            <span className="text-xs text-textMuted whitespace-nowrap">{tx(lang, 'Bitiş', 'Ends')} {fmtDateTime(current.epochEnd, lang)}</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-textSecondary">{tx(lang, 'Havuzdaki payın', 'Your share of the pool')}</span>
              <span className="font-semibold text-textPrimary tabular-nums">{fmtPct(current.shareBps, lang)}</span>
            </div>
            <div className="h-2 rounded-full bg-elevated border border-borderSubtle overflow-hidden"><div className="h-full bg-brand" style={{ width: `${Math.min(100, current.shareBps / 100)}%` }} /></div>
          </div>
          <div className="mt-3 divide-y divide-borderSubtle text-sm">
            {currentRows.filter((r) => r.pool > 0n).map((r) => (
              <div key={r.symbol} className="flex items-center justify-between py-2">
                <span className="text-textSecondary">{r.symbol} {tx(lang, 'havuzu', 'pool')} <span className="text-textMuted">· {fmtAmount(r.pool, decimalsOf(r.symbol))}</span></span>
                <span className="font-semibold tabular-nums text-textPrimary">≈ {fmtAmount(r.amount, decimalsOf(r.symbol))} {r.symbol}</span>
              </div>
            ))}
          </div>
          {current.userWeight === 0n && (
            <p className="mt-2 text-xs text-textMuted">{tx(lang, 'Bu dönem henüz ağırlığın yok. Tier 1+ emirlerden temiz kapanan işlemler pay kazandırır.', 'No weight yet this epoch. Clean trades from Tier 1+ orders earn a share.')}</p>
          )}
        </section>
      )}

      {state.timing && pastEpochs.length > 0 && (
        <section className="bg-surface border border-borderSubtle rounded-xl p-4" data-testid="rewards-epochs">
          <h3 className="text-sm font-bold text-textPrimary mb-2">{tx(lang, 'Geçmiş dönemler', 'Past epochs')}</h3>
          <div className="divide-y divide-borderSubtle">
            {pastEpochs.map((e) => {
              const rows = epochRows(e);
              const head = epochRowsAll(e)[0];
              if (head.status === REWARD_STATUS.NONE) {
                return (
                  <div key={e} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-textSecondary">{tx(lang, 'Dönem', 'Epoch')} {e} <span className="text-textMuted text-xs">· {fmtDate(head.epochStart, lang)}–{fmtDate(head.epochEnd, lang)}</span></span>
                    <span className="text-xs text-textMuted">{tx(lang, 'Pay yok', 'No share')}</span>
                  </div>
                );
              }
              return (
                <div key={e} className="py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-textPrimary font-semibold">{tx(lang, 'Dönem', 'Epoch')} {e} <span className="text-textMuted text-xs font-normal">· {fmtDate(head.epochStart, lang)}–{fmtDate(head.epochEnd, lang)}</span></span>
                    <span className="text-xs text-textSecondary tabular-nums">{tx(lang, 'Pay', 'Share')} {fmtPct(head.shareBps, lang)}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {rows.length === 0 && <p className="text-xs text-textMuted">{tx(lang, 'Bu dönem için havuz henüz ayrılmadı.', 'No pool has been allocated for this epoch yet.')}</p>}
                    {rows.map((r) => {
                      const meta = STATUS_META[r.status];
                      const busy = busyKey === `${r.epoch}-${r.symbol}`;
                      return (
                        <div key={r.symbol} className="flex items-center justify-between gap-2 text-sm" data-testid={`reward-row-${e}-${r.symbol}`}>
                          <span className="min-w-0 flex items-center gap-2">
                            <Coins className="w-3.5 h-3.5 text-textMuted shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            <span className="tabular-nums text-textPrimary font-medium">{r.isEstimate && r.status !== REWARD_STATUS.EXPIRED ? '≥ ' : ''}{fmtAmount(r.amount, decimalsOf(r.symbol))} {r.symbol}</span>
                            <span className="text-[11px] text-textMuted truncate">{tx(lang, 'havuz', 'pool')} {fmtAmount(r.pool, decimalsOf(r.symbol))}</span>
                          </span>
                          {r.status === REWARD_STATUS.CLAIMABLE && r.amount > 0n ? (
                            <button type="button" onClick={() => handleClaim(r)} disabled={Boolean(busyKey)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-black text-xs font-bold hover:opacity-90 disabled:opacity-50">
                              {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" strokeWidth={1.8} aria-hidden="true" /> : null}
                              {tx(lang, 'Talep et', 'Claim')}
                            </button>
                          ) : (
                            <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${meta.tone}`}>
                              <meta.icon className="w-3 h-3" strokeWidth={1.8} aria-hidden="true" />{meta[lang === 'TR' ? 'TR' : 'EN']}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {head.status === REWARD_STATUS.RECORDING && <p className="text-[11px] text-textMuted mt-1">{tx(lang, `Talep ${fmtDateTime(head.claimOpenAt, lang)} tarihinde açılır.`, `Claims open ${fmtDateTime(head.claimOpenAt, lang)}.`)}</p>}
                  {head.status === REWARD_STATUS.CLAIMABLE && <p className="text-[11px] text-textMuted mt-1">{tx(lang, `Son talep: ${fmtDateTime(head.claimCloseAt, lang)}. Talep edilmeyen pay sonraki döneme devredilir.`, `Claim by ${fmtDateTime(head.claimCloseAt, lang)}. Unclaimed rewards roll into a later epoch.`)}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="bg-surface border border-borderSubtle rounded-xl p-4" data-testid="rewards-history">
          <h3 className="text-sm font-bold text-textPrimary mb-2">{tx(lang, 'Alınan ödüller', 'Received rewards')}</h3>
          <div className="divide-y divide-borderSubtle text-sm">
            {history.slice(0, 20).map((c) => (
              <div key={`${c.tx_hash}-${c.log_index}`} className="flex items-center justify-between py-2">
                <span className="text-textSecondary">{tx(lang, 'Dönem', 'Epoch')} {c.epoch} <span className="text-textMuted text-xs font-mono">· {String(c.tx_hash).slice(0, 10)}…</span></span>
                <span className="font-semibold tabular-nums text-success">+{fmtAmount(c.amount, decimalsOf(c.symbol))} {c.symbol}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default RewardsPanel;

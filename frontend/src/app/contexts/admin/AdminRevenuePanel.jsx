import React from 'react';
import { buildApiUrl } from '../../apiConfig';
import { REVENUE_KIND_LABELS } from './adminChainConfig';

// [TR] Gelir & Ödül sekmesi: backend'in zaten sunduğu /admin/revenue (kontrat RevenueEvent aynası) ve
//      /admin/rewards/health uçlarını gösterir. Önceden bu veriler hiçbir ekranda görünmüyordu.
// [EN] Revenue & Rewards tab: surfaces /admin/revenue and /admin/rewards/health, previously shown nowhere.

const t = (lang, tr, en) => (lang === 'TR' ? tr : en);
const short = (v) => { const s = String(v || ''); return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : (s || '—'); };
const fmtUnits = (raw, decimals = 6) => {
  try {
    const n = BigInt(raw ?? 0);
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = (n % base).toString().padStart(decimals, '0').slice(0, 2);
    return `${whole.toLocaleString('en-US')}.${frac}`;
  } catch { return '—'; }
};

export default function AdminRevenuePanel({ lang = 'EN', authenticatedFetch, tokenSymbols = {} }) {
  const [state, setState] = React.useState({ loading: true, error: '', unauthorized: false, rows: [], rewards: null });

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [revRes, rwRes] = await Promise.all([
        authenticatedFetch(buildApiUrl('admin/revenue'), { suppressAuthToast: true }),
        authenticatedFetch(buildApiUrl('admin/rewards/health'), { suppressAuthToast: true }),
      ]);
      if (revRes.status === 403 || rwRes.status === 403) { setState({ loading: false, error: '', unauthorized: true, rows: [], rewards: null }); return; }
      if (revRes.status === 401 || rwRes.status === 401) { setState({ loading: false, error: t(lang, 'Admin oturumu doğrulanamadı. Yeniden giriş yapın.', 'Admin session is no longer valid. Please sign in again.'), unauthorized: false, rows: [], rewards: null }); return; }
      if (!revRes.ok || !rwRes.ok) throw new Error('bad_status');
      const rev = await revRes.json();
      const rw = await rwRes.json();
      setState({ loading: false, error: '', unauthorized: false, rows: Array.isArray(rev?.rows) ? rev.rows : [], rewards: rw || null });
    } catch {
      setState((s) => ({ ...s, loading: false, error: t(lang, 'Gelir verisi alınamadı.', 'Failed to load revenue data.') }));
    }
  }, [authenticatedFetch, lang]);

  React.useEffect(() => { load(); }, [load]);

  const totals = React.useMemo(() => {
    const byToken = new Map();
    for (const row of state.rows) {
      const key = String(row?.token || '').toLowerCase();
      const acc = byToken.get(key) || { amount: 0n, reward: 0n, treasury: 0n, count: 0 };
      const big = (v) => { try { return BigInt(v ?? 0); } catch { return 0n; } };
      acc.amount += big(row?.amount); acc.reward += big(row?.reward_share); acc.treasury += big(row?.treasury_share); acc.count += 1;
      byToken.set(key, acc);
    }
    return [...byToken.entries()];
  }, [state.rows]);

  const symbolOf = (addr) => tokenSymbols[String(addr || '').toLowerCase()] || short(addr);

  if (state.unauthorized) {
    return (
      <div className="bg-surface border border-danger/40 rounded-xl p-5">
        <h3 className="text-danger text-lg font-semibold mb-2">{t(lang, 'Yetkisiz Erişim', 'Unauthorized Access')}</h3>
        <p className="text-textSecondary text-sm">{t(lang, 'Gelir verilerini görüntüleme yetkiniz yok.', 'You are not authorized to view revenue data.')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="admin-revenue-panel">
      {state.error && <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl p-3 text-sm">{state.error}</div>}
      {state.loading && <div className="text-textSecondary text-sm">{t(lang, 'Yükleniyor…', 'Loading…')}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { k: 'events', label: t(lang, 'Gelir olayı', 'Revenue events'), value: state.rows.length },
          { k: 'epochs', label: t(lang, 'Ödül dönemi', 'Reward epochs'), value: state.rewards?.counts?.epochs ?? '—' },
          { k: 'funding', label: t(lang, 'Fonlama', 'Fundings'), value: state.rewards?.counts?.funding ?? '—' },
          { k: 'claims', label: t(lang, 'Talep (claim)', 'Claims'), value: state.rewards?.counts?.claims ?? '—' },
        ].map((tile) => (
          <div key={tile.k} className="bg-surface border border-borderSubtle rounded-xl px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-textMuted">{tile.label}</p>
            <p className="text-xl font-bold text-textPrimary tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      {totals.length > 0 && (
        <div className="bg-surface border border-borderSubtle rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-textMuted mb-2">{t(lang, 'Token bazında toplam (son 500 olay)', 'Totals by token (last 500 events)')}</p>
          <div className="divide-y divide-borderSubtle text-sm">
            {totals.map(([token, acc]) => (
              <div key={token} className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2">
                <span className="font-semibold text-textPrimary">{symbolOf(token)} <span className="text-textMuted font-normal">· {acc.count}</span></span>
                <span className="text-textSecondary">{t(lang, 'Toplam', 'Total')}: <b className="text-textPrimary tabular-nums">{fmtUnits(acc.amount)}</b></span>
                <span className="text-textSecondary">{t(lang, 'Ödül payı', 'Reward share')}: <b className="text-success tabular-nums">{fmtUnits(acc.reward)}</b></span>
                <span className="text-textSecondary">{t(lang, 'Hazine payı', 'Treasury share')}: <b className="text-textPrimary tabular-nums">{fmtUnits(acc.treasury)}</b></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-borderSubtle rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-textMuted border-b border-borderSubtle">
              <th className="px-3 py-2">{t(lang, 'Zaman', 'Time')}</th>
              <th className="px-3 py-2">{t(lang, 'Tür', 'Kind')}</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">{t(lang, 'Tutar', 'Amount')}</th>
              <th className="px-3 py-2">{t(lang, 'İşlem', 'Trade')}</th>
              <th className="px-3 py-2">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderSubtle">
            {state.rows.length === 0 && !state.loading ? (
              <tr><td colSpan={6} className="px-3 py-4 text-textMuted">{t(lang, 'Henüz gelir olayı yok.', 'No revenue events yet.')}</td></tr>
            ) : state.rows.slice(0, 100).map((row) => (
              <tr key={`${row.tx_hash}-${row.log_index}`} className="text-textSecondary">
                <td className="px-3 py-2 whitespace-nowrap">{row.created_at_onchain ? new Date(row.created_at_onchain).toLocaleString() : `#${row.block_number}`}</td>
                <td className="px-3 py-2">{REVENUE_KIND_LABELS[Number(row.kind)]?.[lang === 'TR' ? 'TR' : 'EN'] || `#${row.kind}`}</td>
                <td className="px-3 py-2">{symbolOf(row.token)}</td>
                <td className="px-3 py-2 text-right font-mono text-textPrimary">{fmtUnits(row.amount)}</td>
                <td className="px-3 py-2 font-mono">{row.trade_id ? `#${row.trade_id}` : '—'}</td>
                <td className="px-3 py-2 font-mono">{short(row.tx_hash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-textMuted">{t(lang, 'Kaynak: kontrat olaylarının backend aynası (salt okunur). Tutarlar 6 ondalıkla gösterilir.', 'Source: backend mirror of contract events (read-only). Amounts shown with 6 decimals.')}</p>
    </section>
  );
}

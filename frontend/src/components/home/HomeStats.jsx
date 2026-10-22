import { Flame } from 'lucide-react';
import { fmtCompact, fmtInt, fmtNumber } from '../../app/format';

// [TR] İstatistik değişim rozeti (eskiden AppViews içindeydi; yalnız ana sayfa kullanır).
// [EN] Stat delta badge (moved from AppViews; used only on Home).
const StatChange = ({ value, lang = 'EN' }) => {
  if (value == null) return null;
  const isPositive = value >= 0;
  return <span className={`text-[10px] ml-2 font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>{isPositive ? '▲' : '▼'}{lang === 'TR' ? `%${Math.abs(value).toFixed(1).replace('.', ',')}` : `${Math.abs(value).toFixed(1)}%`}</span>;
};

// [TR] Protokol istatistikleri. Hesap ve "veri yoksa tire" kuralı eski renderHome ile aynıdır.
// [EN] Protocol stats. Computation and the "dash when no data" rule match the old renderHome.
const HomeStats = ({ protocolStats, statsLoading, statsError, fetchStats, lang }) => {
  const tr = lang === 'TR';
  // [TR] İstatistik gelmediyse "$0" yanıltıcıdır; veri yokken tire gösterilir.
  // [EN] "$0" is misleading when stats failed to load; show a dash when there is no data.
  const statValue = (value, format) => (protocolStats == null || value == null ? '—' : format(value));
  const usd = (v) => `$${fmtCompact(v, lang, 1)}`;
  const openOrders = protocolStats && (protocolStats.open_sell_orders != null || protocolStats.open_buy_orders != null)
    ? Number(protocolStats.open_sell_orders || 0) + Number(protocolStats.open_buy_orders || 0)
    : null;
  const hours = protocolStats?.avg_trade_hours;
  const tiles = [
    { k: 'vol', label: tr ? 'Tamamlanan hacim' : 'Settled volume', value: statValue(protocolStats?.total_volume_usdt, usd), change: protocolStats?.changes_30d?.total_volume_usdt_pct },
    { k: 'trades', label: tr ? 'Başarılı işlem' : 'Successful trades', value: statValue(protocolStats?.completed_trades, (v) => fmtInt(v, lang)), change: protocolStats?.changes_30d?.completed_trades_pct },
    { k: 'open', label: tr ? 'Açık emir' : 'Open orders', value: openOrders == null ? '—' : fmtInt(openOrders, lang), sub: openOrders == null ? null : (tr ? `${protocolStats.open_sell_orders || 0} satış · ${protocolStats.open_buy_orders || 0} alış` : `${protocolStats.open_sell_orders || 0} sell · ${protocolStats.open_buy_orders || 0} buy`) },
    { k: 'time', label: tr ? 'Ort. işlem süresi' : 'Avg. trade time', value: hours != null ? (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} ${tr ? 'dk' : 'min'}` : `${fmtNumber(hours, lang, { maxFractionDigits: 1 })} ${tr ? 'sa' : 'h'}`) : '—' },
    { k: 'burn', label: tr ? 'Eriyen ve yakılan' : 'Decayed & burned', value: statValue(protocolStats?.burned_bonds_usdt, (v) => `$${fmtInt(v, lang)}`), danger: true, sub: tr ? 'Uzlaşmayanların kaybı' : 'Lost by those who would not settle' },
  ];
  return (
    <div className="mb-10 md:mb-14">
      <div className="grid min-w-0 grid-cols-2 md:grid-cols-5 gap-3" aria-busy={statsLoading ? 'true' : 'false'} data-testid="home-stats">
        {tiles.map((tile) => (
          <div key={tile.k} className={`min-w-0 overflow-hidden bg-surface border p-4 rounded-2xl relative ${tile.danger ? 'border-danger/30 col-span-2 md:col-span-1' : 'border-borderSubtle'}`}>
            {tile.danger && <Flame className="absolute -right-2 -bottom-2 w-14 h-14 text-danger/10" strokeWidth={1.8} aria-hidden="true" />}
            <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${tile.danger ? 'text-danger' : 'text-textMuted'}`}>{tile.label}</p>
            {statsLoading && protocolStats == null ? (
              <div className="h-7 w-20 rounded-md bg-elevated animate-pulse" />
            ) : (
              <div className="flex min-w-0 flex-wrap items-baseline relative">
                <span className={`max-w-full truncate text-2xl font-bold tabular-nums ${tile.danger ? 'text-danger' : 'text-textPrimary'}`}>{tile.value}</span>
                {tile.change != null && <StatChange value={tile.change} lang={lang} />}
              </div>
            )}
            {tile.sub && <p className="text-[11px] text-textMuted mt-1 truncate relative">{tile.sub}</p>}
          </div>
        ))}
      </div>
      {statsError && (
        <p className="text-center pt-3 text-textMuted text-xs">
          {tr ? 'İstatistik verisi alınamadı.' : 'Failed to load stats.'}
          <button type="button" onClick={fetchStats} className="ml-2 text-brand font-semibold hover:underline">{tr ? 'Tekrar dene' : 'Retry'}</button>
        </p>
      )}
    </div>
  );
};

export default HomeStats;

import React from 'react';

// [TR] Kontrat sekmesi: owner ayarları zincirden, salt okunur. Owner EOA ise mainnet uyarısı gösterir.
// [EN] On-chain tab: owner settings straight from chain, read-only; warns when an owner is an EOA.

const t = (lang, tr, en) => (lang === 'TR' ? tr : en);
const short = (v) => { const s = String(v || ''); return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : (s || '—'); };
const bps = (v) => (v == null ? '—' : `${(Number(v) / 100).toFixed(2)}% (${v} bps)`);
const dur = (sec, lang) => {
  if (sec == null) return '—';
  const s = Number(sec);
  if (s % 86400 === 0) return `${s / 86400} ${t(lang, 'gün', 'd')}`;
  if (s % 3600 === 0) return `${s / 3600} ${t(lang, 'saat', 'h')}`;
  if (s % 60 === 0) return `${s / 60} ${t(lang, 'dk', 'min')}`;
  return `${s} s`;
};
const units = (raw, decimals = 6) => {
  if (raw == null) return '—';
  try { const n = BigInt(raw); const base = 10n ** BigInt(decimals); return `${(n / base).toLocaleString('en-US')}.${(n % base).toString().padStart(decimals, '0').slice(0, 2)}`; } catch { return '—'; }
};

const Row = ({ label, children, tone }) => (
  <div className="flex items-center justify-between gap-3 py-2 text-sm">
    <span className="text-textSecondary">{label}</span>
    <span className={`text-right font-medium tabular-nums ${tone || 'text-textPrimary'}`}>{children}</span>
  </div>
);

const PausedPill = ({ paused, lang }) => (paused == null
  ? <span className="text-textMuted">—</span>
  : <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${paused ? 'bg-danger/10 text-danger border-danger/40' : 'bg-success/10 text-success border-success/40'}`}>{paused ? t(lang, 'Durduruldu', 'Paused') : t(lang, 'Çalışıyor', 'Live')}</span>);

const OwnerRow = ({ owner, kind, lang }) => (
  <Row label="Owner">
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{short(owner)}</span>
      {kind === 'eoa' && <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-bold">EOA</span>}
      {kind === 'contract' && <span className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px] font-bold">{t(lang, 'Kontrat', 'Contract')}</span>}
    </span>
  </Row>
);

const Card = ({ title, address, children }) => (
  <section className="bg-surface border border-borderSubtle rounded-xl p-4">
    <div className="flex items-center justify-between gap-3 mb-1">
      <h3 className="font-bold text-textPrimary">{title}</h3>
      {address && <span className="font-mono text-xs text-textMuted">{short(address)}</span>}
    </div>
    <div className="divide-y divide-borderSubtle">{children}</div>
  </section>
);

export default function AdminChainPanel({ lang = 'EN', readProtocolConfig }) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });

  const load = React.useCallback(async () => {
    if (typeof readProtocolConfig !== 'function') { setState({ loading: false, error: t(lang, 'Zincir bağlantısı yok.', 'No chain connection.'), data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await readProtocolConfig();
      setState({ loading: false, error: '', data });
    } catch {
      setState({ loading: false, error: t(lang, 'Kontrat okunamadı. Cüzdanı doğru ağa bağlayın.', 'Could not read contracts. Connect your wallet to the right network.'), data: null });
    }
  }, [readProtocolConfig, lang]);

  React.useEffect(() => { load(); }, [load]);

  const { escrow, vault, rewards } = state.data || {};
  const eoaOwners = [escrow, vault, rewards].filter((c) => c?.ownerKind === 'eoa').length;

  return (
    <section className="space-y-4" data-testid="admin-chain-panel">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-textMuted">{t(lang, 'Kaynak: doğrudan kontrat okuması (salt okunur). Parametre değişikliği bu panelden yapılmaz; owner multisig/Timelock üzerinden yönetilmelidir.', 'Source: direct contract reads (read-only). Parameters are not changed here; the owner should act through a multisig/Timelock.')}</p>
        <button type="button" onClick={load} disabled={state.loading} className="shrink-0 bg-success/15 hover:bg-success/25 disabled:opacity-60 border border-success/40 text-success rounded-lg px-3 py-1.5 text-xs font-semibold">{state.loading ? '…' : t(lang, 'Yenile', 'Refresh')}</button>
      </div>
      {state.error && <div className="bg-danger/10 border border-danger/40 text-danger rounded-xl p-3 text-sm">{state.error}</div>}
      {eoaOwners > 0 && (
        <div className="bg-warning/10 border border-warning/40 text-warning rounded-xl p-3 text-sm">
          {t(lang, `${eoaOwners} kontratın owner'ı tek anahtarlı cüzdan (EOA). Mainnet öncesi multisig/Timelock'a devredilmeli.`, `${eoaOwners} contract owner(s) are single-key wallets (EOA). Transfer to a multisig/Timelock before mainnet.`)}
        </div>
      )}

      {state.data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card title="ArafEscrow" address={escrow?.address}>
            {escrow ? (<>
              <Row label={t(lang, 'Durum', 'Status')}><PausedPill paused={escrow.paused} lang={lang} /></Row>
              <OwnerRow owner={escrow.owner} kind={escrow.ownerKind} lang={lang} />
              <Row label={t(lang, 'Hazine', 'Treasury')}><span className="font-mono">{short(escrow.treasury)}</span></Row>
              <Row label={t(lang, 'Alıcı ücreti', 'Taker fee')}>{bps(escrow.takerFeeBps)}</Row>
              <Row label={t(lang, 'Satıcı ücreti', 'Maker fee')}>{bps(escrow.makerFeeBps)}</Row>
              <Row label={t(lang, 'Tier 0 bekleme', 'Tier 0 cooldown')}>{dur(escrow.tier0CooldownSec, lang)}</Row>
              <Row label={t(lang, 'Tier 1 bekleme', 'Tier 1 cooldown')}>{dur(escrow.tier1CooldownSec, lang)}</Row>
              <Row label={t(lang, 'Emir / işlem sayacı', 'Order / trade counter')}>{escrow.orderCounter?.toString?.() ?? '—'} / {escrow.tradeCounter?.toString?.() ?? '—'}</Row>
              {(escrow.tokenConfigs || []).map((tk) => (
                <Row key={tk.symbol} label={`${tk.symbol} ${t(lang, 'ayarı', 'config')}`} tone={tk.config?.supported ? 'text-textPrimary' : 'text-danger'}>
                  {!tk.config ? '—' : !tk.config.supported ? t(lang, 'Desteklenmiyor', 'Not supported') : (
                    <span className="text-xs">{tk.config.allowSellOrders ? 'SELL' : '—'} · {tk.config.allowBuyOrders ? 'BUY' : '—'} · {tk.config.decimals}d<br />
                      <span className="text-textMuted">T0–T3 max: {tk.config.tierMax.map((v) => units(v, tk.config.decimals)).join(' / ')}</span>
                    </span>
                  )}
                </Row>
              ))}
            </>) : <p className="py-2 text-sm text-textMuted">{t(lang, 'Adres ayarlı değil.', 'Address not configured.')}</p>}
          </Card>

          <Card title="ArafRevenueVault" address={vault?.address}>
            {vault ? (<>
              <Row label={t(lang, 'Durum', 'Status')}><PausedPill paused={vault.paused} lang={lang} /></Row>
              <OwnerRow owner={vault.owner} kind={vault.ownerKind} lang={lang} />
              <Row label={t(lang, 'Ödül payı', 'Reward share')}>{bps(vault.rewardBps)}</Row>
              <Row label={t(lang, 'Nihai hazine', 'Final treasury')}><span className="font-mono">{short(vault.finalTreasury)}</span></Row>
              <Row label={t(lang, 'Ödül kontratı', 'Rewards contract')}><span className="font-mono">{short(vault.rewards)}</span></Row>
              {(vault.reserves || []).map((r) => (
                <Row key={r.symbol} label={`${r.symbol} ${t(lang, 'rezerv', 'reserves')}`}>
                  <span className="text-xs">{t(lang, 'Hazine', 'Treasury')} {units(r.treasuryReserve)} · {t(lang, 'Ödül', 'Reward')} {units(r.rewardReserve)}</span>
                </Row>
              ))}
            </>) : <p className="py-2 text-sm text-textMuted">{t(lang, 'Adres ayarlı değil.', 'Address not configured.')}</p>}
          </Card>

          <Card title="ArafRewards" address={rewards?.address}>
            {rewards ? (<>
              <Row label={t(lang, 'Durum', 'Status')}><PausedPill paused={rewards.paused} lang={lang} /></Row>
              <OwnerRow owner={rewards.owner} kind={rewards.ownerKind} lang={lang} />
              <Row label={t(lang, 'Geçerli dönem', 'Current epoch')}>{rewards.currentEpoch?.toString?.() ?? '—'}</Row>
              <Row label={t(lang, 'Dönem süresi', 'Epoch length')}>{dur(rewards.epochDurationSec, lang)}</Row>
              <Row label={t(lang, 'Talep gecikmesi', 'Claim delay')}>{dur(rewards.claimDelaySec, lang)}</Row>
              <Row label={t(lang, 'Talep penceresi', 'Claim window')}>{dur(rewards.claimWindowSec, lang)}</Row>
            </>) : <p className="py-2 text-sm text-textMuted">{t(lang, 'Adres ayarlı değil.', 'Address not configured.')}</p>}
          </Card>
        </div>
      )}
    </section>
  );
}

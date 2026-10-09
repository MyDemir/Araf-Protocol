import React from 'react';
import { buildApiUrl } from '../../apiConfig';
import { shortAddress as short, tx as t } from '../../copy';

// [TR] "Ödeme yöntemleri" sekmesi: rail açma/kapama (switch), onay penceresi, audit listesi.
//      Kapatılan rail yalnız YENİ profil/emir açılışını engeller; aktif işlemler etkilenmez.
//      Kontrat rail bilmez; bu kapı yalnız UI/API düzeyindedir.
// [EN] "Payment methods" tab. Disabling only blocks NEW profiles/orders; active trades are unaffected.

const RISK_CLASS = {
  LOW: 'bg-success/10 text-success border border-success/40',
  MEDIUM: 'bg-elevated text-textPrimary border border-borderStrong',
  HIGH: 'bg-danger/10 text-danger border border-danger/40',
  RESTRICTED: 'bg-danger/10 text-danger border border-danger/40',
};

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function AdminRailsPanel({ lang = 'EN', authenticatedFetch, showToast = () => {} }) {
  const [state, setState] = React.useState({ loading: true, error: '', unauthorized: false, rails: [] });
  const [audit, setAudit] = React.useState({ items: [], total: 0, page: 1, limit: 10 });
  const [pending, setPending] = React.useState(null); // { rail, nextEnabled }
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const loadAudit = React.useCallback(async (page = 1) => {
    try {
      const res = await authenticatedFetch(buildApiUrl(`admin/payment-rails/audit?page=${page}&limit=10`), { suppressAuthToast: true });
      if (!res.ok) return;
      const data = await res.json();
      setAudit({
        items: Array.isArray(data?.items) ? data.items : [],
        total: Number(data?.total) || 0,
        page: Number(data?.page) || page,
        limit: Number(data?.limit) || 10,
      });
    } catch { /* audit listesi ikincil; sessiz */ }
  }, [authenticatedFetch]);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await authenticatedFetch(buildApiUrl('admin/payment-rails'), { suppressAuthToast: true });
      if (res.status === 403) { setState({ loading: false, error: '', unauthorized: true, rails: [] }); return; }
      if (!res.ok) throw new Error('bad_status');
      const data = await res.json();
      setState({ loading: false, error: '', unauthorized: false, rails: Array.isArray(data?.rails) ? data.rails : [] });
      loadAudit(1);
    } catch {
      setState((s) => ({ ...s, loading: false, error: t(lang, 'Ödeme yöntemleri alınamadı.', 'Failed to load payment methods.') }));
    }
  }, [authenticatedFetch, lang, loadAudit]);

  React.useEffect(() => { load(); }, [load]);

  const closeDialog = () => { if (!saving) { setPending(null); setReason(''); } };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const body = { enabled: pending.nextEnabled };
      if (reason.trim()) body.reason = reason.trim();
      const res = await authenticatedFetch(buildApiUrl(`admin/payment-rails/${pending.rail.code}`), {
        method: 'PUT',
        body: JSON.stringify(body),
        suppressAuthToast: true,
      });
      if (res.ok) {
        showToast(t(lang, 'Ödeme yöntemi güncellendi.', 'Payment method updated.'), 'success');
        setPending(null);
        setReason('');
        await load();
      } else {
        let code = '';
        try { code = (await res.json())?.code || ''; } catch { /* yoksay */ }
        const msg = code === 'LAST_ENABLED_RAIL'
          ? t(lang, 'En az bir ödeme yöntemi açık kalmalıdır.', 'At least one payment method must stay enabled.')
          : t(lang, 'Güncelleme başarısız.', 'Update failed.');
        showToast(msg, 'error');
        setPending(null);
        setReason('');
      }
    } catch {
      showToast(t(lang, 'Güncelleme başarısız.', 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (state.loading && state.rails.length === 0) {
    return <div className="p-4 text-sm text-textMuted" role="status">{t(lang, 'Yükleniyor…', 'Loading…')}</div>;
  }
  if (state.unauthorized) {
    return <div className="p-4 text-sm text-danger" role="alert">{t(lang, 'Admin erişimi reddedildi.', 'Admin access denied.')}</div>;
  }

  const lastEnabled = state.rails.filter((r) => r.enabled).length <= 1;

  return (
    <section className="space-y-4" aria-label={t(lang, 'Ödeme yöntemleri', 'Payment methods')}>
      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h2 className="text-base font-semibold text-textPrimary">{t(lang, 'Ödeme yöntemleri', 'Payment methods')}</h2>
        <p className="mt-1 text-xs text-textSecondary">
          {t(lang,
            'Kapatılan yöntem yeni profil ve emir açılışını engeller; aktif işlemler (LOCKED/PAID/CHALLENGED) etkilenmez. Kontrat bu ayarı bilmez.',
            'A disabled method blocks new profiles and orders only; active trades (LOCKED/PAID/CHALLENGED) are unaffected. The contract is unaware of this setting.')}
        </p>
        {state.error && <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p>}
      </div>

      <ul className="space-y-3">
        {state.rails.map((rail) => {
          const name = rail.name?.[lang === 'TR' ? 'TR' : 'EN'] || rail.code;
          const blocked = rail.enabled && lastEnabled;
          const labelId = `rail-label-${rail.code}`;
          return (
            <li key={rail.code} className="bg-surface border border-borderSubtle rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="min-w-0">
                <div id={labelId} className="text-sm font-semibold text-textPrimary">{name} <span className="text-xs text-textMuted font-mono">({rail.code})</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-textSecondary">
                  <span>{t(lang, 'Ülke', 'Country')}: {(rail.countries || []).join(', ') || '—'}</span>
                  <span className={`px-2 py-0.5 rounded-full ${RISK_CLASS[rail.riskLevel] || RISK_CLASS.MEDIUM}`}>{rail.riskLevel}</span>
                </div>
                <div className="mt-1 text-xs text-textMuted">
                  {t(lang, 'Son değişiklik', 'Last change')}: {fmtDate(rail.changedAt)}
                  {rail.changedBy ? ` · ${short(rail.changedBy)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${rail.enabled ? 'text-success' : 'text-textMuted'}`}>
                  {rail.enabled ? t(lang, 'Açık', 'Enabled') : t(lang, 'Kapalı', 'Disabled')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rail.enabled}
                  aria-labelledby={labelId}
                  disabled={blocked}
                  title={blocked ? t(lang, 'Son açık yöntem kapatılamaz.', 'The last enabled method cannot be disabled.') : undefined}
                  onClick={() => setPending({ rail, nextEnabled: !rail.enabled })}
                  className={`relative inline-flex items-center shrink-0 min-h-[44px] min-w-[56px] rounded-full border transition disabled:opacity-50 ${rail.enabled ? 'bg-success/20 border-success/50' : 'bg-elevated border-borderStrong'}`}
                >
                  <span aria-hidden="true" className={`inline-block h-6 w-6 rounded-full bg-textPrimary transition-transform ${rail.enabled ? 'translate-x-7' : 'translate-x-1.5'}`} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h3 className="text-sm font-semibold text-textPrimary mb-2">{t(lang, 'Denetim kaydı', 'Audit log')}</h3>
        {audit.items.length === 0 ? (
          <p className="text-xs text-textMuted">{t(lang, 'Kayıt yok.', 'No records.')}</p>
        ) : (
          <ul className="space-y-2">
            {audit.items.map((a) => (
              <li key={a.id} className="text-xs text-textSecondary border-b border-borderSubtle pb-2 last:border-0">
                <span className="font-mono text-textPrimary">{a.rail}</span>{' '}
                {a.previousEnabled ? t(lang, 'Açık', 'Enabled') : t(lang, 'Kapalı', 'Disabled')} → {a.newEnabled ? t(lang, 'Açık', 'Enabled') : t(lang, 'Kapalı', 'Disabled')}
                {' · '}{short(a.adminWallet)}{' · '}{fmtDate(a.createdAt)}
                {a.reason ? <div className="text-textMuted break-words">{a.reason}</div> : null}
              </li>
            ))}
          </ul>
        )}
        {audit.total > audit.limit && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="min-h-[44px] px-3 rounded-lg border border-borderSubtle text-xs disabled:opacity-50" disabled={audit.page <= 1} onClick={() => loadAudit(audit.page - 1)}>
              {t(lang, 'Önceki', 'Previous')}
            </button>
            <span className="text-xs text-textMuted">{audit.page} / {Math.max(1, Math.ceil(audit.total / audit.limit))}</span>
            <button type="button" className="min-h-[44px] px-3 rounded-lg border border-borderSubtle text-xs disabled:opacity-50" disabled={audit.page * audit.limit >= audit.total} onClick={() => loadAudit(audit.page + 1)}>
              {t(lang, 'Sonraki', 'Next')}
            </button>
          </div>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeDialog}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rail-confirm-title"
            className="w-full max-w-md bg-surface border border-borderStrong rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rail-confirm-title" className="text-base font-semibold text-textPrimary">
              {pending.nextEnabled
                ? t(lang, 'Ödeme yöntemini aç', 'Enable payment method')
                : t(lang, 'Ödeme yöntemini kapat', 'Disable payment method')}
              {': '}{pending.rail.code}
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              {pending.nextEnabled
                ? t(lang, 'Kullanıcılar bu yöntemle yeni profil oluşturabilir.', 'Users will be able to create new profiles with this method.')
                : t(lang, 'Bu yöntemle yeni profil ve emir açılamaz. Aktif işlemler etkilenmez.', 'New profiles and orders with this method will be blocked. Active trades are unaffected.')}
            </p>
            <label className="mt-3 block text-xs text-textSecondary" htmlFor="rail-reason">
              {t(lang, 'Gerekçe (opsiyonel)', 'Reason (optional)')}
            </label>
            <input
              id="rail-reason"
              type="text"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-lg bg-elevated border border-borderSubtle px-3 text-sm text-textPrimary"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeDialog} disabled={saving} className="min-h-[44px] px-4 rounded-lg border border-borderSubtle text-sm text-textSecondary">
                {t(lang, 'Vazgeç', 'Cancel')}
              </button>
              <button type="button" onClick={confirm} disabled={saving} className="min-h-[44px] px-4 rounded-lg bg-success/15 border border-success/40 text-sm font-semibold text-success disabled:opacity-60">
                {saving ? '…' : t(lang, 'Onayla', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

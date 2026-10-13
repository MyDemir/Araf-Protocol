import React from 'react';
import { buildApiUrl } from '../../apiConfig';
import { shortAddress as short, tx as t } from '../../copy';

// [TR] "Çalışma ayarları" sekmesi: worker performans/operasyon ayarları (admin > env > varsayılan).
//      Değişiklik yeniden başlatma gerekmeden sonraki turda etkili olur. Sınırlar sunucuda zorlanır.
//      RPC URL'leri bilerek burada yoktur: ele geçirilmiş bir admin oturumu doğru zincir ID'siyle sahte log
//      döndüren bir RPC verebilir ve worker o log'lara güvenir; bu yüzden yalnız env'de kalırlar.
// [EN] "Runtime settings" tab. RPC URLs are intentionally absent: a hijacked admin session could point the
//      worker at an RPC that reports the right chain ID but returns forged logs, so they stay env-only.

const SOURCE_CLASS = {
  admin: 'bg-honey/10 text-textPrimary border border-honey/40',
  env: 'bg-elevated text-textPrimary border border-borderStrong',
  default: 'bg-elevated text-textMuted border border-borderSubtle',
};

const GROUPS = [
  { id: 'worker', TR: 'Worker', EN: 'Worker' },
  { id: 'watchdog', TR: 'Watchdog / Sağlık', EN: 'Watchdog / Health' },
  { id: 'cache', TR: 'Önbellekler', EN: 'Caches' },
  { id: 'ticker', TR: 'Kur referansı', EN: 'Rate reference' },
  { id: 'jobs', TR: 'Arka plan işleri', EN: 'Background jobs' },
];

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const REASON_MAX = 300;

export default function AdminRuntimeSettingsPanel({ lang = 'EN', authenticatedFetch, showToast = () => {} }) {
  const [state, setState] = React.useState({ loading: true, error: '', unauthorized: false, settings: [], version: 0, degraded: false });
  const [drafts, setDrafts] = React.useState({});
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [audit, setAudit] = React.useState({ items: [], total: 0, page: 1, limit: 10 });
  const [pending, setPending] = React.useState(null); // { setting, value (number|null = reset) }
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);

  const loadAudit = React.useCallback(async (page = 1) => {
    try {
      const res = await authenticatedFetch(buildApiUrl(`admin/runtime-settings/audit?page=${page}&limit=10`), { suppressAuthToast: true });
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
      const res = await authenticatedFetch(buildApiUrl('admin/runtime-settings'), { suppressAuthToast: true });
      if (res.status === 403) { setState({ loading: false, error: '', unauthorized: true, settings: [], version: 0, degraded: false }); return; }
      if (!res.ok) throw new Error('bad_status');
      const data = await res.json();
      const settings = Array.isArray(data?.settings) ? data.settings : [];
      setState({ loading: false, error: '', unauthorized: false, settings, version: Number(data?.version) || 0, degraded: data?.degraded === true });
      setDrafts(Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
      setFieldErrors({});
      setConflict(false);
      loadAudit(1);
    } catch {
      setState((s) => ({ ...s, loading: false, error: t(lang, 'Çalışma ayarları alınamadı.', 'Failed to load runtime settings.') }));
    }
  }, [authenticatedFetch, lang, loadAudit]);

  React.useEffect(() => { load(); }, [load]);

  const closeDialog = () => { if (!saving) { setPending(null); setReason(''); } };

  const requestSave = (setting) => {
    const raw = String(drafts[setting.key] ?? '').trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < setting.min || n > setting.max) {
      setFieldErrors((e) => ({
        ...e,
        [setting.key]: t(lang, `${setting.min}–${setting.max} arasında bir tam sayı girin.`, `Enter a whole number between ${setting.min} and ${setting.max}.`),
      }));
      return;
    }
    setFieldErrors((e) => ({ ...e, [setting.key]: '' }));
    setPending({ setting, value: n });
  };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const body = pending.value === null ? { reset: true } : { value: pending.value };
      body.expectedVersion = state.version;
      if (reason.trim()) body.reason = reason.trim().slice(0, REASON_MAX);
      const res = await authenticatedFetch(buildApiUrl(`admin/runtime-settings/${pending.setting.key}`), {
        method: 'PUT',
        body: JSON.stringify(body),
        suppressAuthToast: true,
      });
      if (res.ok) {
        showToast(t(lang, 'Ayar güncellendi. Sonraki turdan itibaren geçerli.', 'Setting updated. Applies from the next round.'), 'success');
        setPending(null);
        setReason('');
        await load();
      } else if (res.status === 409) {
        setPending(null);
        setReason('');
        setConflict(true);
      } else {
        let msg = '';
        try { msg = (await res.json())?.error || ''; } catch { /* yoksay */ }
        showToast(res.status === 400 && msg ? msg : t(lang, 'Güncelleme başarısız.', 'Update failed.'), 'error');
        setPending(null);
        setReason('');
      }
    } catch {
      showToast(t(lang, 'Güncelleme başarısız.', 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (state.loading && state.settings.length === 0) {
    return <div className="p-4 text-sm text-textMuted" role="status">{t(lang, 'Yükleniyor…', 'Loading…')}</div>;
  }
  if (state.unauthorized) {
    return <div className="p-4 text-sm text-danger" role="alert">{t(lang, 'Admin erişimi reddedildi.', 'Admin access denied.')}</div>;
  }

  const sourceLabel = (src) => (src === 'admin'
    ? t(lang, 'Admin', 'Admin')
    : src === 'env' ? t(lang, 'Env', 'Env') : t(lang, 'Varsayılan', 'Default'));
  const fmtVal = (v) => (v === null || v === undefined ? '—' : String(v));

  return (
    <section className="space-y-4" aria-label={t(lang, 'Çalışma ayarları', 'Runtime settings')}>
      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h2 className="text-base font-semibold text-textPrimary">{t(lang, 'Çalışma ayarları', 'Runtime settings')}</h2>
        <p className="mt-1 text-xs text-textSecondary">
          {t(lang,
            'Öncelik: admin değeri, yoksa env, o da yoksa varsayılan. Değişiklik yeniden başlatma gerekmeden sonraki turdan itibaren geçerli olur (önbellek en fazla 15 sn).',
            'Precedence: admin value, else env, else default. Changes apply from the next round without a restart (cache up to 15 s).')}
        </p>
        <p className="mt-2 text-xs text-textMuted">
          {t(lang,
            'RPC URL’leri bilerek burada yok ve yalnız env’de kalır: ele geçirilmiş bir admin oturumu, zincir ID’sini doğru söyleyip sahte log döndüren bir RPC verebilir ve worker o log’lara güvenir.',
            'RPC URLs are intentionally not here and stay env-only: a hijacked admin session could point the worker to an RPC that reports the right chain ID but returns forged logs, and the worker trusts those logs.')}
        </p>
        {state.degraded && (
          <p className="mt-2 text-xs text-warning" role="status">
            {t(lang, 'Veritabanı okunamadı; son bilinen değerler gösteriliyor.', 'Database unreadable; showing last known values.')}
          </p>
        )}
        {state.error && <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p>}
      </div>

      {conflict && (
        <div className="bg-warning/10 border border-warning/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" role="alert">
          <p className="text-sm text-textPrimary">
            {t(lang,
              'Ayarlar başka bir yönetici tarafından değiştirilmiş. Değişikliğiniz kaydedilmedi; güncel değerleri yenileyin.',
              'Settings were changed by another admin. Your change was not saved; refresh to see the current values.')}
          </p>
          <button type="button" onClick={load} className="min-h-[44px] px-4 rounded-lg border border-borderStrong text-sm font-semibold text-textPrimary">
            {t(lang, 'Yenile', 'Refresh')}
          </button>
        </div>
      )}

      {GROUPS.map((g) => {
        const items = state.settings.filter((s) => (s.group || 'worker') === g.id);
        if (items.length === 0) return null;
        return (
      <div key={g.id} className="space-y-3" role="group" aria-labelledby={`rs-group-${g.id}`}>
      <h3 id={`rs-group-${g.id}`} className="text-sm font-semibold text-textPrimary px-1">{lang === 'TR' ? g.TR : g.EN}</h3>
      <ul className="space-y-3">
        {items.map((s) => {
          const inputId = `rs-input-${s.key}`;
          const hintId = `rs-hint-${s.key}`;
          const errId = `rs-err-${s.key}`;
          const err = fieldErrors[s.key];
          const dirty = String(drafts[s.key] ?? '') !== String(s.value);
          return (
            <li key={s.key} className="bg-surface border border-borderSubtle rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold font-mono text-textPrimary break-all">{s.key}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${SOURCE_CLASS[s.source] || SOURCE_CLASS.default}`}>
                  {t(lang, 'Kaynak', 'Source')}: {sourceLabel(s.source)}
                </span>
              </div>
              <p className="text-xs text-textSecondary">{s.description?.[lang === 'TR' ? 'TR' : 'EN']}</p>
              {Array.isArray(s.constraints) && s.constraints.length > 0 && (
                <p className="text-xs text-textMuted">
                  {t(lang, 'Kısıt', 'Constraint')}: {s.constraints.map((c) => c?.[lang === 'TR' ? 'TR' : 'EN']).filter(Boolean).join(' · ')}
                </p>
              )}
              {Array.isArray(s.constraintViolations) && s.constraintViolations.length > 0 && (
                <p className="text-xs text-warning" role="status">
                  {t(lang, 'Mevcut değerler bu kısıtı ihlal ediyor', 'Current values violate this constraint')}: {s.constraintViolations.join(' ')}
                </p>
              )}
              {s.warning && (
                <p className="text-xs text-warning border border-warning/40 bg-warning/10 rounded-lg px-2 py-1" role="note">
                  {s.warning?.[lang === 'TR' ? 'TR' : 'EN']}
                </p>
              )}
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-textMuted">{t(lang, 'Etkin', 'Effective')}</dt><dd className="font-semibold text-textPrimary tabular-nums">{s.value} {s.unit}</dd></div>
                <div><dt className="text-textMuted">Env</dt><dd className="text-textSecondary tabular-nums">{fmtVal(s.envValue)}</dd></div>
                <div><dt className="text-textMuted">{t(lang, 'Varsayılan', 'Default')}</dt><dd className="text-textSecondary tabular-nums">{s.default}</dd></div>
              </dl>
              <div>
                <label htmlFor={inputId} className="block text-xs text-textSecondary">
                  {t(lang, 'Yeni değer', 'New value')} ({s.unit})
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={s.min}
                    max={s.max}
                    value={drafts[s.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                    aria-describedby={err ? `${hintId} ${errId}` : hintId}
                    aria-invalid={err ? 'true' : 'false'}
                    className="min-h-[44px] w-40 max-w-full rounded-lg bg-elevated border border-borderSubtle px-3 text-sm text-textPrimary tabular-nums"
                  />
                  <span className="text-xs text-textMuted" aria-hidden="true">{s.unit}</span>
                  <button
                    type="button"
                    disabled={!dirty}
                    onClick={() => requestSave(s)}
                    aria-label={`${t(lang, 'Kaydet', 'Save')}: ${s.key}`}
                    className="min-h-[44px] px-4 rounded-lg bg-success/15 border border-success/40 text-sm font-semibold text-success disabled:opacity-50"
                  >
                    {t(lang, 'Kaydet', 'Save')}
                  </button>
                  {s.source === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setPending({ setting: s, value: null })}
                      aria-label={`${t(lang, 'Env’e dön', 'Revert to env')}: ${s.key}`}
                      className="min-h-[44px] px-4 rounded-lg border border-borderStrong text-sm text-textPrimary"
                    >
                      {t(lang, 'Env’e dön', 'Revert to env')}
                    </button>
                  )}
                </div>
                <p id={hintId} className="mt-1 text-xs text-textMuted">
                  {t(lang, 'Sınır', 'Range')}: {s.min}–{s.max} {s.unit}
                </p>
                {err && <p id={errId} className="mt-1 text-xs text-danger" role="alert">{err}</p>}
              </div>
              {s.changedAt && (
                <div className="text-xs text-textMuted">
                  {t(lang, 'Son değişiklik', 'Last change')}: {fmtDate(s.changedAt)}{s.changedBy ? ` · ${short(s.changedBy)}` : ''}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </div>
        );
      })}

      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h3 className="text-sm font-semibold text-textPrimary mb-2">{t(lang, 'Denetim kaydı', 'Audit log')}</h3>
        {audit.items.length === 0 ? (
          <p className="text-xs text-textMuted">{t(lang, 'Kayıt yok.', 'No records.')}</p>
        ) : (
          <ul className="space-y-2">
            {audit.items.map((a) => (
              <li key={a.id} className="text-xs text-textSecondary border-b border-borderSubtle pb-2 last:border-0 break-words">
                <span className="font-mono text-textPrimary">{a.setting}</span>{' '}
                {fmtVal(a.previousValue)} → {a.newValue === null ? t(lang, 'env’e dönüş', 'revert to env') : a.newValue}
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
            aria-labelledby="rs-confirm-title"
            className="w-full max-w-md bg-surface border border-borderStrong rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rs-confirm-title" className="text-base font-semibold text-textPrimary break-words">
              {pending.value === null
                ? t(lang, 'Env’e dön', 'Revert to env')
                : t(lang, 'Ayarı değiştir', 'Change setting')}
              {': '}{pending.setting.key}
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              {pending.value === null
                ? t(lang, 'Admin değeri silinir; env, o da yoksa varsayılan geçerli olur.', 'The admin value is removed; env (or the default) applies.')
                : t(lang, `${pending.setting.value} → ${pending.value} ${pending.setting.unit}. Sonraki turdan itibaren geçerli olur.`, `${pending.setting.value} → ${pending.value} ${pending.setting.unit}. Applies from the next round.`)}
            </p>
            <label className="mt-3 block text-xs text-textSecondary" htmlFor="rs-reason">
              {t(lang, 'Gerekçe (opsiyonel, en fazla 300 karakter)', 'Reason (optional, max 300 characters)')}
            </label>
            <textarea
              id="rs-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="rs-reason-count"
              className="mt-1 w-full rounded-lg bg-elevated border border-borderSubtle px-3 py-2 text-sm text-textPrimary"
            />
            <div id="rs-reason-count" className="text-right text-xs text-textMuted">{reason.length}/{REASON_MAX}</div>
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

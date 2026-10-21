import React from 'react';
import { buildApiUrl } from '../../apiConfig';
import { shortAddress as short, tx as t } from '../../copy';
import { fmtDateTime } from '../../format';
import {
  SOCIAL_ALLOWED_HOSTS, SOCIAL_MAX_LABEL, SOCIAL_MAX_LINKS, SOCIAL_MAX_URL, socialErrorMessage, validateSocialDraft,
} from '../../socialLinks';

// [TR] "Sosyal linkler" sekmesi: footer butonlarını ekle/düzenle/sil/sırala/etkinleştir. Kurallar sunucuda zorlanır
//      (https + sabit allowlist + ...); burada aynı doğrulama yalnız hızlı geri bildirim içindir. Kaydetmeden önce
//      değişiklik özeti ve onay gerekir; sürüm çakışmasında (409) yenileme istenir. Allowlist panelden değişmez.
// [EN] "Social links" tab. Server enforces the rules; client validation is for fast feedback only.

const REASON_MAX = 300;
let rowSeq = 0;
const nextKey = () => { rowSeq += 1; return `sl-row-${rowSeq}`; };
const toRow = (l) => ({ key: nextKey(), id: l.id, label: l.label, url: l.url, enabled: l.enabled !== false });
const sameRow = (a, b) => a.label === b.label && a.url === b.url && a.enabled === b.enabled;

export const summarizeSocialChanges = (before, after) => {
  const byId = new Map(before.map((b) => [b.id, b]));
  const keptIds = new Set(after.filter((a) => a.id && byId.has(a.id)).map((a) => a.id));
  const added = after.filter((a) => !a.id || !byId.has(a.id));
  const removed = before.filter((b) => !keptIds.has(b.id));
  const modified = after.filter((a) => a.id && byId.has(a.id) && !sameRow(a, byId.get(a.id)));
  const keptOrderBefore = before.filter((b) => keptIds.has(b.id)).map((b) => b.id);
  const keptOrderAfter = after.filter((a) => keptIds.has(a.id)).map((a) => a.id);
  const reordered = keptOrderBefore.join('|') !== keptOrderAfter.join('|');
  return { added, removed, modified, reordered, any: added.length + removed.length + modified.length > 0 || reordered };
};

export default function AdminSocialLinksPanel({ lang = 'EN', authenticatedFetch, showToast = () => {} }) {
  const [state, setState] = React.useState({ loading: true, error: '', unauthorized: false, links: [], version: 0 });
  const [rows, setRows] = React.useState([]);
  const [audit, setAudit] = React.useState({ items: [], total: 0, page: 1, limit: 10 });
  const [errors, setErrors] = React.useState([]);
  const [pending, setPending] = React.useState(null); // { links, summary }
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  // [TR] lang ve taslak durumu ref'te: dil değişimi yeniden yüklemeyi tetiklemez, kirli taslak ezilmez (F4-03).
  // [EN] lang and dirty state live in refs: a language switch never reloads, and a dirty draft is never overwritten.
  const langRef = React.useRef(lang);
  langRef.current = lang;
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const baselineRef = React.useRef('[]');
  const firstLoadRef = React.useRef(true);
  const serializeRows = (rs) => JSON.stringify(rs.map((r) => [r.id ?? null, r.label, r.url, r.enabled]));
  const [conflict, setConflict] = React.useState(false);

  const loadAudit = React.useCallback(async (page = 1) => {
    try {
      const res = await authenticatedFetch(buildApiUrl(`admin/social-links/audit?page=${page}&limit=10`), { suppressAuthToast: true });
      if (!res.ok) return;
      const data = await res.json();
      setAudit({
        items: Array.isArray(data?.items) ? data.items : [],
        total: Number(data?.total) || 0,
        page: Number(data?.page) || page,
        limit: Number(data?.limit) || 10,
      });
    } catch { /* audit ikincil; sessiz */ }
  }, [authenticatedFetch]);

  const load = React.useCallback(async ({ force = false } = {}) => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await authenticatedFetch(buildApiUrl('admin/social-links'), { suppressAuthToast: true });
      if (res.status === 403) { setState({ loading: false, error: '', unauthorized: true, links: [], version: 0 }); return; }
      if (!res.ok) throw new Error('bad_status');
      const data = await res.json();
      const links = Array.isArray(data?.links) ? data.links : [];
      if (!force && serializeRows(rowsRef.current) !== baselineRef.current) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      setState({ loading: false, error: '', unauthorized: false, links, version: Number(data?.version) || 0 });
      const nextRows = links.map(toRow);
      baselineRef.current = serializeRows(nextRows);
      setRows(nextRows);
      setErrors([]);
      setConflict(false);
      loadAudit(1);
    } catch {
      setState((s) => ({ ...s, loading: false, error: t(langRef.current, 'Sosyal linkler alınamadı.', 'Failed to load social links.') }));
    }
  }, [authenticatedFetch, loadAudit]);

  React.useEffect(() => { const force = firstLoadRef.current; firstLoadRef.current = false; load({ force }); }, [load]);

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index, delta) => setRows((rs) => {
    const j = index + delta;
    if (j < 0 || j >= rs.length) return rs;
    const copy = [...rs];
    [copy[index], copy[j]] = [copy[j], copy[index]];
    return copy;
  });
  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = () => setRows((rs) => (rs.length >= SOCIAL_MAX_LINKS ? rs : [...rs, { key: nextKey(), id: undefined, label: '', url: '', enabled: true }]));

  const draftLinks = rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label.trim(), url: r.url.trim(), enabled: r.enabled }));
  const summary = summarizeSocialChanges(state.links, draftLinks);
  const errFor = (index, field) => errors.find((e) => e.index === index && e.field === field);
  const listErr = errors.find((e) => e.index === null);

  const requestSave = () => {
    const check = validateSocialDraft(draftLinks);
    setErrors(check.errors);
    if (!check.ok || !summary.any) return;
    setPending({ links: draftLinks, summary });
  };

  const closeDialog = () => { if (!saving) { setPending(null); setReason(''); } };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const body = { links: pending.links, expectedVersion: state.version };
      if (reason.trim()) body.reason = reason.trim().slice(0, REASON_MAX);
      const res = await authenticatedFetch(buildApiUrl('admin/social-links'), {
        method: 'PUT',
        body: JSON.stringify(body),
        suppressAuthToast: true,
      });
      if (res.ok) {
        showToast(t(lang, 'Sosyal linkler güncellendi.', 'Social links updated.'), 'success');
        setPending(null);
        setReason('');
        await load({ force: true });
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

  if (state.loading && state.links.length === 0 && rows.length === 0) {
    return <div className="p-4 text-sm text-textMuted" role="status">{t(lang, 'Yükleniyor…', 'Loading…')}</div>;
  }
  if (state.unauthorized) {
    return <div className="p-4 text-sm text-danger" role="alert">{t(lang, 'Admin erişimi reddedildi.', 'Admin access denied.')}</div>;
  }

  const btn = 'min-h-[44px] min-w-[44px] px-3 rounded-lg border border-borderSubtle text-sm text-textPrimary disabled:opacity-40';
  const fmtLink = (l) => `${l.label} → ${l.url}${l.enabled ? '' : ` (${t(lang, 'pasif', 'disabled')})`}`;

  return (
    <section className="space-y-4" aria-label={t(lang, 'Sosyal linkler', 'Social links')}>
      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h2 className="text-base font-semibold text-textPrimary">{t(lang, 'Sosyal linkler', 'Social links')}</h2>
        <p className="mt-1 text-xs text-textSecondary">
          {t(lang,
            `Ana sayfa alt bilgisindeki butonlar. En fazla ${SOCIAL_MAX_LINKS} link; yalnız https ve izinli alan adları. Hiç etkin link yoksa ortam (env) varsayılanları gösterilir.`,
            `Buttons in the home page footer. At most ${SOCIAL_MAX_LINKS} links; https and allowed domains only. With no enabled link, the env defaults are shown.`)}
        </p>
        <p className="mt-2 text-xs text-textMuted">
          {t(lang, 'İzinli alan adları (panelden değiştirilemez)', 'Allowed domains (cannot be changed here)')}: {SOCIAL_ALLOWED_HOSTS.join(', ')}
        </p>
        {state.error && <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p>}
      </div>

      {conflict && (
        <div className="bg-warning/10 border border-warning/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" role="alert">
          <p className="text-sm text-textPrimary">
            {t(lang,
              'Sosyal linkler başka biri tarafından değiştirildi. Değişikliğiniz kaydedilmedi; güncel listeyi yenileyin.',
              'Social links were changed by someone else. Your change was not saved; refresh to see the current list.')}
          </p>
          <button type="button" onClick={() => load({ force: true })} className="min-h-[44px] px-4 rounded-lg border border-borderStrong text-sm font-semibold text-textPrimary">
            {t(lang, 'Yenile', 'Refresh')}
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r, index) => {
          const labelErr = errFor(index, 'label');
          const urlErr = errFor(index, 'url');
          const n = index + 1;
          return (
            <li key={r.key} className="bg-surface border border-borderSubtle rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[10rem,1fr] gap-3">
                <div>
                  <label htmlFor={`sl-label-${r.key}`} className="block text-xs text-textSecondary">{t(lang, 'Etiket', 'Label')} #{n}</label>
                  <input
                    id={`sl-label-${r.key}`}
                    type="text"
                    maxLength={SOCIAL_MAX_LABEL}
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                    aria-invalid={labelErr ? 'true' : 'false'}
                    aria-describedby={labelErr ? `sl-label-err-${r.key}` : undefined}
                    className="mt-1 min-h-[44px] w-full rounded-lg bg-elevated border border-borderSubtle px-3 text-sm text-textPrimary"
                  />
                  {labelErr && <p id={`sl-label-err-${r.key}`} className="mt-1 text-xs text-danger" role="alert">{socialErrorMessage(labelErr.code, lang)}</p>}
                </div>
                <div>
                  <label htmlFor={`sl-url-${r.key}`} className="block text-xs text-textSecondary">URL #{n}</label>
                  <input
                    id={`sl-url-${r.key}`}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    maxLength={SOCIAL_MAX_URL}
                    value={r.url}
                    onChange={(e) => update(r.key, { url: e.target.value })}
                    aria-invalid={urlErr ? 'true' : 'false'}
                    aria-describedby={urlErr ? `sl-url-err-${r.key}` : undefined}
                    className="mt-1 min-h-[44px] w-full rounded-lg bg-elevated border border-borderSubtle px-3 text-sm text-textPrimary font-mono"
                  />
                  {urlErr && <p id={`sl-url-err-${r.key}`} className="mt-1 text-xs text-danger" role="alert">{socialErrorMessage(urlErr.code, lang)}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 min-h-[44px] text-sm text-textPrimary">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.key, { enabled: e.target.checked })} />
                  {t(lang, 'Etkin', 'Enabled')}
                </label>
                <button type="button" className={btn} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${t(lang, 'Yukarı taşı', 'Move up')} #${n}`}>↑</button>
                <button type="button" className={btn} disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`${t(lang, 'Aşağı taşı', 'Move down')} #${n}`}>↓</button>
                <button type="button" className={`${btn} text-danger`} onClick={() => remove(r.key)} aria-label={`${t(lang, 'Sil', 'Delete')} #${n}`}>{t(lang, 'Sil', 'Delete')}</button>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-xs text-textMuted px-1">{t(lang, 'Henüz link yok.', 'No links yet.')}</li>}
      </ul>
      {listErr && <p className="text-xs text-danger" role="alert">{socialErrorMessage(listErr.code, lang)}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={add} disabled={rows.length >= SOCIAL_MAX_LINKS}>{t(lang, 'Link ekle', 'Add link')}</button>
        <button
          type="button"
          onClick={requestSave}
          disabled={!summary.any}
          className="min-h-[44px] px-4 rounded-lg bg-success/15 border border-success/40 text-sm font-semibold text-success disabled:opacity-50"
        >
          {t(lang, 'Kaydet', 'Save')}
        </button>
        {summary.any && <button type="button" className={btn} onClick={() => load({ force: true })}>{t(lang, 'Değişiklikleri at', 'Discard changes')}</button>}
      </div>

      <div className="bg-surface border border-borderSubtle rounded-xl p-4">
        <h3 className="text-sm font-semibold text-textPrimary mb-2">{t(lang, 'Denetim kaydı', 'Audit log')}</h3>
        {audit.items.length === 0 ? (
          <p className="text-xs text-textMuted">{t(lang, 'Kayıt yok.', 'No records.')}</p>
        ) : (
          <ul className="space-y-2">
            {audit.items.map((a) => (
              <li key={a.id} className="text-xs text-textSecondary border-b border-borderSubtle pb-2 last:border-0 break-words">
                <span className="font-mono text-textPrimary">v{a.version}</span>
                {' · '}{a.previousLinks?.length ?? 0} → {a.newLinks?.length ?? 0} {t(lang, 'link', 'links')}
                {' · '}{short(a.adminWallet)}{' · '}{fmtDateTime(a.createdAt, lang, { seconds: true })}
                {a.reason ? <div className="text-textMuted break-words">{a.reason}</div> : null}
                <ul className="mt-1 text-textMuted break-all">
                  {(a.newLinks || []).map((l) => <li key={l.id}>{fmtLink(l)}</li>)}
                </ul>
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
            aria-labelledby="sl-confirm-title"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface border border-borderStrong rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="sl-confirm-title" className="text-base font-semibold text-textPrimary">{t(lang, 'Değişiklik özeti', 'Change summary')}</h3>
            <ul className="mt-2 space-y-1 text-sm text-textSecondary break-all">
              {pending.summary.added.map((l) => <li key={`a-${l.label}-${l.url}`}>{t(lang, 'Eklenen', 'Added')}: {fmtLink(l)}</li>)}
              {pending.summary.removed.map((l) => <li key={`r-${l.id}`}>{t(lang, 'Silinen', 'Removed')}: {fmtLink(l)}</li>)}
              {pending.summary.modified.map((l) => <li key={`m-${l.id}`}>{t(lang, 'Değişen', 'Changed')}: {fmtLink(l)}</li>)}
              {pending.summary.reordered && <li>{t(lang, 'Sıra değişti.', 'Order changed.')}</li>}
            </ul>
            <label className="mt-3 block text-xs text-textSecondary" htmlFor="sl-reason">
              {t(lang, 'Gerekçe (opsiyonel, en fazla 300 karakter)', 'Reason (optional, max 300 characters)')}
            </label>
            <textarea
              id="sl-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg bg-elevated border border-borderSubtle px-3 py-2 text-sm text-textPrimary"
            />
            <div className="text-right text-xs text-textMuted">{reason.length}/{REASON_MAX}</div>
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

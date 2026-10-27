import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';

import { SEPA_COUNTRY_CODES } from '../../orderUiModel';
import { RAIL_LABELS, getRailLabel } from '../../railLabels';
import {
  aliasTypeKey, getCatalogRail, groupRailsByRegion, isBlockedFreeCountry, isLegacyRail, regionLabel, useRailCatalogState, validateCatalogRail,
} from '../../railCatalog';

const identity = (draft) => draft;

/**
 * [TR] Profil sayfasındaki ödeme profili formu. Önceki sürüm yalnız isim+IBAN içeriyordu:
 *      SEPA (BIC) ve ACH (routing/account) alanları, iletişim kanalı ve ülke seçimi yoktu;
 *      backend doğrulaması bu yüzden SEPA/ACH kayıtlarını her zaman reddediyordu.
 * [EN] Complete payout profile form (the previous one lacked SEPA/ACH fields and contact).
 */
export const PaymentProfilePanel = ({
  lang = 'EN',
  payoutProfileDraft,
  setPayoutProfileDraft,
  handleUpdatePII,
  canonicalizePayoutProfileDraft = identity,
  isContractLoading = false,
  paymentRiskConfig = null,
  paymentRailCatalog = null,
  savedRail = null,
}) => {
  const draft = payoutProfileDraft || {};
  const fields = draft.fields || {};
  const rail = draft.rail || 'TR_IBAN';
  const isTR = lang === 'TR';
  const inputClass = 'w-full bg-elevated text-textPrimary border border-borderStrong rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60';
  const labelClass = 'block text-xs text-textMuted mb-1';

  const update = (patch) => setPayoutProfileDraft((prev) => canonicalizePayoutProfileDraft({ ...prev, ...patch }));
  const updateField = (key, value) => setPayoutProfileDraft((prev) => ({ ...prev, fields: { ...(prev?.fields || {}), [key]: value } }));
  // [TR] Kapalı rail'ler: risk config overlay'inde enabled === false. Seçenek görünür ama seçilemez, "şu an kapalı" yazar.
  const disabledRails = new Set();
  Object.values(paymentRiskConfig || {}).forEach((bucket) => {
    Object.entries(bucket || {}).forEach(([code, entry]) => { if (entry?.enabled === false) disabledRails.add(code); });
  });
  const selectedRailClosed = disabledRails.has(rail);

  // [TR] Katalog (prop > bağlam). Yoksa eski 3 rail'lik statik görünüm aynen kalır.
  const { catalog: contextCatalog, enabledRails } = useRailCatalogState();
  const catalog = paymentRailCatalog || contextCatalog;
  const catalogRail = catalog ? getCatalogRail(rail, catalog) : null;
  const dynamicRail = catalogRail && !isLegacyRail(rail) ? catalogRail : null;
  // [TR] Kullanıcının daha önce gördüğü (kayıtlı) rail kapansa bile listede kalır (karar 11); kapalı rail'ler yeni seçim için gizlenir.
  const seenRails = useRef(new Set());
  seenRails.current.add(rail);
  if (savedRail) seenRails.current.add(String(savedRail).toUpperCase());
  const isRailOpen = (code) => (enabledRails ? enabledRails.includes(code) : true) && !disabledRails.has(code);
  const visibleCatalogRows = catalog ? catalog.filter((r) => isRailOpen(r.code) || seenRails.current.has(r.code)) : [];
  const railGroups = groupRailsByRegion(visibleCatalogRows);
  const closedSuffix = (code) => (isRailOpen(code) ? '' : (isTR ? ' — şu an kapalı' : ' — currently closed'));

  const catalogCountries = catalogRail && Array.isArray(catalogRail.countries) ? catalogRail.countries : null;
  const freeCountry = Boolean(catalogCountries && catalogCountries.includes('*'));
  const countryOptions = catalogCountries && !freeCountry
    ? catalogCountries
    : (rail === 'TR_IBAN' ? ['TR'] : rail === 'US_ACH' ? ['US'] : SEPA_COUNTRY_CODES);

  // [TR] İstemci ön kontrolü (asıl doğrulama backend'de): yalnız katalog alanlı rail'lerde, gönderim denenince hatalar görünür.
  const [attempted, setAttempted] = useState(false);
  const fieldErrors = dynamicRail ? validateCatalogRail(dynamicRail, fields) : {};
  const countryValue = String(draft.country || '').toUpperCase();
  const countryError = freeCountry
    ? (!/^[A-Z]{2}$/.test(countryValue) ? 'required' : (isBlockedFreeCountry(countryValue) ? 'blocked' : null))
    : null;
  const errorText = (code) => (code === 'required' ? (isTR ? 'Zorunlu alan' : 'Required') : (isTR ? 'Biçim geçersiz' : 'Invalid format'));
  const handleSubmit = (e) => {
    if (dynamicRail && (Object.keys(fieldErrors).length > 0 || countryError)) {
      e?.preventDefault?.();
      setAttempted(true);
      return;
    }
    handleUpdatePII(e);
  };
  // [TR] Alias alanı + `<anahtar>_type` enum kardeşi tek grup (tür seçimi, sonra değer); kardeş ayrıca çizilmez.
  const aliasTypeKeys = new Set((dynamicRail?.fields || []).filter((f) => f.kind === 'alias').map(aliasTypeKey));
  const renderDynamicFields = () => (dynamicRail.fields || []).map((f) => {
    if (f.kind === 'enum' && aliasTypeKeys.has(f.key)) return null;
    if (f.kind !== 'alias') return renderCatalogField(f);
    const typeField = dynamicRail.fields.find((x) => x.key === aliasTypeKey(f));
    return (
      <div key={f.key} className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3" data-testid={`alias-group-${f.key}`}>
        {typeField && renderCatalogField(typeField)}
        {renderCatalogField(f)}
      </div>
    );
  });
  const renderCatalogField = (f) => {
    const id = `payout-f-${f.key}`;
    const label = f.label?.[isTR ? 'TR' : 'EN'] || f.key;
    const err = attempted ? fieldErrors[f.key] : null;
    const common = {
      id,
      value: fields[f.key] || '',
      'aria-required': f.required ? 'true' : undefined,
      'aria-invalid': err ? 'true' : undefined,
      'aria-describedby': err ? `${id}-err` : undefined,
    };
    let control;
    if (f.kind === 'enum') {
      control = (
        <select {...common} onChange={(e) => updateField(f.key, e.target.value)} className={inputClass}>
          <option value="">—</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    } else {
      const mono = f.kind !== 'email' && f.kind !== 'phone';
      control = (
        <input
          {...common}
          type={f.kind === 'email' ? 'email' : f.kind === 'phone' ? 'tel' : 'text'}
          inputMode={f.kind === 'digits' ? 'numeric' : f.kind === 'phone' ? 'tel' : undefined}
          autoComplete="off"
          onChange={(e) => updateField(f.key, e.target.value)}
          className={`${inputClass} ${mono ? 'font-mono' : ''} ${err ? 'border-danger' : ''}`}
        />
      );
    }
    return (
      <div key={f.key}>
        <label className={labelClass} htmlFor={id}>{label}{f.required ? ' *' : ''}</label>
        {control}
        {err && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger">{errorText(err)}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-surface border border-borderSubtle rounded-xl p-4 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="payout-rail">{isTR ? 'Ödeme yöntemi' : 'Payment method'}</label>
          <select id="payout-rail" value={rail} onChange={(e) => update({ rail: e.target.value })} className={inputClass}>
            {catalog ? railGroups.map((g) => (
              <optgroup key={g.region} label={regionLabel(g.region, isTR ? 'TR' : 'EN')}>
                {g.rows.map((r) => (
                  <option key={r.code} value={r.code} disabled={!isRailOpen(r.code) && r.code !== rail}>
                    {getRailLabel(r.code, isTR ? 'TR' : 'EN', catalog) || r.code}{closedSuffix(r.code)}
                  </option>
                ))}
              </optgroup>
            )) : Object.keys(RAIL_LABELS).map((key) => (
              <option key={key} value={key} disabled={disabledRails.has(key) && key !== rail}>
                {RAIL_LABELS[key][isTR ? 'TR' : 'EN']}{disabledRails.has(key) ? (isTR ? ' — şu an kapalı' : ' — currently closed') : ''}
              </option>
            ))}
          </select>
          {selectedRailClosed && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {isTR
                ? 'Seçili ödeme yöntemi şu an kapalı. Yeni emir açmak veya doldurmak için açık bir yöntem seçin.'
                : 'The selected payment method is currently closed. Choose an open method to create or fill orders.'}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-country">{isTR ? 'Ülke' : 'Country'}</label>
          {freeCountry ? (
            <input id="payout-country" value={draft.country || ''} maxLength={2} placeholder="XX" onChange={(e) => update({ country: e.target.value.toUpperCase() })} aria-invalid={attempted && countryError ? 'true' : undefined} className={`${inputClass} font-mono uppercase`} />
          ) : (
            <select id="payout-country" value={draft.country || countryOptions[0]} onChange={(e) => update({ country: e.target.value })} className={inputClass}>
              {countryOptions.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          )}
          {attempted && countryError && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {countryError === 'blocked' ? (isTR ? 'Bu ülke desteklenmiyor' : 'This country is not supported') : errorText('required')}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="payout-holder">{isTR ? 'Hesap sahibi' : 'Account holder'}</label>
        <input id="payout-holder" value={fields.account_holder_name || ''} onChange={(e) => updateField('account_holder_name', e.target.value)} autoComplete="name" className={inputClass} />
      </div>

      {dynamicRail && renderDynamicFields()}

      {!dynamicRail && (rail === 'TR_IBAN' || rail === 'SEPA_IBAN') && (
        <div>
          <label className={labelClass} htmlFor="payout-iban">IBAN</label>
          <input id="payout-iban" value={fields.iban || ''} onChange={(e) => updateField('iban', e.target.value)} placeholder={rail === 'TR_IBAN' ? 'TR00 0000 0000 0000 0000 0000 00' : 'DE00 0000 0000 0000 0000 00'} className={`${inputClass} font-mono`} />
        </div>
      )}
      {!dynamicRail && rail === 'SEPA_IBAN' && (
        <div>
          <label className={labelClass} htmlFor="payout-bic">BIC</label>
          <input id="payout-bic" value={fields.bic || ''} onChange={(e) => updateField('bic', e.target.value || null)} className={`${inputClass} font-mono`} />
        </div>
      )}
      {!dynamicRail && rail === 'US_ACH' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="payout-routing">Routing</label>
            <input id="payout-routing" inputMode="numeric" value={fields.routing_number || ''} onChange={(e) => updateField('routing_number', e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass} htmlFor="payout-account">{isTR ? 'Hesap no' : 'Account no'}</label>
            <input id="payout-account" inputMode="numeric" value={fields.account_number || ''} onChange={(e) => updateField('account_number', e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} htmlFor="payout-type">{isTR ? 'Hesap tipi' : 'Account type'}</label>
            <select id="payout-type" value={fields.account_type || ''} onChange={(e) => updateField('account_type', e.target.value || null)} className={inputClass}>
              <option value="">—</option>
              <option value="checking">{isTR ? 'Vadesiz (checking)' : 'Checking'}</option>
              <option value="savings">{isTR ? 'Birikim (savings)' : 'Savings'}</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="payout-bank">{isTR ? 'Banka adı (opsiyonel)' : 'Bank name (optional)'}</label>
        <input id="payout-bank" value={fields.bank_name || ''} onChange={(e) => updateField('bank_name', e.target.value || null)} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="payout-contact-channel">{isTR ? 'İletişim (opsiyonel)' : 'Contact (optional)'}</label>
          <select id="payout-contact-channel" value={draft.contact?.channel || ''} onChange={(e) => update({ contact: { ...(draft.contact || {}), channel: e.target.value || null } })} className={inputClass}>
            <option value="">{isTR ? 'Yok' : 'None'}</option>
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
            <option value="phone">{isTR ? 'Telefon' : 'Phone'}</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-contact-value">&nbsp;</label>
          <input id="payout-contact-value" placeholder={draft.contact?.channel === 'telegram' ? '@username' : draft.contact?.channel === 'email' ? 'name@example.com' : draft.contact?.channel === 'phone' ? '+90…' : ''} disabled={!draft.contact?.channel} value={draft.contact?.value || ''} onChange={(e) => update({ contact: { ...(draft.contact || {}), value: e.target.value || null } })} className={`${inputClass} disabled:opacity-50`} />
        </div>
      </div>

      <button type="submit" disabled={isContractLoading} className="w-full bg-brand hover:opacity-90 disabled:opacity-50 text-black text-sm font-bold px-4 py-2.5 rounded-lg">
        {isContractLoading ? (isTR ? 'Kaydediliyor…' : 'Saving…') : (isTR ? 'Kaydet' : 'Save')}
      </button>
      <p className="text-xs text-textMuted flex items-center justify-center gap-1.5"><Lock className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />{isTR ? 'Şifreli saklanır, zincire yazılmaz.' : 'Stored encrypted, never on-chain.'}</p>
    </form>
  );
};

export default PaymentProfilePanel;

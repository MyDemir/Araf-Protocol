import { Lock } from 'lucide-react';
import React from 'react';

const DEFAULT_SEPA_COUNTRIES = ['DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'AT', 'PT', 'IE', 'LU', 'FI', 'GR'];
const RAIL_LABELS = {
  TR_IBAN: { TR: 'Türkiye (IBAN)', EN: 'Turkey (IBAN)' },
  SEPA_IBAN: { TR: 'Avrupa (SEPA)', EN: 'Europe (SEPA)' },
  US_ACH: { TR: 'ABD (ACH)', EN: 'USA (ACH)' },
};

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
  SEPA_COUNTRIES = DEFAULT_SEPA_COUNTRIES,
  isContractLoading = false,
}) => {
  const draft = payoutProfileDraft || {};
  const fields = draft.fields || {};
  const rail = draft.rail || 'TR_IBAN';
  const isTR = lang === 'TR';
  const inputClass = 'w-full bg-elevated text-textPrimary border border-borderStrong rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60';
  const labelClass = 'block text-xs text-textMuted mb-1';

  const update = (patch) => setPayoutProfileDraft((prev) => canonicalizePayoutProfileDraft({ ...prev, ...patch }));
  const updateField = (key, value) => setPayoutProfileDraft((prev) => ({ ...prev, fields: { ...(prev?.fields || {}), [key]: value } }));
  const countryOptions = rail === 'TR_IBAN' ? ['TR'] : rail === 'US_ACH' ? ['US'] : SEPA_COUNTRIES;

  return (
    <form onSubmit={handleUpdatePII} className="space-y-3 bg-surface border border-borderSubtle rounded-xl p-4 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="payout-rail">{isTR ? 'Ödeme yöntemi' : 'Payment method'}</label>
          <select id="payout-rail" value={rail} onChange={(e) => update({ rail: e.target.value })} className={inputClass}>
            {Object.keys(RAIL_LABELS).map((key) => (
              <option key={key} value={key}>{RAIL_LABELS[key][isTR ? 'TR' : 'EN']}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-country">{isTR ? 'Ülke' : 'Country'}</label>
          <select id="payout-country" value={draft.country || countryOptions[0]} onChange={(e) => update({ country: e.target.value })} className={inputClass}>
            {countryOptions.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="payout-holder">{isTR ? 'Hesap sahibi' : 'Account holder'}</label>
        <input id="payout-holder" value={fields.account_holder_name || ''} onChange={(e) => updateField('account_holder_name', e.target.value)} autoComplete="name" className={inputClass} />
      </div>

      {(rail === 'TR_IBAN' || rail === 'SEPA_IBAN') && (
        <div>
          <label className={labelClass} htmlFor="payout-iban">IBAN</label>
          <input id="payout-iban" value={fields.iban || ''} onChange={(e) => updateField('iban', e.target.value)} placeholder={rail === 'TR_IBAN' ? 'TR00 0000 0000 0000 0000 0000 00' : 'DE00 0000 0000 0000 0000 00'} className={`${inputClass} font-mono`} />
        </div>
      )}
      {rail === 'SEPA_IBAN' && (
        <div>
          <label className={labelClass} htmlFor="payout-bic">BIC</label>
          <input id="payout-bic" value={fields.bic || ''} onChange={(e) => updateField('bic', e.target.value || null)} className={`${inputClass} font-mono`} />
        </div>
      )}
      {rail === 'US_ACH' && (
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
          <input id="payout-contact-value" disabled={!draft.contact?.channel} value={draft.contact?.value || ''} onChange={(e) => update({ contact: { ...(draft.contact || {}), value: e.target.value || null } })} className={`${inputClass} disabled:opacity-50`} />
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

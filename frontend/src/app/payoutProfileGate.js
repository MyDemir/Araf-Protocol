// [TR] Ödeme profili kapısı (yalnız arayüz/API düzeyi; kontrat doğrudan çağrılarak atlanabilir — asıl güvence
//      "eksik snapshot → PII kapalı, işlem ödeme penceresinde çözülür" kuralıdır).
//      İlke: kayıtlı ödeme profili olmayan taraf işleme girmemeli. Karar, taslak formdaki değere değil,
//      backend'deki KAYITLI profil durumuna bakar. Durum bilinmiyorsa (null/undefined) kapı kapalıdır (fail-closed).
// [EN] Payout-profile gate (UI/API level only). Reads the SAVED backend profile state, never the draft form;
//      unknown state fails closed.

/** true yalnız backend kayıtlı profili doğruladıysa. */
export const isPayoutProfileSaved = (hasPayoutProfile) => hasPayoutProfile === true;

/** Emir sahibinin profili yok mu? Yalnız backend açıkça false dediyse true (bilinmiyorsa engelleme yapma: sunucu boolean verir). */
export const isOwnerPayoutProfileMissing = (order) => order?.ownerHasPayoutProfile === false;

/** Emir sahibinin profil rail'i admin tarafından kapatıldı mı? Yalnız backend açıkça false dediyse true. */
export const isOwnerRailDisabled = (order) => order?.ownerRailEnabled === false;

export const OWNER_RAIL_DISABLED_MESSAGE = {
  TR: 'Satıcının ödeme yöntemi şu an kapalı.',
  EN: "The seller's payment method is currently closed.",
};
export const ownerRailDisabledMessage = (lang) => OWNER_RAIL_DISABLED_MESSAGE[lang === 'TR' ? 'TR' : 'EN'];

export const PROFILE_REQUIRED_MESSAGE = {
  TR: 'Önce ödeme profilini doldurun.',
  EN: 'Fill in your payout profile first.',
};

export const OWNER_PROFILE_MISSING_MESSAGE = {
  TR: "Satıcının ödeme profili yok.",
  EN: "The seller has no payout profile.",
};

export const profileRequiredMessage = (lang) => PROFILE_REQUIRED_MESSAGE[lang === 'TR' ? 'TR' : 'EN'];
export const ownerProfileMissingMessage = (lang) => OWNER_PROFILE_MISSING_MESSAGE[lang === 'TR' ? 'TR' : 'EN'];

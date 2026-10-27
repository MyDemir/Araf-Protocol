// [TR] Ortak brifteki ARAYÜZ'e uyan katalog fixture'ı (getPublicRailCatalog çıktısı: legacyCanonical yok).
//      Gerçek API yokken testler ve görsel kontrol bunu kullanır; alan metinleri örnektir.
const risk = (riskLevel = 'MEDIUM') => ({ riskLevel, minBondSurchargeBps: 0, feeSurchargeBps: 0, warningKey: null, description: { TR: '', EN: '' } });
const f = (key, TR, EN, kind, extra = {}) => ({ key, label: { TR, EN }, kind, required: true, normalize: 'trim', copyable: false, ...extra });

export const SEPA_FIXTURE_COUNTRIES = ['DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'AT', 'PT', 'IE', 'LU', 'FI', 'GR', 'PL', 'SE'];

export const paymentRailCatalogFixture = [
  { code: 'TR_IBAN', region: 'EUROPE', name: { TR: 'Türkiye (IBAN)', EN: 'Turkey (IBAN)' }, countries: ['TR'], currencies: ['TRY'], defaultEnabled: true, risk: risk(),
    fields: [f('iban', 'IBAN', 'IBAN', 'iban', { normalize: 'strip_spaces_upper', copyable: true, pattern: '^TR\\d{24}$' })] },
  { code: 'SEPA_IBAN', region: 'EUROPE', name: { TR: 'Avrupa (SEPA)', EN: 'Europe (SEPA)' }, countries: SEPA_FIXTURE_COUNTRIES, currencies: ['EUR'], defaultEnabled: true, risk: risk(),
    fields: [f('iban', 'IBAN', 'IBAN', 'iban', { normalize: 'strip_spaces_upper', copyable: true }), f('bic', 'BIC', 'BIC', 'bic', { required: false, normalize: 'strip_spaces_upper' })] },
  { code: 'US_ACH', region: 'AMERICAS', name: { TR: 'ABD (ACH)', EN: 'USA (ACH)' }, countries: ['US'], currencies: ['USD'], defaultEnabled: true, risk: risk('HIGH'),
    fields: [
      f('routing_number', 'Routing', 'Routing', 'digits', { pattern: '^\\d{9}$', normalize: 'strip_spaces', copyable: true }),
      f('account_number', 'Hesap no', 'Account no', 'digits', { pattern: '^\\d{4,17}$', normalize: 'strip_spaces', copyable: true }),
      f('account_type', 'Hesap tipi', 'Account type', 'enum', { required: false, options: ['checking', 'savings'] }),
    ] },
  { code: 'GB_FPS', region: 'EUROPE', name: { TR: 'Birleşik Krallık (Faster Payments)', EN: 'United Kingdom (Faster Payments)' }, countries: ['GB'], currencies: ['GBP'], defaultEnabled: false, risk: risk('HIGH'),
    fields: [
      f('sort_code', 'Sort code', 'Sort code', 'digits', { pattern: '^\\d{6}$', normalize: 'strip_spaces', copyable: true }),
      f('account_number', 'Hesap numarası', 'Account number', 'digits', { pattern: '^\\d{8}$', normalize: 'strip_spaces', copyable: true }),
    ] },
  { code: 'MX_SPEI', region: 'AMERICAS', name: { TR: 'Meksika (SPEI)', EN: 'Mexico (SPEI)' }, countries: ['MX'], currencies: ['MXN'], defaultEnabled: false, risk: risk(),
    fields: [f('clabe', 'CLABE', 'CLABE', 'digits', { pattern: '^\\d{18}$', checksum: 'clabe', normalize: 'strip_spaces', copyable: true })] },
  { code: 'BR_PIX', region: 'AMERICAS', name: { TR: 'Brezilya (Pix)', EN: 'Brazil (Pix)' }, countries: ['BR'], currencies: ['BRL'], defaultEnabled: false, risk: risk('HIGH'),
    fields: [
      f('pix_key_type', 'Pix anahtar türü', 'Pix key type', 'enum', { options: ['email', 'phone', 'evp', 'cnpj'] }),
      f('pix_key', 'Pix anahtarı', 'Pix key', 'alias', {
        options: ['email', 'phone', 'evp', 'cnpj'],
        aliasPatterns: { email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', phone: '^\\+\\d{8,15}$', evp: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', cnpj: '^\\d{14}$' },
        copyable: true,
      }),
    ] },
  { code: 'IN_UPI', region: 'ASIA_PACIFIC', name: { TR: 'Hindistan (UPI)', EN: 'India (UPI)' }, countries: ['IN'], currencies: ['INR'], defaultEnabled: false, risk: risk('HIGH'),
    fields: [f('vpa', 'UPI adresi (VPA)', 'UPI address (VPA)', 'alnum', { pattern: '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$', copyable: true })] },
  { code: 'SWIFT_INTL', region: 'INTERNATIONAL', name: { TR: 'Uluslararası (SWIFT)', EN: 'International (SWIFT)' }, countries: ['*'], currencies: ['USD', 'EUR', 'GBP'], defaultEnabled: false, risk: risk('HIGH'),
    fields: [
      f('bic', 'BIC', 'BIC', 'bic', { normalize: 'strip_spaces_upper', pattern: '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' }),
      f('bank_country', 'Banka ülkesi', 'Bank country', 'alnum', { pattern: '^[A-Z]{2}$', normalize: 'strip_spaces_upper' }),
      f('account_number', 'Hesap no / IBAN', 'Account no / IBAN', 'alnum', { normalize: 'strip_spaces_upper', checksum: 'mod97', ibanCountryLengths: { DE: 22, GB: 22, TR: 26 }, copyable: true }),
    ] },
];

export const supportedFiatFixture = ['AUD', 'BRL', 'EUR', 'GBP', 'INR', 'MXN', 'TRY', 'USD'];
// [TR] Açık rail'ler (enabledPaymentRails): GB_FPS kapalı, BR_PIX/MX_SPEI/IN_UPI açık.
export const enabledRailsFixture = ['TR_IBAN', 'SEPA_IBAN', 'US_ACH', 'BR_PIX', 'MX_SPEI', 'IN_UPI'];

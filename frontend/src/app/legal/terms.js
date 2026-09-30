// [TR] Araf Kullanım Koşulları. Metin protokolün gerçek davranışına dayanır (ArafEscrow / ArafRewards):
//      süreler, eriyen kasa, teminatlar, owner yetkileri. Sürüm backend `config/terms.js` ile aynı olmalı;
//      kabul, SIWE imzasının içindeki beyanla yapılır (imza = kabulün kanıtı).
//      Not: Bu metin hukuki danışmanlık değildir; yürürlüğe almadan önce bir hukukçuya inceletilmelidir.
// [EN] Araf Terms of Use, grounded in the protocol's actual behaviour. Version must match the backend;
//      acceptance is part of the signed SIWE statement. Not legal advice; have counsel review before use.

export const TERMS_VERSION = '2026-10-01';

// [TR] Cüzdanın imzaladığı beyan. Backend bu cümleyi ve sürümü doğrular; değiştirirken backend regex'ini güncelleyin.
// [EN] Clause signed by the wallet; the backend parses it, keep it in sync with backend/scripts/config/terms.js.
export const buildTermsStatement = (version = TERMS_VERSION) => (
  `Sign in to Araf Protocol. I accept the Araf Terms of Use v${version} and acknowledge that Araf is non-custodial software, not a party to my trades.`
);

const STORAGE_PREFIX = 'araf_terms_accepted';
export const termsStorageKey = (wallet, version = TERMS_VERSION) => `${STORAGE_PREFIX}:${version}:${String(wallet || '').toLowerCase()}`;

export const isTermsAcceptedLocally = (wallet, version = TERMS_VERSION) => {
  if (typeof window === 'undefined' || !wallet) return false;
  try { return window.localStorage.getItem(termsStorageKey(wallet, version)) === 'true'; } catch { return false; }
};

export const markTermsAcceptedLocally = (wallet, version = TERMS_VERSION) => {
  if (typeof window === 'undefined' || !wallet) return;
  try { window.localStorage.setItem(termsStorageKey(wallet, version), 'true'); } catch { /* storage unavailable */ }
};

// [TR] Kabul düğmesinden önce tek tek işaretlenmesi gereken beyanlar (en ağır riskler).
export const TERMS_ACKNOWLEDGEMENTS = {
  TR: [
    { key: 'software', text: 'Araf\'ın yalnızca bir yazılım aracı olduğunu; aracı kurum, emanetçi, ödeme kuruluşu, hakem veya işlemlerimin tarafı olmadığını kabul ediyorum.' },
    { key: 'finality', text: 'İşlem sonuçlarını yalnız akıllı kontratın belirlediğini, insan hakemi bulunmadığını ve sonuçların geri alınamayacağını kabul ediyorum.' },
    { key: 'loss', text: 'Süreleri kaçırırsam veya uzlaşmazsam teminatımın ve ana paranın eriyebileceğini ya da yakılabileceğini, bu kaybın bana ait olduğunu kabul ediyorum.' },
    { key: 'fiat', text: 'Banka ödemelerinin zincir dışında olduğunu; ödeme, ters ibraz ve yasal uyum (vergi, KYC, yaptırımlar) sorumluluğunun bana ait olduğunu kabul ediyorum.' },
  ],
  EN: [
    { key: 'software', text: 'I accept that Araf is only a software tool, not a broker, custodian, payment institution, arbitrator or party to my trades.' },
    { key: 'finality', text: 'I accept that only the smart contract decides outcomes, that there is no human arbitrator and that outcomes cannot be reversed.' },
    { key: 'loss', text: 'I accept that if I miss deadlines or do not settle, my bond and principal can decay or be burned, and that this loss is mine.' },
    { key: 'fiat', text: 'I accept that bank payments happen off-chain and that payment, chargeback and legal compliance (tax, KYC, sanctions) are my responsibility.' },
  ],
};

export const TERMS_SECTIONS = {
  TR: [
    { title: '1. Kapsam ve tanımlar', body: [
      '"Araf Protokolü", Base ağında yayınlanmış ArafEscrow, ArafRevenueVault ve ArafRewards akıllı kontratlarıdır. "Arayüz", bu web uygulaması ve ona hizmet eden sunucudur. "Kullanıcı", arayüze cüzdanıyla bağlanan herkestir.',
      'Arayüzü kullanarak veya bir işlemi imzalayarak bu koşulların tamamını kabul etmiş sayılırsınız. Kabul etmiyorsanız arayüzü kullanmayın.',
    ] },
    { title: '2. Araf\'ın rolü: yalnızca yazılım', body: [
      'Araf bir yazılım aracıdır. Araf; aracı kurum, emanetçi, borsa, ödeme veya elektronik para kuruluşu, yatırım danışmanı, hakem ya da alım-satımlarınızın tarafı değildir. Karşı tarafı Araf seçmez, işlemlere onay vermez ve işlemlere garanti vermez.',
      'Kriptolar yalnız sizin cüzdanınız ile akıllı kontrat arasında hareket eder. Araf ekibinin veya kontrat sahibinin (owner) kilitli fonları taşıma, dondurma, iade etme veya başkasına verme yetkisi yoktur.',
      'Kontrat sahibi yalnız ileriye dönük parametreleri (ücret oranları, hazine adresi, desteklenen tokenlar, itibar eşikleri) değiştirebilir ve yeni emir açılmasını/doldurulmasını geçici olarak durdurabilir. Açık işlemler bu durdurmadan etkilenmez ve kendi kurallarıyla sonuçlanır; ücretler işlem kilitlendiği anda sabitlenir.',
    ] },
    { title: '3. Karar mercii kontrattır', body: [
      'İşlemlerin sonucu yalnız akıllı kontratın kuralları ve zaman sayaçlarıyla belirlenir. İnsan hakem, müşteri hizmetleri kararı veya itiraz makamı yoktur. Araf ekibi bir işlemin sonucunu değiştiremez, iptal edemez veya tazmin edemez.',
      'Zincire yazılmış bir işlem geri alınamaz. Hatalı adres, yanlış tutar veya yanlış karşı tarafla yapılan işlemlerin sonucu size aittir.',
    ] },
    { title: '4. Süreler, teminatlar ve eriyen kasa', body: [
      'Emir açan ve dolduran taraflar, kontratta tanımlı oranlarda teminat kilitler (Tier 0 teminatsızdır). Oranlar tier\'a ve itibarınıza göre değişir.',
      'Ödeme penceresi: alıcı kilitten itibaren 48 saat içinde ödemeyi yapıp bildirmezse işlem düşer, alıcının teminatından kesinti yapılır ve itibarına olumsuz kayıt düşer.',
      'Onay: satıcı ödeme bildirimine yanıt vermezse alıcı 48 saat sonra satıcıyı uyarabilir; 24 saat içinde yanıt gelmezse kripto otomatik olarak alıcıya serbest bırakılır.',
      'İtiraz (eriyen kasa): itiraz açıldıktan 48 saat sonra iki tarafın teminatı saat saat erimeye başlar; 144. saatten itibaren ana para da erir; 240 saat (10 gün) içinde uzlaşma olmazsa kalan tutar yakılır. Eriyen ve yakılan tutarlar hazineye gider ve geri verilmez.',
      'Bu sürelerin takibi tamamen sizin sorumluluğunuzdadır. Arayüzün sayaçları ve bildirimleri yardımcıdır; gecikme, erişim sorunu veya bildirim eksikliği sonucu değiştirmez.',
    ] },
    { title: '5. Fiat ödemeler ve ters ibraz', body: [
      'Banka/fiat ödemeleri zincir dışında, doğrudan kullanıcılar arasında yapılır. Araf ödemeleri göremez, doğrulayamaz, geri çeviremez ve garanti etmez; yüklenen dekontlar yalnız bilgilendirme amaçlıdır.',
      'Ters ibraz (chargeback), sahte dekont ve üçüncü kişi hesabından ödeme risklerini satıcı üstlenir. Kripto serbest bırakmadan önce gelen ödemenin tutarını, gönderenini ve kalıcılığını doğrulamak satıcının sorumluluğudur.',
    ] },
    { title: '6. Yasal uyum ve yasak kullanım', body: [
      'Bulunduğunuz ülkenin mevzuatına (vergi, kripto varlık düzenlemeleri, kara para aklamanın önlenmesi, yaptırımlar, kimlik doğrulama) uymak sizin sorumluluğunuzdadır. Arayüzü kullanmanın yasal olmadığı bir yerdeyseniz kullanmayın.',
      'Suç geliri, dolandırıcılık, kara para aklama, terörün finansmanı, yaptırım altındaki kişi veya ülkelerle işlem, başkası adına ya da başkasının hesabıyla işlem yapmak yasaktır. Bu durumlarda arayüz erişimi sınırlandırılabilir ve yetkili makamların talepleri yasal çerçevede karşılanabilir.',
      '18 yaşından büyük olduğunuzu ve bu koşulları kabul etme ehliyetine sahip olduğunuzu beyan edersiniz.',
    ] },
    { title: '7. İtibar, tier ve kısıtlamalar', body: [
      'İtibar, tier, risk puanı ve yasaklar kontrat tarafından işlem sonuçlarına göre otomatik uygulanır ve zincirde herkese açıktır. Araf bu kayıtları elle değiştiremez veya silemez; kontratın temiz sayfa kuralı dışında bir sıfırlama yoktur.',
    ] },
    { title: '8. Kişisel veriler', body: [
      'Ödeme bilgileriniz (ad, IBAN vb.) şifreli saklanır, zincire yazılmaz ve yalnız aktif bir işlemde karşı tarafa gösterilir. Karşı tarafın bu bilgiyi nasıl kullandığından Araf sorumlu değildir; verdiğiniz bilgilerin doğruluğundan siz sorumlusunuz.',
      'Cüzdan adresiniz ve zincir üstü işlemleriniz herkese açıktır ve silinemez.',
    ] },
    { title: '9. Teknik ve piyasa riskleri', body: [
      'Akıllı kontratlar hata içerebilir; denetim veya test, hatasızlık garantisi değildir. Ağ tıkanıklığı, işlem ücretleri, cüzdan veya özel anahtar kaybı, tarayıcı/eklenti sorunları ve arayüz kesintileri kayba yol açabilir.',
      'USDT/USDC gibi stabil kripto paralar ihraççılarının kontrolündedir; dondurulabilir, sabitlik kaybedebilir veya desteklenmeyebilir. Arayüzdeki referans kurlar yalnız bilgilendirme amaçlıdır ve işlem sonucunu etkilemez.',
    ] },
    { title: '10. Ödüller', body: [
      'Barış ödülleri garanti edilmez, bir yatırım getirisi veya hak değildir. Ağırlık ve pay kontrat kurallarıyla hesaplanır; dönem 30 gündür, ödül dönem bitiminden 1 gün sonra açılır ve 7 gün içinde talep edilmezse sonraki döneme devredilir. Kurallar gelecekteki kontrat sürümlerinde değişebilir.',
    ] },
    { title: '11. Garanti reddi ve sorumluluğun sınırlandırılması', body: [
      'Arayüz ve protokol "olduğu gibi" ve "mevcut olduğu kadarıyla" sunulur; kesintisiz, hatasız veya belirli bir amaca uygun olacağına dair açık ya da örtülü hiçbir garanti verilmez.',
      'Yürürlükteki hukukun izin verdiği azami ölçüde Araf, geliştiricileri ve katkıda bulunanları; fon, kâr, veri veya fırsat kaybı dahil doğrudan ya da dolaylı hiçbir zarardan, karşı tarafın davranışından, zincir dışı ödemelerden, üçüncü taraf hizmetlerinden (cüzdan, RPC, stabil kripto ihraççısı, banka) ve yazılım hatalarından sorumlu tutulamaz.',
      'Bu koşulları veya mevzuatı ihlal etmeniz nedeniyle Araf\'a yöneltilen taleplerden doğan zarar ve masrafları karşılamayı kabul edersiniz.',
    ] },
    { title: '12. Değişiklikler ve kabul yöntemi', body: [
      'Koşullar sürümlüdür. Yeni bir sürüm yayımlandığında arayüzü kullanmaya devam edebilmek için yeni sürümü cüzdan imzasıyla yeniden kabul etmeniz gerekir.',
      `Kabul, giriş sırasında cüzdanınızla imzaladığınız mesajdaki beyanla yapılır ("I accept the Araf Terms of Use v${TERMS_VERSION}"). İmzalı mesajın özeti, kabul kanıtı olarak sunucuda saklanır.`,
    ] },
  ],
  EN: [
    { title: '1. Scope and definitions', body: [
      '"Araf Protocol" means the ArafEscrow, ArafRevenueVault and ArafRewards smart contracts deployed on Base. "Interface" means this web application and the server behind it. "User" means anyone connecting a wallet to the interface.',
      'By using the interface or signing a transaction you accept these terms in full. If you do not accept them, do not use the interface.',
    ] },
    { title: '2. Araf\'s role: software only', body: [
      'Araf is a software tool. Araf is not a broker, custodian, exchange, payment or e-money institution, investment adviser, arbitrator or a party to your trades. Araf does not choose counterparties, approve trades or guarantee them.',
      'Crypto moves only between your wallet and the smart contract. Neither the Araf team nor the contract owner can move, freeze, refund or reassign locked funds.',
      'The contract owner can only change forward-looking parameters (fee rates, treasury address, supported tokens, reputation thresholds) and temporarily pause creating/filling orders. Open trades are not affected by a pause and settle under their own rules; fees are fixed when a trade locks.',
    ] },
    { title: '3. The contract is the final authority', body: [
      'Outcomes are decided only by the smart contract\'s rules and timers. There is no human arbitrator, support decision or appeal. The Araf team cannot change, cancel or compensate the outcome of a trade.',
      'A transaction written on-chain cannot be reversed. The consequences of a wrong address, amount or counterparty are yours.',
    ] },
    { title: '4. Deadlines, bonds and the bleeding escrow', body: [
      'Order makers and takers lock bonds at contract-defined rates (Tier 0 has no bond). Rates depend on tier and reputation.',
      'Payment window: if the buyer does not pay and report within 48 hours of the lock, the trade lapses, part of the buyer\'s bond is taken and a negative record is added to their reputation.',
      'Release: if the seller does not respond to a payment report, the buyer can ping after 48 hours; with no response within 24 hours the crypto is released to the buyer automatically.',
      'Dispute (bleeding escrow): 48 hours after a dispute opens both bonds start decaying every hour; from hour 144 the principal decays too; without a settlement within 240 hours (10 days) the remainder is burned. Decayed and burned amounts go to the treasury and are not returned.',
      'Tracking these deadlines is entirely your responsibility. Interface timers and notices are aids; delays, access problems or missing notices do not change outcomes.',
    ] },
    { title: '5. Fiat payments and chargebacks', body: [
      'Bank/fiat payments happen off-chain, directly between users. Araf cannot see, verify, reverse or guarantee them; uploaded receipts are informational only.',
      'The seller bears chargeback, fake-receipt and third-party-account risks. Verifying the amount, sender and finality of an incoming payment before releasing crypto is the seller\'s responsibility.',
    ] },
    { title: '6. Legal compliance and prohibited use', body: [
      'Complying with the law where you are (tax, crypto-asset rules, anti-money-laundering, sanctions, identity checks) is your responsibility. Do not use the interface where doing so is unlawful.',
      'Proceeds of crime, fraud, money laundering, terrorist financing, dealing with sanctioned persons or countries, and trading on behalf of or with the account of another person are prohibited. In such cases interface access may be restricted and lawful requests from authorities may be answered.',
      'You confirm you are over 18 and able to accept these terms.',
    ] },
    { title: '7. Reputation, tiers and restrictions', body: [
      'Reputation, tiers, risk points and bans are applied automatically by the contract from trade outcomes and are public on-chain. Araf cannot edit or erase them; there is no reset other than the contract\'s clean-slate rule.',
    ] },
    { title: '8. Personal data', body: [
      'Your payment details (name, IBAN, etc.) are stored encrypted, never written on-chain and shown only to the counterparty of an active trade. Araf is not responsible for how the counterparty uses them; you are responsible for their accuracy.',
      'Your wallet address and on-chain activity are public and cannot be erased.',
    ] },
    { title: '9. Technical and market risks', body: [
      'Smart contracts can contain bugs; audits or tests are not a guarantee. Network congestion, gas fees, loss of a wallet or private key, browser/extension issues and interface outages can cause losses.',
      'Stablecoins such as USDT/USDC are controlled by their issuers; they can be frozen, lose their peg or stop being supported. Reference rates in the interface are informational and do not affect outcomes.',
    ] },
    { title: '10. Rewards', body: [
      'Proof of Peace rewards are not guaranteed and are not an investment return or entitlement. Weight and shares follow contract rules; an epoch lasts 30 days, rewards open 1 day after it ends and roll into a later epoch if not claimed within 7 days. Rules may change in future contract versions.',
    ] },
    { title: '11. Disclaimer of warranties and limitation of liability', body: [
      'The interface and protocol are provided "as is" and "as available", without any express or implied warranty of uninterrupted, error-free operation or fitness for a purpose.',
      'To the maximum extent permitted by law, Araf, its developers and contributors are not liable for any direct or indirect loss, including loss of funds, profit, data or opportunity, for counterparty conduct, off-chain payments, third-party services (wallets, RPCs, stablecoin issuers, banks) or software defects.',
      'You agree to cover losses and costs arising from claims against Araf caused by your breach of these terms or of the law.',
    ] },
    { title: '12. Changes and how you accept', body: [
      'These terms are versioned. When a new version is published you must accept it again with a wallet signature to keep using the interface.',
      `You accept by the clause in the message you sign with your wallet at sign-in ("I accept the Araf Terms of Use v${TERMS_VERSION}"). A digest of the signed message is kept on the server as evidence of acceptance.`,
    ] },
  ],
};

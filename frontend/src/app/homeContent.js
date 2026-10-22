// [TR] Ana sayfa (tanıtım) metinleri ve sabitleri. Her sayı/kural kontrattan ya da README'den kanıtlıdır; kaynak
//      satırı yanında yazılıdır. Kontrat değişirse buradaki metin de güncellenir. Pazarlama abartısı yok: kontrat
//      harici denetimden geçmedi ve yalnız testnet içindir (README "Project status" / "Security").
// [EN] Home (landing) copy and constants. Every number/rule is backed by the contract or README; the source line
//      sits next to it. No marketing claims: the contract is not audited and is testnet-only.

// [TR] Tanıtım videosu: tek yer. CSP (frontend/vercel.json) frame-src içermediği için şimdilik yeni sekmede açılır;
//      sayfa içi oynatmaya geçilirse yalnız HOME_VIDEO_EMBED_URL kullanılır.
// [EN] Intro video: single source. CSP has no frame-src, so it opens in a new tab for now; an in-page player
//      would use HOME_VIDEO_EMBED_URL.
export const HOME_VIDEO_ID = '1234203639';
export const HOME_VIDEO_URL = `https://vimeo.com/${HOME_VIDEO_ID}`;
export const HOME_VIDEO_EMBED_URL = `https://player.vimeo.com/video/${HOME_VIDEO_ID}?dnt=1`;

const TR = {
  hero: {
    eyebrow: 'Base üzerinde P2P USDT/USDC',
    titleLine1: 'Sistem yargılamaz.',
    titleLine2: 'Dürüstsüzlüğü pahalıya mal eder.',
    lead: 'Emanet tutmayan, hakemsiz eşten eşe USDT/USDC takası. Kurallar kontratta.',
    market: 'Pazara git',
    create: '+ Emir oluştur',
    // README.md:21, :289
    status: 'Testnet yazılımı · harici denetim yapılmadı · gerçek fonla kullanmayın',
    clockTitle: 'Kontratın saati',
    clockSub: 'Sorunsuz bir işlemde süreler',
    // ArafEscrow.sol:271 PAYMENT_WINDOW, :1133 GRACE_PERIOD, :1161 pingedAt + 24 hours
    clock: [
      { at: '0 sa', text: 'Satıcının kriptosu ve iki tarafın teminatı kilitlenir' },
      { at: '≤ 48 sa', text: 'Alıcı banka ödemesini yapar ve bildirir' },
      { at: '+48 sa', text: 'Satıcı sessizse alıcı uyarı (ping) gönderebilir' },
      { at: '+24 sa', text: 'Yanıt yoksa kripto alıcıya otomatik serbest kalır' },
    ],
  },
  video: {
    eyebrow: 'Tanıtım videosu',
    title: 'Araf’ı izleyin',
    text: 'Protokolün nasıl çalıştığını anlatan kısa tanıtım. Video Vimeo’da yeni sekmede açılır.',
    cta: 'Vimeo’da izle',
    aria: 'Araf tanıtım videosunu Vimeo’da yeni sekmede aç',
  },
  about: {
    eyebrow: 'Proje',
    title: 'Banka havalesiyle stablecoin takası, aracı olmadan.',
    body: [
      'USDT veya USDC’yi banka hesabındaki parayla takas edenler bunu çoğunlukla eşten eşe yapar. Havale zincir dışında gerçekleşir; hiçbir kontrat paranın ulaşıp ulaşmadığını göremez. Bugünkü P2P platformları bunu ekran görüntüsü okuyan bir moderatörle çözer.',
      'Araf kimin haklı olduğunu bulmaya çalışmaz. Çözülmeyen bir işlemi iki taraf için de pahalı hale getirir; böylece ikisi için de en ucuz yol dürüstçe bitirmektir.',
    ],
    forTitle: 'Kimin için',
    forList: [
      'Stablecoin’i banka havalesiyle alıp satmak isteyenler',
      'Fonlarını bir platformun personeline emanet etmek istemeyenler',
      'Kuralları önceden ve açıkça bilmek isteyenler',
    ],
    facts: [
      { k: 'Ağ', v: 'Base' },
      { k: 'Varlık', v: 'USDT · USDC' },
      { k: 'Hakem', v: 'Yok' },
    ],
  },
  philosophy: {
    eyebrow: 'Felsefe',
    motto: 'Zamana Güven, Hakeme Değil.',
    mottoAlt: 'Trust the Time, Not the Oracle.',
    lead: 'Protokol zincir dışı gerçeği ispatlamaz. Gecikmeyi, anlaşmazlığı ve kötü stratejiyi fiyatlandırır.',
    points: [
      { title: 'Hakem yok', text: 'Uyuşmazlıkta insan hakem, moderatör ya da oracle yoktur. Dekont yorumlanmaz; yalnız süreler ve ödemeler uygulanır.' },
      { title: 'Karar kontratta', text: 'Fon hareketini yalnız kontrat fonksiyonları yapar. Backend ve arayüz zinciri yansıtır; hakem değildir, fon serbest bırakamaz.' },
      { title: 'Dürüstsüzlük pahalı', text: 'Yalan söylemek ya da oyalamak yalan söyleyene de kaybettirir. Uzatmanın kimseye faydası yoktur.' },
    ],
    // ArafEscrow.sol:268 GRACE_PERIOD, :272 USDT_DECAY_START (+48 = 144. saat), :273 MAX_BLEEDING, :1095 burnExpired
    bleedTitle: 'İtirazda eriyen kasa',
    bleedSub: 'Saatler itirazın açılışından itibaren sayılır.',
    bleed: [
      { from: 0, to: 48, label: '0–48 sa', text: 'Ek süre: hiçbir şey erimez' },
      { from: 48, to: 144, label: '48–144 sa', text: 'İki tarafın teminatı saat saat erir' },
      { from: 144, to: 240, label: '144–240 sa', text: 'Kilitli ana para da erimeye başlar' },
    ],
    bleedEnd: '240. saat: kalan her şey yakılır (hazineye gider)',
  },
  features: {
    eyebrow: 'Özellikler',
    title: 'Kontratta yazılı, zincirde doğrulanabilir.',
    items: [
      // README.md "Trust boundaries"; ArafEscrow.sol fon tutan tek kaynak
      { key: 'custody', title: 'Emanet tutmaz', text: 'Fonlar ArafEscrow kontratında kilitlidir. Backend fon tutmaz ve emaneti hareket ettiremez.' },
      // ArafEscrow.sol:244-254
      { key: 'bond', title: 'İki taraflı teminat', text: 'Satıcı ve alıcı teminat yatırır. Oran tier’a göre satıcıda %0–8, alıcıda %0–10’dur.' },
      // ArafEscrow.sol:271, :266, :909
      { key: 'window', title: '48 saat ödeme penceresi', text: 'Alıcı 48 saat içinde ödemeyi bildirmezse işlem iptal edilebilir; alıcı teminatının %2’si satıcıya geçer.' },
      // ArafEscrow.sol:1133, :1161, :266
      { key: 'ping', title: 'Ping ve otomatik serbest bırakma', text: 'Satıcı susarsa alıcı uyarır; 24 saat içinde yanıt yoksa kripto alıcıya geçer. İki taraf da teminatının en az %2’sini kaybeder.' },
      // ArafEscrow.sol:268, :272-273, :292-294, :1095
      { key: 'bleed', title: 'İtirazda erime ve yakım', text: 'İtirazda 48 saat sonra teminatlar, 144. saatten sonra ana para erir. 240. saatte kalan tutar yakılır.' },
      // ArafEscrow.sol:1039, :1210, :1265
      { key: 'settle', title: 'Her an uzlaşma', text: 'Taraflar itiraz sürerken bile birlikte iptal edebilir ya da paylaşım teklifinde anlaşabilir.' },
      // README.md "Tiers"; ArafEscrow.sol:256-257, :715
      { key: 'tier', title: 'Zincir üstü itibar ve tier', text: 'Beş kademe (0–4). Üst tier daha düşük teminat ister; temiz sicil teminatı 1 puan düşürür, risk puanı 3 puan artırır.' },
      // ArafEscrow.sol:558, :583, :628, :659 whenNotPaused
      { key: 'pause', title: 'Duraklatma yalnız yeni işlemi durdurur', text: 'Duraklatma yeni emir ve eşleşmeyi engeller. Açık işlemler her zaman kapatılabilir.' },
      // README.md "Trust boundaries": no withdraw/rescue function
      { key: 'owner', title: 'Sahip fon çekemez', text: 'Kontratta çekme ya da kurtarma fonksiyonu yoktur. Sahip emanetteki fonu alamaz, işlemin sonucuna karar veremez.' },
    ],
  },
  how: {
    eyebrow: 'Nasıl çalışır',
    title: 'Kararı kontrat verir, backend değil.',
    steps: [
      { key: 'order', title: 'Emir', text: 'Satıcı kriptoyu ve teminatını kilitler; alıcı kendi teminatıyla işleme girer.' },
      { key: 'payment', title: 'Ödeme', text: 'Alıcı 48 saat içinde banka ödemesini yapıp bildirir; yapmazsa teminatından kesinti olur.' },
      { key: 'release', title: 'Onay', text: 'Satıcı onaylar. Sessiz kalırsa alıcı 48 saat sonra uyarır, 24 saat sonra kripto otomatik serbest kalır.' },
      { key: 'dispute', title: 'İtiraz', text: 'Hakem yok: teminatlar ve sonra ana para erir. Hızlı uzlaşmak her iki taraf için en ucuz yoldur.' },
    ],
  },
  faq: { eyebrow: 'Sık sorulanlar', title: 'Merak edilenler' },
};

const EN = {
  hero: {
    eyebrow: 'P2P USDT/USDC on Base',
    titleLine1: 'The system does not judge.',
    titleLine2: 'It makes dishonesty expensive.',
    lead: 'Non-custodial, arbitrator-free P2P USDT/USDC trading. The rules live in the contract.',
    market: 'Open market',
    create: '+ Create order',
    status: 'Testnet software · not externally audited · do not use real funds',
    clockTitle: 'The contract clock',
    clockSub: 'Deadlines in a smooth trade',
    clock: [
      { at: '0 h', text: 'Seller crypto and both bonds are locked' },
      { at: '≤ 48 h', text: 'Buyer sends the bank payment and reports it' },
      { at: '+48 h', text: 'If the seller is silent, the buyer can ping' },
      { at: '+24 h', text: 'With no reply, crypto auto-releases to the buyer' },
    ],
  },
  video: {
    eyebrow: 'Intro video',
    title: 'Watch Araf',
    text: 'A short introduction to how the protocol works. The video opens on Vimeo in a new tab.',
    cta: 'Watch on Vimeo',
    aria: 'Open the Araf intro video on Vimeo in a new tab',
  },
  about: {
    eyebrow: 'Project',
    title: 'Stablecoin for bank transfers, without a middleman.',
    body: [
      'People who swap USDT or USDC for money in a bank account usually do it peer to peer. The transfer happens off-chain, so no contract can see whether it arrived. Today’s P2P platforms solve this with a moderator who reads screenshots.',
      'Araf does not try to find out who is right. It makes an unresolved trade expensive for both sides, so the cheapest move for each of them is to finish honestly.',
    ],
    forTitle: 'Who it is for',
    forList: [
      'People buying or selling stablecoins against bank transfers',
      'People who do not want to trust a platform’s staff with their funds',
      'People who want the rules known up front',
    ],
    facts: [
      { k: 'Network', v: 'Base' },
      { k: 'Assets', v: 'USDT · USDC' },
      { k: 'Arbitrator', v: 'None' },
    ],
  },
  philosophy: {
    eyebrow: 'Philosophy',
    motto: 'Trust the Time, Not the Oracle.',
    mottoAlt: 'Zamana Güven, Hakeme Değil.',
    lead: 'The protocol does not prove off-chain truth. It prices delay, disagreement and bad strategy.',
    points: [
      { title: 'No arbitrator', text: 'No human arbitrator, moderator or oracle. Receipts are never interpreted; only deadlines and payouts are enforced.' },
      { title: 'The contract decides', text: 'Only contract functions move funds. The backend and the interface mirror the chain; they are not judges and cannot release funds.' },
      { title: 'Dishonesty is expensive', text: 'Lying or stalling costs the liar as well. Dragging a dispute out helps no one.' },
    ],
    bleedTitle: 'The bleeding escrow in a dispute',
    bleedSub: 'Hours are counted from when the dispute opens.',
    bleed: [
      { from: 0, to: 48, label: '0–48 h', text: 'Grace period: nothing decays' },
      { from: 48, to: 144, label: '48–144 h', text: 'Both bonds decay every hour' },
      { from: 144, to: 240, label: '144–240 h', text: 'The locked principal decays too' },
    ],
    bleedEnd: 'Hour 240: everything left is burned (sent to the treasury)',
  },
  features: {
    eyebrow: 'Features',
    title: 'Written in the contract, verifiable on-chain.',
    items: [
      { key: 'custody', title: 'Non-custodial', text: 'Funds are locked in the ArafEscrow contract. The backend holds no funds and cannot move escrow.' },
      { key: 'bond', title: 'Bonds on both sides', text: 'Seller and buyer both post a bond. By tier it is 0–8% for the seller and 0–10% for the buyer.' },
      { key: 'window', title: '48-hour payment window', text: 'If the buyer does not report payment within 48 hours the trade can be canceled; 2% of the buyer bond goes to the seller.' },
      { key: 'ping', title: 'Ping and auto-release', text: 'If the seller goes silent the buyer pings; with no reply within 24 hours the crypto goes to the buyer. Both sides lose at least 2% of their bond.' },
      { key: 'bleed', title: 'Decay and burn in disputes', text: 'In a dispute, bonds decay after 48 hours and principal after hour 144. At hour 240 the rest is burned.' },
      { key: 'settle', title: 'Settle at any time', text: 'Even during a dispute the parties can cancel together or agree on a split proposal.' },
      { key: 'tier', title: 'On-chain reputation and tiers', text: 'Five tiers (0–4). Higher tiers post smaller bonds; a clean record lowers the bond by 1 point, risk points raise it by 3.' },
      { key: 'pause', title: 'Pause stops new trades only', text: 'Pause blocks new orders and fills. Open trades can always be closed.' },
      { key: 'owner', title: 'The owner cannot take funds', text: 'There is no withdraw or rescue function. The owner cannot take escrowed funds or decide a trade.' },
    ],
  },
  how: {
    eyebrow: 'How it works',
    title: 'The contract decides, not the backend.',
    steps: [
      { key: 'order', title: 'Order', text: 'The seller locks crypto plus a bond; the buyer joins with a bond of their own.' },
      { key: 'payment', title: 'Payment', text: 'The buyer pays by bank within 48 hours and reports it; otherwise part of their bond is lost.' },
      { key: 'release', title: 'Release', text: 'The seller confirms. If silent, the buyer pings after 48 hours and funds auto-release 24 hours later.' },
      { key: 'dispute', title: 'Dispute', text: 'No arbitrator: bonds, then principal, decay. Settling fast is the cheapest path for both sides.' },
    ],
  },
  faq: { eyebrow: 'FAQ', title: 'Common questions' },
};

export const getHomeContent = (lang) => (lang === 'TR' ? TR : EN);

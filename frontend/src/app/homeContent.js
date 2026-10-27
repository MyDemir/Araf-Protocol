// [TR] Ana sayfa (tanıtım) metinleri ve sabitleri. Her sayı/kural kontrattan ya da README'den kanıtlıdır; kaynak
//      satırı yanında yazılıdır. Kontrat değişirse buradaki metin de güncellenir. Pazarlama abartısı yok: kontrat
//      harici denetimden geçmedi ve yalnız testnet içindir (README "Project status" / "Security").
// [EN] Home (landing) copy and constants. Every number/rule is backed by the contract or README; the source line
//      sits next to it. No marketing claims: the contract is not audited and is testnet-only.

// [TR] Tanıtım videosu: tek yer. Sayfa içi oynatıcı HOME_VIDEO_EMBED_URL'i (dnt=1) tıklamadan sonra yükler; bunun
//      için CSP'de `frame-src https://player.vimeo.com` gerekir (frontend/vercel.json). HOME_VIDEO_URL yeni sekme bağlantısı.
// [EN] Intro video: single source. The in-page player loads HOME_VIDEO_EMBED_URL (dnt=1) only after a click and needs
//      `frame-src https://player.vimeo.com` in the CSP. HOME_VIDEO_URL is the new-tab link.
export const HOME_VIDEO_ID = '1234203639';
export const HOME_VIDEO_URL = `https://vimeo.com/${HOME_VIDEO_ID}`;
export const HOME_VIDEO_EMBED_URL = `https://player.vimeo.com/video/${HOME_VIDEO_ID}?dnt=1`;

const TR = {
  hero: {
    eyebrow: 'P2P USDT/USDC · Base Sepolia testnet',
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
    text: 'Protokolün nasıl çalıştığını anlatan kısa tanıtım. Oynat’a basana kadar Vimeo’ya bağlantı kurulmaz.',
    cta: 'Oynat',
    playAria: 'Araf tanıtım videosunu oynat (Vimeo oynatıcısı yüklenir)',
    iframeTitle: 'Araf tanıtım videosu (Vimeo)',
    openLink: 'Vimeo’da aç',
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
      { k: 'Ağ', v: 'Base Sepolia' },
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
    title: 'Her kural kontratta yazılı.',
    items: [
      // README.md "Trust boundaries"; ArafEscrow.sol fon tutan tek kaynak
      { key: 'custody', title: 'Emanet tutmaz', text: 'Fonlar ArafEscrow kontratında kilitlidir. Backend fon tutmaz ve emaneti hareket ettiremez.' },
      // ArafEscrow.sol:244-254
      { key: 'bond', title: 'İki taraflı teminat', text: 'Satıcı ve alıcı teminat yatırır. Oran tier’a göre satıcıda %0–8, alıcıda %0–10’dur.' },
      // ArafEscrow.sol:271, :266, :909
      { key: 'window', title: '48 saat ödeme penceresi', text: 'Alıcı 48 saat içinde ödemeyi bildirmezse işlem iptal edilebilir; alıcının teminatı varsa %2’si satıcıya geçer.' },
      // ArafEscrow.sol:1133, :1161, :266, :1167-1178 (max(%2 bond, ücret); maker ücreti bond ile sınırlı)
      { key: 'ping', title: 'Ping ve otomatik serbest bırakma', text: 'Satıcı susarsa alıcı uyarır; 24 saat içinde yanıt yoksa kripto alıcıya geçer. Teminatı olan taraf teminatının en az %2’sini kaybeder (Tier 0’da teminat yoktur).' },
      // ArafEscrow.sol:268, :272-273, :292-294, :1095
      { key: 'bleed', title: 'İtirazda erime ve yakım', text: 'İtirazda 48 saat sonra teminatlar, 144. saatten sonra ana para erir. 240. saatte kalan tutar yakılır.' },
      // ArafEscrow.sol:1039-1052 (LOCKED/PAID/CHALLENGED, iki onay); ArafSettlementLib.sol:154 (paylaşım yalnız CHALLENGED)
      { key: 'settle', title: 'Birlikte iptal, itirazda uzlaşma', text: 'İşlem açıkken (itiraz dahil) taraflar iki onayla birlikte iptal edebilir. İtiraz sürerken paylaşım teklifinde de anlaşabilirler.' },
      // README.md "Tiers"; ArafEscrow.sol:244-254, :256-257, :715, :1461-1472 / :1486-1497 (Tier 0 erken döner)
      { key: 'tier', title: 'Zincir üstü itibar ve tier', text: 'Beş kademe (0–4). Tier 0’da teminat yoktur; Tier 1’den 4’e çıktıkça teminat düşer (satıcı %8→%2, alıcı %10→%2). Tier 1 ve üstünde temiz sicil (risk puanı yok, en az bir başarılı işlem) oranı 1 yüzde puan düşürür; herhangi bir risk puanı 3 yüzde puan artırır.' },
      // ArafEscrow.sol:558, :583, :628, :659 whenNotPaused (yalnız bunlar). Çıkışlar taraf hareketi bekler; garanti verilmez.
      { key: 'pause', title: 'Duraklatma yalnız yeni işlemi durdurur', text: 'Duraklatma yeni emir ve eşleşmeyi engeller; açık işlemlerin çıkış fonksiyonları duraklatmadan etkilenmez.' },
      // README.md "Trust boundaries"; ArafEscrow.sol:1790 setTreasury, :1814-1818 setFeeConfig, :310 MAX_FEE_CONFIG_BPS = 2000
      { key: 'owner', title: 'Sahip fon çekemez', text: 'Kontratta çekme ya da kurtarma fonksiyonu yoktur. Sahip hazine adresini, ücretleri (taraf başına en fazla %20) ve ayarları değiştirebilir; ama emanetteki fonu alamaz ve işlemin sonucunu seçemez.' },
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
  // [TR] SSS: kaynak satırı her sorunun üstünde. {fee} yer tutucusu kontrattan okunan ücretle değişir.
  // [EN] FAQ: source line above each question. {fee} is replaced by the fee read from the contract.
  faq: {
    eyebrow: 'Sık sorulanlar',
    title: 'Merak edilenler',
    items: [
      // README.md:56
      { q: 'Araf hakem kullanıyor mu?', a: 'Hayır. Uyuşmazlıkta insan hakem yoktur. Süreç zincirdeki zamanlayıcılar ve ekonomik teşviklerle ilerler; son söz kontratındır.' },
      // README.md:172-173, :178
      { q: 'Platform fonlarıma erişebilir mi?', a: 'Hayır. Fonlar akıllı kontratta kilitlidir. Backend yalnız zinciri yansıtır; serbest bırakma kararı veremez.' },
      // ArafEscrow.sol:268, :1133, :1161
      { q: 'Satıcı ödemeyi onaylamazsa ne olur?', a: 'Ödeme bildiriminden 48 saat sonra alıcı satıcıyı uyarır; 24 saat içinde yanıt gelmezse kripto otomatik olarak alıcıya geçer.' },
      // ArafEscrow.sol:273, :292-294, :1095; README.md:84-92
      { q: 'Eriyen kasa nedir?', a: 'İtiraz açıldıktan 48 saat sonra iki tarafın teminatı saat saat erimeye başlar; 144. saatten itibaren ana para da erir. 10 gün içinde uzlaşma olmazsa kalan tutar yakılır.' },
      // ArafEscrow.sol:244-254, :256-257; README.md:120-122
      { q: 'Neden tier ve teminat var?', a: 'Tier sistemi yeni cüzdanların emir büyüklüğünü sınırlar; teminatlar kötü niyeti pahalı hale getirir. Temiz sicil teminatı %1 düşürür, risk puanı %3 artırır.' },
      // ArafEscrow.sol:263-264, :836-837
      { q: 'Ücret ne kadar?', a: 'Başarılı işlemde kontrat {fee} ücret keser.', aNoFee: 'Ücret oranı kontratta tanımlıdır ve işlem kilitlenirken sabitlenir.' },
      // ArafEscrow.sol:565, :587, :635, :663, :1790, :1814, :1846, :1943; README.md:174-180, :183
      { q: 'Kontrat sahibi (owner) neler yapabilir?', a: 'Ücreti, işlemler arası bekleme süresini, desteklenen token\'ları, tier tavanlarını ve itibar politikasını ayarlayabilir; yeni emir ve dolumları duraklatabilir. Emanetteki fonu alamaz ve bir işlemin sonucuna karar veremez. Sahip bugün tek adrestir; çoklu imzaya geçiş ana ağ listesindedir.' },
      // ArafEscrow.sol:271, :893-916; README.md:46-47
      { q: 'Alıcı 48 saatte ödeme bildirmezse ne olur?', a: 'Taraflardan biri kilidi çözer: satıcı kriptosunu ve teminatını geri alır, alıcı teminatının %2\'sini satıcıya öder. Tier 0\'da teminat olmadığından bu ceza 0\'dır.' },
      // ArafEscrow.sol:281, :992, :1013-1022; README.md:108
      { q: 'İtiraz (challenge) ne zaman açılabilir?', a: 'Yalnızca satıcı açabilir. Önce ödeme bildiriminden en az 24 saat sonra uyarı atar; itiraz uyarıdan 24 saat sonra açılır, uyarıdan 48 saat dolunca kapanır. Pencere kaçarsa uyarı düşer ve alıcının otomatik serbest bırakma yolu açılır.' },
      // ArafEscrow.sol:244-254, :288-290, :521-522; README.md:124-135
      { q: 'Tier\'lar ve teminat oranları nedir?', a: 'Tier 0\'da teminat yoktur. Tier 1-4\'te satıcı/alıcı teminatı sırasıyla %8/%10, %6/%8, %5/%5 ve %2/%2\'dir. Yükselmek için varsayılan olarak 15, 50, 100 ya da 200 başarılı işlem, risk puanı sınırı ve ilk başarılı işlemden 15 gün gerekir. 20 USD altı işlemler itibara sayılmaz.' },
      // ArafEscrow.sol:310, :733-737, :836-837, :1814-1818; README.md:104-105
      { q: 'Ücret ne kadar artabilir? Tier 0\'da satıcı ücreti var mı?', a: 'Sahip ücreti taraf başına en çok 2.000 baz puana (%20) ayarlayabilir; açık emir ve işlemler oluşturuldukları andaki ücreti korur. Tier 0 emirlerinde satıcı ücreti 0\'dır.' },
      // ArafEscrow.sol:1039-1053, :1063-1081, :1309-1327
      { q: 'Karşılıklı iptal nasıl çalışır?', a: 'İki taraf da kendi işlemiyle onay verir; ikinci onayla iptal yürür. Onay, karşı taraf onaylamadan geri çekilebilir. Ödeme öncesi iptalde ücret yoktur; sonrasında ücret tarafın kendi teminatından kesilir. İptal nötr bir çıkıştır, başarılı işlem sayılmaz.' },
      // README.md:160; docs/TR/ARCHITECTURE.md:784-789, :795-797, :800
      { q: 'Banka bilgilerim nasıl korunur, kim görür?', a: 'Ödeme bilgileri sunucuda AES-256-GCM ile şifreli saklanır. İşlem kilitlenince bir kez anlık görüntü alınır ve işlem sürerken değiştirilemez. Görüntüleme, işleme özel ve oturum cüzdanınızla eşleşen kısa ömürlü (varsayılan 15 dakika) bir jetonla, yalnız işlem açıkken yapılır.' },
      // ArafEscrow.sol:1846-1880; homeContent.js hero.lead; README.md:303
      { q: 'Hangi token\'lar kullanılır?', a: 'Arayüz USDT ve USDC için tasarlandı. Desteklenen token\'lar, alış ve satış yönü ile tier başına tutar tavanları kontratta sahip tarafından token bazında ayarlanır.' },
      // docs/TR/ARCHITECTURE.md:1126-1128
      { q: 'Ödeme yöntemlerini kim yönetir?', a: 'Yönetici panelinden bir ödeme yöntemi yalnız açılıp kapatılabilir ve en az biri açık kalır. Kapatma yalnız yeni işleri engeller; açık işlemler etkilenmez. Bu kapı arayüz ve API düzeyindedir, kontrat ödeme yöntemini bilmez.' },
      // README.md:21, :188-191, :289
      { q: 'Gerçek parayla kullanabilir miyim?', a: 'Hayır. Yazılım Base Sepolia testnet içindir ve harici bir güvenlik denetiminden geçmedi. Gerçek fon yatırmayın.' },
      // README.md:116-117, :159-167; ArafEscrow.sol:541-545, :644, :1766-1769, :1991-2006, :2023-2029
      { q: 'Cüzdanı nasıl bağlarım, alıcı olmak için ne gerekir?', a: 'Cüzdanla Ethereum ile giriş (SIWE) yapılır; fon hareketi doğrudan cüzdanınızla kontrata imzalanır. Alıcı olmak için cüzdanın kayıtlı olması, kayıttan 2 gün geçmesi ve en az 0,001 ETH bakiye gerekir. Banlı cüzdan yeni emir ya da dolum yapamaz.' },
      // README.md:156; docs/TR/ARCHITECTURE_INCENTIVES.md:56; docs/TR/GAME_THEORY.md:179, :206
      { q: 'Ödüller (Proof of Peace) nedir?', a: 'Hızlı ve temiz kapanan işlemlerden doğan, havuzdan paya göre dağıtılan ödüllerdir. Cashback değildir; sabit bir getiri vaadi de değildir. Tier 0 ve karşılıklı iptal ağırlık kazandırmaz.' },
      // ArafEscrow.sol:508-519, :2023-2029; docs/TR/ARCHITECTURE.md:495-510
      { q: 'Ban ve itibar nasıl işler?', a: 'Her işlem sonucu risk puanını artırır ya da azaltır; itirazı kaybeden +60, yakım +90 alır, temiz serbest bırakma puanı düşürür. Puan 100\'e ulaşınca varsayılan 30 gün ban gelir; tekrarında süre katlanır. Banlıyken yeni emir ya da dolum yapılamaz.' },
      // README.md:188-190
      { q: 'Kontrat adresi nedir?', a: 'Henüz herkese açık bir kontrat adresi yayımlanmadı; Base Sepolia dağıtımı sürüyor. Ana ağ dağıtımı yok.' },
    ],
  },
};

const EN = {
  hero: {
    eyebrow: 'P2P USDT/USDC · Base Sepolia testnet',
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
    text: 'A short introduction to how the protocol works. Nothing connects to Vimeo until you press Play.',
    cta: 'Play',
    playAria: 'Play the Araf intro video (loads the Vimeo player)',
    iframeTitle: 'Araf intro video (Vimeo)',
    openLink: 'Open on Vimeo',
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
      { k: 'Network', v: 'Base Sepolia' },
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
    title: 'Every rule is written in the contract.',
    items: [
      { key: 'custody', title: 'Non-custodial', text: 'Funds are locked in the ArafEscrow contract. The backend holds no funds and cannot move escrow.' },
      { key: 'bond', title: 'Bonds on both sides', text: 'Seller and buyer both post a bond. By tier it is 0–8% for the seller and 0–10% for the buyer.' },
      { key: 'window', title: '48-hour payment window', text: 'If the buyer does not report payment within 48 hours the trade can be canceled; if the buyer posted a bond, 2% of it goes to the seller.' },
      { key: 'ping', title: 'Ping and auto-release', text: 'If the seller goes silent the buyer pings; with no reply within 24 hours the crypto goes to the buyer. Each side that posted a bond loses at least 2% of it (Tier 0 has no bond).' },
      { key: 'bleed', title: 'Decay and burn in disputes', text: 'In a dispute, bonds decay after 48 hours and principal after hour 144. At hour 240 the rest is burned.' },
      { key: 'settle', title: 'Cancel together, settle a dispute', text: 'While a trade is open (dispute included) the parties can cancel with both approvals. During a dispute they can also agree on a split proposal.' },
      { key: 'tier', title: 'On-chain reputation and tiers', text: 'Five tiers (0–4). Tier 0 has no bond; from Tier 1 to 4 the bond falls (seller 8%→2%, buyer 10%→2%). From Tier 1 up, a clean record (no risk points, at least one successful trade) lowers the rate by 1 percentage point; any risk points raise it by 3.' },
      { key: 'pause', title: 'Pause stops new trades only', text: 'Pause blocks new orders and fills; the exit functions of open trades are not affected by pause.' },
      { key: 'owner', title: 'The owner cannot take funds', text: 'There is no withdraw or rescue function. The owner can change the treasury address, fees (at most 20% per side) and settings, but cannot take escrowed funds or choose a trade’s outcome.' },
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
  // [TR] SSS: kaynak satırı her sorunun üstünde. {fee} yer tutucusu kontrattan okunan ücretle değişir.
  // [EN] FAQ: source line above each question. {fee} is replaced by the fee read from the contract.
  faq: {
    eyebrow: 'FAQ',
    title: 'Common questions',
    items: [
      // README.md:56
      { q: 'Does Araf use arbitrators?', a: 'No. There are no human arbitrators. The flow runs on on-chain timers and economic incentives; the contract has the final say.' },
      // README.md:172-173, :178
      { q: 'Can the platform access my funds?', a: 'No. Funds stay locked in the smart contract. The backend only mirrors the chain and cannot release funds.' },
      // ArafEscrow.sol:268, :1133, :1161
      { q: 'What if the seller never confirms payment?', a: '48 hours after the payment report the buyer can ping the seller; with no response within 24 hours the crypto is released to the buyer automatically.' },
      // ArafEscrow.sol:273, :292-294, :1095; README.md:84-92
      { q: 'What is the bleeding escrow?', a: 'Starting 48 hours after a dispute opens, both bonds decay every hour; from hour 144 the principal decays too. Without a settlement within 10 days the rest is burned.' },
      // ArafEscrow.sol:244-254, :256-257; README.md:120-122
      { q: 'Why tiers and bonds?', a: 'Tiers cap order size for new wallets; bonds make bad faith expensive. A clean record lowers the bond by 1%, risk points raise it by 3%.' },
      // ArafEscrow.sol:263-264, :836-837
      { q: 'What are the fees?', a: 'On a successful trade the contract charges {fee}.', aNoFee: 'The fee rate is defined in the contract and fixed when a trade locks.' },
      // ArafEscrow.sol:565, :587, :635, :663, :1790, :1814, :1846, :1943; README.md:174-180, :183
      { q: 'What can the contract owner do?', a: 'The owner can set fees, trade cooldowns, supported tokens, tier caps and the reputation policy, and can pause new orders and fills. The owner cannot take escrowed funds or decide a trade. The owner is a single address today; moving to a multisig is on the mainnet checklist.' },
      // ArafEscrow.sol:271, :893-916; README.md:46-47
      { q: 'What if the buyer does not report payment within 48 hours?', a: 'Either party can unwind the lock: the seller gets the crypto and bond back, and the buyer pays 2% of their bond to the seller. On Tier 0 there is no bond, so that penalty is 0.' },
      // ArafEscrow.sol:281, :992, :1013-1022; README.md:108
      { q: 'When can a challenge be opened?', a: 'Only the seller can. First the seller pings at least 24 hours after the payment report; the challenge opens 24 hours after the ping and closes 48 hours after it. If the window is missed the ping lapses and the buyer\'s auto-release path opens.' },
      // ArafEscrow.sol:244-254, :288-290, :521-522; README.md:124-135
      { q: 'What are the tiers and bond rates?', a: 'Tier 0 has no bond. Tiers 1-4 post seller/buyer bonds of 8%/10%, 6%/8%, 5%/5% and 2%/2%. By default, moving up needs 15, 50, 100 or 200 successful trades, a risk-point limit and 15 days since the first successful trade. Trades under 20 USD do not count toward reputation.' },
      // ArafEscrow.sol:310, :733-737, :836-837, :1814-1818; README.md:104-105
      { q: 'How high can fees go? Does the seller pay on Tier 0?', a: 'The owner can set fees up to 2,000 bps (20%) per side; open orders and trades keep the fee they were created with. On Tier 0 orders the seller fee is 0.' },
      // ArafEscrow.sol:1039-1053, :1063-1081, :1309-1327
      { q: 'How does mutual cancel work?', a: 'Each party consents with its own transaction; the second consent executes the cancel. A consent can be withdrawn before the other side confirms. Before payment there is no fee; afterwards each side\'s fee comes out of its own bond. A cancel is a neutral exit, not a successful trade.' },
      // README.md:160; docs/TR/ARCHITECTURE.md:784-789, :795-797, :800
      { q: 'How is my bank info protected and who can see it?', a: 'Payment details are stored on the server with AES-256-GCM encryption. A snapshot is taken once when the trade locks and cannot change while it runs. Viewing needs a trade-scoped, short-lived token (15 minutes by default) matching your session wallet, and works only while the trade is open.' },
      // ArafEscrow.sol:1846-1880; homeContent.js hero.lead; README.md:303
      { q: 'Which tokens are supported?', a: 'The interface is built for USDT and USDC. Supported tokens, their buy and sell directions and per-tier amount caps are set per token in the contract by the owner.' },
      // docs/TR/ARCHITECTURE.md:1126-1128
      { q: 'Who manages payment methods?', a: 'From the admin panel a payment method can only be switched on or off, and at least one stays on. Switching one off blocks only new activity; open trades are unaffected. This gate lives in the UI and API, not the contract, which knows nothing about payment methods.' },
      // README.md:21, :188-191, :289
      { q: 'Can I use it with real money?', a: 'No. The software is for the Base Sepolia testnet and has not had an external security audit. Do not deposit real funds.' },
      // README.md:116-117, :159-167; ArafEscrow.sol:541-545, :644, :1766-1769, :1991-2006, :2023-2029
      { q: 'How do I connect a wallet and what does a buyer need?', a: 'You sign in with your wallet (SIWE) and sign fund-moving actions directly against the contract. To be a buyer the wallet must be registered, at least 2 days old since registration, and hold at least 0.001 ETH. A banned wallet cannot place new orders or fills.' },
      // README.md:156; docs/TR/ARCHITECTURE_INCENTIVES.md:56; docs/TR/GAME_THEORY.md:179, :206
      { q: 'What are the rewards (Proof of Peace)?', a: 'They come from fast, clean trades and are shared pro rata from a pool. They are not cashback and not a fixed return. Tier 0 and mutual cancel earn no weight.' },
      // ArafEscrow.sol:508-519, :2023-2029; docs/TR/ARCHITECTURE.md:495-510
      { q: 'How do bans and reputation work?', a: 'Each outcome adds or removes risk points; losing a dispute adds 60, a burn adds 90, and a clean release lowers the score. At 100 points a ban follows, 30 days by default, and it grows on repeats. While banned you cannot place new orders or fills.' },
      // README.md:188-190
      { q: 'What is the contract address?', a: 'No public contract address is published yet; the Base Sepolia deployment is in progress. There is no mainnet deployment.' },
    ],
  },
};

export const getHomeContent = (lang) => (lang === 'TR' ? TR : EN);

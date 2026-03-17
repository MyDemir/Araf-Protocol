# Araf Protocol — Kapsamlı Düzeltme Görevi

## Bağlam
Araf Protocol bir Web2.5 hibrit P2P escrow sistemidir. Üç katman:
- `contracts/src/ArafEscrow.sol` — Solidity 0.8.24, Base L2
- `backend/scripts/` — Node.js/Express, MongoDB/Mongoose, Redis
- `frontend/src/` — React 18, Wagmi 2, Viem

**Temel kural:** ARCHITECTURE_TR.md tek gerçek kaynaktır.
Backend hiçbir zaman hakem rolü üstlenemez. Fonları etkileyen
tüm kararlar on-chain sözleşme tarafından verilir. Backend yalnızca
Mirror (eventleri DB'ye yansıtır), Relay (imzaları iletir) ve
Index (pazar yerini hızlı sorgular) rollerini üstlenir.

---

## GÖREV 1 — MongoDB Model Düzeltmesi (KRİTİK)
**Dosya:** `backend/scripts/models/Trade.js`

`timers` subdocument'una aşağıdaki alanları ekle.
Mongoose strict mode bu alanlar olmadan $set işlemlerini
sessizce yok sayıyor; bu yüzden ping ve challenge akışları
hiç çalışmıyor:
```javascript
timers: {
  locked_at:           { type: Date, default: null },
  paid_at:             { type: Date, default: null },
  challenged_at:       { type: Date, default: null },
  resolved_at:         { type: Date, default: null },
  last_decay_at:       { type: Date, default: null },
  pinged_at:           { type: Date, default: null },   // EKLE
  challenge_pinged_at: { type: Date, default: null },   // EKLE
},
pinged_by_taker:          { type: Boolean, default: false }, // EKLE
challenge_pinged_by_maker: { type: Boolean, default: false }, // EKLE
```

---

## GÖREV 2 — Event Listener: _onMakerPinged Düzeltmesi (KRİTİK)
**Dosya:** `backend/scripts/services/eventListener.js`

Mevcut `_onMakerPinged` her zaman `pinged_by_taker: true`
yazıyor. Ama sözleşmede iki farklı fonksiyon aynı `MakerPinged`
event'ini emit ediyor:
- `pingMaker()` — taker çağırır
- `pingTakerForChallenge()` — maker çağırır

`pinger` adresini trade'in `taker_address`'iyle karşılaştırarak
hangi ping türü olduğunu ayırt et:
```javascript
async _onMakerPinged(event) {
  const { tradeId, pinger } = event.args;

  const trade = await Trade.findOne({
    onchain_escrow_id: Number(tradeId)
  }).lean();
  if (!trade) return;

  const isTakerPing =
    pinger.toLowerCase() === trade.taker_address?.toLowerCase();

  const updateFields = isTakerPing
    ? {
        "timers.pinged_at": new Date(),
        "pinged_by_taker": true
      }
    : {
        "timers.challenge_pinged_at": new Date(),
        "challenge_pinged_by_maker": true
      };

  await Trade.findOneAndUpdate(
    { onchain_escrow_id: Number(tradeId) },
    { $set: updateFields }
  );
}
```

---

## GÖREV 3 — Sözleşme: firstSuccessfulTradeAt Getter + AUTO_RELEASE_PENALTY Düzeltmesi
**Dosya:** `contracts/src/ArafEscrow.sol`

### 3a. firstSuccessfulTradeAt için external view getter ekle

`firstSuccessfulTradeAt` mapping zaten var ama external getter yok.
Frontend profil sayfasındaki "Tier 1 için X gün kaldı" göstergesi
bu veriye ihtiyaç duyuyor. Mevcut view fonksiyonlarının yanına ekle:
```solidity
/// @notice Returns the timestamp of the wallet's first successful trade.
/// @dev Used by frontend to calculate MIN_ACTIVE_PERIOD countdown.
function getFirstSuccessfulTradeAt(address _wallet)
    external
    view
    returns (uint256)
{
    return firstSuccessfulTradeAt[_wallet];
}
```

### 3b. AUTO_RELEASE_PENALTY_BPS: 500 → 200 olarak güncelle

Mevcut değer her iki taraftan 5% kesiyor. Tasarım kararı
olarak bu 2%'ye düşürülüyor. Her iki taraftan ayrı ayrı
uygulanmaya devam ediyor:
```solidity
// Eski:
uint256 public constant AUTO_RELEASE_PENALTY_BPS = 500; // 5%

// Yeni:
uint256 public constant AUTO_RELEASE_PENALTY_BPS = 200; // 2%
```

Bu değişiklikten sonra Hardhat test suite'ini çalıştır
(`npx hardhat test`) ve autoRelease ceza hesaplamalarını
kullanan test case'leri (özellikle "applies 5% negligence penalty"
testi) yeni değere göre güncelle:
```javascript
// Test güncelleme: 500n → 200n
const makerPenalty = (MAKER_BOND_T2 * 200n) / 10000n;
const takerPenalty = (TAKER_BOND_T2 * 200n) / 10000n;
```

---

## GÖREV 4 — Sözleşme: Cancel Test Düzeltmesi
**Dosya:** `contracts/test/ArafEscrow.test.js`

`_executeCancel()` fonksiyonu her zaman 0.2% protokol ücreti
kesiyor (ARCHITECTURE_TR ile uyumlu — bu kasıtlı davranış).
Ama test "cancel has no fee" iddiasıyla bunu test ediyor ve
şu an sözleşmeyle çelişiyor. Testi gerçeğe göre düzelt:
```javascript
it("cancel deducts standard protocol fee from remaining amounts", async () => {
  const tradeId = await setupTrade(2);
  await escrow.connect(taker).lockEscrow(tradeId);

  const makerBefore    = await mockUSDT.balanceOf(maker.address);
  const takerBefore    = await mockUSDT.balanceOf(taker.address);
  const treasuryBefore = await mockUSDT.balanceOf(treasury.address);

  const deadline = (await time.latest()) + 3600;
  const makerSig = await eip712CancelSig(
    maker, tradeId, await escrow.sigNonces(maker.address), deadline
  );
  await escrow.connect(maker).proposeOrApproveCancel(
    tradeId, deadline, makerSig
  );
  const takerSig = await eip712CancelSig(
    taker, tradeId, await escrow.sigNonces(taker.address), deadline
  );
  await escrow.connect(taker).proposeOrApproveCancel(
    tradeId, deadline, takerSig
  );

  // Sözleşme 0.2% ücret kesiyor (ARCHITECTURE_TR ile uyumlu)
  const takerFee = (TRADE_AMOUNT * TAKER_FEE_BPS) / BPS_DENOM;
  const makerFee = (TRADE_AMOUNT * MAKER_FEE_BPS) / BPS_DENOM;

  const makerAfter    = await mockUSDT.balanceOf(maker.address);
  const takerAfter    = await mockUSDT.balanceOf(taker.address);
  const treasuryAfter = await mockUSDT.balanceOf(treasury.address);

  // Maker: crypto geri alır + (bond - makerFee)
  expect(makerAfter - makerBefore).to.equal(
    TRADE_AMOUNT + MAKER_BOND_T2 - makerFee
  );
  // Taker: (bond - takerFee) geri alır
  expect(takerAfter - takerBefore).to.equal(TAKER_BOND_T2 - takerFee);
  // Treasury: her iki tarafın ücretini alır
  expect(treasuryAfter - treasuryBefore).to.equal(takerFee + makerFee);
  expect((await escrow.getTrade(tradeId)).state).to.equal(5); // CANCELED
});
```

Aynı anda ARCHITECTURE_EN.md'deki yanlış satırı da düzelt:
```markdown
<!-- ARCHITECTURE_EN.md — State Definitions tablosunda -->

<!-- Eski (YANLIŞ): -->
| `CANCELED` | 2/2 EIP-712 signature | Full refund. No fees. Collaterals fully returned. |

<!-- Yeni (DOĞRU): -->
| `CANCELED` | 2/2 EIP-712 signature | Standard protocol fee (0.2%) deducted from remaining amounts. Collaterals returned minus fees. |
```

---

## GÖREV 5 — Frontend ABI Düzeltmeleri (KRİTİK)
**Dosya:** `frontend/src/hooks/useArafContract.js`

### 5a. antiSybilCheck — 4 değer → 3 değer
```javascript
// Eski (YANLIŞ — kontrat 3 değer döndürüyor):
'function antiSybilCheck(address _wallet) view returns (bool ageOk, bool balanceOk, bool cooldownOk, uint256 cooldownRemaining)',

// Yeni (DOĞRU):
'function antiSybilCheck(address _wallet) view returns (bool aged, bool funded, bool cooldownOk)',
```

### 5b. getReputation — 5 değer (sözleşmeyle eşleş)
```javascript
// Eski (YANLIŞ — 6 değer, olmayan firstSuccessfulTradeAt var):
'function getReputation(address _wallet) view returns (uint256 successful, uint256 failed, uint256 bannedUntil, uint256 consecutiveBans, uint8 effectiveTier, uint256 firstSuccessfulTradeAt)',

// Yeni (DOĞRU — 5 değer):
'function getReputation(address _wallet) view returns (uint256 successful, uint256 failed, uint256 bannedUntil, uint256 consecutiveBans, uint8 effectiveTier)',
```

### 5c. Yeni getter'ı ABI'ye ekle (Görev 3a ile birlikte)
```javascript
// ArafEscrowABI parseAbi listesine ekle:
'function getFirstSuccessfulTradeAt(address _wallet) view returns (uint256)',
```

### 5d. Hook'a getFirstSuccessfulTradeAt metodunu ekle
```javascript
getFirstSuccessfulTradeAt: useCallback(
  async (address) => {
    if (!_isValidAddress) return null;
    try {
      return await publicClient.readContract({
        address: getAddress(ESCROW_ADDRESS),
        abi: ArafEscrowABI,
        functionName: 'getFirstSuccessfulTradeAt',
        args: [getAddress(address)],
      });
    } catch (err) {
      console.error('[ArafContract] getFirstSuccessfulTradeAt hatası:', err.message);
      return null;
    }
  },
  [publicClient]
),
```

### 5e. App.jsx'te sybilStatus cooldownRemaining kullanımını düzelt

`antiSybilCheck` artık `cooldownRemaining` döndürmüyor.
App.jsx'te bu alana bağımlı her yerde sabit `0` kullan
veya kaldır:
```javascript
setSybilStatus({
  funded:     typeof res.funded !== 'undefined' ? res.funded : res[1],
  cooldownOk: typeof res.cooldownOk !== 'undefined' ? res.cooldownOk : res[2],
  cooldownRemaining: 0, // Sözleşme bu değeri döndürmüyor
});
```

---

## GÖREV 6 — reputationDecay Query Path Düzeltmesi (KRİTİK)
**Dosya:** `backend/scripts/jobs/reputationDecay.js`

User.js modelinde `banned_until` ve `consecutive_bans` üst
seviyede tanımlı — `reputation_cache` altında değil.
Sorgu yanlış path kullanıyor, her zaman 0 sonuç dönüyor:
```javascript
// Eski (YANLIŞ):
const usersToClean = await User.find({
  "reputation_cache.banned_until": { $lt: oneHundredEightyDaysAgo },
  "reputation_cache.consecutive_bans": { $gt: 0 },
}).limit(50);

// Yeni (DOĞRU):
const usersToClean = await User.find({
  "banned_until":     { $lt: oneHundredEightyDaysAgo },
  "consecutive_bans": { $gt: 0 },
}).limit(50);
```

---

## GÖREV 7 — Cancel İmza Akışı: Hybrid (Relay + Fallback)
**Dosyalar:** `frontend/src/App.jsx`, `backend/scripts/routes/trades.js`

ARCHITECTURE_TR Bölüm 9.2'de tanımlanan akış şu:
Backend imzaları saklayan relay, kontrat kriptografik kanıtı
bağımsız doğrular. Backend sadece koordinasyonu kolaylaştırır,
hiçbir zaman karar vermez.

### 7a. App.jsx handleProposeCancel — Hybrid Akış
```javascript
const handleProposeCancel = async () => {
  if (!activeTrade?.onchainId) return;
  if (isContractLoading) return;
  try {
    setIsContractLoading(true);
    showToast(lang === 'TR'
      ? 'İptal imzası oluşturuluyor...'
      : 'Creating cancel signature...', 'info');

    const ESCROW_ADDR = import.meta.env.VITE_ESCROW_ADDRESS;
    const { getAddress, parseAbi: _parseAbi } = await import('viem');
    const nonceAbi = _parseAbi([
      'function sigNonces(address) view returns (uint256)'
    ]);
    const nonce = await publicClient.readContract({
      address: getAddress(ESCROW_ADDR),
      abi: nonceAbi,
      functionName: 'sigNonces',
      args: [getAddress(address)],
    });

    const { signature, deadline } = await signCancelProposal(
      activeTrade.onchainId, nonce
    );

    // RELAY YOLU (birincil): Backend'e gönder, karşı taraf görsün
    try {
      const relayRes = await authenticatedFetch(
        `${API_URL}/api/trades/propose-cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            tradeId:   activeTrade.id,
            signature,
            deadline,
          }),
        }
      );
      const relayData = await relayRes.json();

      if (relayData.bothSigned) {
        // Her iki imza da mevcut — kontratı çağır
        showToast(lang === 'TR'
          ? 'Her iki taraf imzaladı. Kontrata gönderiliyor...'
          : 'Both signed. Sending to contract...', 'info');
        await proposeOrApproveCancel(
          BigInt(activeTrade.onchainId), deadline, signature
        );
        setCancelStatus(null);
        setTradeState('CANCELED');
        setCurrentView('home');
        showToast(lang === 'TR'
          ? '✅ İşlem iptal edildi.'
          : '✅ Trade cancelled.', 'success');
      } else {
        // Sadece bir imza — bekle
        setCancelStatus('proposed_by_me');
        showToast(lang === 'TR'
          ? '✅ İptal teklifi gönderildi. Karşı tarafın onayı bekleniyor.'
          : '✅ Cancel proposal sent. Awaiting counterparty.', 'success');
      }
    } catch (relayErr) {
      // FALLBACK YOLU: Backend erişilemez — direkt on-chain
      console.warn('[Cancel] Backend relay başarısız, direkt on-chain fallback:', relayErr.message);
      showToast(lang === 'TR'
        ? 'Backend erişilemez. Kontrata direkt gönderiliyor...'
        : 'Backend unreachable. Sending directly to contract...', 'info');
      await proposeOrApproveCancel(
        BigInt(activeTrade.onchainId), deadline, signature
      );
      setCancelStatus('proposed_by_me');
      showToast(lang === 'TR'
        ? '✅ İptal teklifi kontrata gönderildi (direkt).'
        : '✅ Cancel proposal sent directly to contract.', 'success');
    }
  } catch (err) {
    const msg = err.shortMessage || err.reason || err.message || '';
    if (msg.includes('rejected') || msg.includes('User rejected')) {
      showToast(lang === 'TR' ? 'İşlem iptal edildi.' : 'Transaction cancelled.', 'error');
    } else {
      showToast(msg || (lang === 'TR' ? 'İptal teklifi başarısız.' : 'Cancel proposal failed.'), 'error');
    }
  } finally {
    setIsContractLoading(false);
  }
};
```

### 7b. Karşı taraf "Onayla" butonunu backend'den bekleyen
imzaya göre düzenle

`cancelStatus === 'proposed_by_other'` state'inde onay
butonuna basıldığında:
```javascript
// Mevcut sahte davranış (test state değiştiriyor) yerine:
onClick={async () => {
  try {
    setIsContractLoading(true);
    const ESCROW_ADDR = import.meta.env.VITE_ESCROW_ADDRESS;
    const { getAddress, parseAbi: _parseAbi } = await import('viem');
    const nonceAbi = _parseAbi([
      'function sigNonces(address) view returns (uint256)'
    ]);
    const nonce = await publicClient.readContract({
      address: getAddress(ESCROW_ADDR),
      abi: nonceAbi,
      functionName: 'sigNonces',
      args: [getAddress(address)],
    });
    const { signature, deadline } = await signCancelProposal(
      activeTrade.onchainId, nonce
    );
    // Relay'e gönder — bothSigned true döner → kontratı çağırır
    await handleProposeCancel();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setIsContractLoading(false);
  }
}}
```

---

## GÖREV 8 — App.jsx: Challenge Timer Düzeltmesi
**Dosya:** `frontend/src/App.jsx`

Sözleşmede `pingTakerForChallenge` için bekleme süresi
24 saattir. App.jsx yanlış olarak 1 saat kullanıyor:
```javascript
// Eski (YANLIŞ — 1 saat):
const challengeUnlockDate = activeTrade?.paidAt
  ? new Date(new Date(activeTrade.paidAt).getTime() + 1 * 3600 * 1000)
  : null;

// Yeni (DOĞRU — 24 saat, sözleşmeyle uyumlu):
const challengeUnlockDate = activeTrade?.challengePingedAt
  ? new Date(new Date(activeTrade.challengePingedAt).getTime() + 24 * 3600 * 1000)
  : null;
```

Not: Timer artık `paidAt`'ten değil `challengePingedAt`'ten
başlıyor çünkü 24 saatlik bekleme ping gönderildikten sonra
başlıyor.

---

## GÖREV 9 — App.jsx: autoRelease Uyarı Metni + challengedAt Güncelleme
**Dosya:** `frontend/src/App.jsx`

### 9a. autoRelease uyarı metni

Sözleşme hem maker'dan hem taker'dan ceza kesiyor (%2 + %2).
Mevcut metin sadece taker'dan bahsediyor:
```jsx
// Eski (YANLIŞ — sadece taker bahsi):
{lang === 'TR'
  ? 'Dikkat: Bu işlem, sistemi meşgul etme ve ihmal cezası olarak Taker teminatınızdan %5 kesinti yapacaktır.'
  : 'Warning: This action will deduct a 5% penalty from your Taker bond.'}

// Yeni (DOĞRU — her iki taraf, %2 güncel değer):
{lang === 'TR'
  ? 'Dikkat: Satıcı pasif kaldığı için her iki tarafın teminatından %2 ihmal cezası kesilecektir (Maker: %2, Taker: %2).'
  : 'Warning: Due to maker inaction, a 2% negligence penalty will be deducted from both parties\' bonds (Maker: 2%, Taker: 2%).'}
```

### 9b. Challenge sonrası challengedAt'i hemen güncelle

`handleChallenge` başarısından sonra bleeding timer'ların
hemen doğru değer göstermesi için:
```javascript
// challengeTrade başarı bloğuna ekle:
await challengeTrade(BigInt(activeTrade.onchainId));
setTradeState('CHALLENGED');
setActiveTrade(prev => ({
  ...prev,
  challengedAt: new Date().toISOString() // EKLE — polling bekleme
}));
showToast(...);
```

---

## GÖREV 10 — App.jsx: PIIDisplay tradeId Kaynağı Düzeltmesi
**Dosya:** `frontend/src/App.jsx`

`handleStartTrade` Listing._id'yi activeTrade.id olarak
set ediyor. Ama PIIDisplay ve PII endpoint'i Trade._id
bekliyor. lockEscrow başarısından sonra gerçek trade ID'yi
fetch et:
```javascript
// handleStartTrade — lockEscrow başarısından sonra:
await lockEscrow(BigInt(order.onchainId));

// Gerçek Trade._id'yi çek
let realTradeId = null;
try {
  const tradeRes = await authenticatedFetch(
    `${API_URL}/api/trades/my`
  );
  const tradeData = await tradeRes.json();
  const matchedTrade = tradeData.trades?.find(
    t => t.onchain_escrow_id === order.onchainId
  );
  if (matchedTrade) realTradeId = matchedTrade._id;
} catch (_) { /* fallback: eski davranış */ }

setActiveTrade({
  ...order,
  id:       realTradeId || order.id, // Trade._id, fallback Listing._id
  onchainId: order.onchainId,
});
```

---

## GÖREV 11 — App.jsx: Buy Butonu Guard'ları
**Dosya:** `frontend/src/App.jsx`

### 11a. Token adresi yapılandırılmamışsa buton disable
```javascript
const tokenAddr = SUPPORTED_TOKEN_ADDRESSES[order.crypto];
const isTokenConfigured = Boolean(tokenAddr);

const finalCanTakeOrder =
  canTakeOrder && isCooldownOk && isFunded && isTokenConfigured;
```

### 11b. Yanlış ağda buton disable
```javascript
const SUPPORTED_CHAIN_IDS = [8453, 84532, 31337];
const isCorrectChain = SUPPORTED_CHAIN_IDS.includes(chainId);

const finalCanTakeOrder =
  canTakeOrder && isCooldownOk && isFunded &&
  isTokenConfigured && isCorrectChain;
```

Buton label'ına ekle:
```jsx
!isCorrectChain
  ? <><span>⛓</span> {lang === 'TR' ? 'Yanlış Ağ' : 'Wrong Network'}</>
  : !isTokenConfigured
  ? <><span>⚙</span> {lang === 'TR' ? 'Token Ayarlanmadı' : 'Token Not Set'}</>
  : /* mevcut buton içeriği */
```

---

## GÖREV 12 — usePII: Cookie-Only Auth
**Dosya:** `frontend/src/hooks/usePII.js`

AUDIT FIX F-01 sonrası JWT httpOnly cookie'de tutuluyor.
`authToken` prop'u artık gereksiz ve `'cookie-active'`
string'i yanlışlıkla Authorization header'a yazılıyor.
Her iki adımda da sadece `credentials: 'include'` kullan:
```javascript
// usePII.js — authToken parametresini ve tüm header koşullarını kaldır

export function usePII(tradeId) { // authToken parametresi kaldırıldı
  // ...
  const fetchPII = useCallback(async () => {
    // ADIM 1
    const tokenRes = await fetch(
      `${API_BASE}/api/pii/request-token/${tradeId}`,
      {
        method: 'POST',
        credentials: 'include',         // httpOnly cookie otomatik gönderilir
        headers: { 'Content-Type': 'application/json' },
      }
    );
    // ...
    // ADIM 2 — piiToken hala Bearer olarak gönderilir (trade-scoped)
    const piiRes = await fetch(`${API_BASE}/api/pii/${tradeId}`, {
      headers: { 'Authorization': `Bearer ${piiToken}` },
    });
  }, [tradeId]); // authToken bağımlılığı kaldırıldı
}
```

App.jsx'te PIIDisplay çağrılarından `authToken` prop'unu kaldır:
```jsx
// Eski:
<PIIDisplay tradeId={activeTrade?.id} authToken={jwtToken} ... />

// Yeni:
<PIIDisplay tradeId={activeTrade?.id} ... />
```

PIIDisplay.jsx'in de `authToken` prop'unu kabul etmemesi için
bileşen imzasını güncelle.

---

## GÖREV 13 — listings.js: RPC Provider Cache
**Dosya:** `backend/scripts/routes/listings.js`

Her `POST /api/listings` isteğinde yeni Provider yaratılıyor.
Modül seviyesinde cache'le:
```javascript
// Dosyanın üstüne ekle:
let _cachedListingsProvider = null;
function _getListingsProvider() {
  if (!_cachedListingsProvider) {
    _cachedListingsProvider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL
    );
  }
  return _cachedListingsProvider;
}

// _getOnChainEffectiveTier içinde değiştir:
async function _getOnChainEffectiveTier(walletAddress) {
  // ...
  try {
    const provider = _getListingsProvider(); // Yeni instance değil
    const contract = new ethers.Contract(
      contractAddress, REPUTATION_ABI, provider
    );
    // ...
  }
}
```

---

## GÖREV 14 — AppPastUi.jsx Silme
**Dosya:** `frontend/src/AppPastUi.jsx`

Bu arşiv dosyasını tamamen sil. İçinde React hook kuralı
ihlali (`useCountdown`'ın `renderTradeRoom` içinde çağrılması)
var. Git history yeterli:
```bash
rm frontend/src/AppPastUi.jsx
```

---

## GÖREV 15 — GAME_THEORY.md Güncelleme
**Dosya:** `docs/GAME_THEORY.md`

Sequence diagram'da Maker itiraz akışını simetrik ping
modelini yansıtacak şekilde güncelle. Mevcut tek adımlı
`challengeTrade()` → iki adımlı `pingTakerForChallenge()`
→ 24h bekleme → `challengeTrade()` olarak değiştir:
```markdown
    and Maker disputes
        Note over Maker: paidAt + 24h sonra
        Maker->>Contract: pingTakerForChallenge()
        Note over Contract: 24h yanıt penceresi başladı
        Note over Taker: Taker'ın yanıt vermesi için 24h var
        
        alt Taker 24h içinde yanıt vermezse
            Maker->>Contract: challengeTrade()
            Contract-->>Maker: Event: DisputeOpened
            Note over Contract: State: CHALLENGED
        else Taker yanıt verirse (release veya cancel)
            Note over Maker,Taker: ConflictingPingPath koruması
            Note over Contract: autoRelease yolu kapanır
        end
```

`ConflictingPingPath` hatasını da diyagrama ekle ve
altına şu notu koy:
> Güvenlik: Maker `pingTakerForChallenge` yaptıysa Taker
> `pingMaker` (autoRelease yolu) kullanamaz ve tersi de geçerli.
> Bu MEV/transaction ordering manipülasyonunu önler.

---

## GÖREV 16 — API_DOCUMENTATION.md Güncelleme
**Dosya:** `docs/API_DOCUMENTATION.md`

AUDIT FIX F-01 sonrası üç endpoint yanlış belgelenmiş:

### POST /auth/verify — yanıt body'si
```markdown
<!-- Eski (YANLIŞ): -->
**Başarılı Yanıt (200 OK):**
{ "token": "ey...", "refreshToken": "abc..." }

<!-- Yeni (DOĞRU — F-01 sonrası): -->
**Başarılı Yanıt (200 OK):**
{ "wallet": "0x...", "profile": { ... } }

> Token'lar httpOnly cookie olarak set edilir (`araf_jwt`,
> `araf_refresh`). JavaScript'ten erişilemez (XSS koruması).
```

### POST /auth/refresh — request body
```markdown
<!-- Eski (YANLIŞ): -->
{ "wallet": "0x...", "refreshToken": "abc..." }

<!-- Yeni (DOĞRU): -->
{ "wallet": "0x..." }

> Refresh token `araf_refresh` cookie'sinden otomatik okunur.
```

### PUT /api/pii → PUT /api/auth/profile olarak düzelt
```markdown
<!-- Eski (YANLIŞ): -->
#### `PUT /api/pii`

<!-- Yeni (DOĞRU): -->
#### `PUT /api/auth/profile`
**Açıklama:** Kullanıcının banka sahibi, IBAN ve Telegram
bilgisini günceller. Veriler AES-256-GCM ile şifrelenerek
saklanır.
```

### Yeni endpoint ekle: GET /api/auth/me
```markdown
#### `GET /api/auth/me`
**Açıklama:** Cookie'deki JWT geçerliyse wallet adresini
döndürür. Frontend sayfa yüklendiğinde oturum kontrolü için
kullanır (httpOnly cookie JS'ten okunamadığından bu endpoint
gereklidir).
**Yetkilendirme:** Auth JWT Cookie (araf_jwt)
**Başarılı Yanıt (200 OK):**
{ "wallet": "0x...", "authenticated": true }
```

---

## GÖREV 17 — Stats Hata State'i
**Dosya:** `frontend/src/App.jsx`

Stats fetch başarısız olduğunda kullanıcıya hata mesajı göster:
```javascript
const [statsError, setStatsError] = useState(false);

// fetchStats catch bloğuna ekle:
} catch (err) {
  console.error("Stats fetch error:", err);
  setStatsError(true); // EKLE
} finally {
  setStatsLoading(false);
}
```

Stats kartlarında hata durumu:
```jsx
{statsError && (
  <div className="col-span-5 text-center py-4 text-slate-500 text-xs">
    {lang === 'TR'
      ? 'İstatistik verisi alınamadı.'
      : 'Failed to load stats.'}
    <button
      onClick={() => { setStatsError(false); fetchStats(); }}
      className="ml-2 text-emerald-400 hover:underline"
    >
      {lang === 'TR' ? 'Tekrar dene' : 'Retry'}
    </button>
  </div>
)}
```

---

## GÖREV 18 — getReputation'da firstSuccessfulTradeAt Entegrasyonu
**Dosya:** `frontend/src/App.jsx`

Görev 3a ve 5d tamamlandıktan sonra profil itibar
sekmesindeki aktiflik göstergesini gerçek on-chain
veriye bağla:
```javascript
// fetchUserReputation fonksiyonuna ekle:
const firstTradeAt = await getFirstSuccessfulTradeAt(address);

setUserReputation({
  successful:           Number(repData.successful ?? repData[0]),
  failed:               Number(repData.failed ?? repData[1]),
  bannedUntil:          Number(repData.bannedUntil ?? repData[2]),
  consecutiveBans:      Number(repData.consecutiveBans ?? repData[3]),
  effectiveTier:        Number(repData.effectiveTier ?? repData[4]),
  firstSuccessfulTradeAt: Number(firstTradeAt ?? 0), // Yeni alan
});
```

---

## Görev Tamamlama Sırası

Aşağıdaki sırayı takip et. Her görevden sonra TypeScript/
ESLint hatası yoksa ilerle:

1. Görev 1 (Trade model) — diğer her şeyin temeli
2. Görev 2 (eventListener) — Görev 1'e bağımlı
3. Görev 6 (reputationDecay query) — bağımsız
4. Görev 14 (AppPastUi.jsx sil) — bağımsız
5. Görev 3 (Sözleşme: getter + penalty)
6. `npx hardhat compile` — hata yoksa devam
7. Görev 4 (test düzelt) — `npx hardhat test`
8. Görev 5 (ABI düzeltmeleri)
9. Görev 12 (usePII cookie-only)
10. Görev 13 (listings provider cache)
11. Görev 7 (cancel hybrid akış)
12. Görev 8 (challenge timer)
13. Görev 9 (autoRelease uyarı + challengedAt)
14. Görev 10 (PIIDisplay tradeId)
15. Görev 11 (buy button guards)
16. Görev 17 (stats error state)
17. Görev 18 (firstSuccessfulTradeAt entegrasyonu)
18. Görev 15 (GAME_THEORY.md)
19. Görev 16 (API_DOCUMENTATION.md)

## Doğrulama Kriterleri

Tüm görevler tamamlandıktan sonra şunları kontrol et:

- [ ] `npx hardhat test` — tüm testler geçiyor
- [ ] `cd backend && npm run lint` — hata yok
- [ ] `cd frontend && npm run build` — hata yok
- [ ] Trade.js modelinde `pinged_at` ve `challenge_pinged_at` var
- [ ] `antiSybilCheck` ABI 3 değer döndürüyor
- [ ] `getReputation` ABI 5 değer döndürüyor
- [ ] `getFirstSuccessfulTradeAt` hem sözleşmede hem ABI'de var
- [ ] `AUTO_RELEASE_PENALTY_BPS` sözleşmede 200
- [ ] `AppPastUi.jsx` silinmiş
- [ ] `usePII` `authToken` parametresi yok
- [ ] Cancel akışı önce backend relay, başarısızsa on-chain deniyor
- [ ] ARCHITECTURE_EN.md cancel ücreti düzeltilmiş
- [ ] API_DOCUMENTATION.md F-01 sonrası güncel

## GÖREV 19 — Revize: Polling Olmadan Tam Cookie Auth Modeli
**Dosya:** `frontend/src/App.jsx`

### Felsefe
httpOnly cookie sistemi kendi kendine yeterlidir.
Periyodik polling gereksiz API yükü yaratır ve
yanlış bir güvenlik hissi verir — 401 tabanlı
reaktif model hem daha verimli hem daha temizdir.

Tek kaynak: backend. UI state sadece backend
yanıtlarını yansıtır, bağımsız karar vermez.

---

### Değişiklik 1 — jwtToken tamamen kaldır
```javascript
// SİL:
const [jwtToken, setJwtToken] = useState(null);
const [refreshTokenState, setRefreshTokenState] = useState(null);

// EKLE:
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [authChecked, setAuthChecked] = useState(false);
// authChecked: ilk /api/auth/me tamamlanana kadar
// UI "yükleniyor" gösterir, false flash olmaz
```

Tüm dosyada şu değişimleri uygula:
- setJwtToken('cookie-active') → setIsAuthenticated(true)
- setJwtToken(null)            → setIsAuthenticated(false)
- if (!jwtToken)               → if (!isAuthenticated)
- isConnected && jwtToken      → isConnected && isAuthenticated
- jwtToken && isConnected      → isAuthenticated && isConnected

---

### Değişiklik 2 — Sayfa yükü session kontrolü

Mevcut useEffect'i şununla değiştir:
```javascript
useEffect(() => {
  if (!isConnected || !address) {
    setIsAuthenticated(false);
    setAuthChecked(true);
    return;
  }

  fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
    .then(res => {
      setIsAuthenticated(res.ok);
      setAuthChecked(true);
    })
    .catch(() => {
      setIsAuthenticated(false);
      setAuthChecked(true);
    });
}, [isConnected, address]);
// Polling yok. Sadece wallet bağlantısı değişince çalışır.
```

---

### Değişiklik 3 — authenticatedFetch: tek 401 yöneticisi

Tüm session yönetimi buraya taşınıyor.
Başka hiçbir yerde 401 kontrolü yok:
```javascript
const authenticatedFetch = React.useCallback(
  async (url, options = {}) => {
    // İlk istek — cookie otomatik gönderilir
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    // 401 değilse direkt döndür
    if (res.status !== 401) return res;

    // 401 — refresh dene
    try {
      const refreshRes = await fetch(
        `${API_URL}/api/auth/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address?.toLowerCase() }),
        }
      );

      if (!refreshRes.ok) {
        // Refresh başarısız — 7 günlük session bitti
        setIsAuthenticated(false);
        showToast(
          lang === 'TR'
            ? 'Oturumunuz sona erdi. Lütfen tekrar imzalayın.'
            : 'Session expired. Please sign in again.',
          'error'
        );
        return res; // Orijinal 401'i döndür
      }

      // Refresh başarılı — backend yeni cookie set etti
      // Orijinal isteği tekrarla
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

    } catch {
      // Ağ hatası — session durumunu değiştirme
      return res;
    }
  },
  [address, lang]
  // isAuthenticated bağımlılığı yok — döngü riski ortadan kalkar
);
```

---

### Değişiklik 4 — loginWithSIWE güncelle
```javascript
const loginWithSIWE = async () => {
  // ...mevcut nonce + imza mantığı aynı...

  const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, signature }),
  });

  if (verifyRes.ok) {
    setIsAuthenticated(true);  // 'cookie-active' değil
    showToast(...);
  } else {
    const data = await verifyRes.json().catch(() => ({}));
    throw new Error(data.error || 'Doğrulama başarısız');
  }
};
```

---

### Değişiklik 5 — logout güncelle
```javascript
// Mevcut logout mantığı aynı, sadece state güncelleme:
router.post('/logout', ...) başarılıysa:
  setIsAuthenticated(false);
  // refreshTokenState artık yok — silinecek satır yok
```

---

### Değişiklik 6 — authChecked ile flash önleme

Sayfa ilk yüklendiğinde cookie kontrolü tamamlanmadan
UI "giriş gerekli" gösterip hemen "giriş yapıldı"ya
geçmemelidir. authChecked flag'ini kullan:
```javascript
// Navbar auth butonu:
{!authChecked
  ? null  // veya spinner
  : !isConnected
  ? <button onClick={() => setShowWalletModal(true)}>Cüzdan</button>
  : !isAuthenticated
  ? <button onClick={loginWithSIWE}>İmzala</button>
  : <button onClick={handleAuthAction}>{formatAddress(address)}</button>
}

// Trade Room, PII gibi korumalı alanlar:
{!authChecked
  ? <div className="animate-pulse text-slate-500 text-xs p-4">
      {lang === 'TR' ? 'Oturum kontrol ediliyor...' : 'Checking session...'}
    </div>
  : !isAuthenticated
  ? <div>...</div>  // giriş gerekli mesajı
  : <aktif içerik />
}
```

---

### Değişiklik 7 — fetchMyTrades guard güncelle
```javascript
// Eski:
if (!jwtToken || !isConnected) { ... }

// Yeni:
if (!isAuthenticated || !isConnected) { ... }
```

---

### Kaldırılacak kodlar (tamamen sil)
```javascript
// 1. refreshTokenState state ve tüm kullanımları:
const [refreshTokenState, setRefreshTokenState] = useState(null);
setRefreshTokenState(data.refreshToken);
// → Refresh artık cookie tabanlı, state gereksiz

// 2. AppPastUi.jsx içindeki eski refresh mantığı:
body: JSON.stringify({
  wallet: ...,
  refreshToken: refreshTokenState  // → kaldır
})
// Yeni: sadece wallet gönderiliyor (Görev 12'de zaten var)

// 3. 14 dakika interval (Görev 19 eski versiyonunda önerildi):
// → Hiç ekleme — polling modeli tamamen iptal
```

---

### Doğrulama kriterleri

- [ ] jwtToken string referansı hiçbir yerde yok
- [ ] refreshTokenState state'i yok
- [ ] setInterval ile periyodik /api/auth/me çağrısı yok
- [ ] Tüm 401 yönetimi authenticatedFetch'te
- [ ] Login → isAuthenticated true
- [ ] Logout → isAuthenticated false
- [ ] Wallet disconnect → isAuthenticated false
- [ ] Sayfa yenileme → /api/auth/me bir kez çalışır
- [ ] authChecked false iken korumalı UI görünmüyor
- [ ] Cookie expire → ilk 401'de refresh deneniyor
- [ ] Refresh başarısız → toast + isAuthenticated false

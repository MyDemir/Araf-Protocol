# ARAF Protocol — P0 Blocker Fix Rehberi

Her fix için: hangi dosya, hangi satır, tam kod değişimi.

---

## ARAF-01 — Zero `listingRef` ile on-chain/off-chain bağ kopması

### Sorun
`createEscrow(token, amount, tier)` overload'u `listingRef=bytes32(0)` gönderiyor.
Listener bu durumda DLQ'ya düşürüyor ama uyarı vermeden devam ediyor.
Zincirde escrow var, backend'de yok → trade room erişilemez.

### Fix 1: `ArafEscrow.sol` — zero ref'i revert et

```solidity
// contracts/src/ArafEscrow.sol
// _createEscrow() fonksiyonu içinde, "Checks" bloğuna ekle:

function _createEscrow(
    address _token,
    uint256 _cryptoAmount,
    uint8   _tier,
    bytes32 _listingRef
) internal returns (uint256 tradeId) {
    // ── Checks ──
    if (!supportedTokens[_token]) revert TokenNotSupported();
    if (_cryptoAmount == 0) revert ZeroAmount();
    if (_tier > 4) revert InvalidTier();

    // ARAF-01 FIX: zero listingRef revert — authoritative linkage zorunlu
    // Frontend her zaman keccak256(listing._id) göndermeli
    if (_listingRef == bytes32(0)) revert InvalidListingRef();
    // ... geri kalan kod aynı
}
```

```solidity
// Hata tanımları bloğuna ekle (diğer custom error'ların yanına):
error InvalidListingRef();
```

```solidity
// Parametresiz overload'u kaldır veya deprecated yap:
// KALDIR veya revert ekle:
function createEscrow(
    address _token,
    uint256 _cryptoAmount,
    uint8   _tier
) external nonReentrant whenNotPaused returns (uint256 tradeId) {
    // ARAF-01 FIX: Bu overload artık kabul edilmiyor
    revert InvalidListingRef();
}
```

### Fix 2: `frontend/src/App.jsx` — handleCreateEscrow guard

```javascript
// handleCreateEscrow fonksiyonunda, pre-create sonrası:

pendingListingId  = preCreateData?.listing?._id || null;
pendingListingRef = preCreateData?.listing?.listing_ref || null;

// ARAF-01 FIX: ref yoksa işlemi durdur, stale listing temizle
if (!pendingListingRef || !/^0x[a-f0-9]{64}$/.test(pendingListingRef)) {
  if (pendingListingId) {
    authenticatedFetch(`${API_URL}/api/listings/${pendingListingId}`, { method: 'DELETE' })
      .catch(() => {});
  }
  throw new Error(
    lang === 'TR'
      ? 'Listing referansı alınamadı. İlan tekrar oluşturulamadı.'
      : 'Failed to get listing reference. Please try again.'
  );
}
```

### Fix 3: `eventListener.js` — zero ref politikasını hata olarak işaretle

```javascript
// _onEscrowCreated() içinde, isZeroRef kontrolünde:

if (isZeroRef) {
  // ARAF-01 FIX: Bu artık "recover edilebilir gecikmeli" değil,
  // "geçersiz kontrat API kullanımı" olarak işlemleniyor.
  // Frontend her zaman ref göndermeli; göndermiyorsa kritik bug var.
  logger.error(
    `[Worker] CRITICAL: EscrowCreated event'i zero listingRef ile geldi! ` +
    `trade=#${tradeIdNum} tx=${event.transactionHash} — ` +
    `Bu kontrat seviyesinde engellenmiş olmalı. Manuel inceleme gerekiyor.`
  );
  // DLQ'ya at ama "invalid_api_usage" tag'i ile
  await this._addToDLQ(event, 'CRITICAL: zero listingRef — kontrat fix öncesi oluştu');
  return;
}
```

---

## ARAF-02 — 409 mismatch sonrası forced backend invalidation eksikliği

### Sorun
`authenticatedFetch` 409 alınca `clearLocalSessionState()` çağırıyor (UI temizleniyor)
ama backend cookie'yi ve Redis session'ını temizlemiyor.
Cookie'ler hâlâ tarayıcıda → başka isteklerle tekrar kullanılabilir.

### Fix 1: `frontend/src/App.jsx` — 409 handler'a backend revoke ekle

```javascript
// authenticatedFetch fonksiyonunu bul:
const authenticatedFetch = React.useCallback(async (url, options = {}) => {
  // ...
  
  if (res.status === 409) {
    // ARAF-02 FIX: Sadece UI temizliği değil, backend session'ı da sonlandır
    // Sıralı çalışması şart: önce backend revoke, sonra local temizlik
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        // wallet header gönderme — session zaten geçersiz, 409 aldık
      });
    } catch (_) {
      // Logout başarısız olsa bile devam et — local state zaten temizlenecek
    }
    clearLocalSessionState();
    showToast(
      lang === 'TR'
        ? 'Oturum cüzdan uyuşmazlığı nedeniyle sonlandırıldı. Lütfen yeniden giriş yapın.'
        : 'Session ended due to wallet mismatch. Please sign in again.',
      'error'
    );
    return res;
  }
  
  // ...
}, [connectedWallet, address, lang, clearLocalSessionState]);
```

### Fix 2: `backend/scripts/middleware/auth.js` — requireSessionWalletMatch mismatch'te revoke

```javascript
// requireSessionWalletMatch fonksiyonunda, mismatch log satırından sonra:

if (!req.wallet || req.wallet !== headerWallet) {
  logger.warn(
    `[Auth] Session-wallet mismatch: cookie=${req.wallet || "none"} header=${headerWallet}`
  );

  // ARAF-02 FIX: Mismatch tespit edildiğinde backend session'ını da temizle
  // Bu, frontend'in logout'u başarısız olduğu senaryolara karşı güvence sağlar
  try {
    const { revokeRefreshToken } = require("../services/siwe");
    // Cookie'deki wallet'ı kullan — header'a güvenme
    if (req.wallet) {
      await revokeRefreshToken(req.wallet);
    }
  } catch (revokeErr) {
    logger.warn(`[Auth] Mismatch revoke başarısız: ${revokeErr.message}`);
  }

  // Cookie'leri de temizle
  const cookieOpts = { httpOnly: true, sameSite: "lax", path: "/" };
  res.clearCookie("araf_jwt",     { ...cookieOpts });
  res.clearCookie("araf_refresh", { ...cookieOpts, path: "/api/auth" });

  return res.status(409).json({
    error: "Oturum cüzdanı aktif bağlı cüzdanla eşleşmiyor. Lütfen yeniden giriş yapın.",
    code: "SESSION_WALLET_MISMATCH",
  });
}
```

---

## ARAF-03 — `realTradeId` fallback ile ID drift

### Sorun
`handleStartTrade` içinde `realTradeId` null gelirse `order.id` (listing MongoDB _id'si)
ile `setActiveTrade` çağrılıyor. Bu ID ile `chargeback-ack`, `propose-cancel`,
PII istekleri yapıldığında backend 404/403 dönüyor ama UI "başarılı" gösteriyor.

### Fix: `frontend/src/App.jsx` — realTradeId bulunamazsa trade room açma

```javascript
// handleStartTrade fonksiyonunda, retry loop'tan sonra:

// MEVCUT KOD (sorunlu):
// setActiveTrade({ ...order, id: realTradeId || order.id, onchainId: order.onchainId });

// ARAF-03 FIX: realTradeId yoksa trade room açma
if (!realTradeId) {
  // Ek bir deneme: lockEscrow başarılı olduysa listener henüz işlemiyor olabilir.
  // Kullanıcıyı bilgilendir, fallback ID ile devam etme.
  showToast(
    lang === 'TR'
      ? '⚠️ İşlem zincire yazıldı ancak backend kaydı henüz oluşmadı. ' +
        'Birkaç saniye sonra "Aktif İşlemler" ekranını kontrol edin.'
      : '⚠️ Trade was written on-chain but backend record is not ready yet. ' +
        'Check "Active Trades" in a few seconds.',
    'info'
  );
  // Trade room'u "bekleme" state'i ile aç — ama YANLIŞ ID ile değil
  setActiveTrade({
    ...order,
    id: null,          // Kasıtlı null — ID bilinmiyor
    onchainId: order.onchainId,
    _pendingBackendSync: true,  // UI'da spinner göstermek için flag
  });
  setTradeState('LOCKED');
  setCancelStatus(null);
  setChargebackAccepted(false);
  setCurrentView('tradeRoom');
  return; // ERKEN ÇIKIŞ — lockEscrow başarılı, ama room "pending sync" modunda
}

// Normal yol — sadece gerçek ID ile devam et
setActiveTrade({ ...order, id: realTradeId, onchainId: order.onchainId });
setTradeState('LOCKED');
setCancelStatus(null);
setChargebackAccepted(false);
setCurrentView('tradeRoom');
showToast(lang === 'TR' ? '🔒 İşlem başarıyla kilitlendi!' : '🔒 Trade locked successfully!', 'success');
```

```javascript
// renderTradeRoom() içinde, _pendingBackendSync durumu için guard ekle:
// (Dosyanın başına, tradeRoom render'ının üstüne)

if (activeTrade?._pendingBackendSync && !activeTrade?.id) {
  return (
    <div className="p-8 text-center">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-white font-bold text-lg mb-2">
        {lang === 'TR' ? 'İşlem Zincire Yazıldı' : 'Trade Written On-Chain'}
      </p>
      <p className="text-slate-400 text-sm">
        {lang === 'TR'
          ? 'Backend kaydı senkronize ediliyor... Bu birkaç saniye sürebilir.'
          : 'Syncing backend record... This may take a few seconds.'}
      </p>
      <button
        onClick={fetchMyTrades}
        className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
      >
        {lang === 'TR' ? 'Yenile' : 'Refresh'}
      </button>
    </div>
  );
}
```

```javascript
// fetchMyTrades içinde, _pendingBackendSync aktifken otomatik geçiş:

// Mevcut setActiveTrade'in hemen üstüne ekle:
setActiveTrade(prev => {
  if (!prev) return prev;
  const updated = data.trades.find(t => t.onchain_escrow_id === prev.onchainId);
  if (!updated) return prev;

  // ARAF-03 FIX: _pendingBackendSync'ten çık — gerçek ID geldi
  const wasPendingSync = prev._pendingBackendSync && !prev.id;
  if (wasPendingSync && updated._id) {
    showToast(
      lang === 'TR' ? '✅ İşlem odası hazır!' : '✅ Trade room ready!',
      'success'
    );
  }

  return {
    ...prev,
    id: prev.id || updated._id,  // Yoksa şimdi al
    _pendingBackendSync: false,
    // ... geri kalan alanlar
  };
});
```

---

## ARAF-04 — Auth limiter Redis kesintisinde fail-open

### Sorun
`rateLimiter.js`'te `makeSkipFn()` Redis yoksa tüm limiter'ları skip ediyor.
Auth endpoint'leri (`/nonce`, `/verify`, `/refresh`) için bu brute-force kapısı açıyor.

### Fix: `backend/scripts/middleware/rateLimiter.js` — auth için ayrı in-memory fallback

```javascript
// Dosyanın başına, mevcut importların altına ekle:

// ARAF-04 FIX: Auth için in-memory rate limit fallback
// Redis yokken auth endpoint'lerini korumak için
const _authInMemory = new Map(); // key → { count, resetAt }
const AUTH_INMEM_MAX    = 10;
const AUTH_INMEM_WINDOW = 60_000; // 1 dakika

function _authInMemoryCheck(key) {
  const now = Date.now();
  const entry = _authInMemory.get(key);

  if (!entry || now > entry.resetAt) {
    _authInMemory.set(key, { count: 1, resetAt: now + AUTH_INMEM_WINDOW });
    return false;
  }

  entry.count += 1;
  if (entry.count > AUTH_INMEM_MAX) {
    return true;
  }
  return false;
}

// Eski entry'leri periyodik temizle
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _authInMemory.entries()) {
    if (now > entry.resetAt) _authInMemory.delete(key);
  }
}, 5 * 60_000);
```

```javascript
// makeSkipFn() yerine, authLimiter için özel skip fonksiyonu yaz:

// ARAF-04 FIX: Auth için fail-CLOSED skip — Redis yoksa in-memory'e düş
function makeAuthSkipFn() {
  return (req, res) => {
    if (isReady()) {
      return false; // Redis var, normal akış
    }
    // Redis yok — in-memory fallback ile koru
    const key = req.ip;
    const blocked = _authInMemoryCheck(key);
    if (blocked) {
      logger.warn(`[RateLimit:AUTH-FALLBACK] In-memory limit aşıldı: ${req.ip}`);
      res.status(429).json({
        error: "Çok fazla auth isteği. 1 dakika sonra tekrar deneyin.",
      });
      return true; // İsteği durdur (skip=true ama response zaten yazıldı)
    }
    logger.warn("[RateLimit:AUTH] Redis erişilemez — in-memory fallback aktif.");
    return false; // In-memory limit aşılmadı, geçir
  };
}
```

```javascript
// authLimiter tanımını güncelle — makeSkipFn() yerine makeAuthSkipFn():

const authLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             10,
  keyGenerator:    (req) => req.ip,
  store:           makeStore("auth"),
  skip:            makeAuthSkipFn(), // ARAF-04 FIX: fail-closed
  handler:         (req, res) => {
    onLimitReached(req);
    res.status(429).json({ error: "Çok fazla auth isteği. 1 dakika sonra tekrar deneyin." });
  },
  standardHeaders: true,
  legacyHeaders:   false,
});
```

---

## ARAF-05 — Nonce atomikliği kalıntısı

### Sorun
`siwe.js`'te `SET NX` (Not eXists) sonucu kontrol edilmiyor.
Redis'in `set()` metodu NX başarısızsa `null` döner ama kod bunu görmezden gelip
`existing` değeri tekrar okumadan yeni nonce döndürüyor.

### Fix: `backend/scripts/services/siwe.js` — NX sonucunu kesin kontrol et

```javascript
// generateNonce fonksiyonunu bul ve şu şekilde güncelle:

async function generateNonce(walletAddress) {
  const redis = getRedisClient();
  const key   = `nonce:${walletAddress.toLowerCase()}`;

  // Önce mevcut nonce'ı kontrol et
  const existing = await redis.get(key);
  if (existing) {
    logger.debug(`[Auth] Mevcut nonce kullanılıyor: ${walletAddress}`);
    return existing;
  }

  // ARAF-05 FIX: SET NX sonucunu kesin kontrol et
  const nonce = crypto.randomBytes(16).toString("hex");
  const setResult = await redis.set(key, nonce, { NX: true, EX: NONCE_TTL_SECS });

  if (setResult === null) {
    // NX başarısız — race condition: başka bir istek az önce yazdı
    // Kendi ürettiğimiz nonce'ı kullanma — Redis'ten gerçeği oku
    const racedNonce = await redis.get(key);
    if (!racedNonce) {
      // Redis'te yok ama NX de başarısız — nadir ama mümkün (TTL expired anında)
      // Güvenli hata: kullanıcı tekrar /nonce isteği atabilir
      throw new Error("Nonce üretilemedi. Lütfen tekrar deneyin.");
    }
    logger.debug(`[Auth] Nonce race condition çözüldü, mevcut nonce kullanılıyor: ${walletAddress}`);
    return racedNonce;
  }

  // NX başarılı — yeni nonce üretildi
  logger.debug(`[Auth] Yeni nonce üretildi: ${walletAddress}`);
  return nonce;
}
```

---

## ARAF-06 — Auth restore zincirinin frontend doğruluğuna aşırı bağımlı olması

### Sorun
`/api/auth/me` endpoint'i session'ı döndürüyor ama hangi wallet için olduğunu
doğrulamıyor. Frontend'den gelen `x-wallet-address` header'ına güveniyor.
Stale/wrong wallet ile gelen istek kabul edilebiliyor.

### Fix 1: `backend/scripts/routes/auth.js` — `/me` endpoint'ini strict yap

```javascript
// GET /api/auth/me route'unu bul ve güncelle:

router.get("/me", requireAuth, async (req, res) => {
  // req.wallet = cookie JWT'den gelen wallet (httpOnly, JS erişemez)
  
  // ARAF-06 FIX: Header ile cookie arasındaki wallet'ı karşılaştır
  // requireAuth zaten cookie JWT'yi doğruladı, req.wallet güvenilir
  const headerWalletRaw = req.headers["x-wallet-address"];

  if (headerWalletRaw) {
    const headerWallet = headerWalletRaw.trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(headerWallet) && headerWallet !== req.wallet) {
      // Wallet mismatch — frontend'de hesap değişmiş olabilir
      logger.warn(
        `[Auth] /me wallet mismatch: cookie=${req.wallet} header=${headerWallet} — session geçersiz`
      );

      // Cookie'leri temizle — zorunlu invalidation
      const cookieOpts = { httpOnly: true, sameSite: "lax", path: "/" };
      res.clearCookie("araf_jwt",     { ...cookieOpts });
      res.clearCookie("araf_refresh", { ...cookieOpts, path: "/api/auth" });

      // Session'ı da revoke et
      try {
        await revokeRefreshToken(req.wallet);
      } catch (_) {}

      return res.status(409).json({
        error: "Oturum cüzdanı aktif bağlı cüzdanla eşleşmiyor.",
        code: "SESSION_WALLET_MISMATCH",
      });
    }
  }

  return res.json({ wallet: req.wallet, authenticated: true });
});
```

### Fix 2: `frontend/src/App.jsx` — restore mantığını sertleştir

```javascript
// Auth check useEffect'ini bul (sayfa yüklendiğinde session kontrolü):

useEffect(() => {
  if (!isConnected || !connectedWallet) {
    clearLocalSessionState();
    setAuthChecked(true);
    return;
  }
  fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',
    headers: { 'x-wallet-address': connectedWallet },
  })
    .then(async (res) => {
      // ARAF-06 FIX: 409 da kesin hata — sadece 200 kabul et
      if (res.status === 409) {
        // Backend zaten cookie temizledi, biz de local state'i temizliyoruz
        clearLocalSessionState();
        setAuthChecked(true);
        showToast(
          lang === 'TR'
            ? 'Oturum cüzdanınızla eşleşmiyor. Lütfen yeniden giriş yapın.'
            : 'Session does not match your wallet. Please sign in again.',
          'info'
        );
        return;
      }

      if (!res.ok) {
        clearLocalSessionState();
        setAuthChecked(true);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const sessionWallet = data?.wallet?.toLowerCase?.() || null;

      // ARAF-06 FIX: Backend'den gelen wallet ile connected wallet kesin eşleşmeli
      // "yakın yeterli" değil, tam eşleşme zorunlu
      if (!sessionWallet) {
        await bestEffortBackendLogout();
        clearLocalSessionState();
        setAuthChecked(true);
        return;
      }

      if (sessionWallet !== connectedWallet) {
        // Wallet değişmiş — backend'i de bilgilendir
        await bestEffortBackendLogout();
        clearLocalSessionState();
        showToast(
          lang === 'TR'
            ? 'Bağlı cüzdan oturumla eşleşmiyor. Lütfen yeniden imzalayın.'
            : 'Connected wallet does not match session. Please sign in again.',
          'info'
        );
        setAuthChecked(true);
        return;
      }

      // Kesin eşleşme — session geçerli
      setIsAuthenticated(true);
      setAuthenticatedWallet(sessionWallet);
      authenticatedWalletRef.current = sessionWallet;
      setAuthChecked(true);
    })
    .catch(() => {
      clearLocalSessionState();
      setAuthChecked(true);
    });
}, [isConnected, connectedWallet, clearLocalSessionState, bestEffortBackendLogout, lang]);
```

---

## Uygulama Sırası ve Test Kontrol Listesi

### Önerilen uygulama sırası

1. **ARAF-05** → En küçük, en az riskli, siwe.js tek dosya
2. **ARAF-04** → rateLimiter.js, backend restart gerekiyor
3. **ARAF-06** → auth.js + App.jsx, birlikte deploy et
4. **ARAF-02** → auth.js middleware + App.jsx, birlikte deploy et
5. **ARAF-03** → App.jsx UI mantığı
6. **ARAF-01** → Kontrat değişikliği → yeni deploy zorunlu (en son)

### Her fix için smoke test

**ARAF-05 testi:**
```bash
# Aynı wallet ile eş zamanlı 2 nonce isteği — her ikisi de aynı nonce döndürmeli
curl "http://localhost:4000/api/auth/nonce?wallet=0x123..." &
curl "http://localhost:4000/api/auth/nonce?wallet=0x123..." &
wait
```

**ARAF-04 testi:**
```bash
# Redis'i durdur, sonra auth endpoint'e 15 istek gönder
docker stop araf-redis
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:4000/api/auth/verify \
    -H "Content-Type: application/json" \
    -d '{"message":"test","signature":"0x00"}'
done
# 11. istekten itibaren 429 görmeli (200/400 değil)
```

**ARAF-06 testi:**
1. Wallet A ile giriş yap
2. MetaMask'ta Wallet B'ye geç (çıkış yapmadan)
3. Sayfayı yenile → `/me` 409 dönmeli → UI logout olmalı

**ARAF-02 testi:**
1. Wallet A ile giriş yap
2. MetaMask'ta Wallet B'ye geç
3. Herhangi bir API isteği yap → 409 alınmalı
4. DevTools → Application → Cookies → `araf_jwt` ve `araf_refresh` silinmiş olmalı

**ARAF-03 testi:**
1. lockEscrow'dan sonra backend'i 10 sn offline yap (port engelle)
2. Trade room açılmaya çalışılmalı → "senkronize ediliyor" spinner görünmeli
3. Backend'i aç → birkaç saniye sonra otomatik geçiş olmalı

**ARAF-01 testi (kontrat):**
```javascript
// Hardhat test:
await expect(
  escrow.connect(maker)["createEscrow(address,uint256,uint8)"](
    tokenAddr, TRADE_AMOUNT, 2
  )
).to.be.revertedWithCustomError(escrow, "InvalidListingRef");

// Overload'lu çağrı da revert etmeli:
await expect(
  escrow.connect(maker)["createEscrow(address,uint256,uint8,bytes32)"](
    tokenAddr, TRADE_AMOUNT, 2, ethers.ZeroHash
  )
).to.be.revertedWithCustomError(escrow, "InvalidListingRef");
```

---

## Dikkat Edilmesi Gereken Bağımlılıklar

| Fix | Bağımlı Olduğu | Not |
|-----|----------------|-----|
| ARAF-01 kontrat | ARAF-01 frontend | Frontend fix olmadan kontrat deploy etme — tüm creates kırılır |
| ARAF-02 backend | ARAF-02 frontend | İkisi birlikte deploy edilmeli |
| ARAF-06 backend | ARAF-06 frontend | İkisi birlikte deploy edilmeli |
| ARAF-03 | ARAF-01 | realTradeId sorunu ARAF-01 fix'i ile kısmen azalır |

## Kontrat Yeniden Deploy Notu

ARAF-01 kontrat fix'i mevcut deploy'u kırar (eski ABI).
Adımlar:
1. Yeni kontrat deploy et
2. `VITE_ESCROW_ADDRESS` güncelle
3. Backend `ARAF_ESCROW_ADDRESS` güncelle
4. Redis checkpoint'i yeni deployment block'a ayarla
5. Frontend build et ve deploy et

# 🌀 Araf Protokolü — Araştırma Ufku
## Oracle Problemi, Hakikatin İletimi ve Araf İçin Gerçekten Benzersiz Yönler

> **Amaç:** Bu belge, klasik "özellik listesi" üretmek için değil; Araf Protokolü'nü mevcut P2P escrow piyasasından kategorik olarak ayırabilecek, daha zor, daha derin ve araştırma değeri yüksek yönleri tanımlamak için hazırlanmıştır.

---

## 1. Bu Belgenin Tezi

Araf'ın sıradan bir P2P escrow olarak kalmaması için ihtiyacı olan şey, daha fazla buton, daha fazla UX iyileştirmesi veya daha fazla marketplace filtresi değildir.

Araf'ın gerçek sıçrama alanı şudur:

> **Hakikati dış dünyadan zincire nasıl taşırız?**

Fakat burada kritik ayrım vardır:

- Amaç, oracle'ı bir **hakem** yapmak olmamalıdır.
- Amaç, oracle'ı bir **karar verici** yapmak olmamalıdır.
- Amaç, oracle'ı yalnızca **ekonomik alanı şekillendiren** bir sinyal katmanına dönüştürmek olmalıdır.

Bu nedenle Araf için en güçlü araştırma yönü şu başlık altında toplanır:

# **Oracle Without Verdict**

Yani:
- oracle sonuç belirlemez,
- haklı tarafı ilan etmez,
- fonları tek başına serbest bırakmaz,
- fakat belirsizlik altında **teşvikleri**, **zaman pencerelerini** ve **çürüme eğrilerini** değiştirir.

Bu, mevcut oracle sistemlerinden ve klasik escrow tasarımlarından farklı bir kategori yaratır.

---

## 2. Problemin Kökü: Oracle Problemi Neden Escrow'da Daha Zor?

Blokzinciri literatüründe oracle problemi çoğunlukla fiyat verisi, hava durumu, lojistik olaylar veya spor sonuçları üzerinden tartışılır. Fakat fiat ↔ kripto P2P escrow alanında problem daha zordur.

Çünkü burada doğrulanmak istenen şey çoğu zaman:
- bir banka transferi,
- bir ödeme ekranı,
- bir alıcı adı eşleşmesi,
- bir dekontun gerçekliği,
- bir zaman penceresi içinde fiilen gerçekleşmiş bir off-chain olaydır.

Bu tür olaylar:
- zincir üzerinde yerleşik değildir,
- çoğu zaman herkese açık değildir,
- mahrem veri içerir,
- geri döndürülebilir veya chargeback'e açıktır,
- yerel banka sistemleri arasında standart değildir,
- ve her zaman kriptografik olarak doğrudan doğrulanabilir değildir.

Bu yüzden fiat escrow problemi, klasik fiyat oracle probleminden daha zordur.

Araf'ın farkı da burada kurulabilir:

> Araf, hakikati tam olarak bildiğini iddia etmeden, hakikat sinyallerini ekonomik zorlamaya dönüştüren ilk rail-aware humanless escrow katmanı olabilir.

---

## 3. Literatür ve Piyasa Çizgilerinden Çıkan Dersler

### 3.1. Klasik Oracle Modelleri

Literatürde ve piyasada görülen başlıca hatlar:

1. **Merkezi veri sağlayıcı / tek oracle**
   - hızlıdır,
   - pratiktir,
   - fakat tek hata noktasıdır.

2. **Dağıtık oracle ağları**
   - çoklu düğüm, çoklu veri kaynağı, staking ve aggregation kullanır,
   - fiyat feed'lerinde güçlüdür,
   - fakat öznel escrow uyuşmazlıklarında sınırlıdır.

3. **Optimistic Oracle modelleri**
   - veri varsayılan olarak kabul edilir,
   - itiraz gelirse dispute mekanizması devreye girer,
   - hız / maliyet avantajı sağlar,
   - ancak sonunda yine bir doğrulama/oylama katmanına yaslanır.

4. **Jüri / decentralized justice modelleri**
   - öznel uyuşmazlıkları çözmeye çalışır,
   - fakat insan kararı, latency ve ekonomik koordinasyon maliyeti taşır.

5. **TEE / TLS attestation / cryptographic proof modelleri**
   - veri kaynağından bozulmadan gelmiş olmayı ispatlamaya yaklaşır,
   - ancak kapsama alanı ve entegrasyon karmaşıklığı yüksektir.

6. **ZK / zkVM / computation oracle modelleri**
   - yalnız veriyi değil, veriye dair hesaplamaları da kanıtlar,
   - mahremiyet ve doğrulanabilirlik açısından çok güçlüdür,
   - fakat üretim karmaşıklığı ve maliyeti yüksektir.

### 3.2. Escrow Dünyasının Dersleri

P2P escrow tarafında görülen temel tasarım aileleri:

- **custodial + support arbitration**
- **multisig + insan arabuluculuk**
- **bond-based automated settlement**
- **jury-based escrow**
- **non-custodial ama merkezi dispute yönetimi**

Araf'ın mevcut çizgisi bunların içinde en sert biçimde şu iddiayı taşıyor:

> **Haklı tarafı kimse yorumlamasın; işbirliği etmemenin maliyeti artsın.**

Bu çizgi korunmalı.

---

## 4. Araf İçin Gerçek Araştırma Frontieri

Aşağıdaki başlıklar, mevcut mimarinin üstüne “özellik” olarak değil, yeni bir kategori olarak inşa edilebilecek yönlerdir.

---

# 4.1. Attestation-Weighted Bleeding Escrow

## Fikir
Bleeding Escrow ana çözüm sistemi olarak kalır. Ancak dış dünyadan gelen güçlü kanıtlar, sonucu doğrudan belirlemek yerine **çürüme fiziğini** değiştirir.

Yani:
- güçlü dış kanıt varsa → belirli taraf için beklemenin maliyeti artar,
- kanıt yoksa → klasik bleeding devam eder,
- çelişkili kanıt varsa → iki taraf için de daha sert bir belirsizlik rejimi uygulanır.

## Bu neyi değiştirir?
Araf artık yalnızca “zaman bazlı çürüme” değildir. Şuna dönüşür:

> **kanıt yoğunluğuna duyarlı çürüme sistemi**

## Örnek çalışma mantığı
- `weak_signal` → klasik decay
- `strong_positive_signal_for_taker` → maker bond decay hızlanır
- `strong_positive_signal_for_maker` → taker bond decay hızlanır
- `conflicted_signal` → iki tarafın bond decay'si artar, crypto decay erkene çekilir

## Neden benzersiz?
Çünkü burada oracle:
- release authority değildir,
- adjudicator değildir,
- fakat **uncertainty pricing engine**'in girdisidir.

## Neden zor?
- attestation seviyelerini formel tanımlamak gerekir,
- oyun teorisi yeniden yazılmalıdır,
- kötü niyetli signal injection maliyetleri modellenmelidir,
- kontratta yeni bir "signal-to-decay" matematiği gerekir.

## Araf'a oturuşu
Bu yön, mevcut Bleeding Escrow felsefesini bozmaz. Aksine onu daha sofistike hale getirir.

---

# 4.2. Positive-Proof-Only Oracle Layer

## Fikir
Oracle katmanı yalnızca **pozitif kanıt** üretebilir. Negatif hakikat iddiası üretemez.

Yani oracle şunu diyebilir:
- “ödeme yapıldığına dair güçlü kanıt var”
- “alıcı adı beklenen kalıpla uyumlu”
- “işlem zamanı pencerede”
- “banka arayüzünden doğrulanmış veri elde edildi”

Ama şunu diyemez:
- “ödeme kesinlikle yapılmadı”
- “bu taraf yalancı”
- “fund release edilmelidir”

## Neden çok güçlü?
Çünkü negatif hakikat iddiası genelde:
- veri eksikliği,
- görünmeyen transferler,
- mahremiyet kısıtları,
- bankacılık gecikmeleri,
- yerel sistem farkları
sebebiyle epistemik olarak daha zayıftır.

Araf bu zayıf alanı hüküm vermek için kullanmaz.

## Neden benzersiz?
Çoğu oracle sistemi doğruluk iddiasını çift taraflı kurar:
- doğru / yanlış
- var / yok
- oldu / olmadı

Araf ise yalnızca:
- **pozitif sinyal** kabul eder,
- negatifte hüküm vermez,
- negatif alanı hala ekonomik belirsizlik alanı olarak bırakır.

## Araf'a oturuşu
Bu, "oracle-independent" çizgiyi tamamen bozmaz; onu şu hale getirir:

> **oracle-independent verdict, oracle-assisted incentive shaping**

---

# 4.3. Eşik Attestation + Şahit Şifreleme Mantığı

## Fikir
Belirli bir dış olay hakkında tek bir oracle'a değil, `N-of-M` doğrulayıcı/şahit yapısına dayanılır. Ancak bu sistemde de doğrudan release değil, yalnızca **ekonomik rejim değişimi** olur.

Bu hat, literatürdeki threshold witness encryption ve multi-threshold oracle tasarımlarına yakındır.

## Önerilen yapı
Bir trade için şu kaynaklardan sinyal toplanabilir:
- bank receipt attestation
- TLS-proven session snapshot
- encrypted receipt validation
- name-match assertion
- time-window confirmation

Bu sinyaller bir araya geldiğinde:
- `confidenceScore` üretilir,
- score belirli eşikleri geçerse decay rejimi değişir.

## Örnek
- 1/5 sinyal → bilgi amaçlı, etkisiz
- 3/5 sinyal → maker için challenge maliyeti artar
- 4/5 sinyal → taker lehine auto-release penalty profile değişir
- 5/5 sinyal → burn sonucu asimetrik ekonomik sonuç verebilir

## Neden benzersiz?
Burada eşik imzalar “ödemenin kapısını açan anahtar” değildir.
Bunun yerine:

> **eşik doğrulama, ekonomik zorlamanın seviyesini belirler**

Bu oldukça yeni ve araştırma değeri yüksek bir kombinasyondur.

## Neden zor?
- threshold sinyal ekonomisi kurulmalı,
- collusion maliyeti modellenmeli,
- kötü niyetli attestation spam'i engellenmeli,
- farklı attestation tipleri ortak güven modeline çevrilmelidir.

---

# 4.4. ZK Tabanlı Fiat Event Capsule

## Fikir
Banka ödeme olayı veya ödeme kanıtı, tam ham veri olarak değil; belirli özellikleri ispatlayan bir **mahrem kanıt kapsülü** olarak sisteme sunulur.

Bu kapsül, şunları kanıtlayabilir:
- transferin belirli zaman aralığında yapıldığı
- transfer miktarının trade amount ile uyumlu olduğu
- alıcı adının belirli bir beklenen kimlik kalıbıyla eşleştiği
- dekont referansının bulunduğu
- gönderen/alıcı ilişkisi bakımından çelişki olmadığı

Ama şunları açığa çıkarmaz:
- tam ad
- tam IBAN
- tam dekont içeriği
- ham banka ekranı
- tam işlem açıklaması

## Neden önemli?
Bugünkü escrow dünyasında çoğu sistem iki uç arasında sıkışır:
1. ya ham PII gösterilir
2. ya da hiçbir şey gösterilmez

Araf üçüncü yolu açabilir:

> **raw disclosure yerine proof capsule**

## Neden benzersiz?
Bu durumda Araf, sadece “PII’ı encrypt eden escrow” olmaz. Şuna dönüşür:

> **privacy-preserving fiat proof protocol**

## Neden zor?
- banka verisinin standartlaşmaması,
- TLS/TEE/ZK hattının pahalı ve karmaşık olması,
- prover altyapısının performans gereksinimi,
- UX karmaşıklığı

## Stratejik önem
Bu, uzun vadede Araf'ı sıradan bir P2P trading app değil, **proof-driven settlement layer** haline getirebilir.

---

# 4.5. Confidence Market, Verdict Market Değil

## Fikir
Astraea / Schelling / token-weighted truth voting gibi mekanizmalar, Araf'ta “kim haklı?” sorusu için kullanılmaz. Bunun yerine yalnızca şu soru için kullanılır:

> **Dış kanıtın gücü ne kadar yüksek?**

Katılımcılar bir verdict oylaması değil, bir **confidence classification** üretir.

### Olası çıktı sınıfları
- `LOW_CONFIDENCE`
- `MEDIUM_CONFIDENCE`
- `HIGH_CONFIDENCE`
- `CONFLICTED`

Sonrasında kontrat:
- `HIGH_CONFIDENCE` → belirli decay profile uygular
- `LOW_CONFIDENCE` → standart profile döner
- `CONFLICTED` → iki taraf için de daha agresif uncertainty rejimi uygular

## Neden benzersiz?
Çünkü bu yaklaşım insan veya token sahiplerini “hakem” yapmaz.
Onları yalnızca:

> **belirsizliğin yoğunluğunu ölçen ekonomik sensörler**

haline getirir.

## Neden zor?
- collusion ve bribery analizi gerekir,
- vote sonuçları binary değil ordinaldir,
- confidence sınıflarının kontrata nasıl yansıyacağı dikkatle kurulmalıdır.

## Araf açısından değer
Bu model, Kleros tarzı jury sistemine kaymadan, topluluk tabanlı signal extraction hattı açabilir.

---

# 4.6. AI-Ortaklı Oracle Değil, AI Anomali Güvenlik Duvarı

## Fikir
Yapay zeka asla hakikat kaynağı yapılmaz. Nihai güven kaynağı olmaz. Oracle sonucu vermez. Sadece anomali, sahtecilik, collusion veya sentetik kanıt olasılığı hakkında risk sinyali üretir.

## Yapabilecekleri
- sahte dekont paterni tespiti
- sentetik görsel / template reuse tespiti
- sıra dışı challenge davranışları
- aynı cihaz / aynı pattern / aynı ödeme zinciri kümeleri
- rail bazlı şüpheli davranış segmentasyonu
- name mismatch cluster analizi

## Yapamayacakları
- fon release kararı
- haklı taraf kararı
- tek başına ban kararı
- mahkeme benzeri hüküm

## Neden önemli?
Literatür doğru biçimde uyarıyor: AI deterministik değildir, halüsinasyon riski taşır ve veri zehirlenmesine açıktır. Bu yüzden Araf'ta AI yalnızca **risk hardening trigger** olarak kullanılmalıdır.

## Çıktısı ne olur?
- required bond artışı
- cooldown uzaması
- listing visibility düşmesi
- high-risk trade sınıfına geçiş
- stronger proof requirement

## Benzersizliği
Bu, "AI escrow" değil; **AI-assisted anti-fraud hardening** olur.

---

## 5. Araf'ı Gerçekten Ayırabilecek Birleşik Model

Yukarıdaki yönlerin birleşiminden şu mimari çıkar:

# **Araf = Oracle-Free Verdict Layer + Oracle-Shaped Economic Layer**

Yani iki katmanlı bir sistem:

### Katman 1 — Verdict-Free Base Layer
- Bleeding Escrow
- non-custodial settlement
- humanless dispute flow
- deterministic finalization

### Katman 2 — Proof & Signal Layer
- positive-only attestations
- threshold confidence aggregation
- zk/TLS/TEE proof capsules
- anomaly filtering
- confidence-weighted decay modulation

Bu kombinasyon, Araf'ı şu kategoriye taşıyabilir:

> **Proof-sensitive, verdict-free fiat escrow**

Bu oldukça benzersizdir.

---

## 6. Hangi Yöne Gidilmemeli?

Aşağıdaki yönler Araf'ı farklılaştırmaz; tersine kimliğini bulanıklaştırır:

### 6.1. Oracle'ın doğrudan release authority olması
Bu Araf'ı trust-minimized çizgiden çıkarır.

### 6.2. İnsan jüri / moderasyon eklemek
Bu, Araf'ı kendi felsefi çekirdeğinden uzaklaştırır.

### 6.3. Generic KYC + support arbitration
Bu, seni büyük merkezi P2P platformların zayıf bir kopyasına dönüştürür.

### 6.4. Oracle'ın negatif hakikat iddiası üretmesi
“ödeme yapılmadı” türü kararlar çoğu durumda epistemik olarak zayıftır.

### 6.5. AI'ı final truth engine yapmak
Bu teknik olarak da felsefi olarak da tehlikelidir.

---

## 7. Araştırma Önceliklendirmesi

Aşağıda, bu frontier yönlerin Araf açısından önceliklendirilmiş hali yer alır.

| Öncelik | Araştırma Yönü | Yenilik Gücü | Teknik Zorluk | Araf Kimliğiyle Uyum |
|---|---|---:|---:|---:|
| 1 | Attestation-Weighted Bleeding Escrow | Çok yüksek | Yüksek | Çok yüksek |
| 2 | Positive-Proof-Only Oracle Layer | Çok yüksek | Orta/Yüksek | Çok yüksek |
| 3 | ZK Fiat Event Capsule | Çok yüksek | Çok yüksek | Yüksek |
| 4 | Threshold Confidence Oracle | Yüksek | Yüksek | Yüksek |
| 5 | AI Anomali Güvenlik Duvarı | Orta/Yüksek | Orta | Yüksek |
| 6 | Full Verdict Oracle | Düşük | Yüksek | Düşük |

---

## 8. Tavsiye Edilen Aşamalı Yol Haritası

### Faz A — Teorik Modelleme
Amaç: Henüz protokole bir oracle eklemeden önce ekonomik kuralları ve epistemik sınırları tanımlamak.

Çıktılar:
- signal sınıfları
- confidence seviyeleri
- decay modulation fonksiyonları
- false positive / false negative maliyet modeli
- attack surface haritası

### Faz B — Positive Signal Primitive
Amaç: Oracle'ın yalnızca pozitif sinyal verebildiği minimum model.

Çıktılar:
- `positiveSignal(tradeId, signalType, confidenceClass)` primitive'i
- kontratta yalnızca zaman / bond etkisi
- release authority yok

### Faz C — Multi-Source Attestation
Amaç: Tek oracle yerine attestation eşik modeli.

Çıktılar:
- threshold signal seti
- conflicting signal mantığı
- collusion maliyet hesapları

### Faz D — Proof Capsule Araştırması
Amaç: ZK / TLS / TEE kombinasyonlarının gerçekçi fizibilitesini test etmek.

Çıktılar:
- proof capsule veri modeli
- hangi bankacılık yüzeylerinde mümkün olduğu
- prover performans sınırları

### Faz E — Production Hardening
Amaç: anomaly filtering, rail-specific heuristics, confidence scoring ve storage policy.

---

## 9. Araf İçin En Güçlü Yeni Ürün Cümlesi

Bugün Araf şu şekilde anlatılıyor:
- non-custodial
- humanless
- oracle-independent

Bu güçlüdür ama frontier anlatısı için yeterli değildir.

Aşağıdaki yeni ürün dili çok daha ayırt edici olur:

### Türkçe
> **Araf, oracle'ı hakem olarak değil, ekonomik alanı şekillendiren bir sinyal katmanı olarak kullanan hakemsiz escrow mimarisidir.**

### İngilizce
> **Araf is a verdict-free escrow architecture where external proof never decides the outcome, but can reshape the economics of non-cooperation.**

Bu, gerçekten yeni bir kategori tarif eder.

---

## 10. Sonuç

Bu belgeye göre Araf'ın geleceği şurada yatıyor:

- daha fazla moderasyon eklemekte değil,
- daha fazla klasik oracle feed bağlamakta değil,
- haklı tarafı seçen bir jüri tasarlamakta değil,
- mutlak doğruluk iddiasında bulunmakta değil.

Araf'ın gerçek frontier'i şudur:

> **Hakikati kesin olarak ilan etmeden, hakikate dair güçlü sinyalleri ekonomik baskıya çevirmek.**

Bu nedenle Araf'ın en güçlü araştırma yönü:

# **Oracle Without Verdict + Attestation-Weighted Bleeding Escrow**

Bu yön başarıyla geliştirilirse, Araf yalnızca bir escrow protokolü olmaz.
Şuna dönüşür:

> **belirsizlik altında hakikati fiyatlayan, mahremiyeti koruyan, kararsız ama zorlayıcı bir settlement altyapısı**

ve bu, gerçekten yeni bir kategori olur.

---

## 11. Sonraki Çalışma İçin Önerilen Daraltılmış 3 Konu

Eğer bu frontier içinden yalnızca üç konu seçilecekse, önerilen daraltma şu olmalıdır:

1. **Attestation-Weighted Bleeding Escrow**
2. **Positive-Proof-Only Oracle Layer**
3. **ZK Fiat Event Capsule**

Bu üçlü, hem akademik olarak güçlüdür hem de Araf'ı piyasa kopyalarından net biçimde ayırır.

---

## 12. Belge Notu

Bu belge, Araf'ın mevcut kanonik mimarisi ile oracle/escrow literatüründe öne çıkan hatların sentezi olarak hazırlanmıştır. Nihai amaç, kısa vadeli özellik eklemek değil; Araf için uzun vadeli, zor ve yüksek ayırt ediciliğe sahip araştırma yönlerini tanımlamaktır.

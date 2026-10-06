# Yapılacaklar

## Ertelenen ping/itibar iyileştirmeleri (ürün sahibi kararıyla sonraya bırakıldı)

Aşağıdakiler K2(B) "ping düşer" kuralı sonrasında bilinçli olarak ertelenmiştir. Her madde: sorun, öneri, kapattığı suistimal.

1. **Tier 0'da bond sıfır.**
   Sorun: Tier 0'da teminat 0 olduğundan emir dondurma sıfır maliyetlidir.
   Öneri: Tier 0 bond > 0 yapılsın ya da tier 0 tutarına ~50 USDT tavan konsun.
   Kapattığı suistimal: Bedava emir dondurma, sahte dekont ve şantaj.

2. **Tier yükselmesi işlem sayısına bağlı.**
   Sorun: 200 × 20 USDT ≈ 6 USDT maliyetle tier 4'e çıkılabiliyor; bond %1'e düşüyor, büyük tutarlı şantaj ucuzlaşıyor.
   Öneri: Tier/tutar sınırı temiz serbest bırakma hacmine bağlansın (ör. emir ≤ 2× temiz hacim).
   Kapattığı suistimal: Küçük işlemlerle itibar şişirip büyük tutarda düşük teminatla şantaj.

3. **Kısmi uzlaşma başarı sayısını artırıyor; risk puanı ucuzca sıfırlanabiliyor.**
   Sorun: Birkaç ucuz temiz işlem risk puanını sıfırlıyor; uzlaşma sonucu itibar kazandırıyor.
   Öneri: Uyuşmazlık sonucu itibar kazandırmasın; risk puanı son negatif olaydan 30 gün geçmeden düşmesin.
   Kapattığı suistimal: Uyuşmazlık çıkarıp itibar kazanma ve geçmişi hızlı temizleme.

4. **Düşen ping cezasız; cezalar mağdura değil hazineye gidiyor.**
   Sorun: Düşen ping maker'a +48 saat bedava fren sağlıyor. Dürüst taker autoRelease'te kendi bond'undan %2 ödüyor.
   Öneri: Düşmüş ping sonrası release temiz sayılmasın; cezalar mağdura ödensin; dürüst taker'dan autoRelease cezası kesilmesin.
   Kapattığı suistimal: Ping atıp susarak karşı tarafı bekletme; dürüst tarafın cezalandırılması.

5. **Dürüst maker iki 24 saatlik pencerede de çevrimiçi olmak zorunda.**
   Sorun: Ping'in 24. saatinde açılan ve 48. saatte kapanan pencereyi kaçıran dürüst maker ping'ini kaybeder.
   Öneri: İsteğe bağlı "otomatik challenge" bayrağı ya da MAKER_CHALLENGE_WINDOW 48 saat.
   Kapattığı suistimal: Maker'ın çevrimdışılığı yüzünden istemeden hak kaybı (dürüst kullanıcı yükü).

6. **Anlaşmazlıkta yalancının riski yalnız kendi bond'u.**
   Sorun: Fiatı alan maker'ın challenge'ı ve uzlaşma şantajı kök sorundur; yalancı yalnız kendi bond'unu riske atıyor.
   Öneri: Kök çözüm yok; madde 1-3 ile hafifletilir.
   Kapattığı suistimal: Fiatı alıp challenge açarak uzlaşma şantajı yapma.

7. **Karar notu: yakılan/eriyen tutarlar hazineye gidiyor.**
   Sorun: Protokol uyuşmazlıktan gelir elde ediyor; bu bilinçli bir tercih mi, açık bir karar gerekiyor.
   Öneri: Ürün sahibi kararı alınsın ve belgelensin (alternatif: mağdura ödeme, madde 4).
   Kapattığı suistimal: Teşvik çatışması algısı (uyuşmazlıktan kâr eden protokol).

8. **240. saatte burnExpired herkese açıkken geç gelen uzlaşma kabulü.**
   Sorun: Süre dolduğunda herkes burnExpired çağırabilir; son anda gelen uzlaşma kabulü yarışta yenilebilir.
   Öneri: burnExpired öncesine kısa bir koruma/ek süre ya da bekleyen kabulün önceliği tanımlansın.
   Kapattığı suistimal: Uzlaşma kabulünün hemen öncesinde yakımı tetikleyerek uzlaşmayı bozma.

9. **Profil kilidi Trade aynasına bakıyor.**
   Sorun: Zincirde kilitlenip aynaya yazılmadan önceki kısa pencerede profil yazılabilir (snapshot ilk yakalamayla sabit; düşük risk).
   Öneri: Kilit kontrolünü zincirdeki işlem durumuna da bağla ya da aynalama gecikmesini kapat.
   Kapattığı suistimal: Kilit anında ödeme profilini değiştirerek snapshot'ı etkileme.

// [TR] Açılış bekçisi: ana paket yüklenemez/donarsa (eski deploy, ağ kesintisi) beyaz ekran yerine "yenile" gösterir.
// [EN] Boot watchdog: if the main bundle fails or hangs, show a reload prompt instead of a white screen.
(function () {
  setTimeout(function () {
    var r = document.getElementById('root');
    if (!r || r.childElementCount !== 0) return;
    var b = document.createElement('div');
    b.setAttribute('role', 'alert');
    b.style.cssText = 'padding:2rem;font-family:sans-serif;text-align:center';
    var p = document.createElement('p');
    p.textContent = 'Uygulama yüklenemedi; bağlantınızı kontrol edip yenileyin. / The app failed to load; check your connection and reload.';
    var k = document.createElement('button');
    k.type = 'button';
    k.textContent = 'Yeniden yükle / Reload';
    k.onclick = function () { window.location.reload(); };
    b.appendChild(p);
    b.appendChild(k);
    r.appendChild(b);
  }, 10000);
})();

import React, { useState } from 'react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [showMakerModal, setShowMakerModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tradeState, setTradeState] = useState('LOCKED');
  const [filterTier1, setFilterTier1] = useState(false);
  const [searchAmount, setSearchAmount] = useState('');

  // YENİ: Profil sekme state'i
  const [profileTab, setProfileTab] = useState('ayarlar');

  // YENİ: Kullanıcı banka bilgileri state'leri
  const [bankOwner, setBankOwner] = useState('');
  const [bankIBAN, setBankIBAN] = useState('');

  // YENİ: Aktif işlem verisi (satıcı bilgileri)
  const [activeTrade, setActiveTrade] = useState(null);

  // DEĞİŞTİ: mockOrders artık state — silme işlemi hem profil hem pazar yerini etkiler
  const [orders, setOrders] = useState([
    { id: 1, maker: "0x7F...3bA", crypto: "USDT", fiat: "TRY", rate: "33.50", min: 500,  max: 2500,  tier: 1, bond: "0%",  successRate: 100, txCount: 12 },
    { id: 2, maker: "0x1A...9cK", crypto: "USDC", fiat: "TRY", rate: "33.45", min: 1000, max: 15000, tier: 2, bond: "8%",  successRate: 97,  txCount: 34 },
    { id: 3, maker: "0x9D...4fE", crypto: "ETH",  fiat: "USD", rate: "3100.00", min: 500, max: 5000, tier: 3, bond: "6%",  successRate: 88,  txCount: 9  },
    { id: 4, maker: "0x4B...2yZ", crypto: "USDT", fiat: "TRY", rate: "33.42", min: 1500, max: 8000,  tier: 1, bond: "0%",  successRate: 100, txCount: 21 },
  ]);

  // ARAMA VE FİLTRELEME ALGORİTMASI
  const filteredOrders = orders.filter(order => {
    const amountMatch = searchAmount === '' || (Number(searchAmount) >= order.min && Number(searchAmount) <= order.max);
    const tierMatch = filterTier1 ? order.tier === 1 : true;
    return amountMatch && tierMatch;
  });

  // YENİ: Satın Al butonuna basıldığında tetiklenir
  const handleStartTrade = (order) => {
    setActiveTrade(order);
    setTradeState('LOCKED');
    setCurrentView('tradeRoom');
  };

  // Inline onay için hangi ilanın "silme modunda" olduğunu tutar
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Toast bildirimi state'i
  const [toast, setToast] = useState(null); // { message, type }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // İlan silme — önce inline onay, sonra gerçek silme + toast
  const handleDeleteOrder = (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    setConfirmDeleteId(null);
    showToast('İlan başarıyla silindi ve pazar yerinden kaldırıldı.');
  };

  // ==========================================
  // 1. KULLANICI PROFİL MODALI — SEKMELİ
  // ==========================================
  const renderProfileModal = () => {
    if (!showProfileModal) return null;

    // Kullanıcının kendi ilanları (gerçekte kullanıcı ID'sine göre filtre yapılır)
    const myOrders = orders.filter(o => o.maker === "0x4B...2yZ");

    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">

          {/* Modal Başlık */}
          <div className="flex justify-between items-center p-6 border-b border-slate-700 shrink-0">
            <h2 className="text-2xl font-bold text-white">Profil & Ayarlar</h2>
            <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>

          {/* Sekmeler */}
          <div className="flex border-b border-slate-700 shrink-0">
            {['ayarlar', 'ilanlarim', 'gecmis'].map(tab => (
              <button
                key={tab}
                onClick={() => setProfileTab(tab)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition ${
                  profileTab === tab
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'ayarlar' ? 'Ayarlar' : tab === 'ilanlarim' ? 'İlanlarım' : 'Geçmiş'}
              </button>
            ))}
          </div>

          {/* Sekme İçerikleri */}
          <div className="overflow-y-auto p-6 flex-1">

            {/* AYARLAR SEKMESİ */}
            {profileTab === 'ayarlar' && (
              <div className="space-y-4 text-sm">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                  <span className="text-slate-400">Cüzdan:</span>
                  <span className="font-mono text-emerald-400">0x3A...8bF</span>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                  <span className="text-slate-400">Araf Puanı:</span>
                  <span className="font-bold text-white">🛡️ %100 Başarı (12 İşlem)</span>
                </div>

                {/* YENİ: Banka Hesap Sahibi Alanı */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                  <label className="block text-slate-400 mb-2">Banka Hesap Sahibi</label>
                  <input
                    type="text"
                    value={bankOwner}
                    onChange={e => setBankOwner(e.target.value)}
                    placeholder="Ad Soyad"
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 outline-none"
                  />
                </div>

                {/* IBAN Alanı */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                  <label className="block text-slate-400 mb-2">Kayıtlı IBAN Bilgisi</label>
                  <input
                    type="text"
                    value={bankIBAN}
                    onChange={e => setBankIBAN(e.target.value)}
                    placeholder="TR00 0000..."
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 outline-none"
                  />
                </div>

                <button className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold transition mt-2">
                  Bilgileri Güncelle
                </button>
              </div>
            )}

            {/* İLANLARIM SEKMESİ */}
            {profileTab === 'ilanlarim' && (
              <div className="space-y-3">
                {myOrders.length === 0 ? (
                  <p className="text-slate-500 text-center py-8 text-sm">Aktif ilanınız bulunmuyor.</p>
                ) : (
                  myOrders.map(order => (
                    <div
                      key={order.id}
                      className={`bg-slate-900 border rounded-xl p-4 transition-all duration-200 ${
                        confirmDeleteId === order.id ? 'border-red-500/60 bg-red-950/20' : 'border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-white text-sm">{order.crypto} → {order.fiat}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{order.rate} {order.fiat} · {order.min}–{order.max}</p>
                        </div>
                        {confirmDeleteId !== order.id && (
                          <button
                            onClick={() => setConfirmDeleteId(order.id)}
                            className="text-xs text-red-400 border border-red-500/40 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition font-medium"
                          >
                            Sil
                          </button>
                        )}
                      </div>
                      {confirmDeleteId === order.id && (
                        <div className="mt-3 pt-3 border-t border-red-500/20">
                          <p className="text-xs text-red-400 mb-3">⚠️ Bu ilan pazar yerinden de kaldırılacak. Emin misin?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="flex-1 bg-red-500 hover:bg-red-400 text-white text-xs font-bold py-2 rounded-lg transition"
                            >
                              Onayla
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-2 rounded-lg transition"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <p className="text-xs text-slate-500 text-center pt-2">
                  İlan silindikten sonra pazar yerinden de kaldırılır.
                </p>
              </div>
            )}

            {/* GEÇMİŞ SEKMESİ */}
            {profileTab === 'gecmis' && (
              <div className="space-y-3 text-sm">
                {[
                  { id: 'TX-001', date: '01.03.2026', amount: '1.000 TRY', crypto: '29.85 USDT', status: 'Tamamlandı' },
                  { id: 'TX-002', date: '15.02.2026', amount: '500 TRY',  crypto: '14.92 USDT', status: 'Tamamlandı' },
                  { id: 'TX-003', date: '02.02.2026', amount: '2.500 TRY', crypto: '74.55 USDT', status: 'İptal'       },
                ].map(tx => (
                  <div key={tx.id} className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-mono text-xs text-slate-400">{tx.id} · {tx.date}</p>
                      <p className="text-white font-medium mt-0.5">{tx.amount} → {tx.crypto}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-md font-bold ${
                      tx.status === 'Tamamlandı'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>{tx.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // 2. İLAN AÇMA MODALI (MAKER FLOW)
  // ==========================================
  const renderMakerModal = () => {
    if (!showMakerModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Yeni İlan Aç</h2>
            <button onClick={() => setShowMakerModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
          </div>

          <div className="space-y-4">
            <div className="flex space-x-2">
              <div className="w-1/2">
                <label className="block text-xs text-slate-400 mb-1">Satılacak Kripto</label>
                {/* YENİ: BTC, SOL, AVAX eklendi */}
                <select className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none">
                  <option>USDT</option>
                  <option>USDC</option>
                  <option>ETH</option>
                  <option>BTC</option>
                  <option>SOL</option>
                  <option>AVAX</option>
                </select>
              </div>
              <div className="w-1/2">
                <label className="block text-xs text-slate-400 mb-1">İstenecek İtibari Para</label>
                <select className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none">
                  <option>TRY</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Satılacak Miktar</label>
              <input type="number" placeholder="Örn: 1000" className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kur Fiyatı</label>
              <input type="number" placeholder="Örn: 33.50" className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none" />
            </div>
            <div className="flex space-x-2">
              <div className="w-1/2">
                <label className="block text-xs text-slate-400 mb-1">Min. Limit</label>
                <input type="number" placeholder="500" className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none" />
              </div>
              <div className="w-1/2">
                <label className="block text-xs text-slate-400 mb-1">Max. Limit</label>
                <input type="number" placeholder="2500" className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none" />
              </div>
            </div>

            <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
              <p className="text-xs text-emerald-400 mb-2 font-medium">🛡️ Tier 2 Kuralları Geçerlidir</p>
              <div className="flex justify-between text-xs text-slate-300 mb-1"><span>Satıcı Teminatı (%15):</span> <span>150 Kripto</span></div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-emerald-500/30 pt-2">
                <span>Toplam Kilitlenecek:</span> <span>1150 Kripto</span>
              </div>
            </div>

            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold mt-2 shadow-lg shadow-emerald-900/20">
              Varlığı ve Teminatı Kilitle
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // 3. PAZAR YERİ EKRANI (DASHBOARD)
  // ==========================================
  const renderDashboard = () => (
    <main className="max-w-6xl mx-auto p-4 md:p-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Pazar Yeri</h1>
          <p className="text-sm text-slate-400">Merkeziyetsiz, hakemsiz P2P takas tahtası.</p>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <input
            type="number"
            value={searchAmount}
            onChange={(e) => setSearchAmount(e.target.value)}
            placeholder="Tutar Ara..."
            className="w-full md:w-48 bg-slate-800 text-white px-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => setFilterTier1(!filterTier1)}
            className={`whitespace-nowrap px-4 py-2 rounded-xl font-medium transition text-sm ${filterTier1 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
            %0 Teminat
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-slate-800/50 rounded-2xl border border-slate-700 shadow-xl">
        <table className="w-full text-left border-collapse min-w-[620px]">
          <thead>
            <tr className="border-b border-slate-700 text-xs tracking-wider text-slate-400 uppercase">
              <th className="p-4 font-medium">Satıcı</th>
              <th className="p-4 font-medium">Kur</th>
              <th className="p-4 font-medium">Limit</th>
              <th className="p-4 font-medium">Bond</th>
              <th className="p-4 font-medium text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-700/30 transition">
                  <td className="p-4">
                    {/* YENİ: Güven Endeksi — başarı puanı + parşömen ikonu */}
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs border border-slate-600 shrink-0">🛡️</div>
                      <div>
                        <span className="font-mono text-emerald-400 text-sm">{order.maker}</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className={`text-xs font-medium ${order.successRate === 100 ? 'text-emerald-400' : order.successRate >= 90 ? 'text-yellow-400' : 'text-orange-400'}`}>
                            %{order.successRate} Başarı
                          </span>
                          <span className="text-slate-600">·</span>
                          <span
                            title={`${order.txCount} işlem geçmişi`}
                            className="text-slate-400 hover:text-slate-200 cursor-help text-xs"
                          >
                            📜 {order.txCount} tx
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-base">{order.rate} {order.fiat}</div>
                    <div className="text-xs text-slate-500">1 {order.crypto}</div>
                  </td>
                  <td className="p-4 text-slate-300 text-sm">{order.min} - {order.max} {order.fiat}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${order.tier === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                      {order.bond}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {/* YENİ: handleStartTrade çağrısı */}
                    <button
                      onClick={() => handleStartTrade(order)}
                      className="bg-slate-100 text-slate-900 hover:bg-white px-4 py-2 rounded-lg font-bold transition text-sm shadow-lg"
                    >
                      Satın Al
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="p-8 text-center text-slate-500">Bu tutara uygun ilan bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setShowMakerModal(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 rounded-full flex items-center justify-center text-white text-3xl shadow-emerald-600/50 shadow-lg z-30"
      >
        +
      </button>
    </main>
  );

  // ==========================================
  // 4. İŞLEM VE ARAF ODASI (TRADE ROOM)
  // ==========================================
  const renderTradeRoom = () => {
    const isChallenged = tradeState === 'CHALLENGED';
    const bgTheme = isChallenged ? 'bg-red-950/20' : 'bg-slate-900';
    const borderTheme = isChallenged ? 'border-red-900/50' : 'border-slate-800';

    // YENİ: Kullanıcının banka bilgilerini göster (profil'den çekilir)
    const displayIBAN = bankIBAN || 'TR12 3456 7890 1234 5678 90';
    const displayOwner = bankOwner || 'Ad Soyad (Profil\'den Güncelle)';

    return (
      <main className={`max-w-6xl mx-auto p-4 md:p-6 mt-4 transition-colors duration-500 ${bgTheme} pb-24`}>

        <div className="mb-4 p-2 bg-slate-800 rounded-xl border border-slate-700 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-slate-400 font-mono">UX Test:</span>
          <button onClick={() => setTradeState('LOCKED')} className={`px-2 py-1 rounded ${tradeState === 'LOCKED' ? 'bg-blue-600 text-white' : 'bg-slate-700'}`}>LOCKED</button>
          <button onClick={() => setTradeState('PAID')} className={`px-2 py-1 rounded ${tradeState === 'PAID' ? 'bg-emerald-600 text-white' : 'bg-slate-700'}`}>PAID</button>
          <button onClick={() => setTradeState('CHALLENGED')} className={`px-2 py-1 rounded ${tradeState === 'CHALLENGED' ? 'bg-red-600 text-white' : 'bg-slate-700'}`}>ARAF</button>
        </div>

        <button onClick={() => setCurrentView('dashboard')} className="text-slate-400 hover:text-white mb-4 flex items-center text-sm font-medium">
          ← Geri Dön
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`bg-slate-800/80 p-5 rounded-2xl border ${borderTheme} shadow-xl`}>
            <h3 className="text-lg font-bold mb-4 text-white">İşlem Detayları</h3>
            <div className="space-y-3 text-sm">

              {/* YENİ: Satıcı bilgileri activeTrade'den okunuyor */}
              {activeTrade && (
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                  <p className="text-slate-400 mb-1">Satıcı</p>
                  <p className="font-mono text-emerald-400 text-sm">{activeTrade.maker}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{activeTrade.crypto} → {activeTrade.fiat} @ {activeTrade.rate}</p>
                </div>
              )}

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Gönderilecek Tutar</p>
                <p className="text-xl font-bold text-white">33.500,00 TRY</p>
              </div>

              {/* YENİ: Kullanıcının kendi banka bilgileri gösteriliyor */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Hesap Sahibi</p>
                <p className={`font-medium text-sm ${bankOwner ? 'text-white' : 'text-slate-500 italic'}`}>
                  {displayOwner}
                </p>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Ödeme IBAN'ı</p>
                <p className={`font-mono break-all text-xs sm:text-sm ${bankIBAN ? 'text-emerald-400' : 'text-slate-500 italic'}`}>
                  {displayIBAN}
                </p>
                {!bankIBAN && (
                  <button
                    onClick={() => { setShowProfileModal(true); setProfileTab('ayarlar'); }}
                    className="mt-2 text-xs text-emerald-400 underline"
                  >
                    Profilde güncelle →
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={`col-span-1 lg:col-span-2 bg-slate-800/80 p-5 rounded-2xl border ${borderTheme} shadow-xl flex flex-col justify-center`}>

            {tradeState === 'LOCKED' && (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔒</div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Kripto Kilitlendi</h2>
                <p className="text-slate-400 mb-6 text-sm px-2">Lütfen banka uygulamanızdan transferi gerçekleştirin.</p>
                <button className="bg-blue-600 hover:bg-blue-500 text-white w-full sm:w-auto px-8 py-3 rounded-xl font-bold">Ödemeyi Yaptım</button>
              </div>
            )}

            {tradeState === 'PAID' && (
              <div className="text-center py-4">
                <h2 className="text-lg md:text-xl font-bold text-emerald-400 mb-2">Ödeme Bildirildi</h2>
                <div className="w-full max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-6">
                  <p className="text-xs text-slate-500 mb-1 uppercase font-bold">Kalan Süre</p>
                  <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider break-all">47:59:12</div>
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold">Serbest Bırak</button>
                  <button className="w-full sm:w-auto bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-bold">İtiraz Et</button>
                </div>
              </div>
            )}

            {tradeState === 'CHALLENGED' && (
              <div className="text-center py-2">
                <div className="w-14 h-14 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl animate-pulse">⚠️</div>
                <h2 className="text-2xl md:text-3xl font-bold text-red-500 mb-2">ARAF FAZI</h2>
                <div className="w-full bg-red-950/40 border border-red-900/50 rounded-2xl p-4 mb-6">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-red-400 font-bold">Eriyen Kasa</span>
                    <span className="text-white font-mono">-%10</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-3 mb-2 overflow-hidden border border-red-900/30">
                    <div className="bg-gradient-to-r from-red-600 to-orange-500 h-3 rounded-full" style={{ width: '10%' }}></div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button className="w-full bg-slate-800 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500 hover:text-white p-3 rounded-xl font-bold text-sm">🤝 Karşılıklı Onay</button>
                  <button className="w-full bg-slate-800 border border-orange-500/50 text-orange-400 hover:bg-orange-500 hover:text-white p-3 rounded-xl font-bold text-sm">↩️ Karşılıklı İptal</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  };

  // ==========================================
  // ANA YAPI (ROUTER)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">

      {/* GLOBAL NAVBAR */}
      <nav className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
          <div className="w-8 h-8 rounded bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold">A</div>
          <span className="text-lg font-bold tracking-widest hidden sm:block">ARAF</span>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={() => setShowMakerModal(true)} className="hidden md:block text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-medium">
            + İlan Aç
          </button>
          <button onClick={() => setShowProfileModal(true)} className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-sm hover:bg-slate-700 transition">
            👤
          </button>
          <button className="bg-slate-100 text-slate-900 px-3 py-1.5 rounded-lg font-bold text-sm">
            0x3A...8bF
          </button>
        </div>
      </nav>

      {/* GLOBAL TOAST BİLDİRİMİ */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-bounce-in">
          <div className="flex items-center gap-3 bg-emerald-600 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl shadow-emerald-900/40 border border-emerald-500">
            <span className="text-base">✓</span>
            {toast.message}
          </div>
        </div>
      )}

      {renderProfileModal()}
      {renderMakerModal()}
      {currentView === 'dashboard' ? renderDashboard() : renderTradeRoom()}

    </div>
  );
}

export default App;

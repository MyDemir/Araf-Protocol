import React, { useState } from 'react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [showMakerModal, setShowMakerModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // --- MİMARİ TEST STATE'LERİ (UX PANELİ İÇİN) ---
  const [tradeState, setTradeState] = useState('LOCKED');
  const [userRole, setUserRole] = useState('taker'); // 'maker' veya 'taker'
  const [isBanned, setIsBanned] = useState(false);
  const [cancelStatus, setCancelStatus] = useState(null);

  const [filterTier1, setFilterTier1] = useState(false);
  const [searchAmount, setSearchAmount] = useState('');
  const [profileTab, setProfileTab] = useState('ayarlar');
  const [bankOwner, setBankOwner] = useState('');
  const [bankIBAN, setBankIBAN] = useState('');
  const [activeTrade, setActiveTrade] = useState(null);

  const [orders, setOrders] = useState([
    { id: 1, maker: "0x7F...3bA", crypto: "USDT", fiat: "TRY", rate: "33.50", min: 500,  max: 2500,  tier: 1, bond: "0%",  successRate: 100, txCount: 12 },
    { id: 2, maker: "0x1A...9cK", crypto: "USDC", fiat: "TRY", rate: "33.45", min: 1000, max: 15000, tier: 2, bond: "8%",  successRate: 97,  txCount: 34 },
    { id: 3, maker: "0x9D...4fE", crypto: "ETH",  fiat: "USD", rate: "3100.00", min: 500, max: 5000, tier: 3, bond: "6%",  successRate: 88,  txCount: 9  },
    { id: 4, maker: "0x4B...2yZ", crypto: "USDT", fiat: "TRY", rate: "33.42", min: 1500, max: 8000,  tier: 1, bond: "0%",  successRate: 100, txCount: 21 },
  ]);

  const filteredOrders = orders.filter(order => {
    const amountMatch = searchAmount === '' || (Number(searchAmount) >= order.min && Number(searchAmount) <= order.max);
    const tierMatch = filterTier1 ? order.tier === 1 : true;
    return amountMatch && tierMatch;
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleStartTrade = (order) => {
    if (isBanned) {
      showToast('🚫 30 Günlük Alım (Taker) kısıtlamanız bulunmaktadır. Sadece Maker olarak ilan açabilirsiniz.', 'error');
      return;
    }
    setActiveTrade(order);
    setTradeState('LOCKED');
    setCancelStatus(null);
    setCurrentView('tradeRoom');
  };

  const handleDeleteOrder = (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    setConfirmDeleteId(null);
    showToast('İlan başarıyla silindi ve pazar yerinden kaldırıldı.');
  };

  const handleProposeCancel = () => {
    setCancelStatus('proposed_by_me');
    showToast('Karşı tarafa iptal teklifi gönderildi. Onay bekleniyor...', 'info');
  };

  // ==========================================
  // 1. KULLANICI PROFİL MODALI
  // ==========================================
  const renderProfileModal = () => {
    if (!showProfileModal) return null;
    const myOrders = orders.filter(o => o.maker === "0x4B...2yZ");

    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center p-6 border-b border-slate-700 shrink-0">
            <h2 className="text-2xl font-bold text-white">Profil & Ayarlar</h2>
            <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>

          <div className="flex border-b border-slate-700 shrink-0">
            {['ayarlar', 'ilanlarim', 'gecmis'].map(tab => (
              <button key={tab} onClick={() => setProfileTab(tab)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition ${profileTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-white'}`}>
                {tab === 'ayarlar' ? 'Ayarlar' : tab === 'ilanlarim' ? 'İlanlarım' : 'Geçmiş'}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto p-6 flex-1">
            {profileTab === 'ayarlar' && (
              <div className="space-y-4 text-sm">
                
                {isBanned && (
                  <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl flex items-start space-x-3">
                    <span className="text-2xl">🚫</span>
                    <div>
                      <p className="font-bold text-red-400">30 Günlük İşlem Kısıtlaması</p>
                      <p className="text-red-300/80 text-xs mt-1">Son işlemlerinizdeki uyuşmazlıklar nedeniyle 14 Gün 05 Saat boyunca Alıcı (Taker) olarak işlem yapamazsınız.</p>
                    </div>
                  </div>
                )}

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                  <span className="text-slate-400">Cüzdan:</span>
                  <span className="font-mono text-emerald-400">0x3A...8bF</span>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                  <span className="text-slate-400">Araf Puanı:</span>
                  <span className="font-bold text-white">🛡️ %100 Başarı (12 İşlem)</span>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                  <label className="block text-slate-400 mb-2">Banka Hesap Sahibi</label>
                  <input type="text" value={bankOwner} onChange={e => setBankOwner(e.target.value)} placeholder="Ad Soyad"
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 outline-none" />
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                  <label className="block text-slate-400 mb-2">Kayıtlı IBAN Bilgisi</label>
                  <input type="text" value={bankIBAN} onChange={e => setBankIBAN(e.target.value)} placeholder="TR00 0000..."
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 outline-none" />
                </div>

                <button className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold transition mt-2">
                  Bilgileri Güncelle
                </button>
              </div>
            )}
            {profileTab === 'ilanlarim' && <p className="text-slate-500 text-center py-8 text-sm">Test ortamı ilanları...</p>}
            {profileTab === 'gecmis' && <p className="text-slate-500 text-center py-8 text-sm">Geçmiş işlemler...</p>}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // 2. PAZAR YERİ EKRANI (DASHBOARD)
  // ==========================================
  const renderDashboard = () => (
    <main className="max-w-6xl mx-auto p-4 md:p-6 pb-24">
      
      <div className="mb-8 p-3 bg-slate-800 rounded-xl border border-purple-500/50 flex flex-wrap gap-4 items-center text-sm shadow-lg shadow-purple-900/20">
        <span className="text-purple-400 font-bold tracking-widest uppercase text-xs">🛠️ Ürün Yöneticisi Paneli:</span>
        <div className="flex items-center space-x-2">
          <span className="text-slate-400">Rol:</span>
          <button onClick={() => setUserRole('taker')} className={`px-3 py-1.5 rounded-lg font-medium transition ${userRole === 'taker' ? 'bg-purple-600 text-white' : 'bg-slate-700'}`}>Alıcı (Taker)</button>
          <button onClick={() => setUserRole('maker')} className={`px-3 py-1.5 rounded-lg font-medium transition ${userRole === 'maker' ? 'bg-purple-600 text-white' : 'bg-slate-700'}`}>Satıcı (Maker)</button>
        </div>
        <div className="w-px h-6 bg-slate-600 hidden sm:block"></div>
        <button onClick={() => setIsBanned(!isBanned)} className={`px-3 py-1.5 rounded-lg font-medium transition ${isBanned ? 'bg-red-600 text-white border border-red-500' : 'bg-slate-700 hover:bg-slate-600'}`}>
          {isBanned ? '🔴 30 Gün Ban Aktif' : '⚪ Ban Testi Kapalı'}
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Pazar Yeri</h1>
          <p className="text-sm text-slate-400">Merkeziyetsiz, hakemsiz P2P takas tahtası.</p>
        </div>
        
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <input type="number" value={searchAmount} onChange={(e) => setSearchAmount(e.target.value)} placeholder="Tutar Ara..." 
            className="w-full md:w-48 bg-slate-800 text-white px-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
          <button onClick={() => setFilterTier1(!filterTier1)} 
            className={`whitespace-nowrap px-4 py-2 rounded-xl font-medium transition text-sm ${filterTier1 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'bg-slate-700 text-slate-300'}`}>
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
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs border border-slate-600 shrink-0">🛡️</div>
                      <div>
                        <span className="font-mono text-emerald-400 text-sm">{order.maker}</span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          <span className={`text-xs font-medium ${order.successRate === 100 ? 'text-emerald-400' : 'text-orange-400'}`}>%{order.successRate} Başarı</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400 text-xs">📜 {order.txCount} tx</span>
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
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${order.tier === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>
                      {order.bond}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleStartTrade(order)} 
                      className={`${isBanned ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-100 text-slate-900 hover:bg-white shadow-lg'} px-4 py-2 rounded-lg font-bold transition text-sm`}>
                      Satın Al
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="5" className="p-8 text-center text-slate-500">Bu tutara uygun ilan bulunamadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );

  // ==========================================
  // 3. İŞLEM VE ARAF ODASI (TRADE ROOM)
  // ==========================================
  const renderTradeRoom = () => {
    const isChallenged = tradeState === 'CHALLENGED';
    const bgTheme = isChallenged ? 'bg-red-950/20' : 'bg-slate-900';
    const borderTheme = isChallenged ? 'border-red-900/50' : 'border-slate-800';
    
    const isTaker = userRole === 'taker';
    const isMaker = userRole === 'maker'; // İŞTE EKSİK OLAN HAYAT KURTARICI SATIR!
    
    const displayIBAN = bankIBAN || 'TR12 3456 7890 1234 5678 90';

    return (
      <main className={`max-w-6xl mx-auto p-4 md:p-6 mt-4 transition-colors duration-500 ${bgTheme} pb-24`}>
        
        <div className="mb-4 p-2 bg-slate-800 rounded-xl border border-slate-700 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-slate-400 font-mono">Durum Testi:</span>
          <button onClick={() => setTradeState('LOCKED')} className={`px-3 py-1.5 rounded ${tradeState === 'LOCKED' ? 'bg-blue-600 text-white' : 'bg-slate-700'}`}>1. LOCKED</button>
          <button onClick={() => setTradeState('PAID')} className={`px-3 py-1.5 rounded ${tradeState === 'PAID' ? 'bg-emerald-600 text-white' : 'bg-slate-700'}`}>2. PAID</button>
          <button onClick={() => setTradeState('CHALLENGED')} className={`px-3 py-1.5 rounded ${tradeState === 'CHALLENGED' ? 'bg-red-600 text-white' : 'bg-slate-700'}`}>3. CHALLENGED (ARAF)</button>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setCancelStatus('proposed_by_other')} className="px-2 py-1.5 bg-slate-700 rounded text-orange-400 border border-orange-500/30">Simüle Et: Karşı Taraf İptal İstedi</button>
          </div>
        </div>

        <button onClick={() => setCurrentView('dashboard')} className="text-slate-400 hover:text-white mb-4 flex items-center text-sm font-medium">← Geri Dön</button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`bg-slate-800/80 p-5 rounded-2xl border ${borderTheme} shadow-xl`}>
            <h3 className="text-lg font-bold mb-4 text-white">İşlem Detayları</h3>
            <div className="space-y-3 text-sm">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">{isTaker ? 'Gönderilecek Tutar' : 'Alınacak Tutar'}</p>
                <p className="text-xl font-bold text-white">33.500,00 TRY</p>
                <p className="text-xs text-emerald-400 mt-1">Karşılığı: 1000 USDT</p>
              </div>

              {isTaker ? (
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                  <p className="text-slate-400 mb-1">Satıcı Banka Bilgileri</p>
                  <p className="font-medium text-white text-sm mt-2">A*** P***</p>
                  <p className="font-mono text-emerald-400 mt-1 break-all text-sm">{displayIBAN}</p>
                  <p className="text-xs text-orange-400 mt-3">* Açıklamaya kripto yazmayınız.</p>
                </div>
              ) : (
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-center">
                  <div className="text-3xl mb-2">🏦</div>
                  <p className="text-slate-300 font-medium text-sm">Kayıtlı Banka Hesabınıza Ödeme Bekleniyor.</p>
                  <p className="text-slate-500 text-xs mt-2">Alıcı fiat transferini yaptığında burada bildirim göreceksiniz.</p>
                </div>
              )}
            </div>
          </div>

          <div className={`col-span-1 lg:col-span-2 bg-slate-800/80 p-5 rounded-2xl border ${borderTheme} shadow-xl flex flex-col justify-center`}>

            {tradeState === 'LOCKED' && (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔒</div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">USDT Kontrata Kilitlendi</h2>
                {isTaker ? (
                  <>
                    <p className="text-slate-400 mb-6 text-sm">Lütfen soldaki bilgilere transferi gerçekleştirin ve dekont hash'ini girin.</p>
                    <button onClick={() => setTradeState('PAID')} className="bg-blue-600 hover:bg-blue-500 text-white w-full sm:w-auto px-8 py-3 rounded-xl font-bold">Ödemeyi Yaptım</button>
                  </>
                ) : (
                  <p className="text-slate-400 mb-6 text-sm animate-pulse">Alıcının banka transferini yapması ve bildirmesi bekleniyor...</p>
                )}
              </div>
            )}

            {tradeState === 'PAID' && (
              <div className="text-center py-4">
                <h2 className="text-lg md:text-xl font-bold text-emerald-400 mb-2">Ödeme Bildirildi</h2>
                <div className="w-full max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-6">
                  <p className="text-xs text-slate-500 mb-1 uppercase font-bold">Müzakere (Grace) Süresi</p>
                  <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider">47:59:12</div>
                </div>
                {isTaker ? (
                  <p className="text-slate-400 text-sm mb-4">Satıcının banka hesabını kontrol edip kriptoyu serbest bırakması bekleniyor.</p>
                ) : (
                  <div className="flex flex-col sm:flex-row justify-center gap-3">
                    <button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold">Aldım, Serbest Bırak</button>
                    <button onClick={() => setTradeState('CHALLENGED')} className="w-full sm:w-auto bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-bold">Param Gelmedi (İtiraz Et)</button>
                  </div>
                )}
              </div>
            )}

            {tradeState === 'CHALLENGED' && (
              <div className="text-center py-2">
                <div className="w-14 h-14 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl animate-pulse">⚠️</div>
                <h2 className="text-2xl md:text-3xl font-bold text-red-500 mb-2">ARAF FAZI</h2>
                
                <div className="w-full bg-red-950/40 border border-red-900/50 rounded-2xl p-4 mb-6 text-left">
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-red-400 font-bold">Senin Teminatın (Kanıyor)</span>
                      <span className="text-white font-mono">-%20 / Gün</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-red-900/30">
                      <div className="bg-red-600 h-2 rounded-full w-[20%]"></div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-orange-400">Karşı Tarafın Teminatı</span>
                      <span className="text-slate-300 font-mono">-%10 / Gün</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-orange-900/30">
                      <div className="bg-orange-500/50 h-2 rounded-full w-[10%]"></div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-red-900/30">
                    <p className="text-xs text-slate-400 font-medium flex items-center justify-between">
                      <span>🛡️ Ana Para (USDT) Koruma Süresi:</span>
                      <span className="text-emerald-400 font-mono">2 Gün 14 Saat Kaldı</span>
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                  {cancelStatus === null && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {isMaker && <button className="w-full bg-slate-800 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500 hover:text-white p-3 rounded-xl font-bold text-sm transition">🤝 Aldım (USDT Alıcıya)</button>}
                      <button onClick={handleProposeCancel} className="w-full bg-slate-800 border border-orange-500/50 text-orange-400 hover:bg-orange-500 hover:text-white p-3 rounded-xl font-bold text-sm transition">
                        ↩️ İptal Teklif Et (USDT Satıcıya)
                      </button>
                    </div>
                  )}

                  {cancelStatus === 'proposed_by_me' && (
                    <div className="py-3 px-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center justify-center space-x-3">
                      <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-orange-400 font-bold text-sm">Karşı Tarafın İptal Onayı Bekleniyor...</span>
                    </div>
                  )}

                  {cancelStatus === 'proposed_by_other' && (
                    <div className="animate-pulse-slow">
                      <p className="text-orange-400 font-bold text-sm mb-3">⚠️ Karşı taraf işlemi iptal etmeyi teklif etti. Onaylarsanız USDT satıcıya iade edilecek ve kalan teminatlar dağıtılacaktır.</p>
                      <div className="grid grid-cols-2 gap-3">
                        {/* İŞTE ÇÖZÜLEN BUTONLAR! */}
                        <button 
                          onClick={() => {
                            setCancelStatus(null);
                            setTradeState('LOCKED'); 
                            setCurrentView('dashboard');
                            showToast('🤝 Müşterek İptal başarıyla gerçekleşti! USDT Satıcıya iade edildi.', 'success');
                          }} 
                          className="w-full bg-orange-600 hover:bg-orange-500 text-white p-3 rounded-xl font-bold text-sm"
                        >
                          Evet, İptal Et
                        </button>
                        <button 
                          onClick={() => setCancelStatus(null)} 
                          className="w-full bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-xl font-bold text-sm"
                        >
                          Reddet (Erimeye Devam)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <nav className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
          <div className="w-8 h-8 rounded bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold">A</div>
          <span className="text-lg font-bold tracking-widest hidden sm:block">ARAF</span>
        </div>
        <div className="flex items-center space-x-3">
          <button className="hidden md:block text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-medium">
            + İlan Aç
          </button>
          <button onClick={() => setShowProfileModal(true)} className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-sm hover:bg-slate-700 relative">
            👤 {isBanned && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-slate-900"></span>}
          </button>
          <button className="bg-slate-100 text-slate-900 px-3 py-1.5 rounded-lg font-bold text-sm">0x3A...8bF</button>
        </div>
      </nav>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-bounce-in w-[90%] md:w-auto">
          <div className={`flex items-center gap-3 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl border ${toast.type === 'error' ? 'bg-red-600 border-red-500 shadow-red-900/40' : toast.type === 'info' ? 'bg-blue-600 border-blue-500 shadow-blue-900/40' : 'bg-emerald-600 border-emerald-500 shadow-emerald-900/40'}`}>
            <span className="text-base">{toast.type === 'error' ? '✖' : toast.type === 'info' ? 'ℹ' : '✓'}</span>
            {toast.message}
          </div>
        </div>
      )}

      {renderProfileModal()}
      {currentView === 'dashboard' ? renderDashboard() : renderTradeRoom()}
    </div>
  );
}

export default App;

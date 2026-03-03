import React, { useState } from 'react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [showMakerModal, setShowMakerModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tradeState, setTradeState] = useState('LOCKED');
  const [filterTier1, setFilterTier1] = useState(false);
  const [searchAmount, setSearchAmount] = useState(''); // Arama motoru state'i

  // --- GELİŞMİŞ SAHTE VERİLER ---
  const mockOrders = [
    { id: 1, maker: "0x7F...3bA", crypto: "USDT", fiat: "TRY", rate: "33.50", min: 500, max: 2500, tier: 1, bond: "0%" },
    { id: 2, maker: "0x1A...9cK", crypto: "USDC", fiat: "TRY", rate: "33.45", min: 1000, max: 15000, tier: 2, bond: "8%" },
    { id: 3, maker: "0x9D...4fE", crypto: "ETH", fiat: "USD", rate: "3100.00", min: 500, max: 5000, tier: 3, bond: "6%" },
    { id: 4, maker: "0x4B...2yZ", crypto: "USDT", fiat: "TRY", rate: "33.42", min: 1500, max: 8000, tier: 1, bond: "0%" },
  ];

  // ARAMA VE FİLTRELEME ALGORİTMASI
  const filteredOrders = mockOrders.filter(order => {
    const amountMatch = searchAmount === '' || (Number(searchAmount) >= order.min && Number(searchAmount) <= order.max);
    const tierMatch = filterTier1 ? order.tier === 1 : true;
    return amountMatch && tierMatch;
  });

  // ==========================================
  // 1. KULLANICI PROFİL MODALI
  // ==========================================
  const renderProfileModal = () => {
    if (!showProfileModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Profil & Ayarlar</h2>
            <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
          </div>
          <div className="space-y-4 text-sm">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
              <span className="text-slate-400">Cüzdan:</span>
              <span className="font-mono text-emerald-400">0x3A...8bF</span>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
              <span className="text-slate-400">Araf Puanı:</span>
              <span className="font-bold text-white">🛡️ %100 Başarı (12 İşlem)</span>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
              <label className="block text-slate-400 mb-2">Kayıtlı IBAN Bilgisi</label>
              <input type="text" placeholder="TR00 0000..." className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 outline-none" />
            </div>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold transition mt-2">
              Bilgileri Güncelle
            </button>
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
                <select className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 outline-none">
                  <option>USDT</option>
                  <option>USDC</option>
                  <option>ETH</option>
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
        
        {/* AKTİF ARAMA VE FİLTRE */}
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
        <table className="w-full text-left border-collapse min-w-[600px]">
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
                  <td className="p-4 flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs border border-slate-600">🛡️</div>
                    <span className="font-mono text-emerald-400 text-sm">{order.maker}</span>
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
                    <button onClick={() => setCurrentView('tradeRoom')} className="bg-slate-100 text-slate-900 hover:bg-white px-4 py-2 rounded-lg font-bold transition text-sm shadow-lg">
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

      {/* MOBİL YÜZEN BUTON (FAB) - İlan Aç */}
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
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Gönderilecek Tutar</p>
                <p className="text-xl font-bold text-white">33.500,00 TRY</p>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Alıcı IBAN</p>
                <p className="font-mono text-emerald-400 break-all text-xs sm:text-sm">TR12 3456 7890 1234 5678 90</p>
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
                
                {/* SAAT TAŞMASINI ÖNLEYEN DÜZELTME */}
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
          {/* MASAÜSTÜ İLAN AÇ BUTONU */}
          <button onClick={() => setShowMakerModal(true)} className="hidden md:block text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-medium">
            + İlan Aç
          </button>
          
          {/* PROFİL VE CÜZDAN */}
          <button onClick={() => setShowProfileModal(true)} className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-sm hover:bg-slate-700 transition">
            👤
          </button>
          <button className="bg-slate-100 text-slate-900 px-3 py-1.5 rounded-lg font-bold text-sm">
            0x3A...8bF
          </button>
        </div>
      </nav>

      {renderProfileModal()}
      {renderMakerModal()}
      {currentView === 'dashboard' ? renderDashboard() : renderTradeRoom()}
      
    </div>
  );
}

export default App;

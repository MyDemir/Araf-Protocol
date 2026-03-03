import React, { useState } from 'react';

function App() {
  // --- EKRAN YÖNETİMİ (STATE) ---
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' veya 'tradeRoom'
  const [showMakerModal, setShowMakerModal] = useState(false);
  const [tradeState, setTradeState] = useState('LOCKED'); // 'LOCKED', 'PAID', 'CHALLENGED'
  const [filterTier1, setFilterTier1] = useState(false);

  // --- SAHTE VERİLER ---
  const mockOrders = [
    { id: 1, maker: "0x7F...3bA", rate: "33.50", min: 500, max: 2500, tier: 1, bond: "0%" },
    { id: 2, maker: "0x1A...9cK", rate: "33.45", min: 1000, max: 15000, tier: 2, bond: "8%" },
    { id: 3, maker: "0x9D...4fE", rate: "33.40", min: 5000, max: 50000, tier: 3, bond: "6%" },
  ];

  // ==========================================
  // 1. İLAN AÇMA MODALI (MAKER FLOW)
  // ==========================================
  const renderMakerModal = () => {
    if (!showMakerModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Yeni İlan Aç</h2>
            <button onClick={() => setShowMakerModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Satılacak Miktar (USDT)</label>
              <input type="number" placeholder="Örn: 1000" className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Kur Fiyatı (TRY)</label>
              <input type="number" placeholder="Örn: 33.50" className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label className="block text-sm text-slate-400 mb-1">Min. Limit (TRY)</label>
                <input type="number" placeholder="500" className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="w-1/2">
                <label className="block text-sm text-slate-400 mb-1">Max. Limit (TRY)</label>
                <input type="number" placeholder="2500" className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
              </div>
            </div>

            {/* AKILLI TEMİNAT HESAPLAYICI */}
            <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
              <p className="text-sm text-emerald-400 mb-2 font-medium">🛡️ Tier 2 Kuralları Geçerlidir</p>
              <div className="flex justify-between text-sm text-slate-300 mb-1"><span>Satıcı Teminatı (%15):</span> <span>150 USDT</span></div>
              <div className="flex justify-between text-sm text-slate-300 mb-2"><span>İlan Tutarı:</span> <span>1000 USDT</span></div>
              <div className="flex justify-between text-base font-bold text-white border-t border-emerald-500/30 pt-2">
                <span>Toplam Kilitlenecek:</span> <span>1150 USDT</span>
              </div>
            </div>

            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-lg mt-4 transition shadow-lg shadow-emerald-900/20">
              USDT ve Teminatı Kilitle
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // 2. PAZAR YERİ EKRANI (DASHBOARD)
  // ==========================================
  const renderDashboard = () => (
    <main className="max-w-6xl mx-auto p-4 md:p-6 mt-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold mb-2">Pazar Yeri</h1>
          <p className="text-slate-400">Merkeziyetsiz, hakemsiz ve güvenli P2P takas tahtası.</p>
        </div>
        <div className="flex items-center space-x-2 md:space-x-4 w-full md:w-auto">
          <input type="number" placeholder="Tutar (TRY)" className="w-1/2 md:w-auto bg-slate-800 text-white px-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-emerald-500" />
          <button onClick={() => setFilterTier1(!filterTier1)} className={`w-1/2 md:w-auto px-4 py-2 rounded-xl font-medium transition text-sm ${filterTier1 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
            %0 Teminat
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-slate-800/50 rounded-2xl border border-slate-700 shadow-xl">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-700 text-xs tracking-wider text-slate-400 uppercase">
              <th className="p-4 font-medium">Satıcı (Maker)</th>
              <th className="p-4 font-medium">Kur</th>
              <th className="p-4 font-medium">Limit (TRY)</th>
              <th className="p-4 font-medium">Alıcı Bond</th>
              <th className="p-4 font-medium text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {mockOrders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-700/30 transition">
                <td className="p-4 flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs border border-slate-600">🛡️</div>
                  <span className="font-mono text-emerald-400 text-sm">{order.maker}</span>
                </td>
                <td className="p-4 font-bold text-base">{order.rate} ₺</td>
                <td className="p-4 text-slate-300 text-sm">{order.min} ₺ - {order.max} ₺</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${order.tier === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                    {order.bond}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => setCurrentView('tradeRoom')}
                    className="bg-slate-100 text-slate-900 hover:bg-white px-4 py-2 rounded-lg font-bold transition text-sm shadow-lg">
                    Satın Al
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );

  // ==========================================
  // 3. İŞLEM VE ARAF ODASI (TRADE ROOM)
  // ==========================================
  const renderTradeRoom = () => {
    // Dinamik renklendirme ve temalar
    const isChallenged = tradeState === 'CHALLENGED';
    const bgTheme = isChallenged ? 'bg-red-950/20' : 'bg-slate-900';
    const borderTheme = isChallenged ? 'border-red-900/50' : 'border-slate-800';

    return (
      <main className={`max-w-6xl mx-auto p-4 md:p-6 mt-4 transition-colors duration-500 ${bgTheme}`}>
        
        {/* GELİŞTİRİCİ KONTROLLERİ (TEST İÇİN) */}
        <div className="mb-6 p-3 bg-slate-800 rounded-xl border border-slate-700 flex flex-wrap gap-2 items-center text-sm">
          <span className="text-slate-400 font-mono">🔧 UX Test Paneli:</span>
          <button onClick={() => setTradeState('LOCKED')} className={`px-3 py-1 rounded ${tradeState === 'LOCKED' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>1. LOCKED</button>
          <button onClick={() => setTradeState('PAID')} className={`px-3 py-1 rounded ${tradeState === 'PAID' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>2. PAID</button>
          <button onClick={() => setTradeState('CHALLENGED')} className={`px-3 py-1 rounded ${tradeState === 'CHALLENGED' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300'}`}>3. CHALLENGED (ARAF)</button>
        </div>

        <button onClick={() => setCurrentView('dashboard')} className="text-slate-400 hover:text-white mb-6 flex items-center text-sm font-medium">
          ← Pazar Yerine Dön
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* SOL PANEL: TALİMATLAR VE BANKA */}
          <div className={`bg-slate-800/80 p-6 rounded-2xl border ${borderTheme} shadow-xl`}>
            <h3 className="text-xl font-bold mb-4 text-white">İşlem Detayları</h3>
            <div className="space-y-4 text-sm">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Gönderilecek Tutar (TRY)</p>
                <p className="text-2xl font-bold text-white">33.500,00 ₺</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 mb-1">Alıcı (Maker) IBAN</p>
                <p className="font-mono text-emerald-400 break-all">TR12 3456 7890 1234 5678 90</p>
                <p className="text-slate-400 mt-2">Alıcı Adı: A*** P***</p>
              </div>
              <div className="text-xs text-slate-500 pt-2">
                * Lütfen açıklamaya kripto ile ilgili hiçbir şey yazmayınız. Sadece adınızı soyadınızı belirtiniz.
              </div>
            </div>
          </div>

          {/* ORTA PANEL: SİSTEM DURUMU VE OYUN TEORİSİ */}
          <div className={`col-span-1 lg:col-span-2 bg-slate-800/80 p-6 rounded-2xl border ${borderTheme} shadow-xl flex flex-col justify-center`}>
            
            {/* DURUM: LOCKED */}
            {tradeState === 'LOCKED' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔒</div>
                <h2 className="text-2xl font-bold text-white mb-2">Kripto Kilitlendi</h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">Satıcının USDT'si akıllı kontrata güvenle kilitlendi. Lütfen banka uygulamanızdan TRY transferini gerçekleştirin.</p>
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 w-full md:w-auto">
                  Ödemeyi Yaptım
                </button>
              </div>
            )}

            {/* DURUM: PAID */}
            {tradeState === 'PAID' && (
              <div className="text-center py-4">
                <h2 className="text-xl font-bold text-emerald-400 mb-2">Ödeme Bildirildi</h2>
                <p className="text-slate-400 mb-6">Satıcının banka hesabını kontrol edip kriptoyu serbest bırakması bekleniyor.</p>
                
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 mb-8 inline-block min-w-[300px]">
                  <p className="text-sm text-slate-500 mb-2 uppercase tracking-wider font-bold">Otomatik Çözüm İçin Kalan Süre</p>
                  <div className="text-5xl font-mono font-bold text-white tracking-widest">47:59:12</div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4">
                  <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg">Kriptoyu Serbest Bırak (Maker)</button>
                  <button className="bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-bold transition">Param Gelmedi (İtiraz Et)</button>
                </div>
              </div>
            )}

            {/* DURUM: CHALLENGED (ARAF VE ERİYEN KASA) */}
            {tradeState === 'CHALLENGED' && (
              <div className="text-center py-2">
                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl animate-pulse">⚠️</div>
                <h2 className="text-3xl font-bold text-red-500 mb-2">ARAF FAZI BAŞLADI</h2>
                <p className="text-slate-300 mb-6 max-w-lg mx-auto">Satıcı ödemeyi almadığını bildirdi. Anlaşmazlık çözülemediği için Oyun Teorisi mekanizması devreye girdi.</p>
                
                {/* ERİYEN KASA (PROGRESS BAR) */}
                <div className="bg-red-950/40 border border-red-900/50 rounded-2xl p-6 mb-8">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-red-400 font-bold">Eriyen Kasa (Time-Decay)</span>
                    <span className="text-white font-mono">Kesinti: 115 USDT (%10)</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-4 mb-2 overflow-hidden border border-red-900/30">
                    <div className="bg-gradient-to-r from-red-600 to-orange-500 h-4 rounded-full" style={{ width: '10%' }}></div>
                  </div>
                  <p className="text-xs text-red-400/80 text-left">
                    * Sonraki %10'luk erime <b>14:25:10</b> sonra gerçekleşecek ve Hazineye aktarılacaktır. Kalan paranızı kurtarmak için uzlaşın.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button className="bg-slate-800 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500 hover:text-white px-4 py-4 rounded-xl font-bold transition">
                    🤝 Karşılıklı Onay (USDT Alıcıya)
                  </button>
                  <button className="bg-slate-800 border border-orange-500/50 text-orange-400 hover:bg-orange-500 hover:text-white px-4 py-4 rounded-xl font-bold transition">
                    ↩️ Karşılıklı İptal (USDT Satıcıya)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  };

  // --- ANA YAPI (ROUTING GÖREVİ GÖRÜR) ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-emerald-500/30">
      
      {/* GLOBAL NAVBAR */}
      <nav className="flex justify-between items-center p-4 md:p-6 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-red-500/20">A</div>
          <span className="text-lg md:text-xl font-bold tracking-widest">ARAF</span>
        </div>
        <div className="flex space-x-2 md:space-x-6 items-center">
          <button onClick={() => setShowMakerModal(true)} className="hidden md:block text-emerald-400 hover:text-emerald-300 font-medium transition border border-emerald-500/30 px-4 py-2 rounded-lg bg-emerald-500/10">
            + İlan Aç
          </button>
          <button className="bg-slate-100 hover:bg-white text-slate-900 px-4 py-2 rounded-lg font-bold transition text-sm shadow-lg">
            Cüzdan Bağla
          </button>
        </div>
      </nav>

      {/* MODAL VE EKRANLAR */}
      {renderMakerModal()}
      {currentView === 'dashboard' ? renderDashboard() : renderTradeRoom()}
      
    </div>
  );
}

export default App;

import React, { useState } from 'react';

function App() {
  const [filterTier1, setFilterTier1] = useState(false);

  // Sahte İlan Verileri (Akıllı kontrat bağlanana kadar arayüzü görmek için)
  const mockOrders = [
    { id: 1, maker: "0x7F...3bA", rate: "33.50", min: 500, max: 2500, tier: 1, bond: "0%" },
    { id: 2, maker: "0x1A...9cK", rate: "33.45", min: 1000, max: 15000, tier: 2, bond: "8%" },
    { id: 3, maker: "0x9D...4fE", rate: "33.40", min: 5000, max: 50000, tier: 3, bond: "6%" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      
      {/* NAVBAR (Üst Menü) */}
      <nav className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold text-lg">A</div>
          <span className="text-xl font-bold tracking-wider">ARAF PROTOCOL</span>
        </div>
        <div className="flex space-x-4">
          <button className="text-slate-400 hover:text-white transition">Pazar Yeri</button>
          <button className="text-slate-400 hover:text-white transition">İlanlarım</button>
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-medium transition shadow-lg shadow-emerald-900/20">
            Cüzdan Bağla
          </button>
        </div>
      </nav>

      {/* ANA İÇERİK */}
      <main className="max-w-6xl mx-auto p-6 mt-8">
        
        {/* BAŞLIK VE FİLTRELER */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Pazar Yeri</h1>
            <p className="text-slate-400">Merkeziyetsiz, hakemsiz ve güvenli P2P takas tahtası.</p>
          </div>
          
          <div className="flex items-center space-x-4 bg-slate-800 p-2 rounded-xl border border-slate-700">
            <input 
              type="number" 
              placeholder="Alınacak Tutar (TRY)" 
              className="bg-slate-900 text-white px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
            />
            <button 
              onClick={() => setFilterTier1(!filterTier1)}
              className={`px-4 py-2 rounded-lg font-medium transition ${filterTier1 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              Sadece Tier 1 (%0 Teminat)
            </button>
          </div>
        </div>

        {/* İLAN TABLOSU (ORDER BOOK) */}
        <div className="overflow-x-auto bg-slate-800/50 rounded-2xl border border-slate-700 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-sm tracking-wider text-slate-400 uppercase">
                <th className="p-5 font-medium">Satıcı (Maker)</th>
                <th className="p-5 font-medium">Kur (USDT/TRY)</th>
                <th className="p-5 font-medium">Limit (TRY)</th>
                <th className="p-5 font-medium">Alıcı Teminatı</th>
                <th className="p-5 font-medium text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {mockOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-700/30 transition">
                  <td className="p-5 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs border border-slate-600">🛡️</div>
                    <span className="font-mono text-emerald-400">{order.maker}</span>
                  </td>
                  <td className="p-5 font-bold text-lg">{order.rate} ₺</td>
                  <td className="p-5 text-slate-300">{order.min} ₺ - {order.max} ₺</td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.tier === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                      {order.bond} Bond
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    <button className="bg-slate-100 text-slate-900 hover:bg-white px-6 py-2 rounded-lg font-bold transition shadow-lg">
                      Satın Al
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </main>
    </div>
  );
}

export default App;

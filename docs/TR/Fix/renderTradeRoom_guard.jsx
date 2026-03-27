// renderTradeRoom fonksiyonunun başına ekle
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
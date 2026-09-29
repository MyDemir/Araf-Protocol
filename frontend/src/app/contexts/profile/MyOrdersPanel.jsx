import { ListOrdered } from 'lucide-react';
import React from 'react';
import { getOrderSideCopy } from '../../orderUiModel';

const CANCELABLE_STATUSES = new Set(['OPEN', 'PARTIALLY_FILLED']);

// [TR] Önceki panel "Sil" butonuyla yalnız confirmDeleteId set ediyordu; onay arayüzü ve
//      handleDeleteOrder bu sayfada olmadığından iptal hiç gerçekleşmiyordu.
// [EN] The old panel only set confirmDeleteId; with no confirm UI or handler here, cancel never ran.
export const MyOrdersPanel = ({
  myOrders = [],
  lang = 'EN',
  confirmDeleteId = null,
  setConfirmDeleteId = () => {},
  handleDeleteOrder,
  isContractLoading = false,
}) => {
  const isTR = lang === 'TR';
  if (!myOrders.length) {
    return (
      <div className="bg-surface border border-borderSubtle rounded-xl p-6 text-center max-w-2xl">
        <div className="flex justify-center text-textMuted mb-2"><ListOrdered className="w-8 h-8" strokeWidth={1.8} aria-hidden="true" /></div>
        <p className="text-sm text-textMuted">{isTR ? 'Henüz emriniz yok.' : 'No orders yet.'}</p>
      </div>
    );
  }
  const fmt = (value) => Number(value || 0).toLocaleString(isTR ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 });
  return (
    <div className="space-y-2 max-w-2xl" data-testid="profile-my-orders">
      {myOrders.map((order) => {
        const canCancel = CANCELABLE_STATUSES.has(order.status) && typeof handleDeleteOrder === 'function';
        const isConfirming = confirmDeleteId === order.id;
        const isSell = order.side === 'SELL_CRYPTO';
        const total = Number(order.totalAmount ?? order.amount ?? 0);
        const remaining = Number(order.remainingAmount ?? 0);
        const filledPct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
        return (
          <div key={order.id} className={`bg-surface border rounded-xl p-3 transition ${isConfirming ? 'border-danger/50' : 'border-borderSubtle'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-textPrimary flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isSell ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30'}`}>
                    {order.sideLabel || getOrderSideCopy(order.side, 'order', lang) || order.side}
                  </span>
                  <span>
                    {total > 0 && remaining > 0 && remaining !== total ? `${fmt(remaining)} / ${fmt(total)}` : fmt(total || remaining)} {order.crypto}
                  </span>
                  <span className="text-textMuted font-normal text-xs">#{order.onchainId ?? '—'}</span>
                </p>
                <p className="text-xs text-textSecondary mt-1">
                  {order.hasPrice ? `${fmt(order.rate)} ${order.fiat} · ` : ''}
                  {isTR ? 'Min' : 'Min'} {fmt(order.minFillAmount)} {order.crypto} · T{order.tier ?? 0}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border border-borderSubtle bg-elevated text-textSecondary">{order.statusLabel || order.status}</span>
            </div>
            {total > 0 && filledPct > 0 && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-elevated overflow-hidden"><div className="h-full bg-brand" style={{ width: `${filledPct}%` }} /></div>
                <p className="text-[10px] text-textMuted mt-1">{isTR ? `%${filledPct} dolduruldu` : `${filledPct}% filled`}</p>
              </div>
            )}
            {canCancel && !isConfirming && (
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setConfirmDeleteId(order.id)} className="text-xs border border-danger/40 text-danger px-3 py-1 rounded-lg hover:bg-danger/10">
                  {isTR ? 'İptal et' : 'Cancel'}
                </button>
              </div>
            )}
            {isConfirming && (
              <div className="mt-3 pt-3 border-t border-borderSubtle">
                <p className="text-xs text-textSecondary mb-2">{isTR ? 'Kalan tutar ve teminat cüzdanınıza iade edilir.' : 'The remaining amount and bond return to your wallet.'}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={isContractLoading} onClick={() => handleDeleteOrder(order)} className="flex-1 bg-danger text-white text-xs font-bold py-2 rounded-lg disabled:opacity-50">
                    {isTR ? 'Evet, iptal et' : 'Yes, cancel'}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 bg-elevated border border-borderStrong text-textSecondary text-xs font-bold py-2 rounded-lg">
                    {isTR ? 'Vazgeç' : 'Keep'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MyOrdersPanel;

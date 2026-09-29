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
    return <p className="text-sm text-textMuted">{isTR ? 'Henüz emriniz yok.' : 'No orders yet.'}</p>;
  }
  const fmt = (value) => Number(value || 0).toLocaleString(isTR ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 });
  return (
    <div className="space-y-2 max-w-xl">
      {myOrders.map((order) => {
        const canCancel = CANCELABLE_STATUSES.has(order.status) && typeof handleDeleteOrder === 'function';
        const isConfirming = confirmDeleteId === order.id;
        return (
          <div key={order.id} className="bg-surface border border-borderSubtle rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-textPrimary">
                  {order.sideLabel || getOrderSideCopy(order.side, 'order', lang) || order.side}
                  <span className="text-textMuted font-normal"> · #{order.onchainId ?? '—'}</span>
                </p>
                <p className="text-xs text-textSecondary mt-0.5">
                  {fmt(order.remainingAmount)} {order.crypto}
                  {order.hasPrice ? ` · ${fmt(order.rate)} ${order.fiat}` : ''}
                  {' · '}{order.statusLabel || order.status}
                </p>
              </div>
              {canCancel && !isConfirming && (
                <button onClick={() => setConfirmDeleteId(order.id)} className="shrink-0 text-xs border border-danger/40 text-danger px-3 py-1 rounded-lg hover:bg-danger/10">
                  {isTR ? 'İptal et' : 'Cancel'}
                </button>
              )}
            </div>
            {isConfirming && (
              <div className="mt-3 pt-3 border-t border-borderSubtle flex gap-2">
                <button disabled={isContractLoading} onClick={() => handleDeleteOrder(order)} className="flex-1 bg-danger text-white text-xs font-bold py-2 rounded-lg disabled:opacity-50">
                  {isTR ? 'Evet, iptal et' : 'Yes, cancel'}
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 bg-elevated border border-borderStrong text-textSecondary text-xs font-bold py-2 rounded-lg">
                  {isTR ? 'Vazgeç' : 'Keep'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MyOrdersPanel;

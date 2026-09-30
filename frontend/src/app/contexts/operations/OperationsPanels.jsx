import { getStateLabel } from '../../copy/states';
import OperationTradeCard from './OperationTradeCard';

export const OperationsSummaryBar = ({ summary, lang = 'EN' }) => {
  const items = [
    { key: 'totalActive', label: lang === 'TR' ? 'Aktif işlem' : 'Active trades' },
    { key: 'settlementActionRequired', label: lang === 'TR' ? 'Yanıt gerekiyor' : 'Needs response' },
    { key: 'paid', label: getStateLabel('PAID', lang) },
    { key: 'challenged', label: getStateLabel('CHALLENGED', lang) },
    { key: 'settlementWaiting', label: lang === 'TR' ? 'Yanıt bekleniyor' : 'Awaiting response' },
    { key: 'locked', label: getStateLabel('LOCKED', lang) },
    { key: 'pendingBackendSync', label: lang === 'TR' ? 'Senkron bekliyor' : 'Room sync' },
  ];

  // [TR] Aktif işlem yokken 7 adet "0" kartı bilgi taşımıyordu; boş durum kartı yeterli.
  // [EN] With no active trades, seven "0" tiles carried no information; the empty-state card is enough.
  if (!Number(summary?.totalActive)) return null;

  return (
    // [TR] Sıkı döşeme: mobilde 4 sütun, sayı üstte; 0 olan kutular soluk (dikkat gerektirenler öne çıkar).
    <div className="grid grid-cols-4 xl:grid-cols-7 gap-1.5 mb-4">
      {items.map((item) => {
        const value = Number(summary?.[item.key] ?? 0);
        const urgent = item.key === 'settlementActionRequired' && value > 0;
        return (
          <div key={item.key} className={`rounded-lg border px-2 py-2 ${urgent ? 'border-danger/40 bg-danger/10' : 'border-borderSubtle bg-surface'} ${value === 0 ? 'opacity-60' : ''}`}>
            <p className={`text-lg font-bold leading-none tabular-nums ${urgent ? 'text-danger' : 'text-textPrimary'}`}>{value}</p>
            <p className="mt-1 text-[10px] leading-tight text-textSecondary">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
};

const normalizeAddress = (value) => String(value || '').toLowerCase();

const resolveSettlementMode = (escrow) => {
  const proposal = escrow?.rawTrade?.settlementProposal || escrow?.settlementProposal || null;
  const proposer = proposal?.proposer || proposal?.proposed_by || proposal?.proposedBy || null;
  const viewer = escrow?.viewerAddress || null;
  if (proposer && viewer && normalizeAddress(proposer) !== normalizeAddress(viewer)) return 'action_required';
  if (proposer && viewer && normalizeAddress(proposer) === normalizeAddress(viewer)) return 'waiting';
  return 'info';
};

export const SettlementQueueCard = ({ escrow, lang, onGoToRoom }) => {
  const mode = resolveSettlementMode(escrow);
  const isActionRequired = mode === 'action_required';
  const title = isActionRequired
    ? (lang === 'TR' ? 'Uzlaşma teklifine yanıt verin' : 'Settlement needs your response')
    : (lang === 'TR' ? 'Karşı tarafın uzlaşma yanıtı bekleniyor' : 'Waiting on counterparty settlement response');
  const accentClass = isActionRequired
    ? 'border-danger/40 bg-danger/5 text-danger'
    : 'border-warning/40 bg-warning/5 text-warning';

  return (
    <div className={`rounded-xl border p-2 ${accentClass}`} data-testid="settlement-queue-card">
      <p className="mb-2 text-sm font-bold">{title}</p>
      <OperationTradeCard escrow={escrow} lang={lang} onGoToRoom={onGoToRoom} />
    </div>
  );
};

export const PendingSyncCard = ({ escrow, lang, onGoToRoom }) => {
  return (
    // [TR] Başlık kartın içinde zaten yazıyor; ayrı başlık tekrar ediyordu.
    <div className="rounded-xl border border-info/40 bg-info/5 p-1" data-testid="pending-sync-card">
      <OperationTradeCard escrow={escrow} lang={lang} onGoToRoom={onGoToRoom} />
    </div>
  );
};

export const OperationsContextPanel = ({ lane, lang = 'EN', onGoToRoomForEscrow }) => {
  if (!lane) return null;
  return (
    <div className="space-y-2">
      {lane.items.map((item, idx) => {
        const escrow = item.escrow;
        const onGoToRoom = onGoToRoomForEscrow(escrow);
        if (lane.key === 'settlement_action_required' || lane.key === 'settlement_waiting') {
          return <SettlementQueueCard key={`${lane.key}-${idx}`} escrow={escrow} lang={lang} onGoToRoom={onGoToRoom} />;
        }
        if (lane.key === 'pending_backend_sync') {
          return <PendingSyncCard key={`${lane.key}-${idx}`} escrow={escrow} lang={lang} onGoToRoom={onGoToRoom} />;
        }
        return <OperationTradeCard key={`${lane.key}-${idx}`} escrow={escrow} lang={lang} onGoToRoom={onGoToRoom} />;
      })}
    </div>
  );
};

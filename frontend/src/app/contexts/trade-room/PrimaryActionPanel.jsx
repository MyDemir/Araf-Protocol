import React from 'react';

const EXECUTABLE_ACTION_TYPES = new Set(['contract', 'conditional']);

const resolveActionConfig = (action, actionCallbacks) => {
  const config = actionCallbacks?.[action?.key];
  if (!config) return null;
  if (typeof config === 'function') return { onClick: config };
  return config;
};

export const ActionGuidanceButton = ({ action, actionCallbacks, disabledReasons = [], variant = 'primary', compact = false }) => {
  const config = resolveActionConfig(action, actionCallbacks);
  if (!action || !config || !EXECUTABLE_ACTION_TYPES.has(action.type)) return null;

  const actionDisabledReasons = config.disabledReasons || [];
  // [TR] Aynı gerekçe hem global hem aksiyon listesinden gelebilir; tek kez gösterilir.
  // [EN] The same reason can come from both lists; it is shown once.
  const allDisabledReasons = [...new Set([...disabledReasons, ...actionDisabledReasons].filter(Boolean))];
  const isDisabled = Boolean(config.disabled || allDisabledReasons.length);
  const label = config.label || action.label || action.key;

  const enabledClass = variant === 'secondary'
    ? 'bg-elevated hover:bg-surface text-textPrimary border border-borderStrong'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';

  return (
    <div className={compact ? '' : 'mt-3'}>
      <button
        type="button"
        onClick={config.onClick}
        disabled={isDisabled}
        className={`w-full px-4 ${variant === 'secondary' ? 'py-2 text-sm' : 'py-3'} rounded-lg font-bold transition ${isDisabled ? 'bg-elevated text-textMuted border border-borderStrong cursor-not-allowed' : enabledClass}`}
      >
        {label}
      </button>
      {allDisabledReasons.length > 0 && (
        <p className="mt-1.5 text-xs text-warning">{allDisabledReasons.join(' · ')}</p>
      )}
    </div>
  );
};

// [TR] Tek birincil aksiyon kartı: (varsa) kısa açıklama, gerekli girdiler (dekont, isim kontrolü, onay) ve tek buton.
//      "Şimdi yapılacak" / "Önce gerekli" kutuları aynı bilgiyi tekrar ettiği için kaldırıldı.
// [EN] Single primary action card: optional one-liner, required inputs (receipt, name check, acknowledgement) and one button.
export const PrimaryActionPanel = ({ primaryAction, disabledReasons = [], actionCallbacks, children = null }) => {
  if (!primaryAction && !disabledReasons.length && !children) return null;
  const isExecutable = EXECUTABLE_ACTION_TYPES.has(primaryAction?.type) && Boolean(resolveActionConfig(primaryAction, actionCallbacks));
  return (
    <div className="mb-4 rounded-xl bg-elevated/60 p-4 text-sm text-textSecondary" data-testid="trade-primary-guidance">
      {!isExecutable && primaryAction?.label && (
        <p className="flex items-center gap-2 font-semibold text-textPrimary">
          <span className={`inline-block w-2 h-2 rounded-full ${primaryAction.type === 'info' ? 'bg-textMuted' : 'bg-info animate-pulse'}`} aria-hidden="true" />
          {primaryAction.label}
        </p>
      )}
      {primaryAction?.description && <p className="mt-1 text-sm leading-relaxed text-textSecondary">{primaryAction.description}</p>}
      {children && <div className="mt-3 space-y-3">{children}</div>}
      <ActionGuidanceButton action={primaryAction} actionCallbacks={actionCallbacks} disabledReasons={disabledReasons} />
      {!isExecutable && disabledReasons.length > 0 && <p className="mt-2 text-xs text-warning">{disabledReasons.join(' · ')}</p>}
    </div>
  );
};

export default PrimaryActionPanel;

import React from 'react';

const LANE_TAB_CLASS = {
  settlement_action_required: {
    active: 'bg-danger/15 text-danger border-danger/50',
    idle: 'bg-surface text-danger border-danger/30 hover:border-danger/50',
  },
  pending_backend_sync: {
    active: 'bg-info/15 text-info border-info/50',
    idle: 'bg-surface text-info border-info/30 hover:border-info/50',
  },
};

export const OperationLaneTabs = ({ lanes = [], activeLaneKey, setActiveLaneKey }) => {
  if (!lanes.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {lanes.map((lane) => {
        const variant = LANE_TAB_CLASS[lane.key];
        const className = activeLaneKey === lane.key
          ? (variant?.active || 'bg-elevated text-textPrimary border-borderStrong')
          : (variant?.idle || 'bg-surface text-textSecondary border-borderSubtle hover:text-textPrimary hover:border-borderStrong');
        return (
          <button
            key={lane.key}
            onClick={() => setActiveLaneKey(lane.key)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border transition ${className}`}
          >
            {lane.label} ({lane.items.length})
          </button>
        );
      })}
    </div>
  );
};

export default OperationLaneTabs;

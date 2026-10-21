import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ChainFallbackTradesPanel from '../../frontend/src/app/contexts/trade-room/ChainFallbackTradesPanel';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { PrimaryActionPanel } from '../../frontend/src/app/contexts/trade-room/PrimaryActionPanel';
import { SecondaryActionsPanel } from '../../frontend/src/app/contexts/trade-room/SecondaryActionsPanel';

afterEach(() => cleanup());

const panelProps = (extra = {}) => ({ active: true, trades: [], loading: false, loadedAt: 1, submitManualId: vi.fn(), openTrade: vi.fn(), ...extra });

describe('F2-04 okunamayan islem uyarisi', () => {
  it('failedIds doluysa role=status uyarisi n adedini gosterir (EN/TR)', () => {
    render(<ChainFallbackTradesPanel lang="EN" chainFallback={panelProps({ failedIds: ['4', '9'] })} />);
    const warn = screen.getByTestId('chain-fallback-failed');
    expect(warn).toHaveAttribute('role', 'status');
    expect(warn).toHaveTextContent('2 trades could not be read, information may be outdated');
    cleanup();
    render(<ChainFallbackTradesPanel lang="TR" chainFallback={panelProps({ failedIds: ['4'] })} />);
    expect(screen.getByTestId('chain-fallback-failed')).toHaveTextContent('1 işlem okunamadı, bilgiler eski olabilir');
  });

  it('failedIds bos ya da yoksa uyari yok', () => {
    render(<ChainFallbackTradesPanel lang="EN" chainFallback={panelProps({ failedIds: [] })} />);
    expect(screen.queryByTestId('chain-fallback-failed')).not.toBeInTheDocument();
    cleanup();
    render(<ChainFallbackTradesPanel lang="EN" chainFallback={panelProps()} />);
    expect(screen.queryByTestId('chain-fallback-failed')).not.toBeInTheDocument();
  });

  it('App.jsx chainFallback useMemo failedIds iletir', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/App.jsx'), 'utf8');
    const memo = src.slice(src.indexOf('const chainFallback = React.useMemo'), src.indexOf('useChainFallbackRoomSync({'));
    expect(memo).toMatch(/failedIds:\s*chainFallbackState\.failedIds/);
    expect(memo).toMatch(/\[[^\]]*chainFallbackState\.failedIds[^\]]*\]/);
  });
});

const base = {
  trade: { id: null, onchainId: '11', _chainFallback: true },
  tradeState: 'PAID', userRole: 'maker', paymentIpfsHash: 'h', timers: {},
  isConnected: true, isAuthenticated: true, isSupportedChain: true, isPaused: false, lang: 'EN', chainFallback: true,
};
const callbacks = {
  release_funds: { onClick: vi.fn() }, start_challenge: { onClick: vi.fn() }, propose_cancel: { onClick: vi.fn() },
};

const renderModel = (model) => {
  render(<div>
    <PrimaryActionPanel primaryAction={model.primaryAction} disabledReasons={model.disabledReasons} actionCallbacks={callbacks} />
    <SecondaryActionsPanel secondaryActions={model.secondaryActions} disabledReasons={model.globalDisabledReasons} actionCallbacks={callbacks} lang="EN" />
  </div>);
};

describe('F2-04 stale kayitta aksiyonlar', () => {
  it('stale PAID maker: release ve ikincil aksiyonlar devre disi, aciklama var', () => {
    const model = buildTradeDecisionModel({ ...base, trade: { ...base.trade, stale: true } });
    expect(model.globalDisabledReasons.join(' ')).toMatch(/could not be refreshed/i);
    renderModel(model);
    expect(screen.getByRole('button', { name: /Release Funds/i })).toBeDisabled();
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    expect(screen.getAllByText(/could not be refreshed/i).length).toBeGreaterThan(0);
  });

  it('stale degilse release etkin (regresyon)', () => {
    const model = buildTradeDecisionModel({ ...base });
    expect(model.globalDisabledReasons.join(' ')).not.toMatch(/refreshed/i);
    renderModel(model);
    expect(screen.getByRole('button', { name: /Release Funds/i })).toBeEnabled();
  });

  it('stale TR metni', () => {
    const model = buildTradeDecisionModel({ ...base, lang: 'TR', trade: { ...base.trade, stale: true } });
    expect(model.globalDisabledReasons.join(' ')).toMatch(/yenilenemedi/);
  });
});

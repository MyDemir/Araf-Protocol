import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { removeOrderByOnchainId, resolveOrderActionFns } from '../../frontend/src/app/orderUiModel';

describe('App routing side-aware contract selection', () => {
  const fns = {
    createSellOrder: vi.fn(),
    createBuyOrder: vi.fn(),
    cancelSellOrder: vi.fn(),
    cancelBuyOrder: vi.fn(),
    fillSellOrder: vi.fn(),
    fillBuyOrder: vi.fn(),
  };

  it('SELL_CRYPTO routes create/cancel/fill to sell handlers', () => {
    const resolved = resolveOrderActionFns('SELL_CRYPTO', fns);
    expect(resolved.createFn).toBe(fns.createSellOrder);
    expect(resolved.cancelFn).toBe(fns.cancelSellOrder);
    expect(resolved.fillFn).toBe(fns.fillSellOrder);
  });

  it('BUY_CRYPTO routes create/cancel/fill to buy handlers', () => {
    const resolved = resolveOrderActionFns('BUY_CRYPTO', fns);
    expect(resolved.createFn).toBe(fns.createBuyOrder);
    expect(resolved.cancelFn).toBe(fns.cancelBuyOrder);
    expect(resolved.fillFn).toBe(fns.fillBuyOrder);
  });

  it('UNKNOWN side fails closed and no fallback handler is returned', () => {
    expect(() => resolveOrderActionFns('UNKNOWN', fns)).toThrow(/Invalid order side/);
    expect(() => resolveOrderActionFns('MALFORMED', fns)).toThrow(/Invalid order side/);
  });

  it('cancel sync removes canceled order from both market and myOrders collections', () => {
    const market = [{ onchainId: 1 }, { onchainId: 2 }];
    const mine = [{ onchainId: 2 }, { onchainId: 3 }];

    expect(removeOrderByOnchainId(market, 2)).toStrictEqual([{ onchainId: 1 }]);
    expect(removeOrderByOnchainId(mine, 2)).toStrictEqual([{ onchainId: 3 }]);
  });

  it('routes all primary views through the AppShell outlet composition', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const appShellBlock = source.slice(source.indexOf('<AppShell'), source.indexOf('<button', source.indexOf('<AppShell')));

    expect(source).toContain("import AppShell from './app/shell/AppShell';");
    expect(appShellBlock).toContain('status={systemStatus}');
    expect(source).toContain('const systemStatus = React.useMemo(() => ({');
    expect(source).toContain('...checkDeploymentAlignment({ frontendEscrowAddress: import.meta.env.VITE_ESCROW_ADDRESS, backendDeployment })');
    expect(source).toContain('supportedChains');
    expect(source).toContain('onRegisterWallet: handleRegisterWallet');
    expect(appShellBlock).toContain('navigation={renderSlimRail()}');
    expect(appShellBlock).toContain('panel={renderContextSidebar()}');
    expect(appShellBlock).toContain('mobileBottom={renderMobileNav()}');
    expect(appShellBlock).toContain('outlet={(');
    expect(appShellBlock).toContain("currentView === 'home'");
    expect(appShellBlock).toContain("currentView === 'market'");
    expect(appShellBlock).toContain("currentView === 'operations'");
    expect(appShellBlock).toContain("currentView === 'profile'");
    expect(appShellBlock).toContain("currentView === 'admin'");
    expect(appShellBlock).toContain('renderTradeRoom()');
    expect(appShellBlock).toContain('renderFooter()');
    expect(appShellBlock).toContain('modals={(');
    expect(appShellBlock).toContain('renderWalletModal()');
    expect(appShellBlock).toContain('renderFeedbackModal()');
    expect(appShellBlock).toContain('renderMakerModal()');
    expect(appShellBlock).not.toContain('renderProfileModal()');
    expect(appShellBlock).toContain('renderTermsModal()');
  });


  it('uses explicit sidebar toggle state without timer-based auto-close', () => {
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const appViewsSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app/AppViews.jsx'), 'utf8');

    expect(appSource).toContain('const toggleSidebar = () => {');
    expect(appSource).not.toContain('sidebarTimerRef');
    expect(appSource).not.toContain('setTimeout(() => setSidebarOpen(false), 5000)');
    expect(appViewsSource).toContain('onClick={toggleSidebar}');
    expect(appViewsSource).toContain('onClick={() => setSidebarOpen(false)}');
  });

});

describe('view registry (single source for navigation and session gating)', () => {
  it('every view has an icon, TR/EN labels and a tone; session-only set matches requiresAuth', async () => {
    const { VIEW_REGISTRY, SESSION_ONLY_VIEWS, NAV_ORDER } = await import('../../frontend/src/app/viewRegistry');
    for (const [key, view] of Object.entries(VIEW_REGISTRY)) {
      expect(view.icon, key).toBeTruthy();
      expect(view.label.TR && view.label.EN && view.shortLabel.TR && view.shortLabel.EN, key).toBeTruthy();
      expect(view.tone, key).toMatch(/^text-/);
    }
    expect([...SESSION_ONLY_VIEWS].sort()).toEqual(['admin', 'operations', 'profile', 'tradeRoom']);
    for (const surface of Object.values(NAV_ORDER)) {
      expect([...surface].sort()).toEqual(Object.keys(VIEW_REGISTRY).sort());
    }
  });

  it('nav visibility: public views always, session views when unlocked, admin behind its own gate', async () => {
    const { isViewInNav } = await import('../../frontend/src/app/viewRegistry');
    expect(isViewInNav('market', { navUnlocked: false })).toBe(true);
    expect(isViewInNav('profile', { navUnlocked: false })).toBe(false);
    expect(isViewInNav('profile', { navUnlocked: true })).toBe(true);
    expect(isViewInNav('admin', { navUnlocked: true, canSeeAdminEntry: false })).toBe(false);
    expect(isViewInNav('admin', { navUnlocked: false, canSeeAdminEntry: true })).toBe(true);
    expect(isViewInNav('unknown', { navUnlocked: true })).toBe(false);
  });
});

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { getClockSubscriberCount, setClockOffset, useNow } from '../../frontend/src/app/clock';
import NowBoundary from '../../frontend/src/app/shell/NowBoundary';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

// [TR] P1: saniyelik saat App kökünden çıkarıldı. Kök render sayısı saniyede artmamalı; yalnız yaprak aboneler güncellenir.
describe('P1: per-second clock is isolated from the App root', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); setClockOffset(0); });

  it('only the subscribed leaf re-renders each second; the parent does not', () => {
    let parentRenders = 0;
    let leafRenders = 0;
    const Leaf = () => { leafRenders += 1; useNow(); return null; };
    const Parent = () => { parentRenders += 1; return <Leaf />; };
    render(<Parent />);
    const p0 = parentRenders;
    const l0 = leafRenders;
    for (let i = 0; i < 5; i += 1) act(() => { vi.advanceTimersByTime(1000); });
    expect(parentRenders).toBe(p0);
    expect(leafRenders).toBeGreaterThanOrEqual(l0 + 4);
  });

  it('NowBoundary passes the ticking chain time to its render prop and honours fixedNowMs', () => {
    const seen = [];
    render(<NowBoundary render={(ms) => { seen.push(ms); return null; }} />);
    for (let i = 0; i < 3; i += 1) act(() => { vi.advanceTimersByTime(1000); });
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
    const fixed = [];
    render(<NowBoundary fixedNowMs={123456} render={(ms) => { fixed.push(ms); return null; }} />);
    expect(fixed.every((v) => v === 123456)).toBe(true);
  });

  it('chain offset is applied to the clock and no interval runs without subscribers', () => {
    expect(getClockSubscriberCount()).toBe(0);
    const seen = [];
    const view = render(<NowBoundary render={(ms) => { seen.push(ms); return null; }} />);
    act(() => { setClockOffset(3_600_000); });
    expect(seen[seen.length - 1] - Date.now()).toBeGreaterThan(3_000_000);
    view.unmount();
    expect(getClockSubscriberCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useAppSessionData no longer re-renders the root every second while the trade room is open', async () => {
    const realFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ wallet: '0xabc', orders: [], trades: [], total: 0 }) }));
    let renders = 0;
    const props = {
      address: '0xabc', connectedWallet: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient: null,
      currentView: 'tradeRoom', showProfileModal: false, profileTab: 'ayarlar', lang: 'EN', isContractLoading: false,
      setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(),
      SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
    };
    const Harness = () => {
      renders += 1;
      const s = useAppSessionData(props);
      React.useEffect(() => { s.setActiveTrade({ onchainId: '1', id: 'x', state: 'LOCKED', lockedAt: new Date().toISOString() }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    };
    render(<Harness />);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const before = renders;
    for (let i = 0; i < 5; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // Before the fix this grew by >= 5 (one per second). Allow a couple of async data renders.
    expect(renders - before).toBeLessThan(3);
    global.fetch = realFetch;
  });

  it('source guard: the root hook has no clockMs state and AppViews uses the clock boundary', () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), 'src/app/useAppSessionData.jsx'), 'utf8');
    expect(hook).not.toMatch(/setClockMs|\[clockMs/);
    const views = fs.readFileSync(path.resolve(process.cwd(), 'src/app/AppViews.jsx'), 'utf8');
    expect(views).toContain('<NowBoundary');
  });
});

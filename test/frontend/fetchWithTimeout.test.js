import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, isTimeoutError } from '../../frontend/src/app/fetchWithTimeout';
import { __resetInfraForTest, getInfraHealth } from '../../frontend/src/app/infraHealth';

beforeEach(() => { vi.useFakeTimers(); __resetInfraForTest(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); __resetInfraForTest(); });

const hangingFetch = () => vi.fn((_url, { signal }) => new Promise((_res, rej) => {
  signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
}));

describe('fetchWithTimeout', () => {
  it('rejects a hanging request with TimeoutError (not AbortError) and flags the backend', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const p = fetchWithTimeout('/api/stats', { timeoutMs: 1000, infra: 'backend' });
    const assertion = expect(p).rejects.toSatisfy((e) => isTimeoutError(e) && e.name !== 'AbortError');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(getInfraHealth().backend).toBe(true);
  });

  it('a caller abort stays an AbortError and does not flag the backend', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const ctl = new AbortController();
    const p = fetchWithTimeout('/api/orders', { timeoutMs: 1000, infra: 'backend', signal: ctl.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    ctl.abort();
    await assertion;
    expect(getInfraHealth().backend).toBe(false);
  });

  it('turns a throwing URL thunk (API policy violation) into a rejection', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchWithTimeout(() => { throw new Error('policy'); })).rejects.toThrow('policy');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('flags 5xx but not 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 503 }));
    await fetchWithTimeout('/a', { infra: 'backend' });
    expect(getInfraHealth().backend).toBe(false);
    await fetchWithTimeout('/b', { infra: 'backend' });
    expect(getInfraHealth().backend).toBe(true);
  });
});

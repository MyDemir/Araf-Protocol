import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithTimeout } from '../../frontend/src/app/fetchWithTimeout';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// [TR] F4-13: zaman aşımı gövde okumasını da kapsar; başlıklar gelip gövde takılırsa TimeoutError.
describe('F4-13: fetchJsonWithTimeout', () => {
  it('gövde akışı takılırsa TimeoutError ile reddeder ve isteği iptal eder', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      init.signal.addEventListener('abort', () => { aborted = true; });
      // [TR] Gerçek fetch gibi: iptalde takılı gövde okuması AbortError ile reddedilir.
      return {
        ok: true,
        status: 200,
        json: () => new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      };
    }));
    const p = fetchJsonWithTimeout('http://x/y', { timeoutMs: 1000 });
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(aborted).toBe(true);
  });

  it('normal yanıtta {res, data} döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ a: 1 }) })));
    const out = await fetchJsonWithTimeout('http://x/y', { timeoutMs: 1000 });
    expect(out.data).toEqual({ a: 1 });
    expect(out.res.ok).toBe(true);
  });
});

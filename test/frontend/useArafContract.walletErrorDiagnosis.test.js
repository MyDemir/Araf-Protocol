import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const WALLET = '0x00000000000000000000000000000000000000BB';
let walletChain = 84532;
const writeContract = vi.fn();
const simulateContract = vi.fn();

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract: vi.fn().mockResolvedValue(0n), waitForTransactionReceipt: vi.fn(), simulateContract }),
  useWalletClient: () => ({ data: { writeContract, account: { address: WALLET } } }),
  useChainId: () => walletChain,
  useAccount: () => ({ chainId: walletChain }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return renderHook(() => hook.useArafContract()).result.current;
};

const revertErr = (errorName) => {
  const inner = Object.assign(new Error('reverted'), { data: { errorName } });
  const outer = Object.assign(new Error('The contract function reverted'), {
    cause: inner,
    walk: (fn) => (fn(inner) ? inner : fn(outer) ? outer : null),
  });
  return outer;
};
const call = (c) => c.createSellOrder('0x1111111111111111111111111111111111111111', 1n, 1n, 1, '0x' + '00'.repeat(32), 0);
const logBody = () => JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body);

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.setItem('araf_lang', 'TR');
});
afterEach(() => {
  vi.unstubAllEnvs(); writeContract.mockReset(); simulateContract.mockReset(); walletChain = 84532; localStorage.clear();
});

describe('cuzdan hatasi teshisi', () => {
  it('(a) genel cuzdan hatasi + simulasyon TierNotAllowed: cevrilmis mesaj', async () => {
    writeContract.mockRejectedValue(new Error('İşlem parametreleri geçersiz.'));
    simulateContract.mockRejectedValue(revertErr('TierNotAllowed'));
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(err.shortMessage).toBe('Bu tier için seviyeniz yetersiz.');
    expect(logBody().message).toContain('diag=contract-revert:TierNotAllowed');
  });

  it('(b) -32029 + simulasyon basarili + 84532: cuzdan RPC mesaji', async () => {
    writeContract.mockRejectedValue(Object.assign(new Error('exceeded maximum retry limit {"code":-32029,"message":"public rate limit exceeded"} requestUrl: "https://lb.routeme.sh/rpc/evm/84532"'), { code: 'SERVER_ERROR' }));
    simulateContract.mockResolvedValue({});
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(err.shortMessage).toContain('https://sepolia.base.org');
    expect(err.shortMessage).toContain('cüzdanınızın ağ bağlantısından');
    const msg = logBody().message;
    expect(msg).toContain('diag=wallet-rpc');
    expect(msg).toContain('rpcCode=-32029');
  });

  it('(b2) bilinmeyen zincirde adres verilmez; 8453 mainnet adresi', async () => {
    const { buildWalletRpcMessage } = await import('../../frontend/src/app/walletRpcDiagnosis');
    const unknown = buildWalletRpcMessage(1234, 'TR');
    expect(unknown).toContain('RPC ayarını kontrol edin');
    expect(unknown).not.toMatch(/https?:\/\//);
    expect(buildWalletRpcMessage(8453, 'EN')).toContain('https://mainnet.base.org');
  });

  it('yetersiz gas: simulasyon yok, gas mesaji', async () => {
    writeContract.mockRejectedValue(Object.assign(new Error('insufficient funds for gas * price + value'), { name: 'InsufficientFundsError' }));
    simulateContract.mockResolvedValue({});
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(simulateContract).not.toHaveBeenCalled();
    expect(err.shortMessage).toBe('Cüzdanınızda işlem ücreti (gas) için yeterli ETH yok. Base Sepolia ETH ekleyip tekrar deneyin.');
    expect(logBody().message).toContain('diag=wallet-insufficient-gas');
  });

  it('(c) kullanici reddi: simulasyon yok, mesaj degismez', async () => {
    writeContract.mockRejectedValue(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(simulateContract).not.toHaveBeenCalled();
    expect(err.shortMessage).toBeUndefined();
    expect(err.message).toBe('User rejected the request.');
  });

  it('(d) hata zaten errorName iceriyor: simulasyon yok', async () => {
    writeContract.mockRejectedValue(revertErr('TierNotAllowed'));
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(simulateContract).not.toHaveBeenCalled();
    expect(err.shortMessage).toBe('Bu tier için seviyeniz yetersiz.');
  });

  it('(e) simulasyon ag hatasi: mevcut mesaj korunur', async () => {
    writeContract.mockRejectedValue(new Error('İşlem parametreleri geçersiz.'));
    simulateContract.mockRejectedValue(new Error('fetch failed'));
    const c = await load();
    const err = await call(c).catch((e) => e);
    expect(err.shortMessage).toBeUndefined();
    expect(err.message).toBe('İşlem parametreleri geçersiz.');
  });

  it('(e2) simulasyon zaman asimi: mevcut mesaj korunur', async () => {
    vi.useFakeTimers();
    try {
      writeContract.mockRejectedValue(new Error('generic'));
      simulateContract.mockReturnValue(new Promise(() => {}));
      const c = await load();
      const p = call(c).catch((e) => e);
      await vi.advanceTimersByTimeAsync(9000);
      const err = await p;
      expect(err.message).toBe('generic');
      expect(err.shortMessage).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('(f) crash log mesajinda adres yok, teshis turu var', async () => {
    writeContract.mockRejectedValue(new Error(`failed for ${WALLET} on ${ESCROW}`));
    simulateContract.mockResolvedValue({});
    const c = await load();
    await call(c).catch(() => {});
    const msg = logBody().message;
    expect(msg).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(msg).toContain('diag=wallet-rpc');
  });
});

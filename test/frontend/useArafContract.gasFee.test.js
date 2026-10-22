import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const TEST_TOKEN = '0x1111111111111111111111111111111111111111';
const ME = '0x00000000000000000000000000000000000000BB';
const writeContract = vi.fn();
let pc;

vi.mock('wagmi', () => ({
  usePublicClient: () => pc,
  useWalletClient: () => ({ data: { writeContract, account: { address: ME } } }),
  useChainId: () => 84532,
  useAccount: () => ({ chainId: 84532 }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  vi.stubEnv('VITE_USDT_ADDRESS', TEST_TOKEN);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return renderHook(() => hook.useArafContract()).result.current;
};
const okClient = (over = {}) => ({
  readContract: vi.fn().mockResolvedValue(0n),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', logs: [] }),
  simulateContract: vi.fn().mockRejectedValue(new Error('sim')),
  estimateContractGas: vi.fn().mockResolvedValue(100_000n),
  estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n }),
  getBalance: vi.fn().mockResolvedValue(10n ** 18n),
  ...over,
});
const actions = {
  write: (c) => c.registerWallet(),
  approve: (c) => c.approveToken(TEST_TOKEN, 1n),
  mint: (c) => c.mintToken(TEST_TOKEN),
};

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  writeContract.mockResolvedValue('0xhash');
  pc = okClient();
});
afterEach(() => { vi.unstubAllEnvs(); writeContract.mockReset(); });

describe.each(Object.keys(actions))('%s: gas/ucret ve ETH on kontrolu', (name) => {
  it('gas (%20 tamponlu) ve ucret alanlari verilir', async () => {
    const c = await load();
    await actions[name](c);
    const arg = writeContract.mock.calls[0][0];
    expect(arg.gas).toBe(120_000n);
    // F2-19: (2e9 - 1e6) * 5/3 + 1e6 (baz bilesen 1.2x -> 2x)
    expect(arg.maxFeePerGas).toBe(3_332_666_666n);
    expect(arg.maxPriorityFeePerGas).toBe(1_000_000n);
  });

  it('tahmin hatasinda alansiz gonderir (eski davranis), log atmaz', async () => {
    pc = okClient({
      estimateContractGas: vi.fn().mockRejectedValue(new Error('execution reverted')),
      estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('rpc down')),
    });
    const c = await load();
    await actions[name](c);
    const arg = writeContract.mock.calls[0][0];
    expect(arg).not.toHaveProperty('gas');
    expect(arg).not.toHaveProperty('maxFeePerGas');
    expect(arg).not.toHaveProperty('maxPriorityFeePerGas');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('yetersiz ETH: writeContract cagrilmaz, Turkce hata', async () => {
    pc = okClient({ chain: { id: 84532 }, getBalance: vi.fn().mockResolvedValue(1n) });
    const c = await load();
    await expect(actions[name](c)).rejects.toThrow('Base Sepolia ETH bakiyen işlem ücretine yetmiyor');
    expect(writeContract).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('bakiye okunamazsa engellemez', async () => {
    pc = okClient({ getBalance: vi.fn().mockRejectedValue(new Error('rpc')) });
    const c = await load();
    await actions[name](c);
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it('bakiye tam maliyete esitse engellemez', async () => {
    pc = okClient({ getBalance: vi.fn().mockResolvedValue(120_000n * 3_332_666_666n) });
    const c = await load();
    await actions[name](c);
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it('estimateContractGas cuzdanin account adresini alir', async () => {
    const c = await load();
    await actions[name](c);
    expect(pc.estimateContractGas.mock.calls[0][0].account).toBe(ME);
  });

  it('biri dusse digerleri kullanilir (fee dusse gas yine verilir)', async () => {
    pc = okClient({ estimateFeesPerGas: vi.fn().mockRejectedValue(new Error('x')) });
    const c = await load();
    await actions[name](c);
    const arg = writeContract.mock.calls[0][0];
    expect(arg.gas).toBe(120_000n);
    expect(arg).not.toHaveProperty('maxFeePerGas');
  });
});

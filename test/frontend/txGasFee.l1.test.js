import { describe, it, expect, vi, beforeEach } from 'vitest';

const l1 = vi.fn();
vi.mock('viem/op-stack', () => ({ estimateContractL1Fee: (...a) => l1(...a) }));

import { prepareTxParams } from '../../frontend/src/app/txGasFee';

const GAS_RAW = 100_000n; // buffered -> 120_000
const FEE = 2_000_000_000n;
// F2-19: maxFeePerGas = (FEE - 1) * 5/3 + 1 = 3_333_333_332
const L2_COST = 120_000n * 3_333_333_332n;
const L1_FEE = 50_000_000_000_000n;
const client = (chainId, balance, over = {}) => ({
  chain: chainId == null ? undefined : { id: chainId },
  estimateContractGas: vi.fn().mockResolvedValue(GAS_RAW),
  estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: FEE, maxPriorityFeePerGas: 1n }),
  getBalance: vi.fn().mockResolvedValue(balance),
  ...over,
});
const ctx = (publicClient) => ({ publicClient, account: '0x' + '1'.repeat(40), address: '0x' + '2'.repeat(40), abi: [], functionName: 'f', args: [] });

beforeEach(() => { l1.mockReset(); l1.mockResolvedValue(L1_FEE); });

describe('prepareTxParams: L1 veri ucreti (OP Stack)', () => {
  it('L2 maliyetini karsilayip L1 ile toplami karsilamayan bakiye reddedilir', async () => {
    const pc = client(84532, L2_COST + L1_FEE - 1n);
    await expect(prepareTxParams(ctx(pc))).rejects.toThrow('Base Sepolia ETH bakiyen işlem ücretine yetmiyor');
    expect(l1).toHaveBeenCalledTimes(1);
  });

  it('toplam maliyete esit bakiye gecer', async () => {
    const out = await prepareTxParams(ctx(client(84532, L2_COST + L1_FEE)));
    expect(out.gas).toBe(120_000n);
  });

  it('L1 tahmini basarisizsa L2 ucretiyle karsilastirir (engellemez, loglamaz)', async () => {
    l1.mockRejectedValue(new Error('oracle down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(prepareTxParams(ctx(client(84532, L2_COST)))).resolves.toBeTruthy();
    await expect(prepareTxParams(ctx(client(84532, L2_COST - 1n)))).rejects.toThrow('yetmiyor');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('OP Stack olmayan zincirde (31337) ya da zincirsizde L1 sorulmaz', async () => {
    await expect(prepareTxParams(ctx(client(31337, L2_COST)))).resolves.toBeTruthy();
    await expect(prepareTxParams(ctx(client(undefined, L2_COST)))).resolves.toBeTruthy();
    expect(l1).not.toHaveBeenCalled();
  });
});

describe('prepareTxParams: hata mesaji aktif zincir adini tasir', () => {
  it('mainnet (8453): Base Mainnet ETH, Base Sepolia gecmez', async () => {
    const err = await prepareTxParams(ctx(client(8453, 1n))).catch((e) => e);
    expect(err.message).toBe('Base Mainnet ETH bakiyen işlem ücretine yetmiyor. Cüzdanına Base Mainnet ETH ekleyip tekrar dene.');
    expect(err.message).not.toMatch(/Sepolia/);
    expect(err.name).toBe('InsufficientNativeBalance');
  });

  it('sepolia (84532): Base Sepolia ETH', async () => {
    const err = await prepareTxParams(ctx(client(84532, 1n))).catch((e) => e);
    expect(err.message).toBe('Base Sepolia ETH bakiyen işlem ücretine yetmiyor. Cüzdanına Base Sepolia ETH ekleyip tekrar dene.');
  });
});

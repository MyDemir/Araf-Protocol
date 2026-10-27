import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeBuilderCodeSuffix } from '../../frontend/src/app/builderCode';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const TOKEN = '0x1111111111111111111111111111111111111111';
const ME = '0x00000000000000000000000000000000000000BB';
const SUFFIX = '0x62635f38726c39776d6a780b0080218021802180218021802180218021';
const BASEAPP = '0x62617365617070070080218021802180218021802180218021';

const writeContract = vi.fn();
const estimateContractGas = vi.fn();

vi.mock('wagmi', () => ({
  usePublicClient: () => ({
    readContract: vi.fn().mockResolvedValue(0n),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
    estimateContractGas,
  }),
  useWalletClient: () => ({ data: { writeContract, account: { address: ME } } }),
  useChainId: () => 84532,
  useAccount: () => ({ chainId: 84532 }),
}));

describe('encodeBuilderCodeSuffix', () => {
  it('baseapp (Base resmi ornek)', () => {
    expect(encodeBuilderCodeSuffix('baseapp')).toBe(BASEAPP);
  });
  it('bc_8rl9wmjx', () => {
    expect(encodeBuilderCodeSuffix('bc_8rl9wmjx')).toBe(SUFFIX);
  });
  it('gecersiz kod: bos ek, firlatmaz', () => {
    expect(encodeBuilderCodeSuffix('')).toBe('');
    expect(encodeBuilderCodeSuffix('çğ')).toBe('');
    expect(encodeBuilderCodeSuffix('a\nb')).toBe('');
    expect(encodeBuilderCodeSuffix('x'.repeat(256))).toBe('');
    expect(encodeBuilderCodeSuffix(undefined)).toBe('');
    expect(encodeBuilderCodeSuffix('x'.repeat(255)).endsWith('ff0080218021802180218021802180218021')).toBe(true);
  });
});

describe('builderCode sabitleri (env)', () => {
  afterEach(() => vi.unstubAllEnvs());
  const load = async () => { vi.resetModules(); return import('../../frontend/src/app/builderCode'); };
  it('bos env: varsayilan kod', async () => {
    vi.stubEnv('VITE_BASE_BUILDER_CODE', '');
    const m = await load();
    expect(m.BUILDER_CODE).toBe('bc_8rl9wmjx');
    expect(m.BUILDER_DATA_SUFFIX).toBe(SUFFIX);
  });
  it('env ile degistirilebilir', async () => {
    vi.stubEnv('VITE_BASE_BUILDER_CODE', 'baseapp');
    expect((await load()).BUILDER_DATA_SUFFIX).toBe(BASEAPP);
  });
  it('gecersiz env: ek bos, BUILDER_SUFFIX_PARAMS bos nesne', async () => {
    vi.stubEnv('VITE_BASE_BUILDER_CODE', 'çğ');
    const m = await load();
    expect(m.BUILDER_DATA_SUFFIX).toBe('');
    expect(m.BUILDER_SUFFIX_PARAMS).toEqual({});
  });
});

describe('yazma yollari writeContract/estimateContractGas dataSuffix gecirir', () => {
  beforeEach(() => {
    vi.resetModules();
    writeContract.mockReset().mockResolvedValue('0xhash');
    estimateContractGas.mockReset().mockResolvedValue(100_000n);
    vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
    vi.stubEnv('VITE_USDT_ADDRESS', TOKEN);
    vi.stubEnv('VITE_REWARDS_ADDRESS', '0x00000000000000000000000000000000000000CC');
    vi.stubEnv('VITE_REVENUE_VAULT_ADDRESS', '0x00000000000000000000000000000000000000DD');
  });
  afterEach(() => vi.unstubAllEnvs());

  const araf = async () => {
    const hook = await import('../../frontend/src/hooks/useArafContract');
    return renderHook(() => hook.useArafContract()).result.current;
  };

  it('useArafContract.writeContract (registerWallet) + gaz tahmini', async () => {
    const c = await araf();
    await c.registerWallet();
    expect(writeContract.mock.calls[0][0].dataSuffix).toBe(SUFFIX);
    expect(estimateContractGas.mock.calls[0][0].dataSuffix).toBe(SUFFIX);
  });
  it('approveToken', async () => {
    const c = await araf();
    await c.approveToken(TOKEN, 1n);
    expect(writeContract.mock.calls[0][0].dataSuffix).toBe(SUFFIX);
  });
  it('mintToken', async () => {
    const c = await araf();
    await c.mintToken(TOKEN);
    expect(writeContract.mock.calls[0][0].dataSuffix).toBe(SUFFIX);
  });
  it('useRewardsContract writeRewards ve writeVault', async () => {
    const hook = await import('../../frontend/src/hooks/useRewardsContract');
    const c = renderHook(() => hook.useRewardsContract()).result.current;
    await c.claim(1, TOKEN);
    expect(writeContract.mock.calls[0][0].dataSuffix).toBe(SUFFIX);
    await c.fundGlobalRewards(TOKEN, 1n, 1n, '0x' + '11'.repeat(32));
    expect(writeContract.mock.calls[1][0].dataSuffix).toBe(SUFFIX);
  });
});

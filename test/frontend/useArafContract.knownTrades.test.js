import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbi } from 'viem';
import { readKnownTradeIds } from '../../frontend/src/app/knownTrades';

const ESCROW = '0x00000000000000000000000000000000000000aa';
const WALLET = '0x00000000000000000000000000000000000000bb';
const CHAIN = 84532;

const ORDER_FILLED = parseAbi(['event OrderFilled(uint256 indexed orderId, uint256 indexed tradeId, address indexed filler, uint256 fillAmount, uint256 remainingAmount, uint8 paymentRiskLevelSnapshot, bytes32 childListingRef)']);
const filledLog = (orderId, tradeId) => ({
  address: ESCROW,
  topics: encodeEventTopics({ abi: ORDER_FILLED, eventName: 'OrderFilled', args: { orderId, tradeId, filler: WALLET } }),
  data: encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
    [1_000_000n, 0n, 1, `0x${'00'.repeat(32)}`],
  ),
});

let receipt = { status: 'success', logs: [] };
const multicall = vi.fn();
const publicClient = {
  readContract: vi.fn().mockResolvedValue(0n),
  waitForTransactionReceipt: vi.fn(async () => receipt),
  multicall,
  chain: { contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11' } } },
};
const writeContract = vi.fn().mockResolvedValue('0xhash');

vi.mock('wagmi', () => ({
  usePublicClient: () => publicClient,
  useWalletClient: () => ({ data: { writeContract, account: { address: WALLET } } }),
  useChainId: () => CHAIN,
  useAccount: () => ({ chainId: CHAIN, address: WALLET }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return { hook, c: renderHook(() => hook.useArafContract()).result.current };
};

const scope = { wallet: WALLET, escrow: ESCROW, chainId: CHAIN };

describe('P4 useArafContract — receipt tradeId kaydı ve toplu okuma', () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => { vi.unstubAllEnvs(); writeContract.mockClear(); multicall.mockReset(); });

  it('fillSellOrder receipt\'indeki tradeId bilinen işlemlere yazılır', async () => {
    receipt = { status: 'success', logs: [filledLog(5n, 42n)] };
    const { c } = await load();
    const res = await c.fillSellOrder(5n, 1_000_000n, `0x${'00'.repeat(32)}`);
    expect(res.tradeId).toBe(42n);
    expect(readKnownTradeIds(scope)).toEqual(['42']);
  });

  it('fillBuyOrder receipt\'indeki tradeId de yazılır; tradeId okunamazsa kayıt yapılmaz', async () => {
    receipt = { status: 'success', logs: [filledLog(6n, 43n)] };
    let { c } = await load();
    await c.fillBuyOrder(6n, 1_000_000n, `0x${'00'.repeat(32)}`);
    expect(readKnownTradeIds(scope)).toEqual(['43']);
    receipt = { status: 'success', logs: [] };
    ({ c } = await load());
    const res = await c.fillBuyOrder(7n, 1_000_000n, `0x${'00'.repeat(32)}`);
    expect(res.tradeId).toBeNull();
    expect(readKnownTradeIds(scope)).toEqual(['43']);
  });

  it('depolama hata verse de fill akışı bozulmaz', async () => {
    receipt = { status: 'success', logs: [filledLog(5n, 44n)] };
    const { hook, c } = await load();
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation((k) => { if (String(k).startsWith('araf_known_trades')) throw new Error('quota'); });
    await expect(c.fillSellOrder(5n, 1_000_000n, `0x${'00'.repeat(32)}`)).resolves.toMatchObject({ tradeId: 44n });
    spy.mockRestore();
    expect(() => hook.rememberFilledTradeId({ wallet: WALLET, chainId: CHAIN, tradeId: 1n, storage: { getItem: () => { throw new Error('x'); } } })).not.toThrow();
  });

  it('getTradesBatch multicall\'u allowFailure ile tek çağrıda yapar; başarısız id null olur', async () => {
    multicall.mockResolvedValue([{ status: 'success', result: { id: 1n } }, { status: 'failure', error: new Error('x') }]);
    const { c } = await load();
    const out = await c.getTradesBatch(['1', '2']);
    expect(multicall).toHaveBeenCalledTimes(1);
    expect(multicall.mock.calls[0][0]).toMatchObject({ allowFailure: true });
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(2);
    expect(out).toEqual([{ id: 1n }, null]);
  });

  it('multicall olmayan istemcide readTradesBatch null döner (çağıran tek tek okur)', async () => {
    const { hook } = await load();
    await expect(hook.readTradesBatch({ readContract: vi.fn() }, ['1'], ESCROW)).resolves.toBeNull();
    await expect(hook.readTradesBatch({ multicall, chain: { contracts: {} } }, ['1'], ESCROW)).resolves.toBeNull();
  });
});

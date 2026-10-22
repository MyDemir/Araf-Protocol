import { describe, expect, it } from 'vitest';
import { decodeErrorResult, encodeErrorResult, parseAbi } from 'viem';
import { ARAF_CONTRACT_ERROR_ABI, describeContractErrorName } from '../../frontend/src/app/contractErrors';

const abi = parseAbi(ARAF_CONTRACT_ERROR_ABI);
const ADDR = '0x00000000000000000000000000000000000000aa';

const CASES = [
  { name: 'ZeroAddress', args: undefined, tr: 'Sıfır adres girilemez.', en: 'The zero address is not allowed.' },
  {
    name: 'RevenueIntentFailed',
    args: ['0x1234'],
    tr: 'İşlem protokol gelir kaydında reddedildi, tekrar denemeyin; yöneticiye bildirin.',
    en: 'The protocol revenue record rejected this transaction. Do not retry; notify the admin.',
  },
  {
    name: 'InvalidRewardsBinding',
    args: [ADDR],
    tr: 'Ödül sözleşmesi bu gelir kasasına bağlı değil. Adresi kontrol edin.',
    en: 'The rewards contract is not bound to this revenue vault. Check the address.',
  },
];

describe('dalga5 K: yeni kontrat hataları', () => {
  for (const c of CASES) {
    it(`${c.name} viem ile çözülür ve TR/EN mesaja eşlenir`, () => {
      const data = encodeErrorResult({ abi, errorName: c.name, args: c.args });
      const decoded = decodeErrorResult({ abi, data });
      expect(decoded.errorName).toBe(c.name);
      expect(describeContractErrorName(decoded.errorName, 'TR')).toBe(c.tr);
      expect(describeContractErrorName(decoded.errorName, 'EN')).toBe(c.en);
    });
  }
});

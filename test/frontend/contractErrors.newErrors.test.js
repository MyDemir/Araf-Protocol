import { describe, expect, it } from 'vitest';
import { ARAF_CONTRACT_ERROR_ABI, describeContractErrorName } from '../../frontend/src/app/contractErrors';

describe('new contract errors have ABI fragments and TR/EN copy', () => {
  for (const name of ['SettlementProposalMismatch', 'PaymentWindowClosed', 'NoCancelConsent', 'NotTradeParty']) {
    it(`${name} is decodable and translated`, () => {
      expect(ARAF_CONTRACT_ERROR_ABI.some((f) => f.startsWith(`error ${name}(`))).toBe(true);
      expect(describeContractErrorName(name, 'TR')).toBeTruthy();
      expect(describeContractErrorName(name, 'EN')).toBeTruthy();
      expect(describeContractErrorName(name, 'TR')).not.toBe(describeContractErrorName(name, 'EN'));
    });
  }
});

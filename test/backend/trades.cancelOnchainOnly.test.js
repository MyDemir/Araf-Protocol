const express = require('express');
const request = require('supertest');

jest.mock('../../backend/scripts/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.wallet = '0x1111111111111111111111111111111111111111';
    next();
  },
  requireSessionWalletMatch: (_req, _res, next) => next(),
}));

jest.mock('../../backend/scripts/middleware/rateLimiter', () => ({
  roomReadLimiter: (_req, _res, next) => next(),
  coordinationWriteLimiter: (_req, _res, next) => next(),
}));

jest.mock('../../backend/scripts/models/Trade', () => ({ findById: jest.fn() }));
jest.mock('../../backend/scripts/models/User', () => ({ find: jest.fn().mockResolvedValue([]) }));

const router = require('../../backend/scripts/routes/trades');

// [TR] İptal koordinasyonu tamamen on-chain: her taraf proposeOrApproveCancel(tradeId) çağırır, worker
//      CancelProposed event'ini mirror'lar. Backend imza saklamaz ve iptal için ikinci bir onay kapısı açmaz.
// [EN] Cancel coordination is fully on-chain: each party calls proposeOrApproveCancel(tradeId) and the worker
//      mirrors CancelProposed. The backend stores no signatures and opens no second consent gate.
describe('cancel coordination is on-chain only', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/trades', router);

  it('no longer exposes the off-chain propose-cancel signature route', async () => {
    const res = await request(app)
      .post('/api/trades/propose-cancel')
      .send({ tradeId: '507f1f77bcf86cd799439011', signature: '0x' + '11'.repeat(65), deadline: 1 });
    expect(res.status).toBe(404);
  });

  it('route source carries no EIP-712 cancel verification leftovers', () => {
    const src = require('fs').readFileSync(require.resolve('../../backend/scripts/routes/trades'), 'utf8');
    expect(src).not.toMatch(/verifyTypedData|sigNonces|domainSeparator|CancelProposal/);
  });
});

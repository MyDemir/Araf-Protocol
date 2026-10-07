const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertAllowedChain, appendTokenRecord } = require('../../contracts/scripts/deployTestToken');

describe('deployTestToken script guards', function () {
  it('allows only Base Sepolia and local chain ids', function () {
    expect(() => assertAllowedChain(84532)).to.not.throw();
    expect(() => assertAllowedChain(31337n)).to.not.throw();
    expect(() => assertAllowedChain(8453)).to.throw(/84532 ve 31337/);
    expect(() => assertAllowedChain(1)).to.throw(/84532 ve 31337/);
  });

  it('appends records and preserves existing ones', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    const file = path.join(dir, 'sub', 'x-test-tokens.json');
    appendTokenRecord(file, { symbol: 'A' });
    const list = appendTokenRecord(file, { symbol: 'B' });
    expect(list.map((r) => r.symbol)).to.deep.equal(['A', 'B']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).to.have.length(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

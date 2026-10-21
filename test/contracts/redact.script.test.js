const { expect } = require('chai');
const { redactText, formatError } = require('../../contracts/scripts/lib/redact');

describe('contracts/scripts/lib/redact (K4-10)', () => {
  const url = 'https://base-sepolia.g.alchemy.com/v2/AbCdEf0123456789AbCdEf0123456789';
  const pk = '0x' + 'ab'.repeat(32);

  it('masks RPC URLs, private keys and long tokens', () => {
    const out = redactText(`fail ${url} key=${pk} tok=AbCdEf0123456789AbCdEf0123456789xx`, {});
    expect(out).to.not.contain('alchemy');
    expect(out).to.not.contain('abab');
    expect(out).to.not.contain('AbCdEf0123456789');
  });

  it('does not mask 0x+40 hex addresses but still masks 64 hex', function () {
    const addr = '0x' + 'ab'.repeat(20);
    expect(redactText('owner()=' + addr, {})).to.equal('owner()=' + addr);
    const out = redactText('k=' + 'cd'.repeat(32) + ' k2=0x' + 'cd'.repeat(32), {});
    expect(out).to.not.contain('cdcd');
    expect(redactText('x=0x' + 'ab'.repeat(21), {})).to.not.contain('abab');
  });

  it('masks exact secret env values even without a recognizable shape', () => {
    expect(redactText('boom secretvalue123 end', { DEPLOYER_PRIVATE_KEY: 'secretvalue123' })).to.equal('boom [redacted] end');
  });

  it('formatError prints name+code+masked first line, never the raw object or stack', () => {
    const err = Object.assign(new Error(`server error for ${url}\n  at stack`), { code: 'SERVER_ERROR', info: { requestUrl: url } });
    const out = formatError(err, {});
    expect(out).to.match(/^Error \[SERVER_ERROR\]: server error for /);
    expect(out).to.not.contain('alchemy');
    expect(out).to.not.contain('stack');
    expect(out).to.not.contain('requestUrl');
  });
});

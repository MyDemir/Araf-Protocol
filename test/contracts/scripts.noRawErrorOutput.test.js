// K4-10: deploy betikleri ham hata nesnesini basmaz (RPC URL/anahtar sızıntısı); formatError kullanırlar.
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../contracts/scripts');
const FILES = ['deploy.js', 'deployRewards.js', 'deployTestToken.js', 'rewardsOps.js', 'smokeRewards.js', 'gasBaseline.js', 'verify.js'];

describe('contracts/scripts top-level error output (K4-10)', function () {
  for (const f of FILES) {
    it(`${f} never prints a raw error object`, function () {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      expect(src, 'must import formatError').to.match(/formatError/);
      expect(src).to.not.match(/console\.error\(\s*(e|err|error)\s*\)/);
    });
  }
});

// [TR] Dalga 6 P27 (K4-07): hangi job'lar GitHub environment taşır + CODEOWNERS yolları. Ağ yok.
// [EN] Wave 6 P27: pins which jobs carry the base-sepolia environment, and CODEOWNERS paths.
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const WF = path.join(ROOT, '.github/workflows');

describe('K4-07: workflow environment ve CODEOWNERS', function () {
  const expected = {
    'deploy-base-sepolia.yml': { deploy: 'base-sepolia' },
    'deploy-runtime-base-sepolia.yml': { 'runtime-deploy': 'base-sepolia' },
    'escrow-registry-adopt.yml': { adopt: 'base-sepolia' },
    'rotate-escrow.yml': { rotate: 'base-sepolia' },
    'release.yml': { release: undefined },
    'ci.yml': { backend: undefined, frontend: undefined, 'contracts-abi-drift': undefined },
  };

  for (const [file, jobs] of Object.entries(expected)) {
    it(`${file}: environment alanlari sabit`, function () {
      const wf = yaml.load(fs.readFileSync(path.join(WF, file), 'utf8'));
      expect(Object.keys(wf.jobs).sort()).to.deep.equal(Object.keys(jobs).sort());
      for (const [job, env] of Object.entries(jobs)) {
        expect(wf.jobs[job].environment, `${file}:${job}`).to.equal(env);
      }
    });
  }

  it('CODEOWNERS: kritik yollar @MyDemir sahipli', function () {
    const lines = fs.readFileSync(path.join(ROOT, '.github/CODEOWNERS'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const map = Object.fromEntries(lines.map((l) => l.split(/\s+/)));
    for (const p of ['/.github/', '/contracts/src/', '/backend/scripts/services/encryption.js',
      '/backend/scripts/services/siwe.js', '/frontend/vercel.json']) {
      expect(map[p], p).to.equal('@MyDemir');
    }
    expect(Object.keys(map)).to.have.length(5);
  });
});

// [TR] Arşiv yalıtımı: API katmanı arşiv koleksiyonlarını okumaz; rotasyon betiği app.js zincirinde yok.
// [EN] Archive isolation: API layers never reference archive collections; rotation script not in app.js chain.
const fs = require('fs');
const path = require('path');

const SCRIPTS = path.join(__dirname, '../../backend/scripts');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

describe('archive isolation (static)', () => {
  it('routes/, services/, jobs/ never mention archive_ (except archiveRetention.js)', () => {
    const offenders = ['routes', 'services', 'jobs']
      .flatMap((d) => walk(path.join(SCRIPTS, d)))
      .filter((f) => path.basename(f) !== 'archiveRetention.js')
      .filter((f) => fs.readFileSync(f, 'utf8').includes('archive_'))
      .map((f) => path.relative(SCRIPTS, f));
    expect(offenders).toEqual([]);
  });

  it('rotate-escrow.js is not in the app.js require chain', () => {
    const seen = new Set();
    const queue = [path.join(SCRIPTS, 'app.js')];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/rotate-escrow/);
      for (const m of src.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
        const base = path.resolve(path.dirname(file), m[1]);
        const resolved = [base, `${base}.js`, path.join(base, 'index.js')].find(
          (c) => fs.existsSync(c) && fs.statSync(c).isFile()
        );
        if (resolved) queue.push(resolved);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

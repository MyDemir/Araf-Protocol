import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { ESLint } = createRequire(path.resolve(process.cwd(), 'package.json'))('eslint');

// [TR] E1-07: eval / implied-eval / new Function / javascript: URL ve dangerouslySetInnerHTML lint'te hata olmalı.
describe('E1-07: güvenlik lint kuralları açık', () => {
  const root = path.resolve(process.cwd());
  const lint = async (code) => {
    const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.js') });
    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src/__lint_probe__.jsx') });
    return result.messages.map((m) => m.ruleId);
  };

  it('no-eval', async () => { expect(await lint('export const f = (s) => eval(s);\n')).toContain('no-eval'); });
  it('no-implied-eval', async () => { expect(await lint("export const f = () => setTimeout('x()', 10);\n")).toContain('no-implied-eval'); });
  it('no-new-func', async () => { expect(await lint("export const f = () => new Function('return 1');\n")).toContain('no-new-func'); });
  it('no-script-url', async () => { expect(await lint("export const u = 'javascript:alert(1)';\n")).toContain('no-script-url'); });
  it('dangerouslySetInnerHTML yasak', async () => {
    expect(await lint('export const C = ({ h }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n')).toContain('no-restricted-syntax');
  });
});

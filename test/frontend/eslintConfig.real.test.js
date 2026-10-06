import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// eslint paketi frontend/node_modules altındadır; kökteki testten oradan çözülür.
const { ESLint } = createRequire(path.resolve(process.cwd(), 'package.json'))('eslint');

// [TR] F21: react-hooks eklentisi gerçek olmalı; sahte (boş `create`) eklenti hiçbir ihlali yakalamaz.
describe('F21: frontend ESLint config enforces real react-hooks and recommended rules', () => {
  const frontendRoot = path.resolve(process.cwd());
  const lint = async (code) => {
    const eslint = new ESLint({ cwd: frontendRoot, overrideConfigFile: path.join(frontendRoot, 'eslint.config.js') });
    const [result] = await eslint.lintText(code, { filePath: path.join(frontendRoot, 'src/__lint_probe__.jsx') });
    return result.messages;
  };

  it('reports a missing exhaustive-deps dependency', async () => {
    const messages = await lint(`import { useEffect } from 'react';
export const C = ({ value, onChange }) => { useEffect(() => { onChange(value); }, []); return null; };
`);
    expect(messages.some((m) => m.ruleId === 'react-hooks/exhaustive-deps')).toBe(true);
  });

  it('reports rules-of-hooks violations', async () => {
    const messages = await lint(`import { useState } from 'react';
export const C = ({ on }) => { if (on) { useState(0); } return null; };
`);
    expect(messages.some((m) => m.ruleId === 'react-hooks/rules-of-hooks')).toBe(true);
  });

  it('reports recommended-rule violations (no-undef, no-unused-vars)', async () => {
    const messages = await lint('const unused = 1;\nexport const f = () => notDefinedAnywhere;\n');
    const ids = messages.map((m) => m.ruleId);
    expect(ids).toContain('no-undef');
    expect(ids).toContain('no-unused-vars');
  });

  it('accepts a correct hook and an intentional swallowed catch', async () => {
    const messages = await lint(`import { useEffect } from 'react';
export const C = ({ value, onChange }) => { useEffect(() => { try { onChange(value); } catch (_) {} }, [value, onChange]); return null; };
`);
    expect(messages).toEqual([]);
  });
});

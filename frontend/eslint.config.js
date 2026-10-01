import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// [TR] F21: Önceden react-hooks eklentisi sahteydi (kuralı boş `create: () => ({})` ile "tanımlıyor" ve kapatıyordu);
//      kodda yüzlerce `eslint-disable react-hooks/exhaustive-deps` yorumu hiçbir şeyi denetlemiyordu. Artık gerçek
//      eklenti + ESLint önerilen kuralları açık. React Compiler kuralları (purity / set-state-in-effect ...) bu
//      aşamada KAPSAM DIŞI: yalnız klasik iki kural (rules-of-hooks, exhaustive-deps) zorlanır.
// [EN] F21: the react-hooks "plugin" used to be a stub with an empty rule; disable comments checked nothing.
//      The real plugin plus ESLint recommended rules are now on. React Compiler rules are out of scope here; only
//      the two classic rules (rules-of-hooks, exhaustive-deps) are enforced.
export default [
  {
    linterOptions: {
      // [TR] Bilinçli istisnalar yorumla gerekçelendirilir; kullanılmayan disable yorumları raporlanır.
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // [TR] Bilinçli yutulan hatalar `catch (_) {}` / `catch (_err)` ile yazılır: `_` önekli yakalama/argüman adları ve
      //      boş catch bloğu (best-effort temizlik, log/telemetri) bilinçli istisnadır; diğer her şey hatadır.
      // [EN] Intentionally swallowed errors are written `catch (_) {}` / `catch (_err)`: `_`-prefixed names and empty
      //      catch blocks are the deliberate exception (best-effort cleanup/telemetry); everything else is an error.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Node ortamında çalışan araçlar (vite config, test runner betiği).
    files: ['scripts/**/*.js', 'vite.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];

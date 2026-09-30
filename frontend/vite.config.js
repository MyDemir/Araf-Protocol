import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fromFrontendNodeModules = (...segments) => path.resolve(__dirname, 'node_modules', ...segments)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@testing-library/jest-dom/vitest', replacement: fromFrontendNodeModules('@testing-library/jest-dom/vitest.js') },
      { find: '@testing-library/react', replacement: fromFrontendNodeModules('@testing-library/react') },
      { find: '@testing-library/user-event', replacement: fromFrontendNodeModules('@testing-library/user-event') },
      { find: 'react', replacement: fromFrontendNodeModules('react') },
      // [TR] Kök test/ui-lab (lazy UI Lab) paketleri frontend'in node_modules'undan çözer.
      // [EN] Root test/ui-lab (lazy UI Lab) resolves packages from frontend node_modules.
      { find: 'lucide-react', replacement: fromFrontendNodeModules('lucide-react') },
      { find: 'react-dom', replacement: fromFrontendNodeModules('react-dom') },
      { find: 'viem', replacement: fromFrontendNodeModules('viem') },
      { find: 'wagmi', replacement: fromFrontendNodeModules('wagmi') },
      { find: '@tanstack/react-query', replacement: fromFrontendNodeModules('@tanstack/react-query') },
      { find: 'vitest', replacement: fromFrontendNodeModules('vitest') },
    ],
  },
  build: {
    sourcemap: false,
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: '../test/frontend/setupTests.js',
    include: ['../test/frontend/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
})

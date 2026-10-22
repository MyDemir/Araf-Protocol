import { loadEnv } from 'vite';

// [TR] E1-09: UI Lab sınıfları yalnız geliştirmede ya da VITE_ENABLE_UI_LAB=true build'de CSS'e girer
//      (src/app/uiLab.js ile aynı koşul); normal production CSS'i lab utility'lerini taşımaz.
// [EN] UI Lab classes only reach the CSS in dev or a VITE_ENABLE_UI_LAB=true build (same gate as uiLab.js).
const isProd = process.env.NODE_ENV === 'production';
const labFlag = process.env.VITE_ENABLE_UI_LAB
  ?? loadEnv(isProd ? 'production' : 'development', process.cwd(), 'VITE_').VITE_ENABLE_UI_LAB;
const includeUiLab = !isProd || String(labFlag || '').toLowerCase() === 'true';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...(includeUiLab ? ["../test/ui-lab/**/*.{js,jsx}"] : []),
  ],
  theme: {
    extend: {
      // [TR] Renkler CSS değişkeni olduğu için Tailwind "/10" gibi opaklık eklerini üretemiyordu (bg-danger/10
      //      vb. hiç CSS çıkarmıyordu). color-mix ile her token opaklık destekler; tema değişkenleri aynı kalır.
      // [EN] Tokens are CSS variables, so opacity modifiers (bg-danger/10…) produced no CSS at all.
      //      color-mix gives every token alpha support while keeping the theme variables unchanged.
      colors: Object.fromEntries(Object.entries({
        app: '--color-bg-app',
        shell: '--color-bg-shell',
        surface: '--color-bg-surface',
        elevated: '--color-bg-elevated',
        borderSubtle: '--color-border-subtle',
        borderStrong: '--color-border-strong',
        textPrimary: '--color-text-primary',
        textSecondary: '--color-text-secondary',
        textMuted: '--color-text-muted',
        brand: '--color-brand',
        honey: '--color-honey',
        info: '--color-info',
        warning: '--color-warning',
        danger: '--color-danger',
        success: '--color-success',
      }).map(([name, cssVar]) => [name, ({ opacityValue }) => (
        // Solid utilities (opacity is a --tw-*-opacity var or 1) stay plain var() for older browsers.
        opacityValue === undefined || opacityValue === '1' || String(opacityValue).startsWith('var(')
          ? `var(${cssVar})`
          : `color-mix(in srgb, var(${cssVar}) calc(${opacityValue} * 100%), transparent)`
      )])),
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
        sheet: '1rem',
      },
    },
  },
  plugins: [],
}

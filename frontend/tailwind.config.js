/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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

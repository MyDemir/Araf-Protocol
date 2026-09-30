// [TR] UI Lab'in uygulamaya açılan tek kapısı; frontend/src/app/uiLab.js bunu lazy import eder.
// [EN] The UI Lab's single entry point; lazily imported by frontend/src/app/uiLab.js.
export { default as DevScenarioController } from './controller/DevScenarioController';
export { createLabRuntime, deriveLabTradeRoom, enterScenario } from './appOverlay';

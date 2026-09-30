// [TR] UI Lab (geliştirici senaryo ekranı) kök test/ui-lab klasöründe yaşar ve production paketine girmez:
//      yalnız geliştirmede ya da VITE_ENABLE_UI_LAB=true ile açık build'de dinamik import edilir.
// [EN] The UI Lab lives in the root test/ui-lab folder and never ships in the production bundle:
//      it is dynamically imported only in dev or in a build with VITE_ENABLE_UI_LAB=true.
export const isUiLabEnabled = (env = import.meta.env) => {
  const flag = String(env?.VITE_ENABLE_UI_LAB || '').toLowerCase() === 'true';
  if (flag) return true;
  if (env?.PROD) return false;
  return Boolean(env?.DEV);
};

export const loadUiLab = () => (
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_UI_LAB === 'true'
    ? import('../../../test/ui-lab/index.js')
    : Promise.resolve(null)
);

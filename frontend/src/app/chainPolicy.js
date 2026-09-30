// [TR] Frontend zincir/faucet politikası tek authority noktası.
// [EN] Single authority point for frontend chain/faucet policy.

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const HARDHAT_CHAIN_ID = 31337;

const CHAIN_NAME_BY_ID = {
  [BASE_MAINNET_CHAIN_ID]: 'Base Mainnet',
  [BASE_SEPOLIA_CHAIN_ID]: 'Base Sepolia',
  [HARDHAT_CHAIN_ID]: 'Hardhat Local',
};

export const getSupportedChainIds = (isProd = import.meta.env.PROD) => (
  isProd
    ? [BASE_MAINNET_CHAIN_ID]
    : [HARDHAT_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, BASE_MAINNET_CHAIN_ID]
);

export const getSupportedChainsMap = (isProd = import.meta.env.PROD) => (
  getSupportedChainIds(isProd).reduce((acc, id) => {
    acc[id] = CHAIN_NAME_BY_ID[id];
    return acc;
  }, {})
);

export const isSupportedChainId = (chainId, isProd = import.meta.env.PROD) =>
  Boolean(getSupportedChainsMap(isProd)[chainId]);

export const isMintTokenEnabled = (isProd = import.meta.env.PROD) => !isProd;


// [TR] Deploy uyumu: frontend ile backend aynı escrow kontratına ve desteklenen bir zincire bakmalı.
//      Backend değerleri /api/orders/config -> deployment alanından gelir. Uyumsuzlukta uyarı metinleri döner.
// [EN] Deploy alignment: frontend and backend must point at the same escrow and a supported chain.
export const checkDeploymentAlignment = ({ frontendEscrowAddress, backendDeployment, isProd = import.meta.env.PROD } = {}) => {
  if (!backendDeployment) return [];
  const issues = [];
  const fe = String(frontendEscrowAddress || '').toLowerCase();
  const be = String(backendDeployment.escrowAddress || '').toLowerCase();
  if (fe && be && fe !== be) {
    issues.push(`Escrow adresi uyuşmuyor: frontend ${fe.slice(0, 10)}… / backend ${be.slice(0, 10)}… — işlemler yanlış kontrata gidebilir.`);
  }
  const chainId = Number(backendDeployment.chainId);
  if (chainId && !getSupportedChainIds(isProd).includes(chainId)) {
    issues.push(`Backend zinciri (${chainId}) frontend'in desteklediği zincirler arasında değil.`);
  }
  return issues;
};

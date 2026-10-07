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

export const TARGET_CHAIN_BASE = 'base';
export const TARGET_CHAIN_BASE_SEPOLIA = 'base-sepolia';

const warnedTargetChains = new Set();

// [TR] VITE_TARGET_CHAIN çözümü: 'base' (varsayılan) | 'base-sepolia'. Bilinmeyen değer → uyarı + 'base' (mevcut davranış korunur).
// [EN] Resolves VITE_TARGET_CHAIN: 'base' (default) | 'base-sepolia'. Unknown value -> console warning + 'base' (existing behavior kept).
export const resolveTargetChain = (raw = import.meta.env.VITE_TARGET_CHAIN) => {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '' || value === TARGET_CHAIN_BASE) return TARGET_CHAIN_BASE;
  if (value === TARGET_CHAIN_BASE_SEPOLIA) return TARGET_CHAIN_BASE_SEPOLIA;
  if (!warnedTargetChains.has(value)) {
    warnedTargetChains.add(value);
    console.warn(`[chainPolicy] Unknown VITE_TARGET_CHAIN "${raw}" — falling back to "${TARGET_CHAIN_BASE}". Allowed: ${TARGET_CHAIN_BASE}, ${TARGET_CHAIN_BASE_SEPOLIA}.`);
  }
  return TARGET_CHAIN_BASE;
};

// [TR] Prod'da tek zincir: hedef base-sepolia ise SADECE 84532, aksi halde SADECE 8453. Dev: tam liste.
// [EN] Prod exposes a single chain: only 84532 for base-sepolia target, otherwise only 8453. Dev: full list.
export const getSupportedChainIds = (isProd = import.meta.env.PROD, targetChain = import.meta.env.VITE_TARGET_CHAIN) => {
  if (!isProd) return [HARDHAT_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, BASE_MAINNET_CHAIN_ID];
  return resolveTargetChain(targetChain) === TARGET_CHAIN_BASE_SEPOLIA
    ? [BASE_SEPOLIA_CHAIN_ID]
    : [BASE_MAINNET_CHAIN_ID];
};

export const getSupportedChainsMap = (isProd = import.meta.env.PROD, targetChain = import.meta.env.VITE_TARGET_CHAIN) => (
  getSupportedChainIds(isProd, targetChain).reduce((acc, id) => {
    acc[id] = CHAIN_NAME_BY_ID[id];
    return acc;
  }, {})
);

export const isSupportedChainId = (chainId, isProd = import.meta.env.PROD, targetChain = import.meta.env.VITE_TARGET_CHAIN) =>
  Boolean(getSupportedChainsMap(isProd, targetChain)[chainId]);

export const isMintTokenEnabled = (isProd = import.meta.env.PROD) => !isProd;


// [TR] Deploy uyumu: frontend ile backend aynı escrow kontratına ve desteklenen bir zincire bakmalı.
//      Backend değerleri /api/orders/config -> deployment alanından gelir. Uyumsuzlukta uyarı metinleri döner.
// [EN] Deploy alignment: frontend and backend must point at the same escrow and a supported chain.
export const checkDeploymentAlignment = ({ frontendEscrowAddress, backendDeployment, isProd = import.meta.env.PROD, targetChain = import.meta.env.VITE_TARGET_CHAIN } = {}) => {
  if (!backendDeployment) return [];
  const issues = [];
  const fe = String(frontendEscrowAddress || '').toLowerCase();
  const be = String(backendDeployment.escrowAddress || '').toLowerCase();
  if (fe && be && fe !== be) {
    issues.push(`Escrow adresi uyuşmuyor: frontend ${fe.slice(0, 10)}… / backend ${be.slice(0, 10)}… — işlemler yanlış kontrata gidebilir.`);
  }
  const chainId = Number(backendDeployment.chainId);
  if (chainId && !getSupportedChainIds(isProd, targetChain).includes(chainId)) {
    issues.push(`Backend zinciri (${chainId}) frontend'in desteklediği zincirler arasında değil.`);
  }
  return issues;
};

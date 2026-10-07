import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppProviders from './app/providers/AppProviders.jsx'
import './index.css'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, baseSepolia, hardhat } from 'wagmi/chains'
import { buildRpcTransport } from './app/rpcTransport'
import { loadConnectorsSafely, renderFatalReload } from './app/connectorsLoader'
import { isInMiniApp, scheduleMiniAppReady } from './app/miniapp'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  HARDHAT_CHAIN_ID,
  getSupportedChainIds,
  isTestnetBuild,
} from './app/chainPolicy'

import ErrorBoundary from './components/ErrorBoundary.jsx'

// YÜKS-09 Fix: ErrorBoundary WagmiProvider + QueryClientProvider'ın IÇINE alındı.
//   ÖNCEKİ: ErrorBoundary tüm provider'ları sarmalıyordu. Bir connector (OKX, Coinbase)
//   render hatası verirse ErrorBoundary TÜM uygulamayı, WagmiProvider dahil kapatıyordu.
//   Kullanıcı kilitli Trade Room'a erişemez hale geliyordu.
//   ŞİMDİ: Provider altyapısı çalışmaya devam ederken sadece UI hataları yakalanıyor.

/**
 * Dinamik Codespaces RPC yardımcı fonksiyonu.
 *
 * FRONT-05 Not: Codespaces instance'ı "Public" olarak ayarlanmışsa bu tünel
 * adresi internetten erişilebilir hale gelir. Sadece geliştirme için kullanın.
 * Codespaces "Private" modda tutulması şiddetle tavsiye edilir.
 */
const getCodespacesRPC = (port) => {
  try {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return `http://127.0.0.1:${port}`;
    // [TR] Codespaces: 5173 portunu hedef porta çevir
    return `https://${host.replace('-5173', `-${port}`)}`;
  } catch (_e) {
    return `http://127.0.0.1:${port}`;
  }
};

const CHAIN_BY_ID = {
  [BASE_MAINNET_CHAIN_ID]: base,
  [BASE_SEPOLIA_CHAIN_ID]: baseSepolia,
  [HARDHAT_CHAIN_ID]: hardhat,
};

const wagmiChains = getSupportedChainIds().map((id) => CHAIN_BY_ID[id]).filter(Boolean);

// [TR] P5 — Bağlayıcılar (coinbaseWallet dahil) ayrı chunk'tan yüklenir; ana paket küçülür.
// [EN] P5 — Connectors (incl. coinbaseWallet) load from a separate chunk to keep the main bundle small.
// [TR] WalletConnect geçici olarak kapalı (Reown 403 hatasını engellemek için). Yükleme hatası connectorsLoader'da yönetilir.
const loadConnectors = async () => {
  // [TR] Farcaster connector yalnız mini app içinde eklenir; normal tarayıcıda liste değişmez.
  const inMiniApp = await isInMiniApp()
  return loadConnectorsSafely(
    () => import('wagmi/connectors'),
    console,
    inMiniApp ? () => import('@farcaster/miniapp-wagmi-connector') : null,
  )
}

// [TR] P4 — VITE_RPC_URL birincil RPC, herkese açık RPC yedek (fallback). Prod'da Base, dev'de Base Sepolia'ya uygulanır.
const PRIMARY_RPC = import.meta.env.VITE_RPC_URL
const IS_TESTNET_BUILD = isTestnetBuild()
const buildConfig = (connectors) => createConfig({
  chains: wagmiChains,
  connectors,
  transports: IS_TESTNET_BUILD
    ? {
      // [TR] Prod + base-sepolia: yalnızca Base Sepolia (mainnet karışmaz).
      // [EN] Prod + base-sepolia: Base Sepolia only (no mainnet mixing).
      [baseSepolia.id]: buildRpcTransport(PRIMARY_RPC),
    }
    : {
      [base.id]:        buildRpcTransport(import.meta.env.PROD ? PRIMARY_RPC : undefined),
      ...(import.meta.env.PROD ? {} : {
        [baseSepolia.id]: buildRpcTransport(PRIMARY_RPC),
        // [TR] Hardhat yerel ağı — FRONT-05: sadece development'ta aktif
        [hardhat.id]:     http(getCodespacesRPC(8545)),
      }),
    },
})

const queryClient = new QueryClient()

const bootstrap = async () => {
const config = buildConfig(await loadConnectors())
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/*
      YÜKS-09 Fix: WagmiProvider ve QueryClientProvider DIŞARIDA kalıyor.
      Bu sayede connector/provider hatası tüm uygulamayı kapatmıyor.
      Sadece App ve alt bileşenlerinin render hataları yakalanıyor.
    */}
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AppProviders>
            <App />
          </AppProviders>
        </ErrorBoundary>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
// [TR] İlk render sonrası mini app splash'ını kapat (mini app dışındaysa no-op).
scheduleMiniAppReady()
}

bootstrap().catch((err) => {
  console.error('[bootstrap] fatal', err)
  renderFatalReload(document.getElementById('root'))
})

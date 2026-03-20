import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, baseSepolia, hardhat } from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// L-05 Fix: Global hata sınırı — render hatalarında uygulamanın tamamen çökmesini önler
import ErrorBoundary from './components/ErrorBoundary.jsx'

/**
 * Dinamik Codespaces RPC yardımcı fonksiyonu
 */
const getCodespacesRPC = (port) => {
  try {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return `http://127.0.0.1:${port}`;
    return `https://${host.replace('-5173', `-${port}`)}`;
  } catch (e) {
    return `http://127.0.0.1:${port}`;
  }
};

const config = createConfig({
  // KRİTİK: Vite'da process.env yerine import.meta.env.PROD kullanılır
  chains: import.meta.env.PROD
    ? [base, baseSepolia]
    : [hardhat, baseSepolia, base], 
  connectors: [
    injected(), // OKX Wallet ve diğer eklentiler için
    coinbaseWallet({ appName: 'Araf Protocol' }),
  ],
  transports: {
    [base.id]:       http(),
    [baseSepolia.id]: http(),
    // KRİTİK: Geliştirme modunda dinamik Codespaces linkini kullanır
    [hardhat.id]:    http(import.meta.env.PROD ? undefined : getCodespacesRPC(8545)),
  },
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

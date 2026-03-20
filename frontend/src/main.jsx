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
 * Codespaces URL'sini otomatik olarak Hardhat RPC URL'sine dönüştüren yardımcı fonksiyon.
 * Mobil cihazda (Kiwi) 127.0.0.1 yerine dış HTTPS tünelini kullanmayı sağlar.
 */
const getCodespacesRPC = (port) => {
  try {
    const host = window.location.hostname;
    // Yerel makinedeyse localhost, Codespaces tünelindeyse dinamik URL döndürür
    if (host === 'localhost' || host === '127.0.0.1') return `http://127.0.0.1:${port}`;
    return `https://${host.replace('-5173', `-${port}`)}`;
  } catch (e) {
    return `http://127.0.0.1:${port}`;
  }
};

const config = createConfig({
  /**
   * KRİTİK: Hardhat (31337) ağını listenin en başına aldık. 
   * Bu sayede uygulama açıldığında cüzdanın otomatik olarak yerel ağa bağlanır.
   */
  chains: import.meta.env.PROD
    ? [base, baseSepolia]
    : [hardhat, baseSepolia, base],
  connectors: [
    injected(), // MetaMask, Rabby vb. yerel cüzdanlar
    coinbaseWallet({ appName: 'Araf Protocol' }),
    // GEÇİCİ OLARAK UYUTULDU (403 Reown hatasını engellemek için)
    // walletConnect({ projectId: '3fcc6b444f67d32e656910629a888c34' }),
  ],
  transports: {
    [base.id]:       http(),
    [baseSepolia.id]: http(),
    /**
     * HİBRİT TRANSPORT: 
     * Geliştirme modunda Codespaces dış URL'sini kullanır, canlıda (production) varsayılan RPC'ye döner.
     */
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

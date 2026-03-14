import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// L-05 Fix: Global hata sınırı — render hatalarında uygulamanın tamamen çökmesini önler
import ErrorBoundary from './components/ErrorBoundary.jsx'

// MED-07 Fix: WalletConnect projectId artık hardcoded değil — VITE_WALLETCONNECT_PROJECT_ID
// ortam değişkeninden okunuyor. Bu sayede proje ID'si kaynak kodda görünmez.
// .env dosyasına ekleyin: VITE_WALLETCONNECT_PROJECT_ID=<your-project-id>
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectorsList = [
  injected(), // MetaMask, Rabby vb. yerel cüzdanlar
  coinbaseWallet({ appName: 'Araf Protocol' }),
];

// WalletConnect yalnızca geçerli bir project ID tanımlıysa etkinleştirilir.
if (walletConnectProjectId) {
  connectorsList.push(walletConnect({ projectId: walletConnectProjectId }));
}

const config = createConfig({
  chains: [base, baseSepolia],
  connectors: connectorsList,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
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

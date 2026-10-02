import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/sentry'
import './index.css'
import './lib/i18n'
import App from './App'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { registerServiceWorker } from '@/lib/browserAlerts'

// Browser notifications only (public/sw.js); it caches nothing.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>
)

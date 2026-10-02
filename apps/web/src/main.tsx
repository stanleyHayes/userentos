import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/sentry'
import './index.css'
import './lib/i18n'
import App from './App'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { registerServiceWorker } from '@/lib/browserAlerts'
import { bootHtml } from '@/lib/prerender'
import { markSplashFinished } from '@/lib/splash'

// Browser notifications only (public/sw.js); it caches nothing.
registerServiceWorker()

// A page that arrived with its content (lib/prerender.ts) shows it straight away, without the launch splash.
if (bootHtml) markSplashFinished()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>
)

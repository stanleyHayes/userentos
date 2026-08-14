import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/sentry'
import './index.css'
import './lib/i18n'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

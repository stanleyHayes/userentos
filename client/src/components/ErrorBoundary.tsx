import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { Home, RefreshCw, ArrowLeft, WifiOff } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    })
  }

  handleReload = () => window.location.reload()
  handleGoHome = () => (window.location.href = '/')
  handleGoBack = () => window.history.back()
  handleReset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children

    const isNetworkError =
      this.state.error?.message?.toLowerCase().includes('fetch') ||
      this.state.error?.message?.toLowerCase().includes('network') ||
      this.state.error?.message?.toLowerCase().includes('chunk')

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0c0e1a] px-4 overflow-hidden">
        {/* Floating background shapes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[20%] left-[8%] w-16 h-16 rounded-full bg-red-500/10 dark:bg-red-500/5 animate-[errFloat_5s_ease-in-out_infinite]" />
          <div className="absolute top-[50%] right-[12%] w-12 h-12 rounded-lg bg-amber-500/10 dark:bg-amber-500/5 animate-[errFloat_6s_ease-in-out_1s_infinite]" />
          <div className="absolute bottom-[25%] left-[15%] w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-500/5 animate-[errFloat_7s_ease-in-out_2s_infinite]" />
          <div className="absolute top-[35%] right-[30%] w-6 h-6 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 animate-[errFloat_4s_ease-in-out_0.5s_infinite]" />
        </div>

        <div className="relative text-center max-w-md mx-auto">
          {/* Animated illustration */}
          <div className="mb-6 flex justify-center">
            <svg
              width="180"
              height="140"
              viewBox="0 0 180 140"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="animate-[errBobble_3s_ease-in-out_infinite]"
            >
              {/* Ground shadow */}
              <ellipse cx="90" cy="130" rx="60" ry="6" className="fill-gray-200 dark:fill-white/5" />

              {/* Monitor body */}
              <rect x="35" y="20" width="110" height="80" rx="8" className="fill-[#161927]" stroke="#1e3a5f" strokeWidth="2" />

              {/* Screen */}
              <rect x="43" y="28" width="94" height="60" rx="4" className="fill-[#0c0e1a]" />

              {/* Screen content — sad face */}
              <circle cx="73" cy="52" r="3" className="fill-[#f59e0b] animate-[errBlink_3s_ease-in-out_infinite]" />
              <circle cx="107" cy="52" r="3" className="fill-[#f59e0b] animate-[errBlink_3s_ease-in-out_0.2s_infinite]" />
              <path
                d="M75 67 C80 63, 100 63, 105 67"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                className="animate-[errFrown_3s_ease-in-out_infinite]"
              />

              {/* Monitor stand */}
              <rect x="80" y="100" width="20" height="8" rx="2" className="fill-[#252a3a]" />
              <rect x="70" y="108" width="40" height="5" rx="2" className="fill-[#1e3a5f]" />

              {/* Sparks / error indicators */}
              <g className="animate-[errSpark_1.5s_ease-in-out_infinite]">
                <line x1="148" y1="30" x2="155" y2="23" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                <line x1="152" y1="38" x2="160" y2="36" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                <line x1="146" y1="44" x2="154" y2="48" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
              </g>

              {/* Floating error symbol */}
              <g className="animate-[errSymbol_2s_ease-in-out_infinite]">
                <circle cx="155" cy="15" r="10" className="fill-red-500/20 dark:fill-red-500/15" />
                <text x="155" y="20" textAnchor="middle" className="fill-red-500" fontSize="14" fontWeight="bold" fontFamily="TT Squares, sans-serif">!</text>
              </g>
            </svg>
          </div>

          {/* Heading */}
          <div className="animate-[fadeSlideUp_0.5s_ease-out_both]">
            {isNetworkError ? (
              <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <WifiOff size={14} />
                Connection Issue
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <RefreshCw size={14} />
                Something Went Wrong
              </div>
            )}
          </div>

          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#1e3a5f] dark:text-white/90 animate-[fadeSlideUp_0.5s_ease-out_0.1s_both]">
            {isNetworkError ? "We can't reach the server" : 'Oops, we hit a snag'}
          </h1>

          <p className="mt-3 text-gray-500 dark:text-gray-400 text-sm sm:text-base animate-[fadeSlideUp_0.5s_ease-out_0.2s_both] max-w-sm mx-auto">
            {isNetworkError
              ? "Check your internet connection and try again. We'll be right here when you're back."
              : "Don't worry — your data is safe. A quick refresh usually does the trick."}
          </p>

          {/* Action buttons */}
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 animate-[fadeSlideUp_0.5s_ease-out_0.4s_both]">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap text-white bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 dark:bg-[#f59e0b] dark:text-[#0c0e1a] dark:hover:bg-[#f59e0b]/90 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              <RefreshCw size={15} />
              Try Again
            </button>
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap text-[#1e3a5f] dark:text-gray-300 bg-white dark:bg-[#161927] border border-gray-200 dark:border-gray-700 hover:border-[#1e3a5f] dark:hover:border-gray-500 transition-all duration-200 shadow hover:shadow-md hover:-translate-y-0.5"
            >
              <Home size={15} />
              Go Home
            </button>
            <button
              onClick={this.handleGoBack}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap text-gray-500 dark:text-gray-400 hover:text-[#1e3a5f] dark:hover:text-gray-200 transition-colors duration-200"
            >
              <ArrowLeft size={15} />
              Go Back
            </button>
          </div>

          {/* Collapsible error details (for devs) */}
          {this.state.error && (
            <details className="mt-10 text-left animate-[fadeSlideUp_0.5s_ease-out_0.6s_both]">
              <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Technical details
              </summary>
              <pre className="mt-2 text-[11px] bg-gray-100 dark:bg-[#161927] border border-gray-200 dark:border-[#252a3a] rounded-xl p-4 overflow-auto max-h-32 text-gray-600 dark:text-gray-400 font-mono">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>

        <style>{`
          @keyframes errFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
          }
          @keyframes errBobble {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
          @keyframes errBlink {
            0%, 42%, 48%, 100% { opacity: 1; }
            44%, 46% { opacity: 0.1; }
          }
          @keyframes errFrown {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(2px); }
          }
          @keyframes errSpark {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(0.8) rotate(10deg); }
          }
          @keyframes errSymbol {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-5px) scale(1.1); }
          }
          @keyframes fadeSlideUp {
            0% { transform: translateY(12px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }
}

import { useEffect } from 'react'
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore, useAuthHydrated } from '@/stores/authStore'
// AuthLayout only needs cookie hydration (token check), not full user rehydration
import { Logo } from '@/components/ui/Logo'
import { LogoWatermark } from '@/components/ui/Watermark'
import { Shield, CreditCard, PiggyBank, Scale } from 'lucide-react'

export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthHydrated()
  const location = useLocation()

  // Clear the one-shot post-auth redirect AFTER the redirect render commits.
  // Clearing it during render would let StrictMode's second render (or any extra
  // render) read null and fall back to /dashboard, overriding the intended target.
  useEffect(() => {
    if (isAuthenticated) sessionStorage.removeItem('postAuthRedirect')
  }, [isAuthenticated])

  // Wait for zustand to hydrate from storage before deciding to redirect
  if (!hasHydrated) {
    return null
  }

  if (isAuthenticated) {
    // Honor a one-shot post-auth destination (e.g. Essential Worker signup → worker
    // setup); otherwise land on the dashboard. Without this, the hardcoded redirect
    // would override the navigate() a login/register page runs after authenticating.
    const dest = sessionStorage.getItem('postAuthRedirect') || '/dashboard'
    return <Navigate to={dest} replace />
  }

  const features = [
    { icon: <Shield size={16} />, label: 'Legal Compliance' },
    { icon: <CreditCard size={16} />, label: 'Mobile Payments' },
    { icon: <PiggyBank size={16} />, label: 'Smart Savings' },
    { icon: <Scale size={16} />, label: 'Know Your Rights' },
  ]

  return (
    <div className="public-shell-bg flex min-h-screen">
      {/* Form side */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 animate-fade-down">
            <Link to="/"><Logo size={36} theme="dark" /></Link>
          </div>
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </div>
      </div>

      {/* Brand side */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1f33] via-[#1e3a5f] to-[#0f1f33] lg:flex">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        <LogoWatermark tone="brand" draw className="-bottom-16 -right-10 size-80" />
        <div className="absolute left-14 right-14 top-20 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute bottom-20 left-20 right-20 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />

        <div className="relative max-w-sm text-center text-white px-8">
          <div className="mb-8 flex justify-center animate-float">
            <Logo size={48} variant="mark" theme="light" />
          </div>
          <h2 className="text-3xl font-extrabold font-display tracking-tight animate-fade-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
            Rent<span className="text-secondary">OS</span> Ghana
          </h2>
          <p className="text-lg text-white/50 mt-3 font-display animate-fade-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
            Calm before the storm
          </p>
          <p className="text-sm text-white/30 mt-4 leading-relaxed animate-fade-up" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
            The national digital infrastructure for rental housing in Ghana.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30 animate-fade-up" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
            <img src="/og-image.png" alt="RentOS Ghana platform preview" className="w-full" />
          </div>

          {/* Feature pills */}
          <div className="grid grid-cols-2 gap-3 mt-10">
            {features.map((f, i) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2.5 animate-fade-up"
                style={{ animationDelay: `${0.6 + i * 0.1}s`, animationFillMode: 'both' }}
              >
                <span className="text-secondary">{f.icon}</span>
                <span className="text-xs text-white/60">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore, useAuthHydrated } from '@/stores/authStore'
// AuthLayout only needs cookie hydration (token check), not full user rehydration
import { Logo } from '@/components/ui/Logo'
import { IconWatermark, LogoWatermark, WatermarkConstellation } from '@/components/ui/Watermark'
import { Building2, CheckCircle2, CreditCard, FileSignature, Home, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'

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
    return (
      <div className="public-shell-bg flex min-h-screen items-center justify-center px-6">
        <div className="surface-card flex items-center gap-4 rounded-3xl border px-6 py-5">
          <span className="neumorphic-icon flex h-12 w-12 items-center justify-center rounded-2xl text-primary dark:text-cyan-300">
            <KeyRound className="animate-pulse" size={20} />
          </span>
          <div>
            <p className="font-display text-sm font-extrabold text-primary-dark dark:text-white">Checking your session</p>
            <p className="mt-1 text-xs text-muted dark:text-gray-400">Preparing your secure RentOS workspace…</p>
          </div>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    // Honor a one-shot post-auth destination (e.g. Essential Worker signup → worker
    // setup); otherwise land on the dashboard. Without this, the hardcoded redirect
    // would override the navigate() a login/register page runs after authenticating.
    const dest = sessionStorage.getItem('postAuthRedirect') || '/dashboard'
    return <Navigate to={dest} replace />
  }

  const isRegister = location.pathname === '/register'
  const journey = isRegister
    ? [
        { icon: Home, title: 'Choose your place', copy: 'Search verified homes with clearer records.' },
        { icon: ShieldCheck, title: 'Build your trust profile', copy: 'Carry references, history, and documents once.' },
        { icon: FileSignature, title: 'Move in with confidence', copy: 'Sign, pay, and manage the tenancy in one flow.' },
      ]
    : [
        { icon: ShieldCheck, title: 'Your rental record', copy: 'Agreements, payments, and documents stay connected.' },
        { icon: CreditCard, title: 'Money with context', copy: 'Rent, savings, financing, and receipts in one view.' },
        { icon: Building2, title: 'One workspace', copy: 'Return exactly where your rental journey left off.' },
      ]

  return (
    <div className="public-shell-bg grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      {/* Form side */}
      <div className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:px-10">
        <IconWatermark icon={KeyRound} className="-left-14 top-16 size-52 rotate-[-12deg]" />
        <LogoWatermark className="-bottom-16 right-0 size-64 rotate-12" />
        <div className={`relative w-full ${isRegister ? 'max-w-2xl' : 'max-w-md'}`}>
          <div className="mb-7 flex items-center justify-between animate-fade-down">
            <Link to="/"><Logo size={34} theme="dark" /></Link>
            <Link to="/" className="rounded-full px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-white/60 hover:text-primary dark:hover:bg-white/5">Back home</Link>
          </div>
          <div key={location.pathname} className="surface-card page-enter rounded-[2rem] border p-5 sm:p-7">
            <Outlet />
          </div>
        </div>
      </div>

      {/* Brand side */}
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#091018] text-white lg:flex lg:items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(45,212,191,0.15),transparent_24rem),radial-gradient(circle_at_90%_85%,rgba(245,158,11,0.12),transparent_26rem)]" />
        <WatermarkConstellation icons={[Building2, KeyRound, FileSignature, Home, Sparkles]} tone="brand" className="opacity-80" />
        <LogoWatermark tone="brand" draw className="-right-24 top-8 size-[30rem] rotate-[-10deg]" />
        <div className="relative mx-auto w-full max-w-2xl px-12 py-16 xl:px-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
            <Sparkles size={13} className="text-secondary" />
            {isRegister ? 'Begin your rental story' : 'Welcome back to your rental story'}
          </div>
          <h2 className="mt-8 max-w-xl font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] xl:text-6xl">
            {isRegister ? <>Everything renting.<br /><span className="text-secondary">Working together.</span></> : <>Pick up where<br /><span className="text-secondary">you left off.</span></>}
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/48">
            {isRegister
              ? 'One account connects your property search, trust profile, agreements, money, and support.'
              : 'Your homes, agreements, payments, savings, and next actions are ready in one calm workspace.'}
          </p>

          <div className="mt-10 space-y-3">
            {journey.map(({ icon: Icon, title, copy }, index) => (
              <div key={title} className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-md transition-colors hover:bg-white/[0.08]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-secondary shadow-[6px_6px_16px_rgba(0,0,0,0.35),-4px_-4px_12px_rgba(255,255,255,0.04)]">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/38">{copy}</p>
                </div>
                <span className="font-mono text-[10px] text-white/20">0{index + 1}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3 border-t border-white/10 pt-6 text-xs text-white/35">
            <CheckCircle2 size={15} className="text-emerald-300" />
            Secure identity and role-aware access
          </div>
        </div>
      </aside>
    </div>
  )
}

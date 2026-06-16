import { useState, useEffect } from 'react'
import { Logo } from '@/components/ui/Logo'

interface SplashScreenProps {
  onFinished: () => void
}

export function SplashScreen({ onFinished }: SplashScreenProps) {
  const [phase, setPhase] = useState<'burst' | 'logo' | 'text' | 'ring' | 'fadeOut'>('burst')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logo'), 300)
    const t2 = setTimeout(() => setPhase('text'), 900)
    const t3 = setTimeout(() => setPhase('ring'), 1400)
    const t4 = setTimeout(() => setPhase('fadeOut'), 2400)
    const t5 = setTimeout(() => onFinished(), 2900)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5) }
  }, [onFinished])

  const past = (target: typeof phase) => {
    const order = ['burst', 'logo', 'text', 'ring', 'fadeOut']
    return order.indexOf(phase) >= order.indexOf(target)
  }

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a1628] transition-opacity duration-500 ${phase === 'fadeOut' ? 'opacity-0' : 'opacity-100'}`}>
      {/* Animated circuit grid background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Grid lines that draw in */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="splash-line-h" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="#1e3a5f" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#1e3a5f" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id="splash-line-v" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="#1e3a5f" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#1e3a5f" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          {/* Horizontal grid lines */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1="0%" y1={`${(i + 1) * 8}%`} x2="100%" y2={`${(i + 1) * 8}%`}
              stroke="url(#splash-line-h)"
              strokeWidth="0.5"
              className="splash-grid-line"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
          {/* Vertical grid lines */}
          {Array.from({ length: 16 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={`${(i + 1) * 6}%`} y1="0%" x2={`${(i + 1) * 6}%`} y2="100%"
              stroke="url(#splash-line-v)"
              strokeWidth="0.5"
              className="splash-grid-line"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
          {/* Glowing circuit nodes */}
          {[
            { x: '24%', y: '24%', d: 200 }, { x: '76%', y: '24%', d: 350 },
            { x: '18%', y: '50%', d: 500 }, { x: '82%', y: '50%', d: 450 },
            { x: '24%', y: '76%', d: 600 }, { x: '76%', y: '76%', d: 550 },
            { x: '50%', y: '16%', d: 300 }, { x: '50%', y: '84%', d: 700 },
          ].map((n, i) => (
            <circle
              key={`node${i}`}
              cx={n.x} cy={n.y} r="2"
              fill="#f59e0b"
              className="splash-node"
              style={{ animationDelay: `${n.d}ms` }}
            />
          ))}
        </svg>

        {/* Radial glow layers */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full transition-all duration-1000 ${past('logo') ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
          <div className="absolute inset-0 rounded-full bg-[#1e3a5f]/20 blur-[80px]" />
          <div className="absolute inset-[30%] rounded-full bg-[#f59e0b]/8 blur-[60px]" />
        </div>

        {/* Kente-inspired corner accents */}
        <div className="absolute top-0 left-0 w-32 h-32 opacity-[0.06]">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <rect x="0" y="0" width="12" height="100" fill="#f59e0b" />
            <rect x="16" y="0" width="6" height="100" fill="#10b981" />
            <rect x="0" y="0" width="100" height="12" fill="#f59e0b" />
            <rect x="0" y="16" width="100" height="6" fill="#10b981" />
          </svg>
        </div>
        <div className="absolute bottom-0 right-0 w-32 h-32 opacity-[0.06] rotate-180">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <rect x="0" y="0" width="12" height="100" fill="#f59e0b" />
            <rect x="16" y="0" width="6" height="100" fill="#10b981" />
            <rect x="0" y="0" width="100" height="12" fill="#f59e0b" />
            <rect x="0" y="16" width="100" height="6" fill="#10b981" />
          </svg>
        </div>
      </div>

      {/* Expanding ring burst on logo arrival */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${past('logo') ? 'splash-ring-burst' : 'opacity-0'}`}>
        <div className="w-24 h-24 rounded-full border-2 border-[#f59e0b]/30" />
      </div>
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${past('text') ? 'splash-ring-burst-2' : 'opacity-0'}`}>
        <div className="w-24 h-24 rounded-full border border-[#10b981]/20" />
      </div>

      {/* Main logo with dramatic entrance */}
      <div className={`relative z-10 ${past('logo') ? 'splash-logo-enter' : 'opacity-0 scale-0'}`}>
        {/* Outer spinning ring */}
        <div className={`absolute -inset-6 transition-opacity duration-500 ${past('ring') ? 'opacity-100' : 'opacity-0'}`}>
          <svg className="w-full h-full splash-spin-slow" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="56" fill="none" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="8 12" opacity="0.3" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="#10b981" strokeWidth="0.3" strokeDasharray="4 16" opacity="0.2" />
          </svg>
        </div>

        {/* Pulsing halo */}
        <div className={`absolute -inset-4 rounded-2xl bg-[#f59e0b]/5 transition-opacity duration-500 ${past('ring') ? 'splash-pulse-halo' : 'opacity-0'}`} />

        <Logo size={80} variant="mark" theme="dark" />
      </div>

      {/* Text with staggered letter reveal */}
      <div className={`relative z-10 mt-8 flex flex-col items-center transition-all duration-700 ${past('text') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h1 className="font-display font-extrabold text-4xl tracking-tight text-white">
          <span className="splash-letter" style={{ animationDelay: '0ms' }}>R</span>
          <span className="splash-letter" style={{ animationDelay: '40ms' }}>e</span>
          <span className="splash-letter" style={{ animationDelay: '80ms' }}>n</span>
          <span className="splash-letter" style={{ animationDelay: '120ms' }}>t</span>
          <span className="splash-letter text-[#f59e0b]" style={{ animationDelay: '200ms' }}>O</span>
          <span className="splash-letter text-[#f59e0b]" style={{ animationDelay: '260ms' }}>S</span>
        </h1>

        {/* Animated underline */}
        <div className="relative h-[2px] w-0 mt-2 splash-underline-draw">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent" />
        </div>

        <span className={`mt-3 font-display font-semibold text-sm tracking-[0.3em] uppercase transition-all duration-500 delay-200 ${past('text') ? 'opacity-60' : 'opacity-0'}`} style={{ color: '#94a3b8' }}>
          Ghana
        </span>

        {/* Tagline */}
        <span className={`mt-2 text-xs tracking-wider transition-all duration-500 delay-300 ${past('ring') ? 'opacity-40' : 'opacity-0'}`} style={{ color: '#64748b' }}>
          The Operating System of Rent
        </span>
      </div>

      {/* Loading bar (not dots) */}
      <div className={`relative z-10 mt-10 w-32 h-[2px] rounded-full bg-white/5 overflow-hidden transition-opacity duration-500 ${past('text') ? 'opacity-100' : 'opacity-0'}`}>
        <div className="splash-loading-bar h-full rounded-full bg-gradient-to-r from-[#1e3a5f] via-[#f59e0b] to-[#10b981]" />
      </div>

      <style>{`
        .splash-grid-line {
          opacity: 0;
          animation: gridFadeIn 0.8s ease-out forwards;
        }
        @keyframes gridFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .splash-node {
          opacity: 0;
          animation: nodePulseIn 0.6s ease-out forwards, nodeGlow 2s ease-in-out infinite 0.8s;
        }
        @keyframes nodePulseIn {
          0% { opacity: 0; r: 0; }
          60% { opacity: 0.8; r: 3; }
          100% { opacity: 0.4; r: 2; }
        }
        @keyframes nodeGlow {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.6; }
        }

        .splash-logo-enter {
          animation: logoEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes logoEnter {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .splash-ring-burst {
          animation: ringBurst 1s ease-out both;
        }
        @keyframes ringBurst {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
        .splash-ring-burst-2 {
          animation: ringBurst 1.2s ease-out both;
        }

        .splash-letter {
          display: inline-block;
          animation: letterReveal 0.4s ease-out both;
        }
        @keyframes letterReveal {
          0% { opacity: 0; transform: translateY(8px) scale(0.8); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        .splash-underline-draw {
          animation: underlineDraw 0.6s ease-out 0.5s both;
        }
        @keyframes underlineDraw {
          0% { width: 0; }
          100% { width: 120px; }
        }

        .splash-spin-slow {
          animation: spinSlow 20s linear infinite;
        }
        @keyframes spinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .splash-pulse-halo {
          animation: pulseHalo 2s ease-in-out infinite;
        }
        @keyframes pulseHalo {
          0%, 100% { opacity: 0; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        .splash-loading-bar {
          animation: loadingSlide 1.5s ease-in-out infinite;
        }
        @keyframes loadingSlide {
          0% { width: 0; margin-left: 0; }
          50% { width: 100%; margin-left: 0; }
          100% { width: 0; margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}

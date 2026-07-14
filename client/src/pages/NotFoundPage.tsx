import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { DoodleSpiral, DoodleStars } from '@/components/ui/Doodles'
import { LogoWatermark } from '@/components/ui/Watermark'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0c0e1a] px-4 overflow-hidden">
      {/* Floating background shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[10%] w-20 h-20 rounded-full bg-[#1e3a5f]/10 dark:bg-[#1e3a5f]/20 animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] right-[15%] w-14 h-14 rounded-lg bg-[#f59e0b]/10 dark:bg-[#f59e0b]/20 animate-[float_5s_ease-in-out_1s_infinite]" />
        <div className="absolute bottom-[20%] left-[20%] w-10 h-10 rounded-full bg-[#10b981]/10 dark:bg-[#10b981]/20 animate-[float_7s_ease-in-out_2s_infinite]" />
        <div className="absolute top-[30%] right-[25%] w-6 h-6 rounded-full bg-[#f59e0b]/15 dark:bg-[#f59e0b]/25 animate-[float_4s_ease-in-out_0.5s_infinite]" />
        <DoodleSpiral className="absolute top-[10%] right-[8%] text-primary/10 dark:text-blue-400/10 w-24 h-24 animate-[float_8s_ease-in-out_infinite]" />
        <DoodleStars className="absolute bottom-[15%] right-[30%] text-[#f59e0b]/10 dark:text-[#f59e0b]/15 w-20 h-20 animate-[float_6s_ease-in-out_1.5s_infinite]" />
      </div>

      <LogoWatermark className="left-1/2 top-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2" />

      <div className="relative text-center max-w-lg mx-auto">
        {/* Animated house SVG illustration */}
        <div className="mb-8 flex justify-center">
          <svg
            width="200"
            height="160"
            viewBox="0 0 200 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-[bobble_3s_ease-in-out_infinite]"
          >
            {/* Ground shadow */}
            <ellipse cx="100" cy="150" rx="70" ry="8" className="fill-gray-200 dark:fill-white/5" />

            {/* House body */}
            <rect x="55" y="75" width="90" height="65" rx="4" className="fill-[#161927] dark:fill-[#161927]" stroke="#1e3a5f" strokeWidth="2" />

            {/* Roof */}
            <path
              d="M40 80L100 30L160 80"
              stroke="#f59e0b"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="animate-[roofBounce_3s_ease-in-out_infinite]"
            />
            <path d="M50 80L100 35L150 80Z" className="fill-[#1e3a5f] dark:fill-[#1e3a5f]" />

            {/* Chimney */}
            <rect x="125" y="38" width="12" height="25" rx="2" className="fill-[#252a3a]" />
            {/* Smoke puffs */}
            <circle cx="131" cy="30" r="4" className="fill-gray-300 dark:fill-gray-600 animate-[smokePuff_2.5s_ease-out_infinite]" />
            <circle cx="135" cy="22" r="3" className="fill-gray-300 dark:fill-gray-600 animate-[smokePuff_2.5s_ease-out_0.8s_infinite]" />

            {/* Door */}
            <rect x="85" y="100" width="30" height="40" rx="3" fill="#f59e0b" />
            <circle cx="108" cy="122" r="2.5" fill="#92400e" />

            {/* Windows */}
            <rect x="62" y="85" width="18" height="18" rx="2" className="fill-[#0c0e1a] dark:fill-[#0c0e1a]" />
            <rect x="120" y="85" width="18" height="18" rx="2" className="fill-[#0c0e1a] dark:fill-[#0c0e1a]" />
            {/* Window glow */}
            <rect x="62" y="85" width="18" height="18" rx="2" fill="#f59e0b" opacity="0.3" className="animate-[windowGlow_2s_ease-in-out_infinite]" />
            <rect x="120" y="85" width="18" height="18" rx="2" fill="#f59e0b" opacity="0.3" className="animate-[windowGlow_2s_ease-in-out_0.5s_infinite]" />
            {/* Window cross bars */}
            <line x1="71" y1="85" x2="71" y2="103" className="stroke-gray-500" strokeWidth="1" />
            <line x1="62" y1="94" x2="80" y2="94" className="stroke-gray-500" strokeWidth="1" />
            <line x1="129" y1="85" x2="129" y2="103" className="stroke-gray-500" strokeWidth="1" />
            <line x1="120" y1="94" x2="138" y2="94" className="stroke-gray-500" strokeWidth="1" />

            {/* Question mark floating above house */}
            <text
              x="100"
              y="18"
              textAnchor="middle"
              className="fill-[#f59e0b] animate-[questionFloat_2s_ease-in-out_infinite]"
              fontSize="20"
              fontWeight="bold"
              fontFamily="TT Squares, sans-serif"
            >
              ?
            </text>
          </svg>
        </div>

        {/* 404 number */}
        <h1
          className="font-display font-extrabold text-8xl sm:text-9xl tracking-tight text-[#1e3a5f] dark:text-white/90 animate-[numberPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both] select-none"
        >
          4
          <span className="inline-block text-[#f59e0b] animate-[spin404_1s_cubic-bezier(0.34,1.56,0.64,1)_both]">0</span>
          4
        </h1>

        {/* Message */}
        <p className="mt-4 text-xl sm:text-2xl font-display font-semibold text-gray-700 dark:text-gray-300 animate-[fadeSlideUp_0.5s_ease-out_0.3s_both]">
          This page doesn't exist
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-400 animate-[fadeSlideUp_0.5s_ease-out_0.5s_both]">
          The page you're looking for may have been moved or removed.
        </p>

        {/* Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 animate-[fadeSlideUp_0.5s_ease-out_0.7s_both]">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-semibold text-white bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 dark:bg-[#f59e0b] dark:text-[#0c0e1a] dark:hover:bg-[#f59e0b]/90 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            <Home size={18} />
            Go Home
          </button>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-semibold text-[#1e3a5f] dark:text-gray-300 bg-white dark:bg-[#161927] border border-gray-200 dark:border-gray-700 hover:border-[#1e3a5f] dark:hover:border-gray-500 transition-all duration-200 shadow hover:shadow-md hover:-translate-y-0.5"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>
        </div>
      </div>

      {/* Keyframe animations via inline style tag */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes bobble {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes roofBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes smokePuff {
          0% { opacity: 0.6; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-18px) scale(1.6); }
        }
        @keyframes windowGlow {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.5; }
        }
        @keyframes questionFloat {
          0%, 100% { transform: translateY(0); opacity: 0.8; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes numberPop {
          0% { transform: scale(0.3); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin404 {
          0% { transform: scale(0.3) rotate(-180deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          0% { transform: translateY(12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

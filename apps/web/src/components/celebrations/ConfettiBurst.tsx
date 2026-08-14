import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCelebrationStore } from '@/stores/celebrationStore'

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#22d3ee', '#facc15', '#a78bfa', '#34d399',
]

const PARTICLE_COUNT = 80
const DURATION_MS = 2500

interface Particle {
  id: number
  color: string
  /** Horizontal angle from center in degrees */
  angle: number
  /** Distance to travel in viewport units */
  distance: number
  /** Delay before animation starts (ms) */
  delay: number
  /** Final rotation in degrees */
  rotation: number
  /** Size in px */
  size: number
}

function generateParticles(): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      id: i,
      color: COLORS[i % COLORS.length],
      angle: (Math.random() * 360) - 180,
      distance: 30 + Math.random() * 50, // % of viewport
      delay: Math.random() * 200,
      rotation: Math.random() * 720 - 360,
      size: 6 + Math.random() * 6,
    })
  }
  return particles
}

interface BurstProps {
  burstId: number
  message: string | null
  onDone: () => void
}

function Burst({ burstId, message, onDone }: BurstProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- burstId triggers regeneration intentionally
  const particles = useMemo(() => generateParticles(), [burstId])

  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(t)
  }, [burstId, onDone])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes rentos-confetti-fall {
          0% {
            transform: translate(-50%, -50%) rotate(0deg);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) rotate(var(--tr));
            opacity: 0;
          }
        }
        @keyframes rentos-celebration-msg {
          0% { transform: translate(-50%, -30%) scale(0.5); opacity: 0; }
          15% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          30% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -90%) scale(0.95); opacity: 0; }
        }
      `}</style>

      <div className="absolute left-1/2 top-1/2">
        {particles.map((p) => {
          const rad = (p.angle * Math.PI) / 180
          const tx = `calc(${Math.cos(rad) * p.distance}vw - 50%)`
          const ty = `calc(${Math.sin(rad) * p.distance}vh - 50%)`
          const style: React.CSSProperties & Record<string, string | number> = {
            position: 'absolute',
            left: 0,
            top: 0,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            borderRadius: 2,
            transform: 'translate(-50%, -50%)',
            animation: `rentos-confetti-fall ${DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}ms forwards`,
            '--tx': tx,
            '--ty': ty,
            '--tr': `${p.rotation}deg`,
          }
          return <span key={p.id} style={style} />
        })}

        {message && (
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/95 dark:bg-[#161927]/95 backdrop-blur px-5 py-2.5 shadow-xl border border-white/30 dark:border-[#252a3a]/60"
            style={{
              animation: `rentos-celebration-msg ${DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
            }}
          >
            <span className="text-sm font-bold text-primary-dark dark:text-white">{message}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Mounted once at the app root; listens to the celebration store and renders
 * a confetti burst (via portal) whenever `celebrate` is called.
 */
export function ConfettiBurstPortal() {
  const { burstId, type, message, dismiss } = useCelebrationStore()

  if (type === null || typeof document === 'undefined') return null

  const defaultMessage =
    message ??
    (type === 'payment' ? 'Payment successful!' : type === 'badge' ? 'Badge unlocked!' : 'Milestone reached!')

  return createPortal(
    <Burst burstId={burstId} message={defaultMessage} onDone={dismiss} />,
    document.body,
  )
}

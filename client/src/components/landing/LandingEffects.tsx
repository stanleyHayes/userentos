import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAnimateOnScroll } from '@/hooks/useAnimateOnScroll'
import { cn } from '@/lib/utils'

/**
 * Landing-page premium effects — dependency-free (no three.js/gsap; the
 * project hand-rolls animation). All CSS motion collapses under the global
 * `prefers-reduced-motion` rule; JS-driven effects check it explicitly.
 */

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ────────────────────────────────────────────────
   Aurora — Vercel/Linear-style animated mesh-gradient background.
   Slow drifting blurred color fields behind the hero.
──────────────────────────────────────────────── */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('aurora', className)}>
      <span className="aurora-blob aurora-blob-1" />
      <span className="aurora-blob aurora-blob-2" />
      <span className="aurora-blob aurora-blob-3" />
      <span className="aurora-blob aurora-blob-4" />
    </div>
  )
}

/* ────────────────────────────────────────────────
   GradientText — animated gradient sweep across text.
──────────────────────────────────────────────── */
export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('gradient-text', className)}>{children}</span>
}

/* ────────────────────────────────────────────────
   SplitText — staggered character reveal (rise + fade per char,
   words kept unbroken). Fires when scrolled into view (or immediately).
──────────────────────────────────────────────── */
export function SplitText({
  text,
  className,
  charDelay = 28,
  startDelay = 0,
  immediate = false,
}: {
  text: string
  className?: string
  charDelay?: number
  startDelay?: number
  immediate?: boolean
}) {
  const { ref, isVisible } = useAnimateOnScroll(0.2)
  const show = immediate || isVisible
  const [settled, setSettled] = useState(false)
  const words = text.split(' ')
  let charIndex = 0

  // Once the reveal has fully played, strip the animation from the chars.
  // A lingering animation/transform on descendant chars breaks
  // background-clip:text on a parent GradientText (renders dark).
  useEffect(() => {
    if (!show || settled) return
    const total = startDelay + text.length * charDelay + 750
    const t = setTimeout(() => setSettled(true), total)
    return () => clearTimeout(t)
  }, [show, settled, startDelay, text.length, charDelay])

  return (
    <span ref={ref} className={cn('split-text', show && 'split-text-visible', settled && 'split-text-settled', className)} aria-label={text} role="text">
      {words.map((word, wi) => (
        <span key={wi} className="split-text-word" aria-hidden="true">
          {word.split('').map((char, ci) => {
            const delay = startDelay + charIndex++ * charDelay
            return (
              <span key={ci} className="split-text-char" style={{ animationDelay: `${delay}ms` }}>
                {char}
              </span>
            )
          })}
          {wi < words.length - 1 && <span className="split-text-char split-text-space" style={{ animationDelay: `${startDelay + charIndex++ * charDelay}ms` }}>{' '}</span>}
        </span>
      ))}
    </span>
  )
}

/* ────────────────────────────────────────────────
   MagneticButton — the wrapped element leans toward the cursor and
   springs back on leave. Disabled under reduced motion / touch.
──────────────────────────────────────────────── */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion() || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const relX = e.clientX - (rect.left + rect.width / 2)
      const relY = e.clientY - (rect.top + rect.height / 2)
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.transform = `translate(${relX * strength}px, ${relY * strength}px)`
        }
      })
    },
    [strength],
  )

  const onLeave = useCallback(() => {
    cancelAnimationFrame(frame.current)
    if (ref.current) {
      ref.current.style.transition = 'transform 0.45s cubic-bezier(0.22, 1.4, 0.36, 1)'
      ref.current.style.transform = 'translate(0px, 0px)'
      // Snap back to instant tracking for the next hover
      setTimeout(() => {
        if (ref.current) ref.current.style.transition = ''
      }, 460)
    }
  }, [])

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={cn('magnetic', className)}>
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────
   Marquee — infinite ticker; content duplicated for a seamless loop.
──────────────────────────────────────────────── */
export function Marquee({
  items,
  className,
  duration = 32,
  reverse = false,
}: {
  items: ReactNode[]
  className?: string
  duration?: number
  reverse?: boolean
}) {
  const row = (key: string) => (
    <div key={key} aria-hidden={key === 'b'} className="marquee-row" style={{ animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : undefined }}>
      {items.map((item, i) => (
        <span key={i} className="marquee-item">{item}</span>
      ))}
    </div>
  )
  return (
    <div className={cn('marquee', className)}>
      {row('a')}
      {row('b')}
    </div>
  )
}

/* ────────────────────────────────────────────────
   CursorGlow — a soft radial highlight that follows the pointer over
   the hero (spotlight effect). Pointer-events-none, cheap to run.
──────────────────────────────────────────────── */
export function CursorGlow({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  useEffect(() => {
    if (reducedMotion()) return
    const parent = ref.current?.parentElement
    if (!parent) return

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const rect = parent.getBoundingClientRect()
        ref.current?.style.setProperty('--glow-x', `${e.clientX - rect.left}px`)
        ref.current?.style.setProperty('--glow-y', `${e.clientY - rect.top}px`)
        ref.current?.style.setProperty('--glow-opacity', '1')
      })
    }
    const onLeave = () => ref.current?.style.setProperty('--glow-opacity', '0')

    parent.addEventListener('pointermove', onMove, { passive: true })
    parent.addEventListener('pointerleave', onLeave)
    return () => {
      parent.removeEventListener('pointermove', onMove)
      parent.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  return <div ref={ref} aria-hidden="true" className={cn('cursor-glow', className)} />
}

/* ────────────────────────────────────────────────
   Parallax — translates children at a fraction of scroll position.
──────────────────────────────────────────────── */
export function Parallax({
  children,
  speed = 0.25,
  className,
}: {
  children: ReactNode
  speed?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  useEffect(() => {
    if (reducedMotion()) return
    const onScroll = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        if (!ref.current) return
        const rect = ref.current.getBoundingClientRect()
        const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2
        ref.current.style.transform = `translateY(${centerOffset * -speed}px)`
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame.current)
    }
  }, [speed])

  return (
    <div ref={ref} className={cn('parallax', className)}>
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────
   CountUp — animated number reveal for hero metrics.
──────────────────────────────────────────────── */
export function CountUp({
  value,
  suffix = '',
  duration = 1400,
  className,
}: {
  value: number
  suffix?: string
  duration?: number
  className?: string
}) {
  const { ref, isVisible } = useAnimateOnScroll(0.4)
  const [display, setDisplay] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!isVisible || started.current) return
    started.current = true
    if (reducedMotion()) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(eased * value))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isVisible, value, duration])

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  )
}

/* ────────────────────────────────────────────────
   TiltCard — subtle 3D tilt toward the pointer on hover.
──────────────────────────────────────────────── */
export function TiltCard({
  children,
  maxTilt = 6,
  className,
  style,
}: {
  children: ReactNode
  maxTilt?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion() || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.transform = `perspective(900px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateY(-4px)`
        }
      })
    },
    [maxTilt],
  )

  const onLeave = useCallback(() => {
    cancelAnimationFrame(frame.current)
    if (ref.current) ref.current.style.transform = ''
  }, [])

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={cn('tilt-card', className)} style={style}>
      {children}
    </div>
  )
}

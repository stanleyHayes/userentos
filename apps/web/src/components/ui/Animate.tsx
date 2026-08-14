import { useAnimateOnScroll } from '@/hooks/useAnimateOnScroll'
import type { ReactNode } from 'react'

type Animation = 'fade-up' | 'fade-down' | 'fade-in' | 'fade-left' | 'fade-right' | 'scale-in'

interface AnimateProps {
  children: ReactNode
  animation?: Animation
  delay?: number
  className?: string
}

export function Animate({ children, animation = 'fade-up', delay = 0, className = '' }: AnimateProps) {
  const { ref, isVisible } = useAnimateOnScroll(0.1)
  const delayClass = delay > 0 ? `delay-${delay}` : ''

  return (
    <div
      ref={ref}
      className={`anim anim-${animation} ${isVisible ? 'visible' : ''} ${delayClass} ${className}`}
    >
      {children}
    </div>
  )
}

import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration = 2000, active = true) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active) return

    const startTime = performance.now()
    let rafId: number

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration, active])

  return count
}

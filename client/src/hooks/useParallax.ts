import { useEffect, useRef } from 'react'

/**
 * Scroll parallax: translates the element vertically as the page scrolls,
 * via the `--parallax-y` CSS variable (use with the `.parallax-layer` class).
 * `speed` 0.1 = subtle drift, 0.3 = strong. Disabled for reduced-motion users.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(speed = 0.15) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    function update() {
      raf = 0
      const rect = el!.getBoundingClientRect()
      const viewportCenter = window.innerHeight / 2
      const offset = (rect.top + rect.height / 2 - viewportCenter) * -speed
      el!.style.setProperty('--parallax-y', `${offset.toFixed(1)}px`)
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [speed])

  return ref
}

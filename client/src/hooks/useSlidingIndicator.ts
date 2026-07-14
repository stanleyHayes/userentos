import { useCallback, useLayoutEffect, useState } from 'react'

interface PillStyle {
  transform: string
  width: number
  height: number
}

interface UnderlineStyle {
  transform: string
  width: number
}

type IndicatorStyle<T extends 'pill' | 'underline'> = T extends 'underline' ? UnderlineStyle : PillStyle

/**
 * Measures the active `[data-tab-key]` child of a container and returns
 * transform/size styles for an absolutely-positioned sliding indicator.
 *
 * - `variant: 'pill'`      → full box (transform + width + height)
 * - `variant: 'underline'` → horizontal only (transform + width); height/top
 *                            come from the indicator's own classes.
 *
 * Usage: `<div ref={pill.attach}>` on the (positioned) container, then render
 * an absolutely-positioned `<span style={{ ...pill.style, opacity: pill.visible ? 1 : 0 }}>`.
 *
 * Re-measures on: container mount (callback ref), activeKey change,
 * container/children resize, DOM mutations inside the container (dynamic
 * chip lists), window resize and font load. The first measurement happens
 * inside rAF so the indicator never transitions in from 0,0 on mount.
 */
export function useSlidingIndicator<T extends HTMLElement = HTMLDivElement, V extends 'pill' | 'underline' = 'pill'>(
  activeKey: string | number | null | undefined,
  variant: V = 'pill' as V,
) {
  // Callback ref → state, so the effect re-runs when the container mounts
  // AFTER the first render (loading gates, `data.length > 0` conditions, …).
  const [container, setContainer] = useState<T | null>(null)
  const attach = useCallback((node: T | null) => setContainer(node), [])

  const [style, setStyle] = useState<IndicatorStyle<V>>(
    (variant === 'underline'
      ? { transform: 'translate3d(0,0,0)', width: 0 }
      : { transform: 'translate3d(0,0,0)', width: 0, height: 0 }) as IndicatorStyle<V>,
  )
  const [measured, setMeasured] = useState(false)

  useLayoutEffect(() => {
    if (!container || activeKey == null) return

    const selector = `[data-tab-key="${CSS.escape(String(activeKey))}"]`

    const measure = () => {
      const el = container.querySelector<HTMLElement>(selector)
      if (!el || el.offsetParent === null) {
        setMeasured(false)
        return
      }
      if (variant === 'underline') {
        setStyle({ transform: `translate3d(${el.offsetLeft}px,0,0)`, width: el.offsetWidth } as IndicatorStyle<V>)
      } else {
        setStyle({
          transform: `translate3d(${el.offsetLeft}px,${el.offsetTop}px,0)`,
          width: el.offsetWidth,
          height: el.offsetHeight,
        } as IndicatorStyle<V>)
      }
      setMeasured(true)
    }

    // Defer the first measurement a frame: initial position must not transition.
    const raf = requestAnimationFrame(measure)

    const ro = new ResizeObserver(measure)
    ro.observe(container)
    container.querySelectorAll<HTMLElement>('[data-tab-key]').forEach((el) => ro.observe(el))

    const mo = new MutationObserver(() => {
      container.querySelectorAll<HTMLElement>('[data-tab-key]').forEach((el) => ro.observe(el))
      measure()
    })
    mo.observe(container, { childList: true, subtree: true })

    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure).catch(() => {})

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [container, activeKey, variant])

  return { attach, style, visible: measured && activeKey != null && container != null }
}

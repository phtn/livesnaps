import { useCallback, useEffect, useRef, useState } from 'octane'

function calculateScrollBoxPercentage(el: HTMLElement): number {
  const scrollableHeight: number = el.scrollHeight - el.clientHeight

  if (scrollableHeight <= 0) {
    return 100
  }

  const percentage: number = (el.scrollTop / scrollableHeight) * 100
  return Math.min(100, Math.max(0, percentage))
}

type RefObject<T> = {
  current: T
}

export function useScrollBox<T extends HTMLElement>(elementRef: RefObject<T | null>): number {
  const [percentage, setPercentage] = useState<number>(0)
  const tickingRef = useRef<boolean>(false)

  const handleScroll = useCallback((): void => {
    const el: T | null = elementRef.current
    if (!el) return

    if (!tickingRef.current) {
      window.requestAnimationFrame((): void => {
        if (elementRef.current) {
          setPercentage(calculateScrollBoxPercentage(elementRef.current))
        }
        tickingRef.current = false
      })
      tickingRef.current = true
    }
  }, [elementRef])

  useEffect(() => {
    const el: T | null = elementRef.current
    if (!el) return

    setPercentage(calculateScrollBoxPercentage(el))

    el.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    // Content that loads or swaps in (a loading state replaced by the page)
    // changes the scrollable height without firing a scroll, so watch the
    // children's size, and re-watch whenever the children themselves change.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleScroll)
    const observeChildren = (): void => {
      if (!resizeObserver) return
      resizeObserver.disconnect()
      for (const child of Array.from(el.children)) resizeObserver.observe(child)
    }
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((): void => {
            observeChildren()
            handleScroll()
          })
    observeChildren()
    mutationObserver?.observe(el, { childList: true })

    return (): void => {
      el.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [elementRef, handleScroll])

  return percentage
}

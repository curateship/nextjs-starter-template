import * as React from "react"

/**
 * Whether a box is at least `px` wide, kept up to date as its panel is
 * dragged. For a choice CSS can't make on its own, such as whether a
 * control belongs in a popover, which draws outside the box. Starts false,
 * so the narrow choice shows until the box has been measured.
 */
export function useWidthAtLeast<T extends HTMLElement>(px: number) {
  const [element, setElement] = React.useState<T | null>(null)
  const [wide, setWide] = React.useState(false)

  React.useEffect(() => {
    if (!element) return
    const measure = () => setWide(element.getBoundingClientRect().width >= px)
    measure()
    // jsdom has no ResizeObserver; a component test keeps the first answer.
    if (typeof ResizeObserver !== "function") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, px])

  return [setElement, wide] as const
}

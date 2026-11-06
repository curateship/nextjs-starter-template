import * as React from "react"

/**
 * Whether a box is drawn, and whether the browser tab is in front, as two
 * answers (Racks dashboard, parts 104 and 108). A rack's page keeps every
 * panel drawn (`ThreePanels`): below 1280px the hidden two are
 * `display:none`, and a collapsed side shrinks to nothing, so either way the
 * box has no size. A live picture asks for frames only while it is drawn and
 * the tab is in front, so a hidden panel never uses upload.
 *
 * They are kept apart because they mean different things to the screen. A
 * box with no size has been left, so control lets go. A tab in the
 * background only pauses the pictures: switching to Gmail for a code mid
 * sign-in must not hand the phone back to its jobs. Scrolling the box out of
 * view changes neither.
 */
export function useOnScreen<T extends Element>(): [React.RefCallback<T>, { drawn: boolean; front: boolean }] {
  const [element, setElement] = React.useState<T | null>(null)
  const [sized, setSized] = React.useState(false)
  const [front, setFront] = React.useState(() => typeof document === "undefined" || document.visibilityState === "visible")

  React.useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect
      setSized(Boolean(box && box.width > 0 && box.height > 0))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  React.useEffect(() => {
    const update = () => setFront(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])

  // A browser with no ResizeObserver, such as a test's, counts a box in the page as drawn.
  const measurable = typeof ResizeObserver !== "undefined"
  return [setElement, { drawn: Boolean(element) && (sized || !measurable), front }]
}

import * as React from "react"

/**
 * Escape inside an inline step (a reason row, a Move picker, a "Delete this
 * task?" pair) cancels that step and leaves the window around it open. The
 * window's own Escape listens on the document, so this one listens a step
 * earlier, on the window object, and only while focus is inside `ref`. A menu
 * open from the step has focus in its own popup, so its Escape still closes
 * just the menu.
 */
export function useEscapeCancels(ref: React.RefObject<HTMLElement | null>, onCancel: () => void) {
  const cancel = React.useRef(onCancel)
  React.useEffect(() => {
    cancel.current = onCancel
  })
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) return
      event.stopPropagation()
      event.preventDefault()
      cancel.current()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [ref])
}

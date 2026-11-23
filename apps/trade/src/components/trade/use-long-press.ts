import * as React from "react"

export type ClientPoint = { clientX: number; clientY: number }

const HOLD_MS = 500
const MOVE_SLOP = 8

/**
 * Turns one still finger into the same screen point a mouse click supplies.
 *
 * Move and release are watched on the window because chart libraries capture
 * pointers while they pan. Crossing the movement allowance cancels at once,
 * so a chart drag never ends by opening an order menu.
 */
export function useLongPress(onLongPress: (point: ClientPoint) => void) {
  const callbackRef = React.useRef(onLongPress)
  React.useEffect(() => {
    callbackRef.current = onLongPress
  }, [onLongPress])

  const timerRef = React.useRef<number | null>(null)
  const heldRef = React.useRef<(ClientPoint & { pointerId: number }) | null>(
    null
  )
  const cancelRef = React.useRef<() => void>(() => undefined)
  const cancel = React.useCallback(() => cancelRef.current(), [])
  const moveRef = React.useRef((event: PointerEvent) => {
    const held = heldRef.current
    if (!held || event.pointerId !== held.pointerId) return
    if (
      Math.hypot(event.clientX - held.clientX, event.clientY - held.clientY) >
      MOVE_SLOP
    ) {
      cancel()
    }
  })

  React.useEffect(() => {
    cancelRef.current = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      heldRef.current = null
      window.removeEventListener("pointermove", moveRef.current)
      window.removeEventListener("pointerup", cancel)
      window.removeEventListener("pointercancel", cancel)
    }
    return cancel
  }, [cancel])

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return
      cancel()
      const held = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      heldRef.current = held
      window.addEventListener("pointermove", moveRef.current)
      window.addEventListener("pointerup", cancel)
      window.addEventListener("pointercancel", cancel)
      timerRef.current = window.setTimeout(() => {
        if (heldRef.current !== held) return
        cancel()
        callbackRef.current({ clientX: held.clientX, clientY: held.clientY })
      }, HOLD_MS)
    },
    [cancel]
  )

  return { onPointerDown }
}

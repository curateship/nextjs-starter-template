import * as React from "react"

export const ORDER_WINDOW_WIDTH = 304
export const ORDER_WINDOW_HEIGHT = 560
export const MIN_ORDER_WINDOW_HEIGHT = 260

/** Put a settings window immediately left of the chart control that opened it. */
export function orderWindowBeside(anchor: Element | null): {
  x: number
  y: number
} {
  const at = anchor?.getBoundingClientRect()
  return {
    x: at ? at.left - ORDER_WINDOW_WIDTH - 8 : 8,
    y: at ? at.top + at.height / 2 - ORDER_WINDOW_HEIGHT / 2 : 8,
  }
}

/** Read a number without rejecting a value that is still being typed. */
export function parseOrderNumber(value: string): number | null {
  const trimmed = value.trim()
  const withoutPercent = trimmed.endsWith("%")
    ? trimmed.slice(0, -1).trim()
    : trimmed
  const number = Number(withoutPercent)
  return withoutPercent !== "" && Number.isFinite(number) ? number : null
}

/**
 * The editing guard shared by the DCA and Grid windows.
 *
 * A hand that has touched either form wins over a late settings read. The
 * guard belongs to one mounted window, so closing and reopening starts clean,
 * while two windows open together cannot mark one another as edited.
 */
export function useOrderWindowForm() {
  const [showValidation, setShowValidation] = React.useState(false)
  const edited = React.useRef(false)
  const touched = React.useCallback(
    <Args extends unknown[]>(set: (...args: Args) => void) =>
      (...args: Args) => {
        edited.current = true
        setShowValidation(false)
        set(...args)
      },
    []
  )

  return { edited, touched, showValidation, setShowValidation }
}

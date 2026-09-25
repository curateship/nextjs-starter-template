import * as React from "react"

/**
 * The value a window opened with, held on to while the window fades out.
 *
 * A confirmation stays on screen through its closing fade. Cancel clears the
 * thing it was asking about, so a heading built straight from that thing spends
 * the fade reading `Delete "undefined"?`. This hands back the last real value
 * instead, and swaps to the next one the moment there is one.
 */
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = React.useState(value)
  // Adjusting state during render, which React re-runs immediately without
  // painting in between — the next value is in place before anything is drawn.
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

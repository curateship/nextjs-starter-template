import * as React from "react"

/**
 * The last value a window was opened with, kept after it is cleared.
 *
 * A window fades out for a moment after it is told to close. Drawn from the
 * cleared value, it would shrink to its empty or "Reading…" state during that
 * fade. Drawn from this, it closes looking as it did, like every other window.
 */
export function useHeldWhileClosing<T>(value: T | null | undefined): T | null {
  const [held, setHeld] = React.useState<T | null>(value ?? null)
  if (value != null && value !== held) setHeld(value)
  return value ?? held
}

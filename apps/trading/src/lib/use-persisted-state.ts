import * as React from "react"

/**
 * `useState` mirrored to localStorage. `parse` maps a stored string to a value
 * and may validate or fill in defaults; any read/parse failure falls back to
 * `initial`. Writes are best-effort — blocked or full storage just skips
 * persistence and the value stays in memory.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T = (raw) => JSON.parse(raw) as T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? parse(raw) : initial
    } catch {
      return initial
    }
  })

  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Storage full/blocked — value stays in-memory only.
    }
  }, [key, state])

  return [state, setState]
}

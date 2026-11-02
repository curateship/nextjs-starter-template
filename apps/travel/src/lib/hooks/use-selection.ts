import * as React from "react"

/**
 * Row selection for a dashboard table: a set of ids, a per-row toggle, and a
 * header checkbox that works on the rows currently on screen.
 *
 * Pass the header checkbox only the ids that may actually be selected — a
 * dashboard that keeps some rows out of select-all (your own account, the
 * default plan) filters them out before calling `toggleVisible` and
 * `selectAllState`, and nothing else changes.
 */
export function useSelection() {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const toggle = React.useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** The header checkbox: everything visible on, or everything visible off. */
  const toggleVisible = React.useCallback((visibleIds: string[]) => {
    setSelected((current) => {
      const next = new Set(current)
      if (visibleIds.length && visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [])

  const clear = React.useCallback(() => setSelected(new Set()), [])

  /** What the header checkbox shows for the rows on screen. */
  const selectAllState = React.useCallback(
    (visibleIds: string[]): boolean | "indeterminate" => {
      if (visibleIds.length && visibleIds.every((id) => selected.has(id))) {
        return true
      }
      return visibleIds.some((id) => selected.has(id)) ? "indeterminate" : false
    },
    [selected]
  )

  return { selected, setSelected, toggle, toggleVisible, clear, selectAllState }
}

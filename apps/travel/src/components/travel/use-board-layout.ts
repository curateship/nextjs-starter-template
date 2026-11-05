import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { foldedDaysKey, hiddenIdeasKey } from "@/lib/travel/panel-keys"

function readList(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage may be blocked; the choice still holds for this visit.
  }
}

/**
 * How a trip's board is laid out in this browser: which day columns are folded
 * (task part 12, and "Misc": a double-click on a day's heading folds it, and a
 * header button folds or unfolds every day), and whether the Ideas column is
 * hidden behind its eye (task "Misc"). It also carries Jump to a day from the
 * header to the board (Travel features 3, part 7).
 */
export function useBoardLayout(tripId: string, days: number) {
  const foldKey = foldedDaysKey(tripId)
  const ideasKey = hiddenIdeasKey(tripId)
  const [folded, setFolded] = React.useState<ReadonlySet<string>>(new Set())
  const [ideasHidden, setIdeasHiddenState] = React.useState(false)
  useEffectBeforePaint(() => {
    setFolded(new Set(readList(foldKey)))
    setIdeasHiddenState(localStorage.getItem(ideasKey) === "hidden")
  }, [foldKey, ideasKey])

  const store = React.useCallback(
    (next: ReadonlySet<string>) => {
      write(foldKey, JSON.stringify([...next]))
      return next
    },
    [foldKey]
  )

  const toggleFold = React.useCallback(
    (column: string) =>
      setFolded((was) => {
        const next = new Set(was)
        if (next.has(column)) next.delete(column)
        else next.add(column)
        return store(next)
      }),
    [store]
  )

  const dayKeys = Array.from({ length: days }, (_, index) => `day-${index + 1}`)
  const allFolded = dayKeys.every((key) => folded.has(key))
  const toggleFoldAll = () => setFolded(store(allFolded ? new Set() : new Set(dayKeys)))

  const setIdeasHidden = (hidden: boolean) => {
    write(ideasKey, hidden ? "hidden" : "shown")
    setIdeasHiddenState(hidden)
  }

  // The day the header's Jump to a day asked for, and when, so asking for the same day again scrolls again.
  const [jump, setJump] = React.useState<{ key: string; at: number } | null>(null)
  const jumpTo = (day: number) => {
    const key = `day-${day}`
    // A folded day opens, so there's something to see once it's reached.
    if (folded.has(key)) {
      const next = new Set(folded)
      next.delete(key)
      setFolded(store(next))
    }
    setJump({ key, at: Date.now() })
  }

  return { folded, toggleFold, allFolded, toggleFoldAll, ideasHidden, setIdeasHidden, jump, jumpTo }
}

export type BoardLayout = ReturnType<typeof useBoardLayout>

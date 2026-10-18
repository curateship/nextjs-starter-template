import * as React from "react"

import type { loadProgram } from "@/lib/api/fitness/programs"
import type { Day } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"

/** Everything `loadProgram` hands a program's dashboard. */
export type ProgramPageData = Awaited<ReturnType<typeof loadProgram>>

/** A calendar day as a local Date for the shared date picker, and back. */
export function dayToDate(day: Day): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function dateToDay(date: Date): Day {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

type SaveState = "idle" | "saving" | "saved" | "failed"

/**
 * The program cards' save-as-you-go: `soon` waits 700ms after the last change to a
 * field, `now` saves at once (a switch, a pick, a field being left). Saves
 * run one after another, so two quick edits never land out of order. A
 * refused save says why in the error toast and leaves the typed value alone.
 */
export function useAutoSave() {
  const [state, setState] = React.useState<SaveState>("idle")
  const timers = React.useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; action: () => Promise<unknown> }>()
  )
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())

  const now = React.useCallback((key: string, action: () => Promise<unknown>) => {
    const pending = timers.current.get(key)
    if (pending) clearTimeout(pending.timer)
    timers.current.delete(key)
    const run = queue.current.then(async () => {
      setState("saving")
      try {
        await action()
        setState("saved")
        return true
      } catch (error) {
        setState("failed")
        reportFitnessError(error)
        return false
      }
    })
    queue.current = run
    return run
  }, [])

  const soon = React.useCallback(
    (key: string, action: () => Promise<unknown>) => {
      const pending = timers.current.get(key)
      if (pending) clearTimeout(pending.timer)
      timers.current.set(key, { timer: setTimeout(() => void now(key, action), 700), action })
    },
    [now]
  )

  // Leaving the card with a change still waiting sends it rather than losing it.
  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const [key, entry] of pending) {
        clearTimeout(entry.timer)
        void entry.action().catch(reportFitnessError)
        pending.delete(key)
      }
    }
  }, [])

  return { state, now, soon }
}

export function saveStateLabel(state: SaveState) {
  return state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "failed" ? "Not saved" : ""
}

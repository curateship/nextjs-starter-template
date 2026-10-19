import * as React from "react"
import { toast } from "sonner"

import {
  addToQueue,
  browserStorage,
  isOfflineFailure,
  readQueue,
  replayQueue,
  writeQueue,
  type QueuedChange,
} from "@/components/fitness/workout/offline-queue"
import { changeSet } from "@/lib/api/fitness/workouts"
import { reportFitnessError } from "@/lib/fitness/report-error"

function sendChange(change: QueuedChange) {
  if (change.kind === "saveSet") return changeSet({ action: "save", setId: change.setId, change: change.change })
  if (change.kind === "addSet") {
    return changeSet({ action: "add", workoutId: change.workoutId, position: change.position, id: change.id })
  }
  return changeSet({ action: "remove", setId: change.setId })
}

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine
}

/**
 * Sends the logger's set changes, and keeps them on the phone when there is
 * no signal. `waiting` is how many changes are held back, for the line that
 * says so. Changes always go in the order they were made: once one is held,
 * every later one joins the queue behind it rather than overtaking it.
 */
export function useSetSync(workoutId: string) {
  // Starts at 0 on the server and the first paint alike; the first flush,
  // just after the page shows, reads what the phone is holding.
  const [waiting, setWaiting] = React.useState(0)
  const running = React.useRef(false)

  const flush = React.useCallback(async () => {
    if (running.current) return
    const storage = browserStorage()
    const queue = readQueue(storage, workoutId)
    if (queue.length === 0) {
      setWaiting(0)
      return
    }
    running.current = true
    try {
      const { left, sent } = await replayQueue(queue, sendChange, { online: isOnline, onRefused: reportFitnessError })
      // Changes made while the replay ran were added behind the ones it read.
      const added = readQueue(storage, workoutId).slice(queue.length)
      const next = [...left, ...added]
      writeQueue(storage, workoutId, next)
      setWaiting(next.length)
      if (sent > 0 && next.length === 0) toast.success("Back online. Every set is saved.")
    } finally {
      running.current = false
    }
  }, [workoutId])

  React.useEffect(() => {
    const onOnline = () => void flush()
    window.addEventListener("online", onOnline)
    const first = window.setTimeout(onOnline, 0)
    return () => {
      window.removeEventListener("online", onOnline)
      window.clearTimeout(first)
    }
  }, [flush])

  const send = React.useCallback(
    async (change: QueuedChange): Promise<"sent" | "held" | "refused"> => {
      const storage = browserStorage()
      const queue = readQueue(storage, workoutId)
      if (queue.length > 0 || !isOnline()) {
        const next = addToQueue(queue, change)
        writeQueue(storage, workoutId, next)
        setWaiting(next.length)
        if (isOnline()) void flush()
        return "held"
      }
      try {
        await sendChange(change)
        return "sent"
      } catch (error) {
        if (!isOfflineFailure(error, isOnline())) {
          reportFitnessError(error)
          return "refused"
        }
        const next = addToQueue(readQueue(storage, workoutId), change)
        writeQueue(storage, workoutId, next)
        setWaiting(next.length)
        return "held"
      }
    },
    [flush, workoutId]
  )

  return { send, waiting }
}

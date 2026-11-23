import * as React from "react"

import { loadMyQuickDays } from "@/lib/api/project/planning"
import { localNow } from "@/lib/project/days"
import { quickDays, type QuickDay } from "@/lib/project/quick-days"

type MyDays = Awaited<ReturnType<typeof loadMyQuickDays>>

/** Read once for every picker on the page, and again after a few minutes. */
const FRESH_MS = 5 * 60_000
let cached: { at: number; read: Promise<MyDays> } | null = null

function readMyDays() {
  if (!cached || Date.now() - cached.at > FRESH_MS) {
    const read = loadMyQuickDays()
    cached = { at: Date.now(), read }
    // A failed read is tried again on the next open rather than kept.
    read.catch(() => {
      if (cached?.read === read) cached = null
    })
  }
  return cached.read
}

/**
 * The quick due dates for a picker, worked out each time it opens (`active`),
 * so Today turns over at the person's own midnight. Null until they arrive,
 * and after a failed read, when the month grid still works on its own.
 */
export function useQuickDays(active: boolean): QuickDay[] | null {
  const [days, setDays] = React.useState<QuickDay[] | null>(null)
  React.useEffect(() => {
    if (!active) return
    let live = true
    readMyDays().then(
      (mine) => {
        if (live) setDays(quickDays(localNow(new Date(), mine.zone).day, mine.workDays, mine.holidays))
      },
      () => undefined
    )
    return () => {
      live = false
    }
  }, [active])
  return days
}

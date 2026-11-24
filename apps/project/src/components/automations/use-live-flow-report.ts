import * as React from "react"

import {
  getLiveFlowErrorMessage,
  loadLiveFlowReport,
  type LiveFlowReport,
} from "@/lib/api/automations/live-flow"

/** How often a live flow's numbers are read again while the page is in view. */
const READ_EVERY_MS = 5_000

export type LiveFlowPeriod = "all" | "today" | "7d"

export const LIVE_FLOW_PERIODS: { value: LiveFlowPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
]

/** Where the period starts, in the admin's own day. */
function periodStart(period: LiveFlowPeriod): string | null {
  if (period === "all") return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === "7d") start.setDate(start.getDate() - 6)
  return start.toISOString()
}

/**
 * A live flow's numbers, read when it goes live, again every five seconds
 * while the page is in view, and at once when the tab comes back (Tyler,
 * 23 Nov 2026, picked "Cards refresh themselves"). Off, nothing is read.
 * `onReport` hears every fresh read, so the Run button can say how many are
 * in the flow and the editor can tell the flow stopped itself.
 */
export function useLiveFlowReport({
  automationId,
  live,
  period,
  readAgain,
  onReport,
}: {
  automationId: string
  live: boolean
  period: LiveFlowPeriod
  readAgain?: unknown
  onReport?: (report: LiveFlowReport) => void
}) {
  const [report, setReport] = React.useState<LiveFlowReport | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const heard = React.useRef(onReport)
  React.useEffect(() => {
    heard.current = onReport
  })

  React.useEffect(() => {
    if (!live) return
    let current = true
    let timer: number | undefined
    const read = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === "hidden") return
      loadLiveFlowReport(automationId, periodStart(period))
        .then((next) => {
          if (!current) return
          setReport(next)
          setError(null)
          heard.current?.(next)
        })
        .catch((reason: unknown) => current && setError(getLiveFlowErrorMessage(reason)))
        .finally(() => {
          if (current) timer = window.setTimeout(read, READ_EVERY_MS)
        })
    }
    const back = () => {
      if (document.visibilityState === "visible") read()
    }
    read()
    document.addEventListener("visibilitychange", back)
    return () => {
      current = false
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", back)
    }
  }, [automationId, live, period, readAgain])

  return { report, error }
}

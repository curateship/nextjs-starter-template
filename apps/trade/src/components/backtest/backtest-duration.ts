import { useEffect, useState } from "react"
import { formatDuration } from "@/lib/format/format-time"

export type BacktestTiming = {
  createdAt: number
  finishedAt: number | null
  failed: boolean
}

/** One local clock per screen. No timer runs once every run has finished. */
export function useBacktestClock(running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [running])
  return now
}

export function backtestElapsedMs(
  run: BacktestTiming,
  now: number | null
): number {
  return Math.max(0, (run.finishedAt ?? now ?? run.createdAt) - run.createdAt)
}

export function backtestDurationText(
  run: BacktestTiming,
  now: number | null
): string {
  if (run.finishedAt === null && now === null) return "Running…"
  const duration = formatDuration(backtestElapsedMs(run, now), { zero: "0s" })
  if (run.finishedAt === null) return `Running for ${duration}`
  return run.failed ? `Gave up after ${duration}` : `Took ${duration}`
}

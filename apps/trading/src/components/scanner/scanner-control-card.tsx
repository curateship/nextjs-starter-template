import * as React from "react"
import { Loader2Icon, PauseIcon, PlayIcon, RadarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadScannerControl, setScannerPaused } from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

/**
 * Self-contained toggle to pause/resume the research scanner worker. Loads
 * and saves its own state via the scanner control API — independent of the
 * shell-config Save button.
 */
export function ScannerControlCard() {
  const [paused, setPaused] = React.useState<boolean | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void loadScannerControl()
      .then((result) => {
        if (!cancelled) setPaused(result.paused)
      })
      .catch(() => {
        if (!cancelled) setError("Could not load scanner status.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function toggle() {
    if (paused === null) return
    setSaving(true)
    setError(null)
    try {
      const result = await setScannerPaused(!paused)
      setPaused(result.paused)
    } catch {
      setError("Could not update scanner status.")
    } finally {
      setSaving(false)
    }
  }

  const loading = paused === null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research Scanner</CardTitle>
        <CardDescription>
          The background worker that collects mainnet market data for the
          Research dashboards and alerts. Pause it to stop all scanning.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                loading
                  ? "bg-muted text-muted-foreground"
                  : paused
                    ? "bg-muted text-muted-foreground"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              )}
            >
              <RadarIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {loading
                  ? "Checking status…"
                  : paused
                    ? "Scanning paused"
                    : "Scanning active"}
              </p>
              <p className="text-xs text-muted-foreground">
                {paused
                  ? "The worker has stopped collecting trades, stats, positions, and alerts."
                  : "The worker is collecting mainnet trades, stats, positions, and alerts."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant={paused ? "default" : "outline"}
            disabled={loading || saving}
            onClick={() => void toggle()}
          >
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : paused ? (
              <PlayIcon className="size-4" />
            ) : (
              <PauseIcon className="size-4" />
            )}
            {paused ? "Resume scanning" : "Pause scanning"}
          </Button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

import * as React from "react"
import { CpuIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  changeWorkerSwitch,
  getWorkersErrorMessage,
  loadWorkers,
} from "@/lib/api/workers"
import { formatRelativeTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  WORKER_STATE_LABELS,
  type WorkersDashboard,
  type WorkerState,
  type WorkerStatus,
} from "@/lib/trade/workers"
import { cn } from "@/lib/utils"

/**
 * Is the trading engine running, and the two switches for it.
 *
 * The engine is a separate program from the website, so "is it up?" is a real
 * question with a real answer, and until this existed there was nowhere to ask
 * it. It works entirely off what the engine writes down every few seconds: a
 * copy that has died stops writing, and this says so rather than leaving you to
 * notice that a trade did not happen.
 *
 * A Settings tab rather than a page of its own, because that is where somebody
 * goes to change how the app behaves — and pausing the engine is exactly that.
 * It fetches its own answer instead of taking one from a loader: the tab is
 * only drawn when it is opened, and the answer changes without anybody
 * clicking.
 */

/** Often enough that a stopped engine is noticed, rarely enough to be cheap. */
const REFRESH_MS = 5_000

const STATE_TONE: Record<WorkerState, string> = {
  running: "text-emerald-600 dark:text-emerald-400",
  idle: "text-muted-foreground",
  paused: "text-amber-600 dark:text-amber-400",
  off: "text-muted-foreground",
  offline: "text-destructive",
}

export default function WorkersSettings() {
  const [data, setData] = React.useState<WorkersDashboard | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let stopped = false
    const read = () =>
      void loadWorkers()
        .then((next) => {
          if (!stopped) setData(next)
        })
        // A refresh that fails is not worth interrupting anybody for — the next
        // is five seconds away, and the card says when it was last read.
        .catch(() => {})

    read()
    const timer = window.setInterval(read, REFRESH_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  const flip = async (
    worker: WorkerStatus,
    change: { enabled: boolean } | { paused: boolean }
  ) => {
    setBusy(true)
    try {
      setData(await changeWorkerSwitch({ kind: worker.kind, change }))
    } catch (thrown) {
      showErrorToast(getWorkersErrorMessage(thrown))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">Asking the server…</p>
    )
  }

  return (
    <div className="grid gap-4">
      {data.workers.map((worker) => (
        <Card key={worker.kind}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="grid gap-1">
              <CardTitle className="flex items-center gap-2">
                <CpuIcon className="size-4" />
                {worker.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {worker.description}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn("shrink-0", STATE_TONE[worker.state])}
            >
              {WORKER_STATE_LABELS[worker.state]}
            </Badge>
          </CardHeader>

          <CardContent className="grid gap-4">
            {/* Said on the card, not as a toast. This is a STATE, not something
                that just went wrong: it stays true until somebody starts the
                engine, and a toast reappearing every five seconds as the
                wording ticks over would be unusable. */}
            {worker.state === "offline" && worker.enabled ? (
              <Notice>
                {worker.lastSeenAt
                  ? `Nothing has run since ${formatRelativeTime(worker.lastSeenAt)}. Ladders are not being worked — no rung will buy and no stop will fire until it is started again.`
                  : "This has never run. Ladders are not being worked — no rung will buy and no stop will fire until it is started."}
              </Notice>
            ) : null}

            {worker.latestError ? (
              <Notice>Last error: {worker.latestError}</Notice>
            ) : null}

            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <Line label="Doing now" value={worker.activity} />
              <Line
                label="Last heard from"
                value={
                  worker.lastSeenAt
                    ? formatRelativeTime(worker.lastSeenAt)
                    : "Never"
                }
              />
              <Line
                label="Running since"
                value={
                  worker.startedAt ? formatRelativeTime(worker.startedAt) : "—"
                }
              />
              <Line label="Where" value={worker.host ?? "—"} />
              {worker.figures.map((figure) => (
                <Line
                  key={figure.label}
                  label={figure.label}
                  value={figure.value}
                />
              ))}
            </dl>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {/* Pause is the one to reach for. It leaves every ladder exactly
                  where it is and stops anything else happening, which is what
                  you want while you look at something that seems wrong. */}
              <Button
                variant="outline"
                disabled={busy || !worker.enabled}
                onClick={() => void flip(worker, { paused: !worker.paused })}
              >
                {worker.paused ? "Carry on trading" : "Pause trading"}
              </Button>
              <Button
                variant={worker.enabled ? "outline" : "default"}
                disabled={busy}
                onClick={() => void flip(worker, { enabled: !worker.enabled })}
              >
                {worker.enabled ? "Switch off" : "Switch on"}
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Pausing leaves your ladders where they are and stops anything new
                happening. Switching off is the same, but it stays off through a
                restart.
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">
        Read {formatRelativeTime(data.checkedAt)}.
      </p>
    </div>
  )
}

/** A state worth reading on the card itself, rather than a passing toast. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-start sm:gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  loadWorkers,
  updateMarketRulesPaused,
  updateWorkerEnabled,
  updateWorkerPaused,
} from "@/lib/api/workers"
import type { WorkerStatus, WorkersDashboardData } from "@/lib/workers"
import { useVisibleInterval } from "@/lib/use-visible-interval"

const POLL_MS = 10_000

export function WorkersSettings({
  initial = null,
}: {
  initial?: WorkersDashboardData | null
}) {
  const [data, setData] = React.useState(initial)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setData(await loadWorkers())
      setError(null)
    } catch (cause) {
      setError(messageOf(cause, "Could not load worker information."))
    }
  }, [])

  React.useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])
  useVisibleInterval(refresh, POLL_MS)

  async function change(key: string, action: () => Promise<unknown>) {
    setSaving(key)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(messageOf(cause, "Could not update the worker."))
    } finally {
      setSaving(null)
    }
  }

  if (!data) {
    return (
      <Card>
        <CardContent
          role={error ? "alert" : "status"}
          className={
            error
              ? "flex items-center gap-2 py-6 text-sm text-destructive"
              : "flex items-center gap-2 py-6 text-sm text-muted-foreground"
          }
        >
          {error ? (
            <AlertCircleIcon className="size-4" />
          ) : (
            <Loader2Icon className="size-4 animate-spin" />
          )}
          {error ?? "Loading workers…"}
        </CardContent>
      </Card>
    )
  }

  const overview = [
    ["Online", data.overview.online],
    ["Active", data.overview.active],
    ["Paused or off", data.overview.pausedOrOff],
    ["Needs attention", data.overview.needsAttention],
  ] as const

  return (
    <div className="space-y-2 md:space-y-3">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {overview.map(([label, value]) => (
          <Card key={label} size="sm">
            <CardContent className="grid gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-heading text-2xl font-semibold">
                {value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        {data.workers.map((worker) => (
          <WorkerCard
            key={worker.kind}
            worker={worker}
            canControl={data.canControl}
            saving={saving}
            onChange={change}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Last checked {formatTime(data.checkedAt)}. Status refreshes
        automatically.
      </p>
    </div>
  )
}

function WorkerCard({
  worker,
  canControl,
  saving,
  onChange,
}: {
  worker: WorkerStatus
  canControl: boolean
  saving: string | null
  onChange: (key: string, action: () => Promise<unknown>) => Promise<void>
}) {
  const powerKey = `${worker.kind}:power`
  const pauseKey = `${worker.kind}:pause`
  const rulesKey = `${worker.kind}:rules`
  const busy = saving?.startsWith(`${worker.kind}:`) ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>{worker.label}</CardTitle>
            <CardDescription>{worker.description}</CardDescription>
          </div>
          <Badge variant={worker.state === "running" ? "default" : "secondary"}>
            {stateLabel(worker.state)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="grid grid-cols-3 gap-2">
          {worker.metrics.map((metric) => (
            <div key={metric.label} className="grid min-w-0 gap-1">
              <span className="truncate text-xs text-muted-foreground">
                {metric.label}
              </span>
              <span className="truncate text-sm font-medium">
                {formatMetric(metric.value)}
              </span>
            </div>
          ))}
        </div>

        <dl className="grid gap-1 text-xs text-muted-foreground">
          <Info label="Activity" value={worker.currentActivity} />
          <Info
            label="Process"
            value={`${worker.activeProcesses} online${worker.role ? ` · ${worker.role}` : ""}`}
          />
          <Info label="Started" value={formatTime(worker.startedAt)} />
          <Info
            label="Uptime"
            value={
              worker.online ? formatUptime(worker.startedAt) : "Not running"
            }
          />
          <Info label="Heartbeat" value={formatTime(worker.lastHeartbeatAt)} />
          <Info
            label="Last successful work"
            value={formatTime(worker.lastSuccessfulWorkAt)}
          />
        </dl>

        {worker.latestError ? (
          <p className="text-xs text-destructive">{worker.latestError}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={worker.enabled ? "outline" : "default"}
            disabled={!canControl || busy}
            onClick={() =>
              void onChange(powerKey, () =>
                updateWorkerEnabled(worker.kind, !worker.enabled)
              )
            }
          >
            {saving === powerKey ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PowerIcon className="size-4" />
            )}
            {worker.enabled ? "Turn off" : "Turn on"}
          </Button>
          <Button
            type="button"
            variant={worker.paused ? "default" : "outline"}
            disabled={!canControl || busy || !worker.enabled}
            onClick={() =>
              void onChange(pauseKey, () =>
                updateWorkerPaused(worker.kind, !worker.paused)
              )
            }
          >
            {saving === pauseKey ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : worker.paused ? (
              <PlayIcon className="size-4" />
            ) : (
              <PauseIcon className="size-4" />
            )}
            {worker.paused ? "Resume" : "Pause"}
          </Button>
          {worker.userPaused !== null ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void onChange(rulesKey, () =>
                  updateMarketRulesPaused(!worker.userPaused)
                )
              }
            >
              {saving === rulesKey ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : worker.userPaused ? (
                <PlayIcon className="size-4" />
              ) : (
                <PauseIcon className="size-4" />
              )}
              {worker.userPaused ? "Resume my rules" : "Pause my rules"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <dt>{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  )
}

function stateLabel(state: WorkerStatus["state"]) {
  if (state === "off") return "Off"
  if (state === "offline") return "Offline"
  if (state === "paused") return "Paused"
  if (state === "running") return "Running"
  return "Idle"
}

function formatTime(value: string | null) {
  if (!value) return "Never"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatMetric(value: string) {
  const date = new Date(value)
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : value
}

function formatUptime(startedAt: string | null) {
  if (!startedAt) return "Not running"
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)
  )
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

import * as React from "react"
import {
  ActivityIcon,
  Clock3Icon,
  CpuIcon,
  MemoryStickIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  getCapacityErrorMessage,
  loadCapacitySummary,
  type CapacitySummary,
} from "@/lib/api/capacity"
import { AdminLayout } from "@/pages/shared/admin-layout"

const REFRESH_MS = 10_000
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function CapacityDashboard({
  initialSummary,
}: {
  initialSummary: CapacitySummary
}) {
  const [summary, setSummary] = React.useState(initialSummary)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const next = await loadCapacitySummary()
        if (!active) return
        setSummary(next)
        setError(null)
      } catch (error) {
        if (active) setError(getCapacityErrorMessage(error))
      }
    }
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  return (
    <AdminLayout>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">
            Cost &amp; capacity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live resource reservations, launch headroom, and idle reaping.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <ActivityIcon aria-hidden="true" />
          Refreshes every 10 seconds
        </Badge>
      </div>

      {error ? (
        <Alert className="mb-4 border-destructive/40">
          <AlertTitle>Capacity refresh failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {summary.nodes.length ? (
        <section aria-labelledby="nodes-heading">
          <h2 id="nodes-heading" className="sr-only">
            Worker nodes
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {summary.nodes.map((node) => (
              <Card key={node.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ServerIcon
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <CardTitle>{node.label}</CardTitle>
                  </div>
                  <CardDescription>
                    {node.activeSessions} active ·{" "}
                    {node.estimatedRemainingProfiles} more profile
                    {node.estimatedRemainingProfiles === 1 ? "" : "s"}
                  </CardDescription>
                  <CardAction className="flex gap-2">
                    <Badge
                      variant={
                        node.status === "active" ? "secondary" : "outline"
                      }
                    >
                      {node.status}
                    </Badge>
                    <Badge
                      variant={
                        node.statsStatus === "live" ? "outline" : "destructive"
                      }
                    >
                      Stats {node.statsStatus}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <CapacityMeter
                    icon={<MemoryStickIcon aria-hidden="true" />}
                    label="RAM capacity"
                    value={node.ramUsedMb}
                    max={node.totalRamMb}
                    headroom={`${formatRam(node.ramHeadroomMb)} headroom`}
                    detail={`${formatRam(node.liveRamUsedMb)} live · ${formatRam(node.reservedRamMb)} reserved`}
                    formatValue={formatRam}
                  />
                  <CapacityMeter
                    icon={<CpuIcon aria-hidden="true" />}
                    label="vCPU capacity"
                    value={node.vcpuUsed}
                    max={node.totalVcpu}
                    headroom={`${formatVcpu(node.vcpuHeadroom)} headroom`}
                    detail={`${formatVcpu(node.liveVcpuUsed)} live · ${formatVcpu(node.reservedVcpu)} reserved`}
                    formatValue={formatVcpu}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Alert>
          <AlertTitle>No worker nodes configured</AlertTitle>
          <AlertDescription>
            Add an active node before launching browser profiles.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UsersIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <CardTitle>User concurrency</CardTitle>
            </div>
            <CardDescription>
              Active users against the global per-user cap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.users.length ? (
              <div className="grid gap-5">
                {summary.users.map((user) => (
                  <CapacityMeter
                    key={user.userId}
                    label={user.name}
                    value={user.activeSessions}
                    max={user.concurrencyCap}
                    headroom={`${Math.max(0, user.concurrencyCap - user.activeSessions)} available`}
                    detail={user.email}
                    formatValue={(value) => String(value)}
                  />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active user sessions.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3Icon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <CardTitle>Idle reap events</CardTitle>
            </div>
            <CardDescription>
              Latest sessions stopped after exceeding the idle threshold.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.reapEvents.length ? (
              <ul className="divide-y" aria-label="Recent idle reap events">
                {summary.reapEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {event.userName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {event.profileId
                          ? `Profile ${event.profileId}`
                          : "Unknown profile"}
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={event.createdAt}
                    >
                      {dateFormatter.format(new Date(event.createdAt))}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No idle sessions have been reaped.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Each profile reserves {formatRam(summary.budget.ramMbPerProfile)} and{" "}
        {formatVcpu(summary.budget.vcpuPerProfile)}.
      </p>
    </AdminLayout>
  )
}

function CapacityMeter({
  icon,
  label,
  value,
  max,
  headroom,
  detail,
  formatValue,
}: {
  icon?: React.ReactNode
  label: string
  value: number
  max: number
  headroom: string
  detail: string
  formatValue: (value: number) => string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex min-w-0 items-center gap-2 font-medium [&>svg]:size-4 [&>svg]:text-muted-foreground">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {formatValue(value)} / {formatValue(max)}
        </span>
      </div>
      <progress
        className="block h-2 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        value={Math.min(value, max)}
        max={max}
        aria-label={`${label}: ${formatValue(value)} of ${formatValue(max)}`}
      />
      <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
        <span className="truncate">{detail}</span>
        <span className="shrink-0">{headroom}</span>
      </div>
    </div>
  )
}

function formatRam(value: number) {
  return value >= 1024 ? `${round(value / 1024)} GB` : `${round(value)} MB`
}

function formatVcpu(value: number) {
  return `${round(value)} vCPU`
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

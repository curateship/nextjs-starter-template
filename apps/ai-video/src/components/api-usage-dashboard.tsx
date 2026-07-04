"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  GaugeIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAdminApiUsageDashboard,
  getApiUsageErrorMessage,
  listAdminApiUsageEvents,
  saveUserApiUsageLimit,
  type ApiUsageAdminDashboard,
  type ApiUsageAdminEventItem,
  type ApiUsageAdminUser,
} from "@/lib/api/api-usage"
import { cn } from "@/lib/utils"
import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"

type StatusFilter = "all" | "normal" | "warning" | "blocked"
type EventStatusFilter = "all" | "success" | "failed" | "blocked"
type ProviderFilter = "all" | "gemini" | "openai" | "veo" | "elevenlabs"

const EVENT_PAGE_SIZE = 20

const providerLabels: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  veo: "Veo",
  elevenlabs: "ElevenLabs",
}

const featureLabels: Record<string, string> = {
  text_generation: "Text generation",
  caption_generation: "Captions",
  video_analysis: "Video analysis",
  voiceover: "Voiceover",
  image_generation: "Image generation",
  ai_video_generation: "AI video",
  script_generation: "Script",
  carousel_generation: "Carousel",
  export_description: "Export caption",
}

const providerColors: Record<string, string> = {
  gemini: "bg-sky-500",
  openai: "bg-emerald-500",
  veo: "bg-violet-500",
  elevenlabs: "bg-amber-500",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export function ApiUsageDashboard() {
  const [dashboard, setDashboard] =
    React.useState<ApiUsageAdminDashboard | null>(null)
  const [events, setEvents] = React.useState<ApiUsageAdminEventItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [userSearch, setUserSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [eventStatusFilter, setEventStatusFilter] =
    React.useState<EventStatusFilter>("all")
  const [providerFilter, setProviderFilter] =
    React.useState<ProviderFilter>("all")
  const [overrideDrafts, setOverrideDrafts] = React.useState<
    Record<string, string>
  >({})

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashboardData, eventData] = await Promise.all([
        getAdminApiUsageDashboard(),
        listAdminApiUsageEvents({ limit: EVENT_PAGE_SIZE }),
      ])
      setDashboard(dashboardData)
      setEvents(eventData.events)
      setNextCursor(eventData.next_cursor)
      setOverrideDrafts(
        Object.fromEntries(
          dashboardData.users.map((user) => [
            user.user_id,
            user.override_credits == null ? "" : String(user.override_credits),
          ])
        )
      )
    } catch (loadError) {
      setError(getApiUsageErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void loadDashboard(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadDashboard])

  async function loadMoreEvents() {
    if (!nextCursor) return
    setLoadingMore(true)
    setError(null)
    try {
      const data = await listAdminApiUsageEvents({
        cursor: nextCursor,
        limit: EVENT_PAGE_SIZE,
      })
      setEvents((current) => [...current, ...data.events])
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getApiUsageErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  async function saveUserLimit(user: ApiUsageAdminUser) {
    const draft = overrideDrafts[user.user_id]?.trim() ?? ""
    setSavingUserId(user.user_id)
    setError(null)
    try {
      await saveUserApiUsageLimit(user.user_id, draft ? Number(draft) : null)
      await loadDashboard()
    } catch (saveError) {
      setError(getApiUsageErrorMessage(saveError))
    } finally {
      setSavingUserId(null)
    }
  }

  const filteredUsers = React.useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    return (dashboard?.users ?? []).filter((user) => {
      const matchesSearch =
        !query ||
        user.user_name.toLowerCase().includes(query) ||
        user.user_email.toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === "all" || user.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [dashboard?.users, statusFilter, userSearch])

  const filteredEvents = React.useMemo(
    () =>
      events.filter(
        (event) =>
          (providerFilter === "all" || event.provider === providerFilter) &&
          (eventStatusFilter === "all" || event.status === eventStatusFilter)
      ),
    [eventStatusFilter, events, providerFilter]
  )

  if (loading && !dashboard) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Loading API usage
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">API Usage</h1>
          <p className="text-sm text-muted-foreground">
            Monitor credit usage and set user overrides.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => void loadDashboard()}
          >
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <MetricGrid dashboard={dashboard} />
          <DailyUsageChart dashboard={dashboard} />

          <DashboardTable
            title="Users"
            icon={<GaugeIcon className="size-4 text-muted-foreground" />}
            count={filteredUsers.length}
            controls={
              <>
                <DashboardToolbarSearch
                  name="api-usage-user-search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  aria-label="Search users"
                  placeholder="Search users..."
                />
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as StatusFilter)
                  }
                >
                  <DashboardToolbarSelectTrigger
                    aria-label="Status filter"
                    labels={["All", "Normal", "Warning", "Blocked"]}
                  >
                    <SelectValue />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            header={
              <TableHeader>
                <TableRow>
                  <TableHead column="main">User</TableHead>
                  <TableHead column="meta">Used</TableHead>
                  <TableHead column="meta">Est. spend</TableHead>
                  <TableHead column="meta">Remaining</TableHead>
                  <TableHead column="meta">Status</TableHead>
                  <TableHead column="meta">Override</TableHead>
                </TableRow>
              </TableHeader>
            }
            isEmpty={filteredUsers.length === 0}
            emptyText="No users found."
            emptyColSpan={6}
            footer={{
              type: "summary",
              count: filteredUsers.length,
              label: "users",
            }}
          >
            {filteredUsers.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell column="main">
                  <div>
                    <p className="font-medium">{user.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.user_email}
                    </p>
                  </div>
                </TableCell>
                <TableCell column="meta">
                  <div>
                    <p>
                      {user.used_credits} / {user.limit_credits}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Budget{" "}
                      {currencyFormatter.format(user.estimated_limit_cost_usd)}
                    </p>
                  </div>
                </TableCell>
                <TableCell column="meta">
                  {currencyFormatter.format(user.estimated_used_cost_usd)}
                </TableCell>
                <TableCell column="meta">{user.remaining_credits}</TableCell>
                <TableCell column="meta">
                  <UsageStatusBadge status={user.status} />
                </TableCell>
                <TableCell column="meta">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={API_USAGE_LIMIT_MIN}
                      max={API_USAGE_LIMIT_MAX}
                      className="h-8 w-24"
                      placeholder="Default"
                      value={overrideDrafts[user.user_id] ?? ""}
                      onChange={(event) =>
                        setOverrideDrafts((current) => ({
                          ...current,
                          [user.user_id]: event.target.value,
                        }))
                      }
                      aria-label={`Credit override for ${user.user_name}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={savingUserId === user.user_id}
                      onClick={() => void saveUserLimit(user)}
                    >
                      {savingUserId === user.user_id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </DashboardTable>

          <DashboardTable
            title="Events"
            count={filteredEvents.length}
            controls={
              <>
                <Select
                  value={providerFilter}
                  onValueChange={(value) =>
                    setProviderFilter(value as ProviderFilter)
                  }
                >
                  <DashboardToolbarSelectTrigger
                    aria-label="Provider filter"
                    labels={["All", "Gemini", "OpenAI", "Veo", "ElevenLabs"]}
                  >
                    <SelectValue />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="veo">Veo</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={eventStatusFilter}
                  onValueChange={(value) =>
                    setEventStatusFilter(value as EventStatusFilter)
                  }
                >
                  <DashboardToolbarSelectTrigger
                    aria-label="Event status filter"
                    labels={["All", "Success", "Failed", "Blocked"]}
                  >
                    <SelectValue />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            header={
              <TableHeader>
                <TableRow>
                  <TableHead column="main">Activity</TableHead>
                  <TableHead column="meta">Provider</TableHead>
                  <TableHead column="meta">Credits</TableHead>
                  <TableHead column="meta">Est. cost</TableHead>
                  <TableHead column="meta">Status</TableHead>
                  <TableHead column="meta">Created</TableHead>
                </TableRow>
              </TableHeader>
            }
            isEmpty={filteredEvents.length === 0}
            emptyText="No usage events found."
            emptyColSpan={6}
            footer={{
              type: "loadMore",
              count: filteredEvents.length,
              hasMore: Boolean(nextCursor),
              loading: loadingMore,
              onLoadMore: nextCursor ? () => void loadMoreEvents() : undefined,
              label: "events",
            }}
          >
            {filteredEvents.map((event) => (
              <TableRow key={event.id}>
                <TableCell column="main">
                  <div>
                    <p className="font-medium">
                      {featureLabels[event.feature] ?? event.feature}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.user_name}
                      {event.model ? ` · ${event.model}` : ""}
                    </p>
                  </div>
                </TableCell>
                <TableCell column="meta">
                  {providerLabels[event.provider] ?? event.provider}
                </TableCell>
                <TableCell column="meta">{event.credits}</TableCell>
                <TableCell column="meta">
                  {currencyFormatter.format(event.estimated_cost_usd)}
                </TableCell>
                <TableCell column="meta">
                  <Badge
                    variant={
                      event.status === "blocked" ? "destructive" : "secondary"
                    }
                  >
                    {event.status}
                  </Badge>
                </TableCell>
                <TableCell column="mutedMeta">
                  {dateFormatter.format(new Date(event.created_at))}
                </TableCell>
              </TableRow>
            ))}
          </DashboardTable>
        </>
      ) : null}
    </div>
  )
}

function MetricGrid({ dashboard }: { dashboard: ApiUsageAdminDashboard }) {
  const metrics: { label: string; value: number; detail?: string }[] = [
    {
      label: "Used credits",
      value: dashboard.summary.used_credits,
      detail: `Est. spend ${currencyFormatter.format(
        dashboard.summary.estimated_used_cost_usd
      )}`,
    },
    {
      label: "Remaining credits",
      value: dashboard.summary.remaining_credits,
      detail: `Budget ${currencyFormatter.format(
        dashboard.summary.estimated_total_limit_cost_usd
      )}`,
    },
    {
      label: "Users near cap",
      value: dashboard.summary.users_near_cap,
    },
    {
      label: "Blocked attempts",
      value: dashboard.summary.blocked_attempts,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              {metric.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{metric.value}</p>
            {metric.detail ? (
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DailyUsageChart({ dashboard }: { dashboard: ApiUsageAdminDashboard }) {
  const byDate = new Map<
    string,
    Record<string, { credits: number; estimatedCostUsd: number }>
  >()
  for (const point of dashboard.daily) {
    const row = byDate.get(point.date) ?? {}
    const current = row[point.provider] ?? {
      credits: 0,
      estimatedCostUsd: 0,
    }
    row[point.provider] = {
      credits: current.credits + point.credits,
      estimatedCostUsd: current.estimatedCostUsd + point.estimated_cost_usd,
    }
    byDate.set(point.date, row)
  }
  const rows = Array.from(byDate.entries()).slice(-14)
  const max = Math.max(
    1,
    ...rows.map(([, providers]) =>
      Object.values(providers).reduce(
        (total, value) => total + value.credits,
        0
      )
    )
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily usage</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="flex h-48 items-end gap-2">
            {rows.map(([date, providers]) => {
              const total = Object.values(providers).reduce(
                (sum, value) => sum + value.credits,
                0
              )
              const estimatedCost = Object.values(providers).reduce(
                (sum, value) => sum + value.estimatedCostUsd,
                0
              )
              return (
                <div key={date} className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex h-36 flex-col justify-end overflow-hidden rounded bg-muted">
                    {Object.entries(providers).map(([provider, value]) => (
                      <div
                        key={provider}
                        className={cn(providerColors[provider] ?? "bg-primary")}
                        style={{
                          height: `${Math.max(4, (value.credits / max) * 144)}px`,
                        }}
                        title={`${providerLabels[provider] ?? provider}: ${
                          value.credits
                        } credits, ${currencyFormatter.format(
                          value.estimatedCostUsd
                        )}`}
                      />
                    ))}
                  </div>
                  <p className="truncate text-center text-[11px] text-muted-foreground">
                    {date.slice(5)}
                  </p>
                  <p className="text-center text-[11px] font-medium">
                    {total} · {currencyFormatter.format(estimatedCost)}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No usage this period
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UsageStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "blocked" ? "destructive" : "secondary"}
      className={cn(status === "warning" && "bg-amber-100 text-amber-800")}
    >
      {status}
    </Badge>
  )
}

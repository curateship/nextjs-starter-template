import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BellRingIcon, Trash2Icon } from "lucide-react"

import { DashboardTable, pagedFooter } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { ConfirmDeleteDialog } from "@/components/feedback-shared"
import { SortHeaderRow } from "@/components/scanner/sort-head"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  clearAlertEvents,
  loadAlertLog,
  markAlertEventRead,
  markAllAlertEventsRead,
} from "@/lib/api/alerts"
import {
  alertTradeTarget,
  type AlertEventItem,
  type AlertKind,
  type AlertLogFilters,
  type AlertLogSort,
} from "@/lib/alerts"
import { useVisibleInterval } from "@/lib/use-visible-interval"

const POLL_MS = 10_000
const SEARCH_DEBOUNCE_MS = 300
type AlertLogPage = Awaited<ReturnType<typeof loadAlertLog>>
type Filters = Required<
  Pick<AlertLogFilters, "page" | "pageSize" | "read" | "sortBy" | "dir">
> &
  Pick<AlertLogFilters, "search" | "coin" | "kind">

const COLUMNS = [
  { key: "time", label: "Time", main: true },
  { key: "market", label: "Market" },
  { key: "alert", label: "Alert" },
  { key: "condition", label: "Condition" },
  { key: "observed", label: "Observed" },
  { key: "read", label: "Read" },
] as const

export function AlertLogDashboard({ initial }: { initial: AlertLogPage }) {
  const navigate = useNavigate()
  const [data, setData] = React.useState(initial)
  const [filters, setFilters] = React.useState<Filters>({
    page: initial.page,
    pageSize: initial.pageSize,
    read: "all",
    sortBy: "time",
    dir: "desc",
  })
  const [loading, setLoading] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchInput, setSearchInput] = React.useState("")
  const refreshId = React.useRef(0)

  const refresh = React.useCallback(async (next: Filters) => {
    const id = ++refreshId.current
    setLoading(true)
    try {
      const nextData = await loadAlertLog(next)
      if (id === refreshId.current) setData(nextData)
    } catch (cause) {
      if (id === refreshId.current) throw cause
    } finally {
      if (id === refreshId.current) setLoading(false)
    }
  }, [])

  React.useEffect(
    () => () => {
      refreshId.current += 1
    },
    []
  )

  React.useEffect(() => {
    queueMicrotask(
      () =>
        void refresh(filters).catch((cause) => setError(errorMessage(cause)))
    )
  }, [filters, refresh])
  useVisibleInterval(() => refresh(filters), POLL_MS)

  React.useEffect(() => {
    const search = searchInput || undefined
    if (search === filters.search) return
    const timer = window.setTimeout(() => {
      const next = { ...filters, search, page: 1 }
      setFilters(next)
      setError(null)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [filters, searchInput])

  function patchFilters(patch: Partial<Filters>) {
    const next = {
      ...filters,
      ...patch,
      page: "page" in patch || "pageSize" in patch ? (patch.page ?? 1) : 1,
    }
    setFilters(next)
    setError(null)
  }

  async function markAllRead() {
    setError(null)
    try {
      await markAllAlertEventsRead()
      await refresh(filters)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function clearHistory() {
    setClearing(true)
    setError(null)
    try {
      await clearAlertEvents()
      setConfirmClear(false)
      await refresh({ ...filters, page: 1 })
      setFilters((current) => ({ ...current, page: 1 }))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setClearing(false)
    }
  }

  async function openEvent(event: AlertEventItem) {
    if (!event.readAt) {
      try {
        await markAlertEventRead(event.id)
      } catch {
        // The Trade click-through still works; the next poll reconciles read state.
      }
    }
    void navigate(alertTradeTarget(event.coin))
  }

  return (
    <div className="grid w-full gap-[var(--shell-gutter,0.75rem)]">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Alert Log"
        icon={
          <BellRingIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={data.total}
        loading={loading}
        controls={
          <>
            {data.total > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2Icon className="size-4" />
                Clear history
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              aria-label="Search Alert Log"
              placeholder="Search Alert Log"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <FilterSelect
              label="Market"
              value={filters.coin ?? "all"}
              onValueChange={(value) =>
                patchFilters({ coin: value === "all" ? undefined : value })
              }
              options={data.markets.map((coin) => ({
                value: coin,
                label: coin,
              }))}
            />
            <FilterSelect
              label="Type"
              value={filters.kind ?? "all"}
              onValueChange={(value) =>
                patchFilters({
                  kind: value === "all" ? undefined : (value as AlertKind),
                })
              }
              options={[
                { value: "price_level", label: "Exact price" },
                { value: "price_move", label: "Price move" },
                { value: "volume_spike", label: "Unusual volume" },
              ]}
            />
            <FilterSelect
              label="Read"
              value={filters.read}
              onValueChange={(value) =>
                patchFilters({ read: value as Filters["read"] })
              }
              options={[
                { value: "unread", label: "Unread" },
                { value: "read", label: "Read" },
              ]}
            />
            {data.unreadCount > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </DashboardToolbarButton>
            ) : null}
          </>
        }
        header={
          <SortHeaderRow
            columns={COLUMNS}
            activeKey={filters.sortBy as AlertLogSort}
            dir={filters.dir}
            onSort={(next) => patchFilters(next)}
          />
        }
        isEmpty={data.items.length === 0}
        emptyText="No alert events match these filters."
        emptyColSpan={6}
        footer={pagedFooter(data, patchFilters)}
      >
        {data.items.map((event) => (
          <TableRow
            key={event.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => void openEvent(event)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                keyEvent.preventDefault()
                void openEvent(event)
              }
            }}
          >
            <TableCell column="main">
              <div className="font-medium">{formatTime(event.occurredAt)}</div>
            </TableCell>
            <TableCell column="meta">{event.coin}</TableCell>
            <TableCell column="meta">
              <div className="font-medium">{event.alertName}</div>
              {event.message ? (
                <div className="max-w-64 truncate text-xs text-muted-foreground">
                  {event.message}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta">{conditionLabel(event)}</TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">
              {observedLabel(event)}
            </TableCell>
            <TableCell column="meta">
              <Badge variant={event.readAt ? "secondary" : "default"}>
                {event.readAt ? "Read" : "New"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDeleteDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear Alert Log?"
        body="Every event in your Alert Log will be permanently deleted."
        deleting={clearing}
        onConfirm={() => void clearHistory()}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <DashboardToolbarSelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function conditionLabel(event: AlertEventItem) {
  if (event.kind === "price_level") {
    const operator =
      event.operator === "crossing_up"
        ? "Crosses upward"
        : event.operator === "crossing_down"
          ? "Crosses downward"
          : "Crosses"
    return `${operator} ${event.level}`
  }
  if (event.kind === "price_move") {
    return `${event.direction === "up" ? "Up" : "Down"} ${event.percent}% in ${event.window}`
  }
  return `${event.multiplier}× volume in ${event.window}`
}

function observedLabel(event: AlertEventItem) {
  if (event.kind === "price_level") return String(event.observed)
  if (event.kind === "price_move") {
    return `${event.observed > 0 ? "+" : ""}${event.observed.toFixed(2)}%`
  }
  return `${event.observed.toFixed(1)}×`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The Alert Log request failed."
}

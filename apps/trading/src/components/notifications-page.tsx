import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  BellIcon,
  BookOpenIcon,
  MessageSquareIcon,
  RadarIcon,
  ThumbsUpIcon,
  UsersIcon,
} from "lucide-react"

import { alertRoute, ALERT_TYPE_LABELS } from "@/components/scanner/alert-meta"
import { Badge } from "@/components/ui/badge"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  getNotificationErrorMessage,
  listAllNotifications,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api/notification"
import {
  loadAlertsPage,
  markAlertRead,
  type ScannerAlertItem,
} from "@/lib/api/scanner"
import {
  markMarketScannerAlertRead,
  pollMarketScannerAlerts,
} from "@/lib/api/market-scanner"
import {
  marketScannerTradeTarget,
  type MarketScannerAlertItem,
} from "@/lib/market-scanner"
import { cn } from "@/lib/utils"

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType | "alert"
type NotificationSortColumn =
  | "activity"
  | "detail"
  | "source"
  | "type"
  | "status"
  | "created"

// A row is a feedback notification or a scanner alert — the same unified feed
// shown in the top-right notification tray.
type UnifiedRow =
  | { kind: "feedback"; id: string; createdAt: string; read: boolean; feedback: NotificationItem }
  | { kind: "alert"; id: string; createdAt: string; read: boolean; alert: ScannerAlertItem }
  | { kind: "market"; id: string; createdAt: string; read: boolean; market: MarketScannerAlertItem }

const ALERT_TRAY_LIMIT = 100

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const feedbackTypeLabels: Record<NotificationType, string> = {
  feedback_vote: "Thumbs up",
  feedback_comment: "Comment",
}

function rowTypeLabel(row: UnifiedRow): string {
  if (row.kind === "feedback") return feedbackTypeLabels[row.feedback.type]
  if (row.kind === "market") return "Market scanner"
  return ALERT_TYPE_LABELS[row.alert.type] ?? row.alert.type
}

function rowActivity(row: UnifiedRow): string {
  if (row.kind === "feedback") return row.feedback.actor_name
  return row.kind === "market" ? row.market.title : row.alert.title
}

function rowDetail(row: UnifiedRow): string {
  if (row.kind === "feedback") return row.feedback.feedback_message
  return (row.kind === "market" ? row.market.body : row.alert.body) ?? ""
}

function rowSource(row: UnifiedRow): string {
  if (row.kind === "feedback") return row.feedback.recipient_name
  return row.kind === "market" ? row.market.coin : (row.alert.coin ?? "")
}

function AlertGlyph({ type }: { type: string }) {
  const className = "size-4 text-muted-foreground"
  switch (alertRoute(type)) {
    case "/scanner/positions":
      return <ArrowRightLeftIcon className={className} />
    case "/scanner/crowded":
      return <UsersIcon className={className} />
    case "/scanner/book":
      return <BookOpenIcon className={className} />
    default:
      return <RadarIcon className={className} />
  }
}

type NotificationsPageProps = {
  defaultRowsPerPage: number
  onOpenFeedbackThread: (feedbackId: string) => void
}

export function NotificationsPage({
  defaultRowsPerPage,
  onOpenFeedbackThread,
}: NotificationsPageProps) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [alerts, setAlerts] = React.useState<ScannerAlertItem[]>([])
  const [marketAlerts, setMarketAlerts] = React.useState<MarketScannerAlertItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
  const [sortColumn, setSortColumn] =
    React.useState<NotificationSortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")

  const loadNotifications = React.useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const data = await listAllNotifications({
        cursor,
        limit: defaultRowsPerPage,
      })
      setNotifications((current) =>
        cursor ? [...current, ...data.notifications] : data.notifications
      )
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }, [defaultRowsPerPage])

  const loadAlerts = React.useCallback(async () => {
    try {
      const data = await loadAlertsPage(1, ALERT_TRAY_LIMIT)
      setAlerts(data.items)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  const loadMarketAlerts = React.useCallback(async () => {
    try {
      setMarketAlerts((await pollMarketScannerAlerts()).alerts)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  React.useEffect(() => {
    queueMicrotask(() => {
      void loadNotifications()
      void loadAlerts()
      void loadMarketAlerts()
    })
  }, [loadNotifications, loadAlerts, loadMarketAlerts])

  const rows = React.useMemo<UnifiedRow[]>(() => {
    return [
      ...notifications.map((n) => ({
        kind: "feedback" as const,
        id: `f:${n.id}`,
        createdAt: n.created_at,
        read: n.read_at !== null,
        feedback: n,
      })),
      ...alerts.map((a) => ({
        kind: "alert" as const,
        id: `a:${a.id}`,
        createdAt: a.created_at,
        read: a.read_at !== null,
        alert: a,
      })),
      ...marketAlerts.map((item) => ({
        kind: "market" as const,
        id: `m:${item.id}`,
        createdAt: item.occurredAt,
        read: item.readAt !== null,
        market: item,
      })),
    ]
  }, [notifications, alerts, marketAlerts])

  const filteredRows = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return rows
      .filter((row) => {
        const haystack = [
          rowActivity(row),
          rowDetail(row),
          rowSource(row),
          rowTypeLabel(row),
        ]
          .join(" ")
          .toLowerCase()
        const matchesSearch = !query || haystack.includes(query)
        const matchesRead =
          readFilter === "all" ||
          (readFilter === "unread" && !row.read) ||
          (readFilter === "read" && row.read)
        const matchesType =
          typeFilter === "all" ||
          (typeFilter === "alert" && (row.kind === "alert" || row.kind === "market")) ||
          (row.kind === "feedback" && row.feedback.type === typeFilter)

        return matchesSearch && matchesRead && matchesType
      })
      .sort((a, b) => {
        if (sortColumn === "status") {
          return (Number(a.read) - Number(b.read)) * direction
        }
        if (sortColumn === "created") {
          return (
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime()) *
            direction
          )
        }
        const get =
          sortColumn === "activity"
            ? rowActivity
            : sortColumn === "detail"
              ? rowDetail
              : sortColumn === "source"
                ? rowSource
                : rowTypeLabel
        return get(a).localeCompare(get(b)) * direction
      })
  }, [rows, readFilter, searchQuery, sortColumn, sortDirection, typeFilter])

  const toggleSort = (column: NotificationSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection("asc")
  }

  async function openRow(row: UnifiedRow) {
    if (row.kind === "feedback") {
      onOpenFeedbackThread(row.feedback.feedback_id)
      return
    }
    if (row.kind === "market") {
      if (!row.market.readAt) {
        try {
          const result = await markMarketScannerAlertRead(row.market.id)
          setMarketAlerts((current) => current.map((item) => item.id === result.id ? { ...item, readAt: result.readAt } : item))
        } catch {
          // navigate anyway; the read state will reconcile on next load
        }
      }
      void navigate(marketScannerTradeTarget(row.market.coin))
      return
    }
    if (!row.alert.read_at) {
      try {
        const result = await markAlertRead(row.alert.id)
        setAlerts((current) =>
          current.map((item) =>
            item.id === row.alert.id
              ? { ...item, read_at: result.readAt }
              : item
          )
        )
      } catch {
        // navigate anyway; the read state will reconcile on next load
      }
    }
    void navigate({ to: alertRoute(row.alert.type) })
  }

  return (
    <div className="w-full">
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Notifications"
        icon={<BellIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredRows.length}
        controls={
          <>
            <DashboardToolbarSearch
              name="notification-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search notifications"
              placeholder="Search notifications..."
            />
            <Select
              value={readFilter}
              onValueChange={(value) => setReadFilter(value as ReadFilter)}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Read filter"
                labels={["All", "Unread", "Read"]}
              >
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Type filter"
                labels={["All types", "Alerts", "Thumbs up", "Comments"]}
              >
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="alert">Scanner alerts</SelectItem>
                <SelectItem value="feedback_vote">Thumbs up</SelectItem>
                <SelectItem value="feedback_comment">Comments</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "activity"}
                  direction={sortDirection}
                  onClick={() => toggleSort("activity")}
                >
                  Notification
                </TableSortButton>
              </TableHead>
              <TableHead column="preview">
                <TableSortButton
                  active={sortColumn === "detail"}
                  direction={sortDirection}
                  onClick={() => toggleSort("detail")}
                >
                  Detail
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "source"}
                  direction={sortDirection}
                  onClick={() => toggleSort("source")}
                >
                  Recipient / Coin
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "type"}
                  direction={sortDirection}
                  onClick={() => toggleSort("type")}
                >
                  Type
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "status"}
                  direction={sortDirection}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "created"}
                  direction={sortDirection}
                  onClick={() => toggleSort("created")}
                >
                  Created
                </TableSortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={filteredRows.length === 0}
        emptyText="No notifications found."
        emptyColSpan={6}
        footer={{
          type: "loadMore",
          count: filteredRows.length,
          label: "notifications",
          hasMore: Boolean(nextCursor),
          loading: loadingMore,
          onLoadMore: nextCursor
            ? () => void loadNotifications(nextCursor)
            : undefined,
        }}
      >
        {filteredRows.map((row) => (
          <TableRow
            key={row.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => void openRow(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                void openRow(row)
              }
            }}
          >
            <TableCell column="main">
              <div className="flex items-center gap-2">
                {row.kind === "feedback" ? (
                  row.feedback.type === "feedback_vote" ? (
                    <ThumbsUpIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <MessageSquareIcon className="size-4 text-muted-foreground" />
                  )
                ) : row.kind === "market" ? (
                  <RadarIcon className="size-4 text-muted-foreground" />
                ) : (
                  <AlertGlyph type={row.alert.type} />
                )}
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium">
                    {row.kind === "feedback"
                      ? feedbackTypeLabels[row.feedback.type]
                      : row.kind === "market" ? row.market.title : row.alert.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.kind === "feedback"
                      ? row.feedback.actor_name
                      : row.kind === "market" ? "Market scanner" : "Research scanner"}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell column="preview">
              <span className="line-clamp-1 max-w-44">{rowDetail(row)}</span>
            </TableCell>
            <TableCell column="mutedMeta">{rowSource(row) || "—"}</TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">{rowTypeLabel(row)}</Badge>
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={row.read ? "secondary" : "default"}
                className={cn(!row.read && "bg-primary")}
              >
                {row.read ? "Read" : "Unread"}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {dateFormatter.format(new Date(row.createdAt))}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

import * as React from "react"
import {
  BellIcon,
  CheckCheckIcon,
  CheckIcon,
  MoveRightIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  countUnreadAlerts,
  getAlertErrorMessage,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
  type RankingAlert,
} from "@/lib/api/alerts"
import type { ProjectItem } from "@/lib/api/seo-projects"
import { alertTypeLabels, type AlertType } from "@/lib/keyword-research"
import { cn } from "@/lib/utils"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const alertBadgeClassNames: Record<AlertType, string> = {
  new_ranking:
    "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
  entered_top_10:
    "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
  big_gain:
    "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
  lost_ranking:
    "border-red-200 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
  left_top_10:
    "border-red-200 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
  big_drop:
    "border-red-200 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
}

export function AlertsDashboard({ project }: { project: ProjectItem }) {
  const projectId = project.id
  const [rows, setRows] = React.useState<RankingAlert[]>([])
  const [total, setTotal] = React.useState(0)
  const [unread, setUnread] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [actionBusy, setActionBusy] = React.useState(false)

  React.useEffect(() => {
    setPage(1)
  }, [unreadOnly, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      listAlerts({
        projectId,
        unreadOnly: unreadOnly || undefined,
        pagination: { page, pageSize },
      }),
      countUnreadAlerts(projectId),
    ])
      .then(([data, unreadData]) => {
        if (!active) return
        setRows(data.rows)
        setTotal(data.total)
        setUnread(unreadData.unread)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(getAlertErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, unreadOnly, page, pageSize, refreshToken])

  async function markRead(alertId: string) {
    setActionBusy(true)
    setError(null)
    try {
      await markAlertRead(projectId, alertId)
      setRefreshToken((token) => token + 1)
    } catch (markError) {
      setError(getAlertErrorMessage(markError))
    } finally {
      setActionBusy(false)
    }
  }

  async function markAllRead() {
    setActionBusy(true)
    setError(null)
    try {
      await markAllAlertsRead(projectId)
      setRefreshToken((token) => token + 1)
    } catch (markError) {
      setError(getAlertErrorMessage(markError))
    } finally {
      setActionBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Alerts"
        icon={<BellIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={total}
        controls={
          <>
            <div className={dashboardToolbarSegmentedGroupClassName}>
              <button
                type="button"
                className={cn(
                  dashboardToolbarSegmentedButtonClassName,
                  !unreadOnly
                    ? dashboardToolbarSegmentedButtonActiveClassName
                    : dashboardToolbarSegmentedButtonInactiveClassName
                )}
                onClick={() => setUnreadOnly(false)}
              >
                All
              </button>
              <button
                type="button"
                className={cn(
                  dashboardToolbarSegmentedButtonClassName,
                  unreadOnly
                    ? dashboardToolbarSegmentedButtonActiveClassName
                    : dashboardToolbarSegmentedButtonInactiveClassName
                )}
                onClick={() => setUnreadOnly(true)}
              >
                Unread
                {unread ? <Badge variant="secondary">{unread}</Badge> : null}
              </button>
            </div>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={actionBusy || unread === 0}
              onClick={() => void markAllRead()}
            >
              <CheckCheckIcon className="size-4" />
              Mark all read
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Keyword</TableHead>
              <TableHead column="meta">Alert</TableHead>
              <TableHead column="meta">Movement</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                When
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={loading || rows.length === 0}
        emptyText={
          loading
            ? "Loading alerts..."
            : unreadOnly
              ? "No unread alerts."
              : "No alerts yet. Alerts appear when a rank check finds meaningful movement for a tracked keyword."
        }
        emptyColSpan={5}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          pageSizeOptions: [10, 25, 50, 100],
          onPageChange: (nextPage) =>
            setPage(Math.max(1, Math.min(nextPage, totalPages))),
          onPageSizeChange: setPageSize,
        }}
      >
        {rows.map((row) => {
          const isUnread = row.readAt == null
          return (
            <TableRow key={row.id} className={isUnread ? "bg-muted/30" : undefined}>
              <TableCell column="main">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center gap-2 truncate text-xs sm:text-sm",
                    isUnread ? "font-semibold" : "font-medium"
                  )}
                  title={row.keyword}
                >
                  {isUnread ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  ) : null}
                  {row.keyword}
                </span>
              </TableCell>
              <TableCell column="meta">
                <Badge
                  variant="secondary"
                  className={alertBadgeClassNames[row.type]}
                >
                  {alertTypeLabels[row.type]}
                </Badge>
              </TableCell>
              <TableCell column="meta">
                <MovementCell alert={row} />
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:table-cell">
                {dateTimeFormatter.format(new Date(row.createdAt))}
              </TableCell>
              <TableCell column="meta">
                {isUnread ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={actionBusy}
                    onClick={() => void markRead(row.id)}
                    title="Mark as read"
                    aria-label="Mark as read"
                  >
                    <CheckIcon className="size-4" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Read</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
    </div>
  )
}

function MovementCell({ alert }: { alert: RankingAlert }) {
  const improved = alert.delta != null && alert.delta > 0
  const worsened = alert.delta != null && alert.delta < 0

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs tabular-nums sm:text-sm",
        improved && "text-green-700 dark:text-green-300",
        worsened && "text-destructive",
        alert.delta == null && "text-muted-foreground"
      )}
    >
      {alert.previousPosition != null ? `#${alert.previousPosition}` : "—"}
      <MoveRightIcon className="size-3.5" />
      {alert.newPosition != null ? `#${alert.newPosition}` : "—"}
      {alert.delta != null ? (
        <span className="text-[10px] sm:text-xs">
          ({alert.delta > 0 ? "+" : ""}
          {alert.delta})
        </span>
      ) : null}
    </span>
  )
}

import * as React from "react"
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BellIcon,
  InfoIcon,
  MessageSquareIcon,
  ThumbsUpIcon,
} from "lucide-react"

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
import { cn } from "@/lib/utils"

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType
type NotificationSortColumn = "activity" | "feedback" | "recipient" | "type" | "status" | "created"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const notificationTypeLabels: Record<NotificationType, string> = {
  feedback_vote: "Thumbs up",
  feedback_comment: "Comment",
  session_launch_failed: "Launch failed",
  session_stop_failed: "Stop failed",
  proxy_dead: "Proxy dead",
  session_crashed: "Session crashed",
  session_reaped: "Session reaped",
}

const ALERT_TYPES = new Set<NotificationType>([
  "session_launch_failed",
  "session_stop_failed",
  "proxy_dead",
  "session_crashed",
  "session_reaped",
])

function isAlertType(type: NotificationType) {
  return ALERT_TYPES.has(type)
}

// Primary label shown in the Activity cell / used for the activity sort.
function notificationPrimaryText(item: NotificationItem) {
  return isAlertType(item.type)
    ? item.title ?? notificationTypeLabels[item.type]
    : item.actor_name ?? "Unknown"
}

// Secondary preview text (feedback message, or the alert body).
function notificationPreviewText(item: NotificationItem) {
  return (isAlertType(item.type) ? item.body : item.feedback_message) ?? ""
}

function notificationBadgeVariant(item: NotificationItem) {
  return isAlertType(item.type) && item.severity === "critical"
    ? "destructive"
    : "secondary"
}

function NotificationActivityIcon({ item }: { item: NotificationItem }) {
  if (item.type === "feedback_vote") {
    return <ThumbsUpIcon className="size-4 text-muted-foreground" />
  }
  if (item.type === "feedback_comment") {
    return <MessageSquareIcon className="size-4 text-muted-foreground" />
  }
  if (item.severity === "info") {
    return <InfoIcon className="size-4 text-muted-foreground" />
  }
  return (
    <AlertTriangleIcon
      className={cn(
        "size-4",
        item.severity === "critical" ? "text-destructive" : "text-amber-600"
      )}
    />
  )
}

type NotificationsPageProps = {
  defaultRowsPerPage: number
  onOpenFeedbackThread: (feedbackId: string) => void
}

export function NotificationsPage({
  defaultRowsPerPage,
  onOpenFeedbackThread,
}: NotificationsPageProps) {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
  const [sortColumn, setSortColumn] = React.useState<NotificationSortColumn>("created")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")

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

  React.useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const filteredNotifications = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return notifications.filter((item) => {
      const haystack = [
        item.actor_name,
        item.recipient_name,
        item.feedback_message,
        item.title,
        item.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      const matchesRead =
        readFilter === "all" ||
        (readFilter === "unread" && !item.read_at) ||
        (readFilter === "read" && item.read_at)
      const matchesType = typeFilter === "all" || item.type === typeFilter

      return matchesSearch && matchesRead && matchesType
    }).sort((a, b) => {
      if (sortColumn === "activity") return notificationPrimaryText(a).localeCompare(notificationPrimaryText(b)) * direction
      if (sortColumn === "feedback") return notificationPreviewText(a).localeCompare(notificationPreviewText(b)) * direction
      if (sortColumn === "recipient") return a.recipient_name.localeCompare(b.recipient_name) * direction
      if (sortColumn === "type") return notificationTypeLabels[a.type].localeCompare(notificationTypeLabels[b.type]) * direction
      if (sortColumn === "status") return (Number(Boolean(a.read_at)) - Number(Boolean(b.read_at))) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [notifications, readFilter, searchQuery, sortColumn, sortDirection, typeFilter])

  const toggleSort = (column: NotificationSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  return (
    <div className="w-full pb-8">
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
        count={filteredNotifications.length}
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
                labels={[
                  "All types",
                  "Thumbs up",
                  "Comment",
                  "Launch failed",
                  "Stop failed",
                  "Proxy dead",
                  "Session crashed",
                  "Session reaped",
                ]}
              >
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="feedback_vote">Thumbs up</SelectItem>
                <SelectItem value="feedback_comment">Comment</SelectItem>
                <SelectItem value="session_launch_failed">Launch failed</SelectItem>
                <SelectItem value="session_stop_failed">Stop failed</SelectItem>
                <SelectItem value="proxy_dead">Proxy dead</SelectItem>
                <SelectItem value="session_crashed">Session crashed</SelectItem>
                <SelectItem value="session_reaped">Session reaped</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
            <TableHeader>
              <TableRow>
                <TableHead column="main">
                  <TableSortButton active={sortColumn === "activity"} direction={sortDirection} onClick={() => toggleSort("activity")}>
                    Activity
                  </TableSortButton>
                </TableHead>
                <TableHead column="preview">
                  <TableSortButton active={sortColumn === "feedback"} direction={sortDirection} onClick={() => toggleSort("feedback")}>
                    Feedback
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "recipient"} direction={sortDirection} onClick={() => toggleSort("recipient")}>
                    Recipient
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>
                    Type
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>
                    Status
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>
                    Created
                  </TableSortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={filteredNotifications.length === 0}
        emptyText="No notifications found."
        emptyColSpan={6}
        footer={{
          type: "loadMore",
          count: filteredNotifications.length,
          label: "notifications",
          hasMore: Boolean(nextCursor),
          loading: loadingMore,
          onLoadMore: nextCursor
            ? () => void loadNotifications(nextCursor)
            : undefined,
        }}
      >
        {filteredNotifications.map((item) => (
          <TableRow
            key={item.id}
            role={item.feedback_id ? "button" : undefined}
            tabIndex={item.feedback_id ? 0 : undefined}
            className={cn(item.feedback_id && "cursor-pointer")}
            onClick={() => {
              if (item.feedback_id) onOpenFeedbackThread(item.feedback_id)
            }}
            onKeyDown={(event) => {
              if (
                item.feedback_id &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault()
                onOpenFeedbackThread(item.feedback_id)
              }
            }}
          >
            <TableCell column="main">
              <div className="flex items-center gap-2">
                <NotificationActivityIcon item={item} />
                <div>
                  <p className="text-sm font-medium">
                    {notificationPrimaryText(item)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAlertType(item.type)
                      ? notificationTypeLabels[item.type]
                      : item.actor_name}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell column="preview">
              <span className="line-clamp-1 max-w-44">
                {notificationPreviewText(item)}
              </span>
            </TableCell>
            <TableCell column="mutedMeta">
              {item.recipient_name}
            </TableCell>
            <TableCell column="meta">
              <Badge variant={notificationBadgeVariant(item)}>
                {notificationTypeLabels[item.type]}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={item.read_at ? "secondary" : "default"}
                className={cn(!item.read_at && "bg-primary")}
              >
                {item.read_at ? "Read" : "Unread"}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {dateFormatter.format(new Date(item.created_at))}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

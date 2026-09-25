import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  Loader2Icon,
  ClapperboardIcon,
  GaugeIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  clearAdminNotifications,
  deleteAdminNotifications,
  getNotificationErrorMessage,
  listAllNotifications,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api/notification"
import { cn } from "@/lib/utils"

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType
type NotificationSortColumn =
  | "activity"
  | "target"
  | "recipient"
  | "type"
  | "status"
  | "created"

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
  creator_watch: "Creator watch",
  api_usage_alert: "API usage",
  automation_approval: "Automation approval",
}

function getAutomationName(item: NotificationItem) {
  return item.automation_name || "Deleted automation"
}

function getCreatorName(item: NotificationItem) {
  return item.creator_display_name || item.creator_username || "Creator"
}

function getCreatorHandle(item: NotificationItem) {
  return item.creator_username
    ? `@${item.creator_username}`
    : getCreatorName(item)
}

function getNotificationActivity(item: NotificationItem) {
  if (item.type === "api_usage_alert") {
    return "API credits"
  }

  if (item.type === "automation_approval") {
    return `${getAutomationName(item)} approval`
  }

  return item.type === "creator_watch"
    ? `${getCreatorHandle(item)} new reels`
    : item.actor_name
}

function getNotificationTarget(item: NotificationItem) {
  if (item.type === "automation_approval") {
    return item.automation_approval_state === "timed_out"
      ? `${getAutomationName(item)}, approval timed out`
      : `${getAutomationName(item)}, waiting for approval`
  }

  if (item.type === "api_usage_alert") {
    const level = item.api_usage_level === "blocked" ? "limit reached" : "near limit"
    return `${item.api_usage_used_credits ?? 0} of ${item.api_usage_limit_credits ?? 0} credits, ${level}`
  }

  if (item.type === "creator_watch") {
    const count = item.creator_new_video_count ?? 0
    return `${getCreatorHandle(item)}, ${count} new ${count === 1 ? "reel" : "reels"}`
  }

  return item.feedback_message ?? "Deleted feedback"
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
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting] = React.useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [clearAllOpen, setClearAllOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
  const [sortColumn, setSortColumn] =
    React.useState<NotificationSortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")

  const loadNotifications = React.useCallback(
    async (cursor?: string) => {
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
    },
    [defaultRowsPerPage]
  )

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void loadNotifications(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadNotifications])

  const filteredNotifications = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return notifications
      .filter((item) => {
        const matchesSearch =
          !query ||
          item.actor_name.toLowerCase().includes(query) ||
          item.recipient_name.toLowerCase().includes(query) ||
          getNotificationTarget(item).toLowerCase().includes(query)
        const matchesRead =
          readFilter === "all" ||
          (readFilter === "unread" && !item.read_at) ||
          (readFilter === "read" && item.read_at)
        const matchesType = typeFilter === "all" || item.type === typeFilter

        return matchesSearch && matchesRead && matchesType
      })
      .sort((a, b) => {
        if (sortColumn === "activity")
          return (
            getNotificationActivity(a).localeCompare(
              getNotificationActivity(b)
            ) * direction
          )
        if (sortColumn === "target")
          return (
            getNotificationTarget(a).localeCompare(getNotificationTarget(b)) *
            direction
          )
        if (sortColumn === "recipient")
          return a.recipient_name.localeCompare(b.recipient_name) * direction
        if (sortColumn === "type")
          return (
            notificationTypeLabels[a.type].localeCompare(
              notificationTypeLabels[b.type]
            ) * direction
          )
        if (sortColumn === "status")
          return (
            (Number(Boolean(a.read_at)) - Number(Boolean(b.read_at))) *
            direction
          )
        return (
          (new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()) *
          direction
        )
      })
  }, [
    notifications,
    readFilter,
    searchQuery,
    sortColumn,
    sortDirection,
    typeFilter,
  ])

  const visibleNotificationIds = React.useMemo(
    () => filteredNotifications.map((item) => item.id),
    [filteredNotifications]
  )
  const visibleSelected =
    visibleNotificationIds.length > 0 &&
    visibleNotificationIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && visibleNotificationIds.some((id) => selectedIds.has(id))

  function toggleVisibleSelection(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of visibleNotificationIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function toggleNotificationSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    const notificationIds = Array.from(selectedIds)
    if (!notificationIds.length) return

    setDeleting(true)
    setError(null)
    try {
      await deleteAdminNotifications(notificationIds)
      const deletedIds = new Set(notificationIds)
      setNotifications((current) =>
        current.filter((item) => !deletedIds.has(item.id))
      )
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (deleteError) {
      setError(getNotificationErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  async function clearAll() {
    setDeleting(true)
    setError(null)
    try {
      await clearAdminNotifications()
      setNotifications([])
      setNextCursor(null)
      setSelectedIds(new Set())
      setClearAllOpen(false)
    } catch (deleteError) {
      setError(getNotificationErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const toggleSort = (column: NotificationSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function openNotification(item: NotificationItem) {
    if (item.type === "automation_approval" && item.automation_id) {
      void navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: item.automation_id },
      })
      return
    }

    if (item.type === "creator_watch" && item.creator_id) {
      void navigate({
        to: "/admin/creators/$creatorId",
        params: { creatorId: item.creator_id },
      })
      return
    }

    if (item.feedback_id) {
      onOpenFeedbackThread(item.feedback_id)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Notifications"
        icon={
          <BellIcon className="text-muted-foreground" />
        }
        count={filteredNotifications.length}
        status={error ? { tone: "error", text: error } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting || loadingMore}
                onClick={() => setMassDeleteOpen(true)}
              >
                {deleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
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
              >
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="feedback_vote">Thumbs up</SelectItem>
                <SelectItem value="feedback_comment">Comments</SelectItem>
                <SelectItem value="creator_watch">Creator watch</SelectItem>
                <SelectItem value="api_usage_alert">API usage</SelectItem>
                <SelectItem value="automation_approval">
                  Automation approval
                </SelectItem>
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              variant="destructive"
              disabled={notifications.length === 0 || deleting || loadingMore}
              onClick={() => setClearAllOpen(true)}
            >
              <Trash2Icon className="size-4" />
              Clear all
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    visibleSelected
                      ? true
                      : visiblePartiallySelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleVisibleSelection(checked === true)
                  }
                  aria-label="Select visible notifications"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "activity"}
                  direction={sortDirection}
                  onClick={() => toggleSort("activity")}
                >
                  Activity
                </TableSortButton>
              </TableHead>
              <TableHead column="preview">
                <TableSortButton
                  active={sortColumn === "target"}
                  direction={sortDirection}
                  onClick={() => toggleSort("target")}
                >
                  Target
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "recipient"}
                  direction={sortDirection}
                  onClick={() => toggleSort("recipient")}
                >
                  Recipient
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
              <TableHead column="meta" className="hidden lg:table-cell">
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
        isEmpty={filteredNotifications.length === 0}
        emptyText="No notifications found."
        emptyColSpan={7}
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
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => openNotification(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                openNotification(item)
              }
            }}
          >
            <TableCell
              column="select"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={selectedIds.has(item.id)}
                onCheckedChange={() => toggleNotificationSelection(item.id)}
                aria-label={`Select ${notificationTypeLabels[item.type]} notification`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-2">
                {item.type === "feedback_vote" ? (
                  <ThumbsUpIcon className="size-4 text-muted-foreground" />
                ) : item.type === "creator_watch" ? (
                  <ClapperboardIcon className="size-4 text-muted-foreground" />
                ) : item.type === "api_usage_alert" ? (
                  <GaugeIcon className="size-4 text-muted-foreground" />
                ) : item.type === "automation_approval" ? (
                  <ShieldCheckIcon className="size-4 text-muted-foreground" />
                ) : (
                  <MessageSquareIcon className="size-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {notificationTypeLabels[item.type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === "creator_watch"
                      ? getCreatorHandle(item)
                      : item.type === "api_usage_alert"
                        ? item.api_usage_level === "blocked"
                          ? "Limit reached"
                          : "Near limit"
                        : item.type === "automation_approval"
                          ? getAutomationName(item)
                          : item.actor_name}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell column="preview">
              <span className="line-clamp-1 max-w-44">
                {getNotificationTarget(item)}
              </span>
            </TableCell>
            <TableCell column="mutedMeta">{item.recipient_name}</TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">
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
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {dateFormatter.format(new Date(item.created_at))}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <NotificationDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} notification${selectedIds.size === 1 ? "" : "s"}?`}
        description="This permanently removes the selected notification history."
        confirmLabel="Delete"
        deleting={deleting}
        onConfirm={() => void deleteSelected()}
      />
      <NotificationDeleteDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear all notifications?"
        description="This permanently removes all notification history shown on this dashboard."
        confirmLabel="Clear all"
        deleting={deleting}
        onConfirm={() => void clearAll()}
      />
    </div>
  )
}

function NotificationDeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {deleting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

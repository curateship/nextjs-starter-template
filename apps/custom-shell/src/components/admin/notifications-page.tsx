import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  SparklesIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { describeBulkResult } from "@/lib/bulk-result"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDateTime, formatRelativeTime } from "@/lib/format-time"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  listAdminNotifications,
  notificationTypeLabels,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api/notification"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { cn } from "@/lib/utils"

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType
type NotificationSortColumn =
  | "activity"
  | "feedback"
  | "recipient"
  | "type"
  | "status"
  | "created"

/**
 * The free text a row shows: the update's title for a changelog notice, the
 * broadcast's own title for an announcement, and the feedback it is about for
 * the rest. The database searches and sorts on the same three, in the same
 * order — see `subjectExpression` in `src/server/notifications.ts`.
 */
function notificationSubject(item: NotificationItem) {
  return item.changelog_title ?? item.announcement_title ?? item.feedback_message ?? ""
}

/** Who caused it. An update or a broadcast has nobody behind it. */
function notificationActor(item: NotificationItem) {
  return item.actor_name ?? "—"
}

/**
 * What is about to be deleted, in words. Naming the kind is the only check on
 * having ticked the wrong rows, so say it whenever the selection is all one
 * kind; a mixed pile has no one name and only gets the consequence.
 */
function describeSelection(items: NotificationItem[]) {
  const consequence =
    "so anybody who has not opened them never will. This cannot be undone."
  const kinds = new Set(items.map((item) => item.type))
  const [only] = [...kinds]

  if (kinds.size !== 1 || !only) {
    return `They go from the trays they were sent to, ${consequence}`
  }

  const kind = notificationTypeLabels[only].toLowerCase()
  return items.length === 1
    ? `This ${kind} notice goes from the tray it was sent to, ${consequence}`
    : `All ${items.length} are ${kind} notices, and they go from the trays they were sent to, ${consequence}`
}

type NotificationsPageProps = {
  initialNotifications: NotificationItem[]
  initialTotal: number
  defaultPageSize: number
  onOpenFeedbackThread: (feedbackId: string) => void
}

export function NotificationsPage({
  initialNotifications,
  initialTotal,
  defaultPageSize,
  onOpenFeedbackThread,
}: NotificationsPageProps) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = React.useState(initialNotifications)
  const [total, setTotal] = React.useState(initialTotal)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting] = React.useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [clearAllOpen, setClearAllOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
  const [sort, setSort] = React.useState<NotificationSortColumn>("created")
  const [direction, setDirection] = React.useState<TableSortDirection>("desc")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAdminNotifications({
        search,
        read: readFilter,
        type: typeFilter,
        page,
        pageSize,
        sort,
        direction,
      })
      setNotifications(result.notifications)
      setTotal(result.total)
      setError(null)

      // Deleting the tail of the list can leave you on a page that no longer
      // exists. Step back — and stay loading until that lands, so nobody is
      // told their list is empty on the way.
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }

    setLoading(false)
  }, [direction, page, pageSize, readFilter, search, sort, typeFilter])

  // The route loader already fetched page one, so the first render has its rows
  // and must not ask again.
  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const timer = setTimeout(refresh, 250)
    return () => clearTimeout(timer)
  }, [refresh])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${search}|${readFilter}|${typeFilter}|${sort}|${direction}|${page}|${pageSize}`
  )

  const visibleNotificationIds = React.useMemo(
    () => notifications.map((item) => item.id),
    [notifications]
  )
  const visibleSelected =
    visibleNotificationIds.length > 0 &&
    visibleNotificationIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && visibleNotificationIds.some((id) => selectedIds.has(id))

  // A filter can hide every row while there is still plenty left to clear, so
  // "Clear all" only goes grey when the whole list is genuinely empty.
  const filtersActive =
    search.trim() !== "" || readFilter !== "all" || typeFilter !== "all"

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
    dismissErrorToast()
    try {
      const { count } = await deleteAdminNotifications(notificationIds)
      toast.success(
        describeBulkResult({
          done: count,
          kept: notificationIds.length - count,
          one: "notification",
          many: "notifications",
          verb: "deleted",
        })
      )
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
      await refresh()
    } catch (deleteError) {
      showErrorToast(getNotificationErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  async function clearAll() {
    setDeleting(true)
    dismissErrorToast()
    try {
      const { count } = await clearAdminNotifications()
      toast.success(
        `${count} ${count === 1 ? "notification" : "notifications"} deleted.`
      )
      // Nothing survives a clear-all, so there is nothing left to go and ask
      // the server for.
      setNotifications([])
      setTotal(0)
      setPage(1)
      setSelectedIds(new Set())
      setClearAllOpen(false)
    } catch (deleteError) {
      showErrorToast(getNotificationErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  function openNotification(item: NotificationItem) {
    if (item.type === "changelog") {
      void navigate({ to: "/changelog/whats-new" })
      return
    }
    if (item.feedback_id) {
      onOpenFeedbackThread(item.feedback_id)
    }
  }

  const toggleSort = (column: NotificationSortColumn) => {
    setPage(1)
    if (sort === column) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSort(column)
    setDirection("asc")
  }

  return (
    <>
      <DashboardTable
        title="Notifications"
        icon={<BellIcon className="text-muted-foreground" />}
        count={total}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setMassDeleteOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DisabledReason
              disabled={deleting || (total === 0 && !filtersActive)}
              reason={
                deleting
                  ? "Wait for the delete that is already running to finish."
                  : "There are no notifications to clear."
              }
            >
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting || (total === 0 && !filtersActive)}
                onClick={() => setClearAllOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Clear all
              </DashboardToolbarButton>
            </DisabledReason>
            <DashboardToolbarSearch
              name="notification-search"
              value={search}
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
              aria-label="Search notifications"
              placeholder="Search notifications…"
            />
            <Select
              value={readFilter}
              onValueChange={(value) => {
                setPage(1)
                setReadFilter(value as ReadFilter)
              }}
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
              onValueChange={(value) => {
                setPage(1)
                setTypeFilter(value as TypeFilter)
              }}
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
                <SelectItem value="changelog">Updates</SelectItem>
                <SelectItem value="announcement">Announcements</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableSortButton active={sort === "activity"} direction={direction} onClick={() => toggleSort("activity")}>
                    Activity
                  </TableSortButton>
                </TableHead>
                <TableHead column="preview">
                  <TableSortButton active={sort === "feedback"} direction={direction} onClick={() => toggleSort("feedback")}>
                    Feedback
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sort === "recipient"} direction={direction} onClick={() => toggleSort("recipient")}>
                    Recipient
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sort === "type"} direction={direction} onClick={() => toggleSort("type")}>
                    Type
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sort === "status"} direction={direction} onClick={() => toggleSort("status")}>
                    Status
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sort === "created"} direction={direction} onClick={() => toggleSort("created")}>
                    Created
                  </TableSortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={!loading && notifications.length === 0}
        emptyText="No notifications match those filters."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          onPageChange: setPage,
          onPageSizeChange: (nextSize) => {
            setPage(1)
            setPageSize(nextSize)
          },
        }}
      >
        {notifications.map((item) => (
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
                {item.type === "changelog" ? (
                  <SparklesIcon className="size-4 text-muted-foreground" />
                ) : item.type === "announcement" ? (
                  <MegaphoneIcon className="size-4 text-muted-foreground" />
                ) : item.type === "feedback_vote" ? (
                  <ThumbsUpIcon className="size-4 text-muted-foreground" />
                ) : (
                  <MessageSquareIcon className="size-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {notificationTypeLabels[item.type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {notificationActor(item)}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell column="preview">
              <span
                className="block truncate"
                title={notificationSubject(item)}
              >
                {notificationSubject(item)}
              </span>
            </TableCell>
            <TableCell column="mutedMeta">
              {item.recipient_name}
            </TableCell>
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
            <TableCell
              column="mutedMeta"
              title={formatDateTime(item.created_at)}
            >
              {formatRelativeTime(item.created_at, formatDateTime)}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} notification${selectedIds.size === 1 ? "" : "s"}?`}
        description={describeSelection(
          notifications.filter((item) => selectedIds.has(item.id))
        )}
        confirmLabel={selectedIds.size === 1 ? "Delete notification" : "Delete notifications"}
        loading={deleting}
        onConfirm={() => void deleteSelected()}
      />
      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear all notifications?"
        description="Every notification goes, including any your search or filters are currently hiding. This cannot be undone."
        confirmLabel="Clear all"
        loading={deleting}
        onConfirm={() => void clearAll()}
      />
    </>
  )
}

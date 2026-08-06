import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  GaugeIcon,
  GitMergeIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  SparklesIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UserCheckIcon,
} from "lucide-react"
import { toast } from "sonner"

import { describeBulkResult } from "@/lib/bulk-result"
import { plural } from "@/lib/plural"
import { DisabledReason } from "@/components/ui/disabled-reason"
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
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import {
  TableCell,
  TableHead,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  aiLimitNotificationText,
  automationApprovalNotificationText,
  clearAdminNotifications,
  deleteAdminNotifications,
  getNotificationErrorMessage,
  isAiLimitNotification,
  listAdminNotifications,
  notificationTypeLabels,
  type NotificationItem,
  type NotificationType,
} from "@/lib/api/notification"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useAsyncAction } from "@/lib/use-async-action"
import { useSelection } from "@/lib/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/list-search"
import { cn } from "@/lib/utils"

const notificationsRoute = getRouteApi("/_authenticated/admin/notifications")

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType
type NotificationSortColumn =
  | "activity"
  | "feedback"
  | "recipient"
  | "type"
  | "status"
  | "created"

const NOTIFICATION_COLUMNS: SortableColumn<NotificationSortColumn>[] = [
  { key: "activity", label: "Activity", column: "main" },
  { key: "feedback", label: "Feedback", column: "preview" },
  { key: "recipient", label: "Recipient", column: "meta" },
  { key: "type", label: "Type", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "created", label: "Created", column: "meta" },
]

/**
 * The free text a row shows: the update's title for a changelog notice, the
 * broadcast's own title for an announcement, and the feedback it is about for
 * the rest. The database searches and sorts on the same three, in the same
 * order — see `subjectExpression` in `src/server/notifications/inbox.ts`.
 */
function notificationSubject(item: NotificationItem) {
  // An AI-allowance notice carries its own words — there is no thing it is
  // about to borrow a title from.
  if (isAiLimitNotification(item.type)) {
    return aiLimitNotificationText[item.type].message
  }
  // An approval notice is about a flow, so the flow's name is its subject.
  if (item.type === "automation_approval") {
    return item.automation_name ?? ""
  }
  return item.changelog_title ?? item.announcement_title ?? item.feedback_message ?? ""
}

/**
 * The hover text for that column. An announcement has no page to open, so its
 * own words have to be readable from the row itself — the title alone is only
 * the headline.
 */
function notificationSubjectDetail(item: NotificationItem) {
  const subject = notificationSubject(item)
  if (isAiLimitNotification(item.type)) {
    return `${subject}\n\n${aiLimitNotificationText[item.type].detail}`
  }
  if (item.type === "automation_approval") {
    const state = item.automation_approval_state ?? "pending"
    return `${subject}\n\n${automationApprovalNotificationText[state].detail}`
  }
  return item.announcement_body
    ? `${subject}\n\n${item.announcement_body}`
    : subject
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
  // Search, filters, sort and page live in the address, so opening a record
  // and pressing Back returns this exact list — see `lib/list-search.ts`.
  const listSearch = notificationsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const search = listSearch.q ?? ""
  const readFilter: ReadFilter = listSearch.read ?? "all"
  const typeFilter: TypeFilter = listSearch.type ?? "all"
  const sort: NotificationSortColumn = listSearch.sort ?? "created"
  const direction: TableSortDirection = listSearch.direction ?? "desc"
  const page = listSearch.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(search, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const toggleSort = useListSort<NotificationSortColumn>({ sort, direction })

  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const selection = useSelection()
  const selectedIds = selection.selected
  const [runDelete, deleting] = useAsyncAction(getNotificationErrorMessage)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [clearAllOpen, setClearAllOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
  }, [direction, page, pageSize, readFilter, search, setPage, sort, typeFilter])

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
    selection.setSelected,
    `${search}|${readFilter}|${typeFilter}|${sort}|${direction}|${page}|${pageSize}`
  )

  const visibleNotificationIds = notifications.map((item) => item.id)

  // A filter can hide every row while there is still plenty left to clear, so
  // "Clear all" only goes grey when the whole list is genuinely empty.
  const filtersActive =
    search.trim() !== "" || readFilter !== "all" || typeFilter !== "all"

  async function deleteSelected() {
    const notificationIds = Array.from(selectedIds)
    if (!notificationIds.length) return

    await runDelete(async () => {
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
      selection.clear()
      setMassDeleteOpen(false)
      await refresh()
    })
  }

  async function clearAll() {
    await runDelete(async () => {
      const { count } = await clearAdminNotifications()
      toast.success(
        `${count} ${plural(count, "notification", "notifications")} deleted.`
      )
      // Nothing survives a clear-all, so there is nothing left to go and ask
      // the server for.
      setNotifications([])
      setTotal(0)
      setPage(1)
      selection.clear()
      setClearAllOpen(false)
    })
  }

  // An announcement notice has nowhere to go — it is the words themselves — so
  // its row must not claim to be a button. Only rows that really open
  // something get the role, the hand cursor and the handlers.
  function notificationDestination(item: NotificationItem) {
    if (item.type === "changelog") return "changelog" as const
    if (item.type === "automation_approval") {
      return item.automation_run_id && item.automation_id
        ? ("automationRun" as const)
        : null
    }
    return item.feedback_id ? ("feedback" as const) : null
  }

  function openNotification(item: NotificationItem) {
    const destination = notificationDestination(item)
    if (destination === "changelog") {
      void navigate({ to: "/changelog/whats-new" })
      return
    }
    if (
      destination === "automationRun" &&
      item.automation_id &&
      item.automation_run_id
    ) {
      void navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: item.automation_id },
        search: { run: item.automation_run_id },
      })
      return
    }
    if (destination === "feedback" && item.feedback_id) {
      onOpenFeedbackThread(item.feedback_id)
    }
  }

  return (
    <>
      <DashboardTable
        title="Notifications"
        icon={<BellIcon className="text-muted-foreground" />}
        count={total}
        busy={loading}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
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
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              aria-label="Search notifications"
              placeholder="Search notifications…"
            />
            <Select
              value={readFilter}
              onValueChange={(value) =>
                setListSearch({
                  read: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
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
              onValueChange={(value) =>
                setListSearch({
                  type: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
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
                <SelectItem value="feedback_merged">Merged</SelectItem>
                <SelectItem value="changelog">Updates</SelectItem>
                <SelectItem value="announcement">Announcements</SelectItem>
                <SelectItem value="ai_limit_warning">AI warnings</SelectItem>
                <SelectItem value="ai_limit_reached">AI limit reached</SelectItem>
                <SelectItem value="automation_approval">Approvals</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          <SortableTableHeader
            columns={NOTIFICATION_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleNotificationIds)}
                  onCheckedChange={() =>
                    selection.toggleVisible(visibleNotificationIds)
                  }
                  aria-label="Select visible notifications"
                />
              </TableHead>
            }
          />
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
        {notifications.map((item) => {
          const opens = notificationDestination(item) !== null
          return (
            <TableRow
              key={item.id}
              role={opens ? "button" : undefined}
              tabIndex={opens ? 0 : undefined}
              className={opens ? "cursor-pointer" : undefined}
              onClick={opens ? () => openNotification(item) : undefined}
              onKeyDown={
                opens
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openNotification(item)
                      }
                    }
                  : undefined
              }
            >
              <TableCell
                column="select"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => selection.toggle(item.id)}
                  aria-label={`Select ${notificationTypeLabels[item.type]} notification`}
                />
              </TableCell>
              <TableCell column="main">
                <div className="flex items-center gap-2">
                  {item.type === "changelog" ? (
                    <SparklesIcon className="size-4 text-muted-foreground" />
                  ) : item.type === "announcement" ? (
                    <MegaphoneIcon className="size-4 text-muted-foreground" />
                  ) : isAiLimitNotification(item.type) ? (
                    <GaugeIcon className="size-4 text-muted-foreground" />
                  ) : item.type === "automation_approval" ? (
                    <UserCheckIcon className="size-4 text-muted-foreground" />
                  ) : item.type === "feedback_merged" ? (
                    <GitMergeIcon className="size-4 text-muted-foreground" />
                  ) : item.type === "feedback_vote" ? (
                    <ThumbsUpIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <MessageSquareIcon className="size-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {notificationTypeLabels[item.type]}
                    </p>
                    <p
                      className="max-w-96 truncate text-xs text-muted-foreground"
                      title={notificationActor(item)}
                    >
                      {notificationActor(item)}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell column="preview">
                <span
                  className="block truncate"
                  title={notificationSubjectDetail(item)}
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
          )
        })}
      </DashboardTable>
      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${plural(selectedIds.size, "notification", "notifications")}?`}
        description={describeSelection(
          notifications.filter((item) => selectedIds.has(item.id))
        )}
        confirmLabel={`Delete ${plural(selectedIds.size, "notification", "notifications")}`}
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

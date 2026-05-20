import * as React from "react"
import {
  AlertCircleIcon,
  BellIcon,
  Loader2Icon,
  MessageSquareIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getNotificationErrorMessage,
  listAllNotifications,
  type NotificationItem,
  type NotificationType,
} from "@/lib/notification-api"
import { cn } from "@/lib/utils"

type ReadFilter = "all" | "unread" | "read"
type TypeFilter = "all" | NotificationType

const ADMIN_NOTIFICATION_PAGE_SIZE = 50

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
}

type NotificationsPageProps = {
  onOpenFeedbackThread: (feedbackId: string) => void
}

export function NotificationsPage({
  onOpenFeedbackThread,
}: NotificationsPageProps) {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")

  const loadNotifications = React.useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const data = await listAllNotifications({
        cursor,
        limit: ADMIN_NOTIFICATION_PAGE_SIZE,
      })
      setNotifications((current) =>
        cursor ? [...current, ...data.notifications] : data.notifications
      )
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  React.useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const filteredNotifications = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return notifications.filter((item) => {
      const matchesSearch =
        !query ||
        item.actor_name.toLowerCase().includes(query) ||
        item.recipient_name.toLowerCase().includes(query) ||
        item.feedback_message.toLowerCase().includes(query)
      const matchesRead =
        readFilter === "all" ||
        (readFilter === "unread" && !item.read_at) ||
        (readFilter === "read" && item.read_at)
      const matchesType = typeFilter === "all" || item.type === typeFilter

      return matchesSearch && matchesRead && matchesType
    })
  }, [notifications, readFilter, searchQuery, typeFilter])

  return (
    <div className="w-full pb-8">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All feedback notification activity across users.
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              <BellIcon className="size-4 text-muted-foreground sm:size-[18px]" />
            </span>
            <span className="text-sm font-medium sm:text-base">
              Notifications
            </span>
            <Badge variant="secondary">{filteredNotifications.length}</Badge>
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
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
                labels={["All types", "Thumbs up", "Comments"]}
              >
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="feedback_vote">Thumbs up</SelectItem>
                <SelectItem value="feedback_comment">Comments</SelectItem>
              </SelectContent>
            </Select>
          </DashboardToolbarControls>
        </DashboardToolbar>

        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="main">
                  Activity
                </TableHead>
                <TableHead column="preview">
                  Feedback
                </TableHead>
                <TableHead column="meta">
                  Recipient
                </TableHead>
                <TableHead column="meta">
                  Type
                </TableHead>
                <TableHead column="meta">
                  Status
                </TableHead>
                <TableHead column="meta">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" />
                      Loading notifications
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredNotifications.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No notifications found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredNotifications.map((item) => (
                  <TableRow
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => onOpenFeedbackThread(item.feedback_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onOpenFeedbackThread(item.feedback_id)
                      }
                    }}
                  >
                    <TableCell column="main">
                      <div className="flex items-center gap-2">
                        {item.type === "feedback_vote" ? (
                          <ThumbsUpIcon className="size-4 text-muted-foreground" />
                        ) : (
                          <MessageSquareIcon className="size-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {notificationTypeLabels[item.type]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.actor_name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell column="preview">
                      <span className="line-clamp-1 max-w-44">
                        {item.feedback_message}
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
                    <TableCell column="mutedMeta">
                      {dateFormatter.format(new Date(item.created_at))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {nextCursor ? (
          <div className="flex justify-center bg-muted/50 p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadNotifications(nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Load older
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

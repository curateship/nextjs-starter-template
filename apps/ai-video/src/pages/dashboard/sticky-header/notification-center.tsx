"use client"

import * as React from "react"
import {
  BellIcon,
  CheckCheckIcon,
  ClapperboardIcon,
  GaugeIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  getNotificationErrorMessage,
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import { cn } from "@/lib/utils"

type NotificationFilter = "all" | "unread"
const NOTIFICATION_PAGE_SIZE = 20
// Instant delivery comes from the SSE stream (see the EventSource effect); this
// slow background poll is only a safety net that catches anything missed during
// a stream reconnect.
const NOTIFICATION_REFRESH_MS = 60_000
// Coalesce a burst of stream nudges (e.g. one sync adding several creators)
// into a single refetch.
const STREAM_REFRESH_DEBOUNCE_MS = 300

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function getFeedbackPreview(message: string) {
  return message.length > 90 ? `${message.slice(0, 90)}...` : message
}

function getCreatorName(item: NotificationItem) {
  return item.creator_display_name || item.creator_username || "Creator"
}

function getCreatorHandle(item: NotificationItem) {
  return item.creator_username
    ? `@${item.creator_username}`
    : getCreatorName(item)
}

function getAutomationName(item: NotificationItem) {
  return item.automation_name || "An automation"
}

function NotificationAvatar({ item }: { item: NotificationItem }) {
  const isVote = item.type === "feedback_vote"
  const isUsage = item.type === "api_usage_alert"
  const isApproval = item.type === "automation_approval"

  return (
    <Avatar size="lg">
      <AvatarFallback
        className={
          isUsage || isApproval
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
            : isVote
              ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
        }
      >
        {isUsage ? "!" : isApproval ? "?" : getInitial(item.actor_name)}
      </AvatarFallback>
    </Avatar>
  )
}

function NotificationMessage({ item }: { item: NotificationItem }) {
  if (item.type === "automation_approval") {
    return item.automation_approval_state === "timed_out" ? (
      <>
        <strong>{getAutomationName(item)}</strong> was rejected — nobody
        approved in time
      </>
    ) : (
      <>
        <strong>{getAutomationName(item)}</strong> is waiting for your approval
      </>
    )
  }

  if (item.type === "api_usage_alert") {
    return item.api_usage_level === "blocked" ? (
      <>
        <strong>API credits</strong> are at the monthly limit
      </>
    ) : (
      <>
        <strong>API credits</strong> are near the monthly limit
      </>
    )
  }

  if (item.type === "creator_watch") {
    const count = item.creator_new_video_count ?? 0
    return (
      <>
        <strong>{getCreatorHandle(item)}</strong> has {count} new{" "}
        {count === 1 ? "reel" : "reels"}
      </>
    )
  }

  if (item.type === "feedback_vote") {
    return (
      <>
        <strong>{item.actor_name}</strong> gave your feedback a thumbs up
      </>
    )
  }

  return (
    <>
      <strong>{item.actor_name}</strong> commented on your feedback
    </>
  )
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  if (item.type === "automation_approval") {
    return <ShieldCheckIcon className="h-3.5 w-3.5" />
  }

  if (item.type === "api_usage_alert") {
    return <GaugeIcon className="h-3.5 w-3.5" />
  }

  if (item.type === "creator_watch") {
    return <ClapperboardIcon className="h-3.5 w-3.5" />
  }

  return item.type === "feedback_vote" ? (
    <ThumbsUpIcon className="h-3.5 w-3.5" />
  ) : (
    <MessageSquareIcon className="h-3.5 w-3.5" />
  )
}

function NotificationPreview({ item }: { item: NotificationItem }) {
  if (item.type === "automation_approval") {
    return item.automation_approval_state === "timed_out" ? (
      <>Approval timed out</>
    ) : (
      <>Open the runs panel to approve or reject</>
    )
  }

  if (item.type === "api_usage_alert") {
    return (
      <>
        {item.api_usage_used_credits ?? 0} of{" "}
        {item.api_usage_limit_credits ?? 0} credits used
      </>
    )
  }

  if (item.type === "creator_watch") {
    return <>Creator watch</>
  }

  return <>{getFeedbackPreview(item.feedback_message ?? "Deleted feedback")}</>
}

function NotificationTabs({
  activeFilter,
  unreadCount,
  onFilterChange,
}: {
  activeFilter: NotificationFilter
  unreadCount: number
  onFilterChange: (filter: NotificationFilter) => void
}) {
  const tabs: { label: string; value: NotificationFilter }[] = [
    { label: `Unread (${unreadCount})`, value: "unread" },
    { label: "View all", value: "all" },
  ]

  return (
    <div className="flex rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          type="button"
          variant={activeFilter === tab.value ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "h-8 rounded-md px-3",
            activeFilter === tab.value && "bg-background shadow-sm"
          )}
          onClick={() => onFilterChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

type NotificationCenterProps = {
  onOpenFeedback?: (feedbackId: string) => void
}

export function NotificationCenter({
  onOpenFeedback,
}: NotificationCenterProps) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<NotificationFilter>("unread")
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollAreaRootRef = React.useRef<HTMLDivElement>(null)
  const backgroundFetchRef = React.useRef(false)
  const pendingRefetchRef = React.useRef(false)

  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((item) => !item.read_at)
      : notifications

  const loadNotificationRows = React.useCallback(async (cursor?: string) => {
    // Load-more (append the next page). Independent of the background refresh.
    if (cursor) {
      setLoadingMore(true)
      setError(null)
      try {
        const data = await listNotificationPage({
          cursor,
          limit: NOTIFICATION_PAGE_SIZE,
        })
        setNotifications((current) => [...current, ...data.notifications])
        setUnreadCount(data.unread_count)
        setNextCursor(data.next_cursor)
      } catch (loadError) {
        setError(getNotificationErrorMessage(loadError))
      } finally {
        setLoadingMore(false)
      }
      return
    }

    // Background refresh: a stream nudge, the poll and a reconnect resync can
    // all fire at once. Collapse them into one in-flight fetch; if another
    // trigger fires mid-fetch, loop once more so a late notification is never
    // missed (instead of waiting for the next poll).
    if (backgroundFetchRef.current) {
      pendingRefetchRef.current = true
      return
    }
    backgroundFetchRef.current = true
    setLoading(true)
    setError(null)
    try {
      do {
        pendingRefetchRef.current = false
        const data = await listNotificationPage({
          limit: NOTIFICATION_PAGE_SIZE,
        })
        setNotifications(data.notifications)
        setUnreadCount(data.unread_count)
        setNextCursor(data.next_cursor)
      } while (pendingRefetchRef.current)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      setLoading(false)
      backgroundFetchRef.current = false
    }
  }, [])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void loadNotificationRows(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadNotificationRows])

  React.useEffect(() => {
    if (open) return
    const interval = window.setInterval(
      () => void loadNotificationRows(),
      NOTIFICATION_REFRESH_MS
    )
    return () => window.clearInterval(interval)
  }, [loadNotificationRows, open])

  // Instant delivery: the server pushes a nudge over SSE the moment a
  // notification is created for this user, and we refetch. EventSource
  // reconnects on its own if the connection drops.
  React.useEffect(() => {
    const source = new EventSource("/api/v1/notifications/stream")
    let debounce: number | null = null
    const refresh = () => {
      if (debounce) window.clearTimeout(debounce)
      debounce = window.setTimeout(
        () => void loadNotificationRows(),
        STREAM_REFRESH_DEBOUNCE_MS
      )
    }
    source.onmessage = refresh
    return () => {
      if (debounce) window.clearTimeout(debounce)
      source.close()
    }
  }, [loadNotificationRows])

  React.useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => void loadNotificationRows(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadNotificationRows, open])

  const loadMoreFromElement = React.useCallback(
    (element: HTMLDivElement) => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight

      if (distanceFromBottom > 80 || !nextCursor || loading || loadingMore) {
        return
      }

      void loadNotificationRows(nextCursor)
    },
    [loadNotificationRows, loading, loadingMore, nextCursor]
  )

  React.useEffect(() => {
    const element = scrollAreaRootRef.current?.querySelector<HTMLDivElement>(
      "[data-slot='scroll-area-viewport']"
    )
    if (!element) return

    const handleScroll = () => loadMoreFromElement(element)
    element.addEventListener("scroll", handleScroll)
    return () => element.removeEventListener("scroll", handleScroll)
  }, [loadMoreFromElement])

  async function markAllAsRead() {
    if (unreadCount === 0) return

    setError(null)
    try {
      const result = await markAllNotificationsRead()
      const readIds = new Set(result.notificationIds)
      setNotifications((current) =>
        current.map((item) =>
          readIds.has(item.id) ? { ...item, read_at: result.readAt } : item
        )
      )
      setUnreadCount(0)
    } catch (readError) {
      setError(getNotificationErrorMessage(readError))
    }
  }

  async function openNotification(item: NotificationItem) {
    setError(null)

    if (!item.read_at) {
      try {
        const result = await markNotificationRead(item.id)
        setNotifications((current) =>
          current.map((currentItem) =>
            currentItem.id === result.notificationId
              ? { ...currentItem, read_at: result.readAt }
              : currentItem
          )
        )
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
        return
      }
    }

    setOpen(false)
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

    if (item.type === "api_usage_alert") {
      return
    }

    if (item.feedback_id) {
      onOpenFeedback?.(item.feedback_id)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Open notifications, ${unreadCount} unread`
              : "Open notifications"
          }
        >
          <BellIcon className="h-[1.15rem] w-[1.15rem]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        sideOffset={12}
        className="w-[calc(100vw-2rem)] max-w-[26rem] overflow-hidden p-0 sm:w-[26rem]"
      >
        <div className="flex flex-wrap items-center gap-3 p-4">
          <h2 className="mr-auto text-xl font-semibold">Notification</h2>
          <NotificationTabs
            activeFilter={filter}
            unreadCount={unreadCount}
            onFilterChange={setFilter}
          />
        </div>
        <Separator />

        <div ref={scrollAreaRootRef}>
          <ScrollArea className="h-[28rem]">
            <div className="px-4 py-4">
              {/* Keep showing existing rows while a background refresh runs, so
                  a stream nudge doesn't blank and re-flash the same list as if
                  it were new. Only the first load (no data yet) shows nothing. */}
              {visibleNotifications.length > 0 ? (
                <div className="space-y-3">
                  {visibleNotifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="grid w-full grid-cols-[0.25rem_3rem_1fr] gap-2 rounded-md p-2 text-left hover:bg-muted/60"
                      onClick={() => void openNotification(item)}
                    >
                      <div className="pt-5">
                        {!item.read_at ? (
                          <span className="block size-2 rounded-full bg-red-500" />
                        ) : null}
                      </div>
                      <NotificationAvatar item={item} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm leading-snug text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                          <NotificationIcon item={item} />
                          <span>
                            <NotificationMessage item={item} />
                          </span>
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          <NotificationPreview item={item} />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateFormatter.format(new Date(item.created_at))}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : loading ? null : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              )}
              {error ? (
                <p className="mt-4 text-sm text-destructive">{error}</p>
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button type="button" variant="ghost" onClick={markAllAsRead}>
            <CheckCheckIcon className="h-4 w-4" />
            Mark all as read
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

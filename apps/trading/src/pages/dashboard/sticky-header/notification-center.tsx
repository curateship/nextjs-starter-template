"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowRightLeftIcon,
  BellIcon,
  BookOpenIcon,
  CheckCheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  RadarIcon,
  ThumbsUpIcon,
  UsersIcon,
} from "lucide-react"

import { alertRoute, ALERT_TYPE_LABELS } from "@/components/scanner/alert-meta"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getNotificationErrorMessage,
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import {
  loadAlertsPage,
  markAlertRead,
  markAlertsRead,
  pollAlerts,
  type ScannerAlertItem,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

type NotificationFilter = "all" | "unread"
const NOTIFICATION_PAGE_SIZE = 20
const ALERT_TRAY_LIMIT = 50
const ALERT_POLL_MS = 10_000

// A row in the tray is either a feedback notification or a scanner alert.
type TrayItem =
  | { kind: "feedback"; id: string; createdAt: string; read: boolean; feedback: NotificationItem }
  | { kind: "alert"; id: string; createdAt: string; read: boolean; alert: ScannerAlertItem }

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

function FeedbackRow({ item }: { item: NotificationItem }) {
  const isVote = item.type === "feedback_vote"
  return (
    <>
      <Avatar size="lg">
        <AvatarFallback
          className={
            isVote ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
          }
        >
          {getInitial(item.actor_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm leading-snug text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          {isVote ? (
            <ThumbsUpIcon className="h-3.5 w-3.5" />
          ) : (
            <MessageSquareIcon className="h-3.5 w-3.5" />
          )}
          <span>
            <strong>{item.actor_name}</strong>{" "}
            {isVote ? "gave your feedback a thumbs up" : "commented on your feedback"}
          </span>
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {getFeedbackPreview(item.feedback_message)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormatter.format(new Date(item.created_at))}
        </p>
      </div>
    </>
  )
}

// Group scanner alerts by their source page so the icon/colour reads at a glance.
function alertVisual(type: string) {
  switch (alertRoute(type)) {
    case "/scanner/positions":
      return { Icon: ArrowRightLeftIcon, className: "bg-blue-100 text-blue-800" }
    case "/scanner/crowded":
      return { Icon: UsersIcon, className: "bg-amber-100 text-amber-800" }
    case "/scanner/book":
      return { Icon: BookOpenIcon, className: "bg-violet-100 text-violet-800" }
    default:
      return { Icon: RadarIcon, className: "bg-emerald-100 text-emerald-800" }
  }
}

function AlertRow({ item }: { item: ScannerAlertItem }) {
  const { Icon, className } = alertVisual(item.type)
  return (
    <>
      <Avatar size="lg">
        <AvatarFallback className={className}>
          <Icon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm leading-snug font-medium text-foreground">
          <span className="truncate">{item.title}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {ALERT_TYPE_LABELS[item.type] ?? item.type}
          </Badge>
          {item.coin ? (
            <span className="text-xs text-muted-foreground">{item.coin}</span>
          ) : null}
        </div>
        {item.body ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormatter.format(new Date(item.created_at))}
        </p>
      </div>
    </>
  )
}

function NotificationTraySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[0.25rem_3rem_1fr] gap-2 rounded-md p-2">
          <div className="pt-5">
            <Skeleton className="size-2 rounded-full" />
          </div>
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
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
  const [alerts, setAlerts] = React.useState<ScannerAlertItem[]>([])
  const [feedbackUnread, setFeedbackUnread] = React.useState(0)
  const [alertUnread, setAlertUnread] = React.useState(0)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollAreaRootRef = React.useRef<HTMLDivElement>(null)

  const totalUnread = feedbackUnread + alertUnread

  const items = React.useMemo<TrayItem[]>(() => {
    const merged: TrayItem[] = [
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
    ]
    return merged.sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  }, [notifications, alerts])

  const visibleItems =
    filter === "unread" ? items.filter((item) => !item.read) : items

  const loadNotificationRows = React.useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const data = await listNotificationPage({
        cursor,
        limit: NOTIFICATION_PAGE_SIZE,
      })
      setNotifications((current) =>
        cursor ? [...current, ...data.notifications] : data.notifications
      )
      setFeedbackUnread(data.unread_count)
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  const loadAlertRows = React.useCallback(async () => {
    try {
      const data = await loadAlertsPage(1, ALERT_TRAY_LIMIT)
      setAlerts(data.items)
      setAlertUnread(data.unreadCount)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    void loadNotificationRows()
    void loadAlertRows()
  }, [loadNotificationRows, loadAlertRows, open])

  // Keep the unread badge live even while the tray is closed.
  React.useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const { unreadCount } = await pollAlerts()
        if (!cancelled) setAlertUnread(unreadCount)
      } catch {
        // transient poll failure; next tick retries
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), ALERT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const loadMoreFromElement = React.useCallback((element: HTMLDivElement) => {
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight

    if (distanceFromBottom > 80 || !nextCursor || loading || loadingMore) {
      return
    }

    void loadNotificationRows(nextCursor)
  }, [loadNotificationRows, loading, loadingMore, nextCursor])

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
    if (totalUnread === 0) return
    setError(null)
    try {
      const [feedbackResult] = await Promise.all([
        feedbackUnread > 0
          ? markAllNotificationsRead()
          : Promise.resolve({ notificationIds: [] as string[], readAt: "" }),
        alertUnread > 0 ? markAlertsRead() : Promise.resolve({ ok: true }),
      ])
      const readIds = new Set(feedbackResult.notificationIds)
      setNotifications((current) =>
        current.map((item) =>
          readIds.has(item.id)
            ? { ...item, read_at: feedbackResult.readAt }
            : item
        )
      )
      const readAt = new Date().toISOString()
      setAlerts((current) =>
        current.map((item) =>
          item.read_at ? item : { ...item, read_at: readAt }
        )
      )
      setFeedbackUnread(0)
      setAlertUnread(0)
    } catch (readError) {
      setError(getNotificationErrorMessage(readError))
    }
  }

  async function openFeedbackNotification(item: NotificationItem) {
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
        setFeedbackUnread((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
        return
      }
    }
    setOpen(false)
    onOpenFeedback?.(item.feedback_id)
  }

  async function openAlert(item: ScannerAlertItem) {
    setError(null)
    if (!item.read_at) {
      try {
        const result = await markAlertRead(item.id)
        setAlerts((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, read_at: result.readAt }
              : currentItem
          )
        )
        setAlertUnread((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
        return
      }
    }
    setOpen(false)
    void navigate({ to: alertRoute(item.type) })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Open notifications"
        >
          <BellIcon className="h-[1.15rem] w-[1.15rem]" />
          {totalUnread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
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
          <h2 className="mr-auto text-xl font-semibold">Notifications</h2>
          <NotificationTabs
            activeFilter={filter}
            unreadCount={totalUnread}
            onFilterChange={setFilter}
          />
        </div>
        <Separator />

        <div ref={scrollAreaRootRef}>
          <ScrollArea className="h-[28rem]">
            <div className="px-4 py-4">
              {loading ? (
                <NotificationTraySkeleton />
              ) : visibleItems.length > 0 ? (
                <div className="space-y-3">
                  {visibleItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="grid w-full grid-cols-[0.25rem_3rem_1fr] gap-2 rounded-md p-2 text-left hover:bg-muted/60"
                      onClick={() =>
                        item.kind === "feedback"
                          ? void openFeedbackNotification(item.feedback)
                          : void openAlert(item.alert)
                      }
                    >
                      <div className="pt-5">
                        {!item.read ? (
                          <span className="block size-2 rounded-full bg-red-500" />
                        ) : null}
                      </div>
                      {item.kind === "feedback" ? (
                        <FeedbackRow item={item.feedback} />
                      ) : (
                        <AlertRow item={item.alert} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              )}
              {error ? (
                <p className="mt-4 text-sm text-destructive">{error}</p>
              ) : null}
              {loadingMore ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Loading more
                </div>
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

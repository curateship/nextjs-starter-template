"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  CheckCheckIcon,
  Loader2Icon,
  MegaphoneIcon,
  MessageSquareIcon,
  SparklesIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function NotificationAvatar({ item }: { item: NotificationItem }) {
  // A published update has no person behind it, so it gets the product's own
  // mark rather than an initial.
  if (item.type === "changelog") {
    return (
      <Avatar size="lg">
        <AvatarFallback className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <SparklesIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    )
  }

  // Same for an announcement — it comes from the app, not from a person.
  if (item.type === "announcement") {
    return (
      <Avatar size="lg">
        <AvatarFallback className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
          <MegaphoneIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    )
  }

  const isVote = item.type === "feedback_vote"

  return (
    <Avatar size="lg">
      <AvatarFallback
        className={
          isVote
            ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
            : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
        }
      >
        {getInitial(item.actor_name ?? "")}
      </AvatarFallback>
    </Avatar>
  )
}

function NotificationMessage({ item }: { item: NotificationItem }) {
  if (item.type === "changelog") {
    return <>New update shipped</>
  }

  // An announcement has nowhere to be opened, so its own words go here rather
  // than a stock line that would send the reader looking for a link.
  if (item.type === "announcement") {
    return <strong>{item.announcement_title}</strong>
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
  if (item.type === "changelog") {
    return <SparklesIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "announcement") {
    return <MegaphoneIcon className="h-3.5 w-3.5" />
  }

  return item.type === "feedback_vote" ? (
    <ThumbsUpIcon className="h-3.5 w-3.5" />
  ) : (
    <MessageSquareIcon className="h-3.5 w-3.5" />
  )
}

/**
 * The line under the message: the update's title, the announcement's own words,
 * or the feedback it is about.
 */
function notificationPreview(item: NotificationItem) {
  const text =
    item.type === "changelog"
      ? (item.changelog_title ?? "")
      : item.type === "announcement"
        ? (item.announcement_body ?? "")
        : (item.feedback_message ?? "")

  return text.length > 90 ? `${text.slice(0, 90)}...` : text
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
  /** Server count, so the dot is right before the tray has ever been opened. */
  initialUnreadCount: number
  onOpenFeedback?: (feedbackId: string) => void
}

export function NotificationCenter({
  initialUnreadCount,
  onOpenFeedback,
}: NotificationCenterProps) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<NotificationFilter>("unread")
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount)
  // Follow the shell's count when it reloads, so a notice that arrived while
  // the page was open still shows up. Adjusted during render rather than in an
  // effect so the bell never paints the stale number first.
  const [lastInitialUnread, setLastInitialUnread] =
    React.useState(initialUnreadCount)

  if (lastInitialUnread !== initialUnreadCount) {
    setLastInitialUnread(initialUnreadCount)
    setUnreadCount(initialUnreadCount)
  }
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [markingAll, setMarkingAll] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollAreaRootRef = React.useRef<HTMLDivElement>(null)
  const requestInFlightRef = React.useRef(false)

  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((item) => !item.read_at)
      : notifications

  // The Unread tab can only filter the rows it has pulled, so with unread
  // notices sitting further back than the first page the tab would say 3 and
  // show none. Own up to the gap and offer the pages that close it.
  const hiddenUnreadCount =
    filter === "unread"
      ? Math.max(0, unreadCount - visibleNotifications.length)
      : 0
  const canLoadHiddenUnread = hiddenUnreadCount > 0 && nextCursor !== null

  const loadNotificationRows = React.useCallback(async (cursor?: string) => {
    // One request at a time. Three things ask for pages now — opening the
    // panel, scrolling to the bottom, and the Load more button — and the
    // busy flags they check only go up on the next render, so two can start
    // together. That matters most when a reload lands mid-append: the reload
    // replaces the list, then the append grafts a page fetched against the
    // old one onto it, which duplicates rows.
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true

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
      setUnreadCount(data.unread_count)
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      requestInFlightRef.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    void loadNotificationRows()
  }, [loadNotificationRows, open])

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
    // The button is disabled in both cases; this is the guard against a second
    // click landing between the first one and the re-render.
    if (unreadCount === 0 || markingAll) return

    setMarkingAll(true)
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
    } finally {
      setMarkingAll(false)
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

    // An announcement is the whole message already — there is nowhere to send
    // the reader, so it is now marked read and the tray stays where it is
    // rather than shutting on the words they just clicked.
    if (item.type === "announcement") {
      return
    }

    setOpen(false)

    if (item.type === "changelog") {
      void navigate({ to: "/changelog/whats-new" })
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
            // A circle at one digit that stretches into a pill at two or three,
            // capped at 99+ so a big number can never widen past the button.
            // The count is in the button's own label, so this is decoration to
            // a screen reader.
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[0.625rem] leading-none font-semibold text-white tabular-nums"
            >
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
          <h2 className="mr-auto text-xl font-semibold">Notifications</h2>
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
              {/* Only the very first open has nothing to show. Later opens keep
                  the rows already in hand while they refresh, rather than
                  flashing a spinner over data that is very likely still right. */}
              {loading && notifications.length === 0 ? (
                <div
                  className="grid h-56 place-items-center text-sm text-muted-foreground"
                  role="status"
                >
                  <span className="flex items-center gap-2">
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading…
                  </span>
                </div>
              ) : visibleNotifications.length > 0 ? (
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
                          {notificationPreview(item)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateFormatter.format(new Date(item.created_at))}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : canLoadHiddenUnread || error ? null : (
                // A failed load leaves no rows either, and saying "none" there
                // would be the same lie in a different place — the banner below
                // is the only honest thing to show.
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {filter === "unread"
                    ? "No unread notifications"
                    : "No notifications"}
                </div>
              )}

              {canLoadHiddenUnread ? (
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 text-center",
                    visibleNotifications.length > 0 ? "pt-4" : "py-10"
                  )}
                >
                  <p className="text-sm text-muted-foreground">
                    {hiddenUnreadCount === 1
                      ? "1 unread notice further back"
                      : `${hiddenUnreadCount} unread notices further back`}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading || loadingMore}
                    onClick={() => {
                      if (nextCursor) void loadNotificationRows(nextCursor)
                    }}
                  >
                    {loadingMore ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              ) : loadingMore ? (
                <div className="flex justify-center pt-4" role="status">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : null}

              {error ? (
                <div className="mt-4">
                  <ErrorBanner
                    message={error}
                    onRetry={() => void loadNotificationRows()}
                  />
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button
            type="button"
            variant="ghost"
            disabled={unreadCount === 0 || markingAll}
            onClick={() => void markAllAsRead()}
          >
            {markingAll ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheckIcon className="h-4 w-4" />
            )}
            Mark all as read
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

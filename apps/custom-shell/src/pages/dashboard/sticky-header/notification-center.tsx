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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getNotificationErrorMessage,
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import { formatDateTime, formatRelativeTime } from "@/lib/format-time"
import { cn } from "@/lib/utils"

type NotificationFilter = "all" | "unread"
const NOTIFICATION_PAGE_SIZE = 20

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

/**
 * Two circles, not five colours.
 *
 * Something the app sent — a published update or an announcement — wears the
 * theme's secondary colour and the mark of what it is. Something a person did
 * keeps the plain avatar circle and their initial. Which kind of thing a person
 * did (a thumbs up or a reply) is never told by colour: the row beside it
 * carries its own icon and says so in words.
 *
 * They used to be fixed amber, blue and green pairs, which ignored the
 * workspace's own styling and told two of the four kinds apart by colour alone.
 */
function NotificationAvatar({ item }: { item: NotificationItem }) {
  if (item.type === "changelog" || item.type === "announcement") {
    return (
      <Avatar size="lg">
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          {item.type === "changelog" ? (
            <SparklesIcon className="h-4 w-4" />
          ) : (
            <MegaphoneIcon className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <Avatar size="lg">
      <AvatarFallback>{getInitial(item.actor_name ?? "")}</AvatarFallback>
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

/**
 * Nothing to show, said the way the media gallery says it: an icon, a line, and
 * what would have been here. `hasAny` separates "you have read everything" from
 * "nothing has ever arrived" — only the first has anything to go and look at.
 */
function EmptyNotifications({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
      <div>
        <BellIcon className="mx-auto mb-3 size-10" />
        <p className="font-medium text-foreground">
          {hasAny ? "You are all caught up" : "No notifications yet"}
        </p>
        <p className="mt-1">
          {hasAny
            ? "Everything here has been read. View all shows the rest."
            : "Votes and replies on your feedback land here, along with announcements and new updates."}
        </p>
      </div>
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
  // Marking a notice read now happens behind the click, so two things can race
  // it: a second click on the same row, and a reload that replaces the list
  // with the server's own answer. This holds the rows whose write is still in
  // the air — a row in here is never counted twice, and once a reload clears
  // it, a late failure no longer puts the dot back, because the freshly loaded
  // list is already the truth.
  const pendingReadIdsRef = React.useRef<Set<string>>(new Set())

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
      pendingReadIdsRef.current.clear()
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

  /**
   * Clears the dot straight away and saves that in the background. Marking a
   * notice read is bookkeeping the reader never asked for, so it is not allowed
   * to hold up — or block — the thing they actually clicked, and a failure says
   * nothing: the dot simply comes back and the notice stays unread.
   */
  function markReadInBackground(item: NotificationItem) {
    if (item.read_at || pendingReadIdsRef.current.has(item.id)) return

    pendingReadIdsRef.current.add(item.id)
    const optimisticReadAt = new Date().toISOString()
    setNotifications((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, read_at: optimisticReadAt }
          : currentItem
      )
    )
    setUnreadCount((current) => Math.max(0, current - 1))

    // Nothing to do when it lands: the row already reads as read, and only that
    // — never the time itself — is ever shown.
    void markNotificationRead(item.id)
      .catch(() => {
        if (!pendingReadIdsRef.current.has(item.id)) return
        setNotifications((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, read_at: null }
              : currentItem
          )
        )
        setUnreadCount((current) => current + 1)
      })
      .finally(() => {
        pendingReadIdsRef.current.delete(item.id)
      })
  }

  function openNotification(item: NotificationItem) {
    // An announcement is the whole message already — there is nowhere to send
    // the reader, so the tray stays where it is rather than shutting on the
    // words they just clicked. Everything else opens first; the dot is cleared
    // afterwards, behind the click.
    if (item.type !== "announcement") {
      setOpen(false)

      if (item.type === "changelog") {
        void navigate({ to: "/changelog/whats-new" })
      } else if (item.feedback_id) {
        onOpenFeedback?.(item.feedback_id)
      }
    }

    markReadInBackground(item)
  }

  return (
    // A popover, not a menu. The library gives a menu's container a menu role,
    // which tells a screen reader to expect arrow keys and type-to-jump — and
    // none of what is inside here is a menu item, so none of that ever worked.
    // A popover is the primitive for a panel of mixed content: it still closes
    // on Escape and on a click outside, and still hands focus back to the bell.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
            // a screen reader. The shared badge's destructive treatment is the
            // theme's own alarm colour, so it follows the workspace's styling
            // and has a dark mode, which the baked-in red never did.
            <Badge
              variant="destructive"
              aria-hidden
              className="pointer-events-none absolute -top-1 -right-1 min-w-5 border-2 border-background px-1 text-[0.625rem] leading-none font-semibold tabular-nums"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        sideOffset={12}
        // As tall as the window leaves room for and no taller, so the footer
        // below is always on screen — it used to be a flat 28rem of list plus
        // tabs plus footer, which ran off the bottom of a laptop screen and put
        // "Mark all as read" out of reach.
        style={{
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
        className="flex w-[calc(100vw-2rem)] max-w-[26rem] flex-col gap-0 overflow-hidden p-0 sm:w-[26rem]"
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3 p-4">
          <h2 className="mr-auto text-xl font-semibold">Notifications</h2>
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as NotificationFilter)}
          >
            <TabsList>
              <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
              <TabsTrigger value="all">View all</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />

        <div ref={scrollAreaRootRef} className="min-h-0 flex-1">
          {/* A comfortable height on a big screen, but never more than the
              window leaves once the tabs above and the footer below have had
              their share — so the footer is always on screen. The height has to
              be a real height, not just a cap: the scrolling area sizes its own
              viewport from it, and left to grow it would run straight over the
              footer. */}
          <ScrollArea className="h-[28rem] max-h-[calc(var(--radix-popover-content-available-height)-9.5rem)]">
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
                      onClick={() => openNotification(item)}
                    >
                      <div className="pt-5">
                        {!item.read_at ? (
                          <span className="block size-2 rounded-full bg-destructive" />
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
                        {/* The exact moment is one hover away; the line itself
                            answers the only question a tray gets asked, which
                            is how long ago this happened. */}
                        <p
                          className="mt-1 text-xs text-muted-foreground"
                          title={formatDateTime(item.created_at)}
                        >
                          {formatRelativeTime(item.created_at, formatDateTime)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : canLoadHiddenUnread || error ? null : (
                // A failed load leaves no rows either, and saying "none" there
                // would be the same lie in a different place — the banner below
                // is the only honest thing to show.
                <EmptyNotifications
                  // Nothing loaded at all is a different thing from having read
                  // everything, and the two deserve different words.
                  hasAny={notifications.length > 0}
                />
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
        <div className="flex shrink-0 flex-wrap items-center gap-2 p-4">
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
      </PopoverContent>
    </Popover>
  )
}

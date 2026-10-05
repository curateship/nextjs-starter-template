"use client"

import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon, BellIcon, Loader2Icon } from "lucide-react"

import { NotificationRow } from "@/components/shared/notification-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  countUnreadNotifications,
  getNotificationErrorMessage,
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsSeen,
  type NotificationItem,
} from "@/lib/api/notification"
import { appNoticeCategories } from "@/lib/app-options"
import { notificationAction } from "@/lib/notification-action"
import { relativeDayGroup } from "@/lib/format/format-time"
import { useAppNotificationDetails } from "@/lib/hooks/use-app-notification-details"
import { useNotificationStream } from "@/lib/hooks/use-notification-stream"
import { cn } from "@/lib/utils"

/**
 * Which tab the tray is on: the shell's own two, or the id of one of the app's
 * categories. A string rather than a union, because the app names its own.
 */
type NotificationFilter = string
const NOTIFICATION_PAGE_SIZE = 20

/**
 * The rows under one day heading.
 *
 * **The headings are what makes a long tray readable.** Twenty rows each
 * carrying their own "2h" or "Yesterday" is twenty small sums for the reader to
 * do; one heading does it once for the run underneath it. Tyler asked for these
 * on 4 October 2026.
 *
 * The server hands the notices back newest first, so walking them in order
 * gives Today, then Yesterday, then Earlier, and nothing is sorted again here.
 */
function groupByDay(items: readonly NotificationItem[]) {
  const groups: { label: string; items: NotificationItem[] }[] = []
  for (const item of items) {
    const label = relativeDayGroup(item.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(item)
      continue
    }
    groups.push({ label, items: [item] })
  }
  return groups
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
            ? "Everything here has been read. All shows the rest."
            : "Votes and replies on your feedback land here, along with announcements and new updates."}
        </p>
      </div>
    </div>
  )
}

type NotificationCenterProps = {
  /**
   * How many notices have arrived since this person last opened the bell,
   * counted on the server, so the number is right before the tray has ever
   * been opened. Not the unread count — see the two pieces of state below.
   */
  initialUnseenCount: number
  /**
   * The app-wide switch for the live connection. Off, the bell still updates —
   * on the slow check inside useNotificationStream instead.
   */
  live?: boolean
  /**
   * Whether to offer "Notification settings" in the footer. The switches live
   * on an admin screen, so a member has no page to be sent to and is shown no
   * link rather than one that bounces them back.
   */
  canOpenSettings?: boolean
  onOpenFeedback?: (feedbackId: string) => void
}

export function NotificationCenter({
  initialUnseenCount,
  live = true,
  canOpenSettings = false,
  onOpenFeedback,
}: NotificationCenterProps) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<NotificationFilter>("unread")
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  // Two numbers, because they answer two questions. `unreadCount` is the
  // Unread tab and the Mark all as read button: notices nobody has clicked.
  // `unseenCount` is the red badge: notices that have arrived since the bell
  // was last opened. Opening the bell zeroes the second and leaves the first
  // alone (Tyler, 22 Sep 2026).
  //
  // Both start on the same figure because the shell sends only one. Unseen is
  // a subset of unread, so it is the honest floor for the tab, and the real
  // figure arrives with the first page — which is fetched the moment the tray
  // opens, and the tab is not on screen before that.
  const [unreadCount, setUnreadCount] = React.useState(initialUnseenCount)
  const [unseenCount, setUnseenCount] = React.useState(initialUnseenCount)
  // Follow the shell's count when it reloads, so a notice that arrived while
  // the page was open still shows up. Adjusted during render rather than in an
  // effect so the bell never paints the stale number first.
  const [lastInitialUnseen, setLastInitialUnseen] =
    React.useState(initialUnseenCount)

  if (lastInitialUnseen !== initialUnseenCount) {
    setLastInitialUnseen(initialUnseenCount)
    setUnseenCount(initialUnseenCount)
  }
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [firstPageLoaded, setFirstPageLoaded] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [markingAll, setMarkingAll] = React.useState(false)
  // Read by `clearBell`, which opening the tray calls from an effect that must
  // not be rebuilt on every count change.
  const unseenCountRef = React.useRef(initialUnseenCount)
  const seeingRef = React.useRef(false)
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

  // What this app says about its own notices, looked up while the tray is
  // being read rather than after a click. Empty in an app that has not set the
  // option, and every notice then looks as it always did.
  const appDetails = useAppNotificationDetails(notifications)

  // The app's own tabs, after Unread and All. Fixed for the life of the app,
  // so this never changes while the tray is open.
  const categories = React.useMemo(() => appNoticeCategories(), [])

  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((item) => !item.read_at)
      : filter === "all"
        ? notifications
        : notifications.filter(
            (item) => appDetails[item.id]?.categoryId === filter
          )

  // The Unread tab can only filter the rows it has pulled, so with unread
  // notices sitting further back than the first page the tab would say 3 and
  // show none. Own up to the gap and offer the pages that close it.
  const hiddenUnreadCount =
    filter === "unread"
      ? Math.max(0, unreadCount - visibleNotifications.length)
      : 0
  const canLoadHiddenUnread = hiddenUnreadCount > 0 && nextCursor !== null

  // An app's own tab needs a way to ask for the next page by hand.
  //
  // Scrolling to the bottom fetches the next page, but a filtered tab is the
  // one place that never reaches the bottom: Alerts showing six rows out of
  // twenty loaded has nothing to scroll, so the fetch never fires and those
  // six look like every alert there has ever been.
  //
  // The shell's own two tabs are exempt, and for opposite reasons. All shows
  // every row it has, so its own scrollbar does the asking. Unread knows
  // exactly how many it is hiding and says so in words, which beats an
  // unlabelled button — and a tray with everything read would otherwise lose
  // "You are all caught up" to one.
  const canLoadMoreIntoFilter =
    filter !== "all" && filter !== "unread" && nextCursor !== null

  const loadNotificationRows = React.useCallback(async () => {
    // One request at a time. Three things ask for pages now — opening the
    // panel, scrolling to the bottom, and the Load more button — and the
    // busy flags they check only go up on the next render, so two can start
    // together. That matters most when a reload lands mid-append: the reload
    // replaces the list, then the append grafts a page fetched against the
    // old one onto it, which duplicates rows.
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true

    try {
      const data = await listNotificationPage({
        limit: NOTIFICATION_PAGE_SIZE,
      })
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
      setUnseenCount(data.unseen_count)
      setNextCursor(data.next_cursor)
      setError(null)
      pendingReadIdsRef.current.clear()
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      requestInFlightRef.current = false
      setFirstPageLoaded(true)
    }
  }, [])

  const loadMoreNotificationRows = React.useCallback(async (cursor: string) => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    setLoadingMore(true)
    setError(null)

    try {
      const data = await listNotificationPage({
        cursor,
        limit: NOTIFICATION_PAGE_SIZE,
      })
      setNotifications((current) => [...current, ...data.notifications])
      setUnreadCount(data.unread_count)
      setUnseenCount(data.unseen_count)
      setNextCursor(data.next_cursor)
      pendingReadIdsRef.current.clear()
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    } finally {
      requestInFlightRef.current = false
      setLoadingMore(false)
    }
  }, [])

  /**
   * Clearing the bell's red number, which is what opening the tray means.
   *
   * Tyler, 22 Sep 2026: opening the bell clears the number and nothing else.
   * Having seen the tray is having been told, so every waiting notice is
   * stamped as shown — but it stays unread, stays bold, and stays in the
   * Unread tab until it is clicked or Mark all as read is pressed.
   *
   * **It finishes before the first page is asked for.** Both run on the same
   * click, and a page fetched beside the write answers with the count as it
   * was a moment earlier. That put the red number straight back on a bell
   * that had just cleared.
   *
   * A failure here says nothing out loud. The number on the bell is still the
   * last one that was true, and the next check will say so again.
   */
  const clearBell = React.useCallback(async () => {
    // One write at a time. Two things ask for it on the same click — the open
    // effect below and the effect that keeps an open tray at zero — and the
    // count they both read only goes to zero on the next render.
    if (unseenCountRef.current === 0 || seeingRef.current) return
    seeingRef.current = true
    try {
      await markNotificationsSeen()
      setUnseenCount(0)
    } catch {
      // Left as it was on purpose.
    } finally {
      seeingRef.current = false
    }
  }, [])

  React.useEffect(() => {
    unseenCountRef.current = unseenCount
  })

  React.useEffect(() => {
    if (!open || requestInFlightRef.current) return
    requestInFlightRef.current = true
    void clearBell()
      .then(() => listNotificationPage({ limit: NOTIFICATION_PAGE_SIZE }))
      .then((data) => {
        setNotifications(data.notifications)
        setUnreadCount(data.unread_count)
        setUnseenCount(data.unseen_count)
        setNextCursor(data.next_cursor)
        setError(null)
        pendingReadIdsRef.current.clear()
      })
      .catch((loadError) => {
        setError(getNotificationErrorMessage(loadError))
      })
      .finally(() => {
        requestInFlightRef.current = false
        setFirstPageLoaded(true)
      })
  }, [clearBell, open])

  /**
   * What the live connection (and its slow fallback check) asks for.
   *
   * A shut tray only needs the number — pulling twenty rows nobody is looking
   * at would be most of the cost of this feature for none of the point. An
   * open tray still on its first page reloads, because that page is the whole
   * list anyway; once somebody has scrolled further back, reloading would snap
   * them to the top mid-read, so only the number is refreshed and the rows
   * they are reading stay where they are.
   */
  const syncNotifications = React.useCallback(async () => {
    if (open && notifications.length <= NOTIFICATION_PAGE_SIZE) {
      await loadNotificationRows()
      return
    }

    try {
      const counts = await countUnreadNotifications()
      setUnreadCount(counts.unread_count)
      setUnseenCount(counts.unseen_count)
    } catch {
      // A failed check says nothing. The number on screen is the last one that
      // was true, the next check is a minute away, and putting a banner on the
      // header over a background request nobody asked for would be noise.
    }
  }, [loadNotificationRows, notifications.length, open])

  useNotificationStream({
    live,
    onSync: () => void syncNotifications(),
  })

  // A notice that lands while the tray is open has been shown too — it is on
  // screen. Without this the badge would appear over an open tray, and the
  // next page load would bring the number back.
  React.useEffect(() => {
    if (!open || unseenCount === 0) return
    void clearBell()
  }, [clearBell, open, unseenCount])

  function openNotification(item: NotificationItem) {
    // The app's answer first. A notice the app wrote knows where it came from —
    // the coin that filled, the flow that stopped — and the app is the only
    // side that can say so. The shell opens nothing for those rows, so without
    // this the reading that has an address loses to the one that does not.
    const appHref = appDetails[item.id]?.href
    if (appHref) {
      setOpen(false)
      void navigate({ href: appHref })
      markReadInBackground(item)
      return
    }

    const action = notificationAction(item)

    // A notice with nowhere to go — an announcement, whose own words are the
    // whole message — leaves the tray open rather than shutting on what the
    // reader just clicked. Everything else opens first; the dot is cleared
    // afterwards, behind the click.
    if (action.kind !== "none") {
      setOpen(false)

      if (action.kind === "changelog") {
        void navigate({ to: "/changelog/whats-new" })
      } else if (action.kind === "automationRun") {
        void navigate({
          to: "/admin/automations/$automationId",
          params: { automationId: action.automationId },
          search: { run: action.runId, node: action.nodeId },
        })
      } else if (action.kind === "billing") {
        void navigate({
          to: ".",
          search: (prev) => ({ ...prev, account: "billing" }),
        })
      } else if (action.kind === "crmThread") {
        void navigate({ to: "/admin/crm", search: { open: action.threadId } })
      } else {
        onOpenFeedback?.(action.feedbackId)
      }
    }

    markReadInBackground(item)
  }

  const loading = open && !firstPageLoaded
  const loadMoreFromElement = React.useCallback(
    (element: HTMLDivElement) => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight

      if (distanceFromBottom > 80 || !nextCursor || loading || loadingMore) {
        return
      }

      void loadMoreNotificationRows(nextCursor)
    },
    [loadMoreNotificationRows, loading, loadingMore, nextCursor]
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

  return (
    // A popover, not a menu. The library gives a menu's container a menu role,
    // which tells a screen reader to expect arrow keys and type-to-jump — and
    // none of what is inside here is a menu item, so none of that ever worked.
    // A popover is the primitive for a panel of mixed content: it still closes
    // on Escape and on a click outside, and still hands focus back to the bell.
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && notifications.length === 0) {
          setFirstPageLoaded(false)
        }
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-nav-shape="icon"
          aria-label={
            unseenCount > 0
              ? `Open notifications, ${unseenCount} new`
              : "Open notifications"
          }
        >
          <BellIcon className="size-4" />
          {unseenCount > 0 ? (
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
              {unseenCount > 99 ? "99+" : unseenCount}
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
        {/* Tabs and the one action, on one row. The heading that used to sit
            here said "Notifications" above a tray opened from a bell, which is
            the one thing nobody needed telling. The popover is named for a
            screen reader instead. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 p-3">
          <h2 className="sr-only">Notifications</h2>
          <Tabs
            className="min-w-0"
            value={filter}
            onValueChange={(value) => setFilter(value as NotificationFilter)}
          >
            <TabsList>
              <TabsTrigger value="unread">
                Unread
                {unreadCount > 0 ? (
                  <TabsCount>{unreadCount > 99 ? "99+" : unreadCount}</TabsCount>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id}>
                  {category.label}
                </TabsTrigger>
              ))}
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
          <ScrollArea className="h-[28rem] max-h-[calc(var(--radix-popover-content-available-height)-7rem)]">
            <div className="px-1 py-3">
              {/* Only the very first open has nothing to show. Later opens keep
                  the rows already in hand while they refresh, rather than
                  flashing a spinner over data that is very likely still right. */}
              {loading && notifications.length === 0 ? (
                <LoadingRow label="Loading…" className="min-h-56" />
              ) : visibleNotifications.length > 0 ? (
                <div className="space-y-4">
                  {groupByDay(visibleNotifications).map((group) => (
                    <section
                      key={`${group.label}-${group.items[0].id}`}
                      className="space-y-1"
                    >
                      <h3 className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {group.label}
                      </h3>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <NotificationRow
                            key={item.id}
                            item={item}
                            detail={appDetails[item.id]}
                            onClick={() => openNotification(item)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : canLoadHiddenUnread || canLoadMoreIntoFilter || error ? null : (
                // A failed load leaves no rows either, and saying "none" there
                // would be the same lie in a different place — the error row
                // below is the only honest thing to show.
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
                  <LoadMoreButton
                    loading={loading || loadingMore}
                    onClick={() => {
                      if (nextCursor) void loadMoreNotificationRows(nextCursor)
                    }}
                  />
                </div>
              ) : canLoadMoreIntoFilter ? (
                <div
                  className={cn(
                    "flex justify-center",
                    visibleNotifications.length > 0 ? "pt-4" : "py-10"
                  )}
                >
                  <LoadMoreButton
                    loading={loading || loadingMore}
                    onClick={() => {
                      if (nextCursor) void loadMoreNotificationRows(nextCursor)
                    }}
                  />
                </div>
              ) : loadingMore ? (
                <div className="flex justify-center pt-4" role="status">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : null}

              {error ? (
                <ErrorRow
                  className={cn(
                    notifications.length === 0 ? "min-h-56" : "mt-4"
                  )}
                  message={error}
                  onRetry={() => {
                    setFirstPageLoaded(false)
                    setError(null)
                    void loadNotificationRows()
                  }}
                />
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <Separator />
        {/* Mark all read sits down here rather than beside the tabs. Five tabs
            and a worded button do not share a 416px row, and the row wrapped to
            two — so the action joins the links instead of widening the tray.
            The two links are admin screens, so a member sees the action alone
            rather than links that would bounce them back. */}
        <div className="flex shrink-0 items-center justify-between gap-2 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markingAll}
            onClick={() => void markAllAsRead()}
          >
            {markingAll ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Mark all read
          </Button>
          {canOpenSettings ? (
            <div className="flex items-center gap-1">
              <Button asChild type="button" variant="ghost" size="sm">
                <Link to="/admin/settings" onClick={() => setOpen(false)}>
                  Settings
                </Link>
              </Button>
              <Button asChild type="button" variant="ghost" size="sm">
                <Link to="/admin/notifications" onClick={() => setOpen(false)}>
                  History
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

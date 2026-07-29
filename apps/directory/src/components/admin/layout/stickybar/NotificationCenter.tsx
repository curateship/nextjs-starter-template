"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "@/lib/navigation-client"
import type { LucideIcon } from "lucide-react"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import Bell from "lucide-react/dist/esm/icons/bell.js"
import CalendarPlus from "lucide-react/dist/esm/icons/calendar-plus.js"
import CheckCheck from "lucide-react/dist/esm/icons/check-check.js"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js"
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js"
import Store from "lucide-react/dist/esm/icons/store.js"
import UserCheck from "lucide-react/dist/esm/icons/user-check.js"
import Users from "lucide-react/dist/esm/icons/users.js"

import {
  listHubNotificationPage,
  markAllHubNotificationsRead,
  markHubNotificationRead,
  type HubNotificationItem,
} from "@/lib/actions/notifications/notification-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"

type NotificationFilter = "all" | "unread"

const NOTIFICATION_PAGE_SIZE = 20
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const notificationIcons: Record<HubNotificationItem["type"], LucideIcon> = {
  product_order: ShoppingCart,
  directory_claim: ShieldCheck,
  directory_owner_edit: ShieldCheck,
  directory_featured: ShoppingCart,
  directory_featured_expired: AlertTriangle,
  newsletter_paused: AlertTriangle,
  event_submission: CalendarPlus,
  directory_submission: Store,
  event_registration: Users,
  automation_approval: UserCheck,
}

function getHubNotificationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification request failed."
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
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-md border border-transparent px-3",
            activeFilter === tab.value && "border-border bg-background shadow-sm hover:bg-background"
          )}
          onClick={() => onFilterChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: HubNotificationItem
  onOpen: (item: HubNotificationItem) => void
}) {
  const Icon = notificationIcons[item.type]

  return (
    <button
      type="button"
      className="grid w-full grid-cols-[0.25rem_2.5rem_1fr] gap-2 rounded-md p-2 text-left hover:bg-muted/60"
      onClick={() => onOpen(item)}
    >
      <div className="pt-5">
        {!item.read_at ? (
          <span className="block size-2 rounded-full bg-red-500" />
        ) : null}
      </div>
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {item.message}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.site_name} - {dateFormatter.format(new Date(item.created_at))}
        </p>
      </div>
    </button>
  )
}

export function NotificationCenter() {
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<NotificationFilter>("unread")
  const [notifications, setNotifications] = useState<HubNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const visibleNotifications = filter === "unread"
    ? notifications.filter((item) => !item.read_at)
    : notifications
  const unreadBadgeLabel = unreadCount > 99 ? "99+" : String(unreadCount)

  const loadNotificationRows = useCallback(async (cursor?: string) => {
    if (!currentSite?.id) {
      setNotifications([])
      setUnreadCount(0)
      setNextCursor(null)
      return
    }

    if (cursor) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const data = await listHubNotificationPage({
        siteId: currentSite.id,
        cursor,
        limit: NOTIFICATION_PAGE_SIZE,
      })
      setNotifications((current) =>
        cursor ? [...current, ...data.notifications] : data.notifications
      )
      setUnreadCount(data.unread_count)
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getHubNotificationErrorMessage(loadError))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [currentSite?.id])

  useEffect(() => {
    void loadNotificationRows()
  }, [loadNotificationRows])

  useEffect(() => {
    if (!open) return
    void loadNotificationRows()
  }, [loadNotificationRows, open])

  const loadMoreFromElement = useCallback((element: HTMLDivElement) => {
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight

    if (distanceFromBottom > 80 || !nextCursor || loading || loadingMore) {
      return
    }

    void loadNotificationRows(nextCursor)
  }, [loadNotificationRows, loading, loadingMore, nextCursor])

  useEffect(() => {
    const element = scrollAreaRef.current
    if (!element) return

    const handleScroll = () => loadMoreFromElement(element)
    element.addEventListener("scroll", handleScroll)
    return () => element.removeEventListener("scroll", handleScroll)
  }, [loadMoreFromElement])

  async function markAllAsRead() {
    if (unreadCount === 0) return

    setError(null)
    try {
      if (!currentSite?.id) return

      const result = await markAllHubNotificationsRead(currentSite.id)
      const readIds = new Set(result.notificationIds)
      setNotifications((current) =>
        current.map((item) =>
          readIds.has(item.id) ? { ...item, read_at: result.readAt } : item
        )
      )
      setUnreadCount(0)
    } catch (readError) {
      setError(getHubNotificationErrorMessage(readError))
    }
  }

  async function openNotification(item: HubNotificationItem) {
    setError(null)

    if (!item.read_at) {
      try {
        const result = await markHubNotificationRead(item.id, item.site_id)
        setNotifications((current) =>
          current.map((currentItem) =>
            currentItem.id === result.notificationId
              ? { ...currentItem, read_at: result.readAt }
              : currentItem
          )
        )
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getHubNotificationErrorMessage(readError))
        return
      }
    }

    const targetSite = sites.find((site) => site.id === item.site_id)
    if (targetSite) setCurrentSite(targetSite)

    setOpen(false)
    const safeTarget =
      (item.target_href === "/admin" ||
        item.target_href.startsWith("/admin/") ||
        item.target_href.startsWith("/admin?")) &&
      !item.target_href.includes("\\")

    if (safeTarget) {
      router.push(item.target_href)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadBadgeLabel}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        sideOffset={12}
        className="w-[calc(100vw-2rem)] max-w-104 overflow-hidden p-0 sm:w-104"
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

        <ScrollArea className="h-112" viewportRef={scrollAreaRef}>
          <div className="px-4 py-4">
            {visibleNotifications.length > 0 ? (
              <div className="space-y-3">
                {visibleNotifications.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onOpen={(row) => void openNotification(row)}
                  />
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
        <Separator />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button
            type="button"
            variant="ghost"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

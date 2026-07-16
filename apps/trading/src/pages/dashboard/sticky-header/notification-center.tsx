"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ActivityIcon,
  ArrowRightLeftIcon,
  BellIcon,
  BookOpenIcon,
  ChartNoAxesCombinedIcon,
  CheckCheckIcon,
  MessageSquareIcon,
  RadarIcon,
  ShieldAlertIcon,
  TargetIcon,
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
import {
  getNotificationErrorMessage,
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import { pollNotificationFeed } from "@/lib/api/notification-feed"
import {
  loadAlertsPage,
  markAlertRead,
  markAlertsRead,
  type ScannerAlertItem,
} from "@/lib/api/scanner"
import {
  listTradingNotifications,
  markAllTradingNotificationsRead,
  markTradingNotificationRead,
  type TradingNotificationItem,
} from "@/lib/api/trading-notifications"
import {
  markAlertEventRead,
  markAllAlertEventsRead,
  pollAlertEvents,
} from "@/lib/api/alerts"
import {
  markAllMarketScannerAlertsRead,
  markMarketScannerAlertRead,
  pollMarketScannerAlerts,
} from "@/lib/api/market-scanner"
import { alertTradeTarget, type AlertEventItem } from "@/lib/alerts"
import { showBrowserAlert } from "@/lib/browser-alerts"
import {
  marketScannerTradeTarget,
  type MarketScannerAlertItem,
} from "@/lib/market-scanner"
import { cn } from "@/lib/utils"

type NotificationFilter = "all" | "unread"
const NOTIFICATION_PAGE_SIZE = 20
const ALERT_TRAY_LIMIT = 50
const ALERT_POLL_MS = 10_000

// The tray keeps each source's read behavior while presenting one time-sorted feed.
type TrayItem =
  | {
      kind: "feedback"
      id: string
      createdAt: string
      read: boolean
      feedback: NotificationItem
    }
  | {
      kind: "alert"
      id: string
      createdAt: string
      read: boolean
      alert: ScannerAlertItem
    }
  | {
      kind: "trading"
      id: string
      createdAt: string
      read: boolean
      trading: TradingNotificationItem
    }
  | {
      kind: "market"
      id: string
      createdAt: string
      read: boolean
      market: MarketScannerAlertItem
    }
  | {
      kind: "priceAlert"
      id: string
      createdAt: string
      read: boolean
      priceAlert: AlertEventItem
    }

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
            {isVote
              ? "gave your feedback a thumbs up"
              : "commented on your feedback"}
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
      return {
        Icon: ArrowRightLeftIcon,
        className: "bg-blue-100 text-blue-800",
      }
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

function tradingVisual(item: TradingNotificationItem) {
  switch (item.kind) {
    case "position_opened":
      return {
        Icon: ChartNoAxesCombinedIcon,
        className: "bg-blue-100 text-blue-800",
        title: `${item.coin} ${item.side} opened`,
      }
    case "take_profit":
      return {
        Icon: TargetIcon,
        className: "bg-emerald-100 text-emerald-800",
        title: `${item.coin} take profit filled`,
      }
    case "stop_loss":
      return {
        Icon: ShieldAlertIcon,
        className: "bg-red-100 text-red-800",
        title: `${item.coin} stop loss filled`,
      }
  }
}

function TradingRow({ item }: { item: TradingNotificationItem }) {
  const visual = tradingVisual(item)
  const { Icon } = visual

  return (
    <>
      <Avatar size="lg">
        <AvatarFallback className={visual.className}>
          <Icon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm leading-snug font-medium text-foreground">
          {visual.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.size} {item.coin} at ${Number(item.price).toLocaleString()}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {item.walletLabel}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {item.network}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormatter.format(new Date(item.occurredAt))}
        </p>
      </div>
    </>
  )
}

function MarketAlertRow({ item }: { item: MarketScannerAlertItem }) {
  return (
    <>
      <Avatar size="lg">
        <AvatarFallback className="bg-emerald-100 text-emerald-800">
          <ActivityIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm leading-snug font-medium text-foreground">
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            Market scanner
          </Badge>
          <span className="text-xs text-muted-foreground">{item.coin}</span>
        </div>
        {item.body ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormatter.format(new Date(item.occurredAt))}
        </p>
      </div>
    </>
  )
}

function PriceAlertRow({ item }: { item: AlertEventItem }) {
  return (
    <>
      <Avatar size="lg">
        <AvatarFallback className="bg-emerald-100 text-emerald-800">
          <ActivityIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm leading-snug font-medium text-foreground">
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            Price alert
          </Badge>
          <span className="text-xs text-muted-foreground">{item.coin}</span>
        </div>
        {item.body ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {dateFormatter.format(new Date(item.occurredAt))}
        </p>
      </div>
    </>
  )
}

function TrayRow({ item }: { item: TrayItem }) {
  switch (item.kind) {
    case "feedback":
      return <FeedbackRow item={item.feedback} />
    case "alert":
      return <AlertRow item={item.alert} />
    case "trading":
      return <TradingRow item={item.trading} />
    case "market":
      return <MarketAlertRow item={item.market} />
    case "priceAlert":
      return <PriceAlertRow item={item.priceAlert} />
  }
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
  const [trading, setTrading] = React.useState<TradingNotificationItem[]>([])
  const [marketAlerts, setMarketAlerts] = React.useState<
    MarketScannerAlertItem[]
  >([])
  const [priceAlerts, setPriceAlerts] = React.useState<AlertEventItem[]>([])
  const [feedbackUnread, setFeedbackUnread] = React.useState(0)
  const [alertUnread, setAlertUnread] = React.useState(0)
  const [tradingUnread, setTradingUnread] = React.useState(0)
  const [marketUnread, setMarketUnread] = React.useState(0)
  const [priceAlertUnread, setPriceAlertUnread] = React.useState(0)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollAreaRootRef = React.useRef<HTMLDivElement>(null)
  const seenScannerAlerts = React.useRef<Set<string> | null>(null)
  const seenTradingAlerts = React.useRef<Set<string> | null>(null)
  const seenMarketAlerts = React.useRef<Set<string> | null>(null)
  const seenPriceAlerts = React.useRef<Set<string> | null>(null)

  const totalUnread =
    feedbackUnread +
    alertUnread +
    tradingUnread +
    marketUnread +
    priceAlertUnread

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
      ...trading.map((item) => ({
        kind: "trading" as const,
        id: `t:${item.id}`,
        createdAt: item.occurredAt,
        read: item.readAt !== null,
        trading: item,
      })),
      ...marketAlerts.map((item) => ({
        kind: "market" as const,
        id: `m:${item.id}`,
        createdAt: item.occurredAt,
        read: item.readAt !== null,
        market: item,
      })),
      ...priceAlerts.map((item) => ({
        kind: "priceAlert" as const,
        id: `p:${item.id}`,
        createdAt: item.occurredAt,
        read: item.readAt !== null,
        priceAlert: item,
      })),
    ]
    return merged.sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  }, [notifications, alerts, trading, marketAlerts, priceAlerts])

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

  const loadTradingRows = React.useCallback(async () => {
    try {
      const data = await listTradingNotifications()
      setTrading(data.items)
      setTradingUnread(data.unreadCount)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  const loadPriceAlertRows = React.useCallback(async () => {
    try {
      const data = await pollAlertEvents()
      setPriceAlerts(data.events)
      setPriceAlertUnread(data.unreadCount)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  const loadMarketRows = React.useCallback(async () => {
    try {
      const data = await pollMarketScannerAlerts()
      setMarketAlerts(data.alerts)
      setMarketUnread(data.unreadCount)
    } catch (loadError) {
      setError(getNotificationErrorMessage(loadError))
    }
  }, [])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return
    void loadNotificationRows()
    void loadAlertRows()
    void loadTradingRows()
    void loadMarketRows()
    void loadPriceAlertRows()
  }

  // Keep the unread badge live even while the tray is closed.
  React.useEffect(() => {
    let cancelled = false
    let running = false
    async function tick() {
      if (cancelled || running || document.visibilityState !== "visible") {
        return
      }
      running = true
      try {
        const result = await pollNotificationFeed()
        if (cancelled) return
        if (result.scanner) {
          const nextScanner = result.scanner.latest
          if (seenScannerAlerts.current) {
            for (const alert of nextScanner) {
              if (!seenScannerAlerts.current.has(alert.id)) {
                showBrowserAlert(alert, navigate)
              }
            }
          }
          seenScannerAlerts.current = new Set(
            nextScanner.map((alert) => alert.id)
          )
          setAlertUnread(result.scanner.unreadCount)
        }

        if (result.trading) {
          const nextTrading = result.trading.items
          if (seenTradingAlerts.current) {
            for (const alert of nextTrading) {
              if (!seenTradingAlerts.current.has(alert.id)) {
                showBrowserAlert(alert, navigate)
              }
            }
          }
          seenTradingAlerts.current = new Set(
            nextTrading.map((alert) => alert.id)
          )
          setTrading(nextTrading)
          setTradingUnread(result.trading.unreadCount)
        }

        if (result.market) {
          const nextMarket = result.market.alerts
          if (seenMarketAlerts.current) {
            for (const alert of nextMarket) {
              if (!seenMarketAlerts.current.has(alert.id)) {
                showBrowserAlert(alert, navigate)
              }
            }
          }
          seenMarketAlerts.current = new Set(
            nextMarket.map((alert) => alert.id)
          )
          setMarketAlerts(nextMarket)
          setMarketUnread(result.market.unreadCount)
        }

        if (result.priceAlerts) {
          const nextPriceAlerts = result.priceAlerts.events
          if (seenPriceAlerts.current) {
            for (const alert of nextPriceAlerts) {
              if (!seenPriceAlerts.current.has(alert.id))
                showBrowserAlert(alert, navigate)
            }
          }
          seenPriceAlerts.current = new Set(
            nextPriceAlerts.map((alert) => alert.id)
          )
          setPriceAlerts(nextPriceAlerts)
          setPriceAlertUnread(result.priceAlerts.unreadCount)
        }
      } catch {
        // A later tick retries transient request failures.
      } finally {
        running = false
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), ALERT_POLL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [navigate])

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
    if (totalUnread === 0) return
    setError(null)
    try {
      const [feedbackResult, , tradingResult, marketResult, priceAlertResult] =
        await Promise.all([
          feedbackUnread > 0
            ? markAllNotificationsRead()
            : Promise.resolve({ notificationIds: [] as string[], readAt: "" }),
          alertUnread > 0 ? markAlertsRead() : Promise.resolve({ ok: true }),
          tradingUnread > 0
            ? markAllTradingNotificationsRead()
            : Promise.resolve({ ids: [] as string[], readAt: "" }),
          marketUnread > 0
            ? markAllMarketScannerAlertsRead()
            : Promise.resolve({ ids: [] as string[], readAt: "" }),
          priceAlertUnread > 0
            ? markAllAlertEventsRead()
            : Promise.resolve({ ids: [] as string[], readAt: "" }),
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
      const tradingIds = new Set(tradingResult.ids)
      setTrading((current) =>
        current.map((item) =>
          tradingIds.has(item.id)
            ? { ...item, readAt: tradingResult.readAt }
            : item
        )
      )
      const marketIds = new Set(marketResult.ids)
      setMarketAlerts((current) =>
        current.map((item) =>
          marketIds.has(item.id)
            ? { ...item, readAt: marketResult.readAt }
            : item
        )
      )
      const priceAlertIds = new Set(priceAlertResult.ids)
      setPriceAlerts((current) =>
        current.map((item) =>
          priceAlertIds.has(item.id)
            ? { ...item, readAt: priceAlertResult.readAt }
            : item
        )
      )
      setFeedbackUnread(0)
      setAlertUnread(0)
      setTradingUnread(0)
      setMarketUnread(0)
      setPriceAlertUnread(0)
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
      }
    }
    setOpen(false)
    void navigate({ to: alertRoute(item.type) })
  }

  async function openTradingNotification(item: TradingNotificationItem) {
    setError(null)
    if (!item.readAt) {
      try {
        const result = await markTradingNotificationRead(item.id)
        setTrading((current) =>
          current.map((currentItem) =>
            currentItem.id === result.id
              ? { ...currentItem, readAt: result.readAt }
              : currentItem
          )
        )
        setTradingUnread((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
      }
    }
    setOpen(false)
    void navigate({
      to: "/trade",
      search: { market: item.coin, wallet: item.walletId },
    })
  }

  async function openPriceAlert(item: AlertEventItem) {
    setError(null)
    if (!item.readAt) {
      try {
        const result = await markAlertEventRead(item.id)
        setPriceAlerts((current) =>
          current.map((currentItem) =>
            currentItem.id === result.id
              ? { ...currentItem, readAt: result.readAt }
              : currentItem
          )
        )
        setPriceAlertUnread((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
      }
    }
    setOpen(false)
    void navigate(alertTradeTarget(item.coin))
  }

  async function openMarketAlert(item: MarketScannerAlertItem) {
    setError(null)
    if (!item.readAt) {
      try {
        const result = await markMarketScannerAlertRead(item.id)
        setMarketAlerts((current) =>
          current.map((currentItem) =>
            currentItem.id === result.id
              ? { ...currentItem, readAt: result.readAt }
              : currentItem
          )
        )
        setMarketUnread((current) => Math.max(0, current - 1))
      } catch (readError) {
        setError(getNotificationErrorMessage(readError))
      }
    }
    setOpen(false)
    void navigate(marketScannerTradeTarget(item.coin))
  }

  async function openTrayItem(item: TrayItem) {
    switch (item.kind) {
      case "feedback":
        return openFeedbackNotification(item.feedback)
      case "alert":
        return openAlert(item.alert)
      case "trading":
        return openTradingNotification(item.trading)
      case "market":
        return openMarketAlert(item.market)
      case "priceAlert":
        return openPriceAlert(item.priceAlert)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Open notifications"
        >
          <BellIcon className="h-[1.15rem] w-[1.15rem]" />
          {totalUnread > 0 ? (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 text-[10px] leading-none font-semibold text-white",
                totalUnread > 9 && "px-1"
              )}
            >
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
              {visibleItems.length > 0 ? (
                <div className="space-y-3">
                  {visibleItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="grid w-full grid-cols-[0.25rem_3rem_1fr] gap-2 rounded-md p-2 text-left hover:bg-muted/60"
                      onClick={() => void openTrayItem(item)}
                    >
                      <div className="pt-5">
                        {!item.read ? (
                          <span className="block size-2 rounded-full bg-red-500" />
                        ) : null}
                      </div>
                      <TrayRow item={item} />
                    </button>
                  ))}
                </div>
              ) : !loading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : null}
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

import { createServerFn } from "@tanstack/react-start"

import type { AlertEventItem } from "@/lib/alerts"
import type { AlertsPollResponse } from "@/lib/api/scanner"
import type { TradingNotificationItem } from "@/lib/api/trading-notifications"
import type { MarketScannerAlertItem } from "@/lib/market-scanner"

export type NotificationFeedPollResponse = {
  scanner: AlertsPollResponse | null
  trading: {
    items: TradingNotificationItem[]
    unreadCount: number
  } | null
  market: {
    alerts: MarketScannerAlertItem[]
    unreadCount: number
  } | null
  priceAlerts: {
    events: AlertEventItem[]
    unreadCount: number
  } | null
}

const pollNotificationFeedFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationFeedPollResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { getAlertEventsPoll } = await import("@/server/alerts")
    const { getMarketScannerAlertsPage } =
      await import("@/server/market-scanner")
    const { getScannerAlertsPoll } = await import("@/server/notification-feed")
    const { getTradingNotificationPage } =
      await import("@/server/trading-notifications")

    const [scanner, trading, marketPage, priceAlerts] =
      await Promise.allSettled([
        getScannerAlertsPoll(),
        getTradingNotificationPage(user.id, 10),
        getMarketScannerAlertsPage(user.id, { limit: 10 }),
        getAlertEventsPoll(user.id, 10),
      ])
    return {
      scanner: scanner.status === "fulfilled" ? scanner.value : null,
      trading: trading.status === "fulfilled" ? trading.value : null,
      market:
        marketPage.status === "fulfilled"
          ? {
              alerts: marketPage.value.alerts,
              unreadCount: marketPage.value.unreadCount,
            }
          : null,
      priceAlerts:
        priceAlerts.status === "fulfilled" ? priceAlerts.value : null,
    }
  }
)

export function pollNotificationFeed() {
  return pollNotificationFeedFn()
}

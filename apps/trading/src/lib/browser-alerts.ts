import { alertTradeTarget, type AlertEventItem } from "@/lib/alerts"
import {
  marketScannerTradeTarget,
  type MarketScannerAlertItem,
} from "@/lib/market-scanner"
import { alertRoute } from "@/components/scanner/alert-meta"
import type { ScannerAlertItem } from "@/lib/api/scanner"
import type { TradingNotificationItem } from "@/lib/api/trading-notifications"

export const BROWSER_ALERT_SEEN_KEY = "trading-browser-alert-seen"
export const BROWSER_ALERTS_ENABLED_KEY = "price-alert-browser-enabled"
const BROWSER_ALERT_SEEN_LIMIT = 100

export function browserAlertsEnabled() {
  try {
    const stored = window.localStorage.getItem(BROWSER_ALERTS_ENABLED_KEY)
    return stored === null || stored === "true"
  } catch {
    return false
  }
}

export function setBrowserAlertsEnabled(enabled: boolean) {
  window.localStorage.setItem(BROWSER_ALERTS_ENABLED_KEY, String(enabled))
}

type BrowserAlertItem =
  | AlertEventItem
  | MarketScannerAlertItem
  | ScannerAlertItem
  | TradingNotificationItem

type BrowserAlertTarget =
  | ReturnType<typeof alertTradeTarget>
  | ReturnType<typeof marketScannerTradeTarget>
  | { to: ReturnType<typeof alertRoute> }
  | {
      to: "/trade"
      search: { market: string; wallet: string }
    }

export function showBrowserAlert(
  alert: BrowserAlertItem,
  navigate: (target: BrowserAlertTarget) => unknown
) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return
  if (!browserAlertsEnabled()) return
  const { key, title, body, target } = browserAlertDetails(alert)
  if (!claimBrowserAlert(key)) return
  const notification = new Notification(title, {
    body,
    tag: key,
  })
  notification.onclick = () => {
    window.focus()
    void navigate(target)
    notification.close()
  }
}

function browserAlertDetails(alert: BrowserAlertItem): {
  key: string
  title: string
  body: string | undefined
  target: BrowserAlertTarget
} {
  if ("walletId" in alert) {
    const kind = alert.kind.replaceAll("_", " ")
    return {
      key: `trading-browser-alert:${alert.id}`,
      title: `${alert.coin} ${kind}`,
      body: `${alert.size} ${alert.coin} at $${Number(alert.price).toLocaleString()}`,
      target: {
        to: "/trade",
        search: { market: alert.coin, wallet: alert.walletId },
      },
    }
  }
  if ("created_at" in alert) {
    return {
      key: `scanner-browser-alert:${alert.id}`,
      title: alert.title,
      body: alert.body ?? undefined,
      target: { to: alertRoute(alert.type) },
    }
  }
  if ("ruleName" in alert) {
    return {
      key: `market-scanner-browser-alert:${alert.id}`,
      title: alert.title,
      body: alert.body ?? undefined,
      target: marketScannerTradeTarget(alert.coin),
    }
  }
  return {
    key: `price-alert-browser:${alert.id}`,
    title: alert.title,
    body: alert.body ?? undefined,
    target: alertTradeTarget(alert.coin),
  }
}

function claimBrowserAlert(key: string) {
  try {
    const stored = window.localStorage.getItem(BROWSER_ALERT_SEEN_KEY)
    const parsed: unknown = stored === null ? [] : JSON.parse(stored)
    const seen =
      Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
        ? parsed
        : []
    if (seen.includes(key)) return false
    window.localStorage.setItem(
      BROWSER_ALERT_SEEN_KEY,
      JSON.stringify([...seen.slice(1 - BROWSER_ALERT_SEEN_LIMIT), key])
    )
  } catch {
    // A full or damaged browser store must not block notification delivery.
  }
  return true
}

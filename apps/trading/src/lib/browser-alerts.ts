import {
  alertTradeTarget,
  type AlertEventItem,
} from "@/lib/alerts"
import {
  marketScannerTradeTarget,
  type MarketScannerAlertItem,
} from "@/lib/market-scanner"

export const BROWSER_ALERT_SEEN_KEY = "trading-browser-alert-seen"
export const PRICE_ALERT_BROWSER_ENABLED_KEY = "price-alert-browser-enabled"
const BROWSER_ALERT_SEEN_LIMIT = 100

export function priceAlertBrowserEnabled() {
  try {
    const stored = window.localStorage.getItem(PRICE_ALERT_BROWSER_ENABLED_KEY)
    return stored === null || stored === "true"
  } catch {
    return false
  }
}

export function setPriceAlertBrowserEnabled(enabled: boolean) {
  window.localStorage.setItem(
    PRICE_ALERT_BROWSER_ENABLED_KEY,
    String(enabled)
  )
}

export function showBrowserAlert(
  alert: AlertEventItem | MarketScannerAlertItem,
  navigate: (
    target:
      | ReturnType<typeof alertTradeTarget>
      | ReturnType<typeof marketScannerTradeTarget>
  ) => unknown
) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return
  const isMarketScannerAlert = "ruleName" in alert
  if (!isMarketScannerAlert && !priceAlertBrowserEnabled()) return
  const key = isMarketScannerAlert
    ? `market-scanner-browser-alert:${alert.id}`
    : `price-alert-browser:${alert.id}`
  if (!claimBrowserAlert(key)) return
  const notification = new Notification(alert.title, {
    body: alert.body ?? undefined,
    tag: key,
  })
  notification.onclick = () => {
    window.focus()
    void navigate(
      isMarketScannerAlert
        ? marketScannerTradeTarget(alert.coin)
        : alertTradeTarget(alert.coin)
    )
    notification.close()
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

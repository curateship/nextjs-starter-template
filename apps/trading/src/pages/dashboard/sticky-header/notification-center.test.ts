import { afterEach, describe, expect, it, vi } from "vitest"

import type { AlertEventItem } from "@/lib/alerts"
import {
  BROWSER_ALERT_SEEN_KEY,
  PRICE_ALERT_BROWSER_ENABLED_KEY,
  showBrowserAlert,
} from "@/lib/browser-alerts"
import type { MarketScannerAlertItem } from "@/lib/market-scanner"

const event: AlertEventItem = {
  id: "11111111-1111-4111-8111-111111111111",
  ruleId: null,
  alertName: "BTC breakout",
  message: null,
  coin: "BTC",
  kind: "price_level",
  operator: "crossing_up",
  direction: null,
  level: 69_500,
  percent: null,
  multiplier: null,
  window: null,
  triggerMode: "once",
  cooldown: null,
  observed: 69_501,
  title: "BTC crossed upward through 69500",
  body: "BTC breakout fired.",
  occurredAt: "2026-07-14T12:00:00.000Z",
  readAt: null,
}

const marketEvent: MarketScannerAlertItem = {
  id: "22222222-2222-4222-8222-222222222222",
  ruleId: null,
  ruleName: "Fast movers",
  kind: "price_move",
  direction: "up",
  coin: "ETH",
  window: "5m",
  threshold: 5,
  observed: 6,
  title: "ETH moved up 6%",
  body: null,
  occurredAt: "2026-07-14T12:00:00.000Z",
  readAt: null,
}

afterEach(() => vi.unstubAllGlobals())

describe("price alert browser notifications", () => {
  it("respects the in-app setting and stores a shared event key before showing a popup", () => {
    const stored = new Map<string, string>()
    const setItem = vi.fn((key: string, value: string) =>
      stored.set(key, value)
    )
    const notification = vi.fn(function NotificationMock() {
      return { close: vi.fn(), onclick: null }
    })
    Object.assign(notification, { permission: "granted" })
    vi.stubGlobal("Notification", notification)
    vi.stubGlobal("window", {
      Notification: notification,
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem,
      },
      focus: vi.fn(),
    })
    const navigate = vi.fn()

    stored.set(PRICE_ALERT_BROWSER_ENABLED_KEY, "false")
    showBrowserAlert(event, navigate as never)
    expect(notification).not.toHaveBeenCalled()

    stored.delete(PRICE_ALERT_BROWSER_ENABLED_KEY)
    showBrowserAlert(event, navigate as never)
    showBrowserAlert(event, navigate as never)

    expect(notification).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith(
      BROWSER_ALERT_SEEN_KEY,
      JSON.stringify([`price-alert-browser:${event.id}`])
    )
  })

  it("keeps Market Scanner browser alerts separate", () => {
    const stored = new Map<string, string>()
    const setItem = vi.fn((key: string, value: string) =>
      stored.set(key, value)
    )
    const notification = vi.fn(function NotificationMock() {
      return { close: vi.fn(), onclick: null }
    })
    Object.assign(notification, { permission: "granted" })
    vi.stubGlobal("Notification", notification)
    vi.stubGlobal("window", {
      Notification: notification,
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem,
      },
      focus: vi.fn(),
    })

    showBrowserAlert(marketEvent, vi.fn() as never)

    expect(setItem).toHaveBeenCalledWith(
      BROWSER_ALERT_SEEN_KEY,
      JSON.stringify([`market-scanner-browser-alert:${marketEvent.id}`])
    )
  })
})

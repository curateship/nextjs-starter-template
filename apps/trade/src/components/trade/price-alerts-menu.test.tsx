// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  clear: vi.fn(),
  loadFired: vi.fn(),
  removeFired: vi.fn(),
}))
const errors = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("@/lib/api/trade/alerts", () => ({
  clearAlerts: api.clear,
  getClearAlertsErrorMessage: () =>
    "Those alerts could not be cleared. Try again.",
}))
vi.mock("@/lib/api/trade/price-alerts", () => ({
  getFiredPriceAlertDeleteErrorMessage: () => "Delete failed.",
  getFiredPriceAlertLoadErrorMessage: () => "Load failed.",
  loadFiredPriceAlerts: api.loadFired,
  removeFiredPriceAlert: api.removeFired,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: errors.show }))

import { PriceAlertsMenu } from "@/components/trade/price-alerts-menu"
import { TooltipProvider } from "@/components/ui/tooltip"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  })
  vi.clearAllMocks()
  api.clear.mockResolvedValue({ cleared: 1 })
  api.removeFired.mockResolvedValue({ deleted: true })
  api.loadFired.mockResolvedValue({
    alerts: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        protocol: "hyperliquid",
        network: "mainnet",
        marketKey: "hyperliquid:mainnet:ETH",
        price: 90,
        direction: "below",
        createdAt: 1,
        firedAt: 2,
      },
    ],
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { hasPointerCapture?: unknown })
    .hasPointerCapture
  delete (HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture
  delete (HTMLElement.prototype as { releasePointerCapture?: unknown })
    .releasePointerCapture
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe("the alerts menu", () => {
  it("shows the fired badge and clears only the visible tab", async () => {
    const onCleared = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <PriceAlertsMenu
            alerts={[
              {
                id: "00000000-0000-4000-8000-000000000001",
                protocol: "hyperliquid",
                network: "mainnet",
                marketKey: "hyperliquid:mainnet:BTC",
                price: 110,
                direction: "above",
                createdAt: 1,
              },
            ]}
            error={null}
            onRetry={() => {}}
            onSelectMarket={() => {}}
            onDelete={() => {}}
            lines={{
              armed: [],
              fired: [],
              error: null,
              onRetry: () => {},
              onSelect: () => {},
              onSwitchOff: () => {},
            }}
            onCleared={onCleared}
          />
        </TooltipProvider>
      )
    })

    await vi.waitFor(() => {
      expect(button("Open alerts, 1 fired")).not.toBeNull()
    })
    expect(button("Open alerts, 1 fired").dataset.slot).toBe("popover-trigger")
    expect(button("Open alerts, 1 fired").textContent).toContain("1")

    await act(async () => {
      button("Open alerts, 1 fired").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true })
      )
    })
    expect(document.body.textContent).toContain("Alert")
    expect(document.body.textContent).toContain("Fired")

    await act(async () => buttonWithText("Clear all").click())
    expect(api.clear).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Clear every active alert?")
    await act(async () => buttonWithText("Clear all").click())
    expect(api.clear).toHaveBeenLastCalledWith("active")
    expect(onCleared).toHaveBeenCalledTimes(1)

    await act(async () => {
      button("Open alerts, 1 fired").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true })
      )
    })
    const firedTab = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((candidate) => candidate.textContent?.includes("Fired"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    await act(async () => buttonWithText("Clear all").click())
    expect(api.clear).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain("Clear all fired alerts?")
    await act(async () => buttonWithText("Clear all").click())
    expect(api.clear).toHaveBeenLastCalledWith("fired")
    expect(onCleared).toHaveBeenCalledTimes(2)
  })
})

function button(name: string) {
  const found = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`
  )
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

function buttonWithText(text: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent === text)
  if (!found) throw new Error(`Missing ${text}`)
  return found
}

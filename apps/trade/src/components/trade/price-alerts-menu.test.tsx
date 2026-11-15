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
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: errors.show,
  useErrorToast: vi.fn(),
}))

import * as React from "react"

import { PriceAlertsMenu as PriceAlertsList } from "@/components/trade/price-alerts-menu"
import { useFiredPriceAlerts } from "@/components/trade/price-alerts-panel"
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

/** The list as the dashboard draws it: the fired alerts read above it. */
function PriceAlertsMenu(props: Omit<React.ComponentProps<typeof PriceAlertsList>, "fired">) {
  const fired = useFiredPriceAlerts()
  return <PriceAlertsList {...props} fired={fired} />
}

/** The tab's list sits in the page ⋮'s tooltips. */
function InMenu({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

const noLines = {
  armed: [],
  fired: [],
  error: null,
  onRetry: () => {},
  onSelect: () => {},
  onSwitchOff: () => {},
}

describe("the Alerts tab of the page's ⋮", () => {
  it.each([false, true])(
    "clicking a fired alert opens its market, and a delete that fails puts the row back, failure=%s",
    async (fails) => {
      const select = vi.fn()
      if (fails) api.removeFired.mockRejectedValue(new Error("refused"))
      await act(async () =>
        root.render(
          <InMenu>
            <PriceAlertsMenu
              alerts={[]}
              error={null}
              onRetry={() => {}}
              onSelectMarket={select}
              onDelete={() => {}}
              lines={noLines}
              onCleared={async () => {}}
            />
          </InMenu>
        )
      )
      await vi.waitFor(() => buttonStartingWith("ETH"))
      await act(async () => buttonStartingWith("ETH").click())
      expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:ETH")
      expect(api.removeFired).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000002"
      )
      expect(document.body.textContent?.includes("ETH")).toBe(fails)
      if (fails) expect(errors.show).toHaveBeenCalledWith("Delete failed.")
    }
  )

  it("walks the list one row at a time and clears only the visible tab", async () => {
    const onCleared = vi.fn().mockResolvedValue(undefined)
    const onSelectMarket = vi.fn()
    await act(async () => {
      root.render(
        <InMenu>
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
            onSelectMarket={onSelectMarket}
            onDelete={() => {}}
            lines={noLines}
            onCleared={onCleared}
          />
        </InMenu>
      )
    })

    expect(document.body.textContent).toContain("Alert")
    expect(document.body.textContent).toContain("Fired")

    // It opens on Fired, so the armed list is one press away.
    const alertTab = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((candidate) => candidate.textContent?.includes("Alert"))
    await act(async () => {
      alertTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })

    // A row puts its market on the chart and leaves the list as it is.
    await act(async () => buttonStartingWith("BTC").click())
    expect(onSelectMarket).toHaveBeenCalledWith("hyperliquid:mainnet:BTC")
    expect(buttonStartingWith("BTC")).not.toBeNull()

    await act(async () => buttonWithText("Clear all").click())
    expect(api.clear).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Clear every active alert?")
    await act(async () => confirmButton().click())
    expect(api.clear).toHaveBeenLastCalledWith("active")
    expect(onCleared).toHaveBeenCalledTimes(1)

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
    await act(async () => confirmButton().click())
    expect(api.clear).toHaveBeenLastCalledWith("fired")
    expect(onCleared).toHaveBeenCalledTimes(2)
  })

  // The tab is drawn each time the page's ⋮ opens it. The fired alerts are
  // read by the dashboard, so opening it again shows them at once (Tyler,
  // 8 Nov 2026: "Why does this amount kept loading if i go back to it").
  it("shows the fired alerts at once when the tab opens again", async () => {
    function Dashboard({ open }: { open: boolean }) {
      const fired = useFiredPriceAlerts()
      return open ? (
        <InMenu>
          <PriceAlertsList
            alerts={[]}
            error={null}
            onRetry={() => {}}
            onSelectMarket={() => {}}
            onDelete={() => {}}
            lines={noLines}
            fired={fired}
            onCleared={async () => {}}
          />
        </InMenu>
      ) : null
    }
    await act(async () => root.render(<Dashboard open />))
    await vi.waitFor(() => buttonStartingWith("ETH"))
    await act(async () => root.render(<Dashboard open={false} />))
    await act(async () => root.render(<Dashboard open />))
    expect(document.body.textContent).not.toContain("Reading fired alerts")
    expect(buttonStartingWith("ETH")).toBeTruthy()
    expect(api.loadFired).toHaveBeenCalledTimes(1)
  })
})

function buttonStartingWith(text: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent?.startsWith(text))
  if (!found) throw new Error(`Missing ${text}`)
  return found
}

function buttonWithText(text: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent === text)
  if (!found) throw new Error(`Missing ${text}`)
  return found
}

/** The confirm window's own Clear all, beside the list's button of that name. */
function confirmButton() {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button, [role="dialog"] button'
    )
  ).find((candidate) => candidate.textContent === "Clear all")
  if (!found) throw new Error("Missing the confirm window's Clear all")
  return found
}

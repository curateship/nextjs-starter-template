// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadFired: vi.fn(),
  removeFired: vi.fn(),
}))
const errors = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("@/lib/api/trade/price-alerts", () => ({
  getFiredPriceAlertDeleteErrorMessage: () =>
    "That fired alert could not be deleted. Try again.",
  getFiredPriceAlertLoadErrorMessage: () =>
    "Your fired alerts could not be loaded. Try again.",
  loadFiredPriceAlerts: api.loadFired,
  removeFiredPriceAlert: api.removeFired,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: errors.show }))

import { PriceAlertsPanel } from "@/components/trade/price-alerts-panel"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("the Alerts panel", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    api.loadFired.mockResolvedValue({ alerts: [] })
    api.removeFired.mockResolvedValue({ deleted: true })
  })

  it("shows every alert detail and keeps row and delete actions separate", async () => {
    const select = vi.fn()
    const remove = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
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
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={select}
          onDelete={remove}
        />
      )
    })

    const alertTab = host.querySelector<HTMLButtonElement>(
      '[data-slot="tabs-trigger"][data-state="active"]'
    )
    const firedTab = host.querySelector<HTMLButtonElement>(
      '[data-slot="tabs-trigger"][data-state="inactive"]'
    )
    expect(alertTab?.textContent).toContain("Alert")
    expect(alertTab?.textContent).toContain("1")
    expect(firedTab?.textContent).toContain("Fired")
    expect(firedTab?.textContent).toContain("0")
    expect(host.textContent).toContain("BTC")
    expect(host.textContent).not.toContain("$110")
    expect(host.textContent).toContain("above")

    const open = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("BTC")
    )
    const del = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete BTC alert at $110"]'
    )
    expect(del?.parentElement?.className).toContain("min-h-8")
    expect(del?.parentElement?.className).not.toContain("min-h-10")
    await act(async () => open?.click())
    await act(async () => del?.click())

    expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:BTC")
    expect(remove).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001")
    await act(async () => root.unmount())
    host.remove()
  })

  it("lists armed and fired line alerts beside the price alerts", async () => {
    const select = vi.fn()
    const switchOff = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[
            {
              id: "00000000-0000-4000-8000-000000000001",
              protocol: "hyperliquid",
              network: "mainnet",
              marketKey: "hyperliquid:mainnet:BTC",
              price: 110,
              direction: "above",
              createdAt: 5,
            },
          ]}
          error={null}
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={() => {}}
          onDelete={() => {}}
          lines={{
            armed: [
              {
                id: "line-1",
                marketKey: "hyperliquid:mainnet:ETH",
                kind: "trendline",
                price: 3_600,
                direction: "below",
                armedAt: 1,
                firedAt: null,
              },
            ],
            fired: [
              {
                id: "line-2",
                marketKey: "hyperliquid:mainnet:SOL",
                kind: "trendline",
                price: 150,
                direction: "above",
                armedAt: 1,
                firedAt: Date.now() - 60_000,
              },
            ],
            error: null,
            onRetry: () => {},
            onSelect: select,
            onSwitchOff: switchOff,
          }}
        />
      )
    })

    // Both counts include the lines: one price and one line armed, one
    // line fired.
    const tabs = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-slot="tabs-trigger"]')
    )
    expect(tabs[0]?.textContent).toContain("2")
    expect(tabs[1]?.textContent).toContain("1")

    // The line row is older, so it sits first, and it says what it is.
    const rows = Array.from(host.querySelectorAll("button")).filter(
      (button) => /ETH|BTC/.test(button.textContent ?? "")
    )
    expect(rows[0]?.textContent).toContain("ETH")
    expect(rows[0]?.textContent).toContain("trendline at $3,600 · below")

    await act(async () => rows[0]?.click())
    expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:ETH", "line-1")

    const bin = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Switch off the ETH trendline alert"]'
    )
    await act(async () => bin?.click())
    expect(switchOff).toHaveBeenCalledWith("line-1")

    await act(async () => {
      tabs[1]?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    expect(host.textContent).toContain("SOL")
    expect(host.textContent).toContain("trendline at $150 · above")
    expect(
      host.querySelector('button[aria-label="Clear the fired SOL trendline alert"]')
    ).not.toBeNull()

    await act(async () => root.unmount())
    host.remove()
  })

  it("opens a collapsed panel when either tab is pressed", async () => {
    const expand = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[]}
          error={null}
          collapsed
          onRetry={() => {}}
          onExpand={expand}
          onSelectMarket={() => {}}
          onDelete={() => {}}
        />
      )
    })

    const tabs = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    )
    await act(async () => tabs[0]?.click())
    await act(async () => tabs[1]?.click())

    expect(expand).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
    host.remove()
  })

  it("uses the raised Fired tab and opens a retired alert's market", async () => {
    const select = vi.fn()
    const firedAt = Date.now() - 60_000
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
          firedAt,
        },
      ],
    })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[]}
          error={null}
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={select}
          onDelete={() => {}}
        />
      )
    })

    const firedTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((button) => button.textContent?.includes("Fired"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    expect(api.loadFired).toHaveBeenCalledTimes(2)
    expect(firedTab?.dataset.state).toBe("active")
    expect(firedTab?.textContent).toContain("Fired")
    expect(firedTab?.textContent).toContain("1")
    expect(host.textContent).toContain("ETH")
    expect(host.textContent).toContain("below")
    expect(host.textContent).toContain("minute ago")
    expect(host.textContent).not.toContain("$90")
    expect(host.textContent).not.toContain("No alerts have fired yet")
    expect(
      host.querySelector('button[aria-label^="Delete ETH alert"]')
    ).toBeNull()

    const open = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ETH")
    )
    await act(async () => open?.click())
    expect(select).toHaveBeenCalledWith("hyperliquid:mainnet:ETH")

    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete fired ETH alert"]'
    )
    expect(remove?.parentElement?.className).toContain("min-h-8")
    expect(remove?.parentElement?.className).not.toContain("min-h-10")
    await act(async () => remove?.click())
    expect(api.removeFired).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002"
    )
    expect(host.textContent).not.toContain("ETH")
    expect(firedTab?.textContent).toContain("0")
    await act(async () => root.unmount())
    host.remove()
  })

  it("does not restore a fired alert from a refresh that overlapped its deletion", async () => {
    const alert = {
      id: "00000000-0000-4000-8000-000000000003",
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      marketKey: "hyperliquid:mainnet:SOL",
      price: 120,
      direction: "above" as const,
      createdAt: 1,
      firedAt: Date.now() - 60_000,
    }
    api.loadFired.mockResolvedValueOnce({ alerts: [alert] })
    const refresh = deferred<{ alerts: (typeof alert)[] }>()
    api.loadFired.mockReturnValueOnce(refresh.promise)
    const deletion = deferred<{ deleted: boolean }>()
    api.removeFired.mockReturnValueOnce(deletion.promise)
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[]}
          error={null}
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={() => {}}
          onDelete={() => {}}
        />
      )
    })

    const firedTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((button) => button.textContent?.includes("Fired"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete fired SOL alert"]'
    )
    await act(async () => remove?.click())
    expect(host.textContent).not.toContain("SOL")

    await act(async () => refresh.resolve({ alerts: [alert] }))
    expect(host.textContent).not.toContain("SOL")
    await act(async () => deletion.resolve({ deleted: true }))

    await act(async () => root.unmount())
    host.remove()
  })

  it("restores a fired row and explains when deletion fails", async () => {
    api.loadFired.mockResolvedValue({
      alerts: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          protocol: "hyperliquid",
          network: "mainnet",
          marketKey: "hyperliquid:mainnet:DOGE",
          price: 0.2,
          direction: "below",
          createdAt: 1,
          firedAt: Date.now() - 60_000,
        },
      ],
    })
    api.removeFired.mockRejectedValueOnce(new Error("database unavailable"))
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[]}
          error={null}
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={() => {}}
          onDelete={() => {}}
        />
      )
    })

    const firedTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((button) => button.textContent?.includes("Fired"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete fired DOGE alert"]'
    )
    await act(async () => remove?.click())

    expect(host.textContent).toContain("DOGE")
    expect(errors.show).toHaveBeenCalledWith(
      "That fired alert could not be deleted. Try again."
    )
    await act(async () => root.unmount())
    host.remove()
  })

  it("keeps known fired rows visible and reports when a refresh fails", async () => {
    api.loadFired.mockResolvedValue({
      alerts: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          protocol: "hyperliquid",
          network: "mainnet",
          marketKey: "hyperliquid:mainnet:XRP",
          price: 1,
          direction: "above",
          createdAt: 1,
          firedAt: Date.now() - 60_000,
        },
      ],
    })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <PriceAlertsPanel
          alerts={[]}
          error={null}
          collapsed={false}
          onRetry={() => {}}
          onSelectMarket={() => {}}
          onDelete={() => {}}
        />
      )
    })

    const firedTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((button) => button.textContent?.includes("Fired"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    const alertTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((button) => button.textContent?.includes("Alert"))
    await act(async () => {
      alertTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    api.loadFired.mockRejectedValueOnce(new Error("database unavailable"))
    await act(async () => {
      firedTab?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    expect(api.loadFired).toHaveBeenCalledTimes(3)

    await vi.waitFor(() => {
      expect(host.textContent).toContain("XRP")
      expect(errors.show).toHaveBeenCalledWith(
        "Your fired alerts could not be loaded. Try again.",
        expect.objectContaining({ label: "Try again" })
      )
    })
    await act(async () => root.unmount())
    host.remove()
  })
})

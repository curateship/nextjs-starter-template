// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActiveTradesDropdown } from "@/components/trade/active-trades-dropdown"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { HiddenTradeColumns } from "@/lib/trade/trades-popover-columns"

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}))

const tabStyle = vi.hoisted(() => ({ value: "pills" as "pills" | "underline" }))

// What Settings → Styling → Dashboard tabs picked, as the shell hands it down.
vi.mock("@/components/shell/shell-layout", () => ({
  useOptionalShellRuntime: () => ({
    config: { styling: { dashboardTabs: tabStyle.value } },
  }),
}))

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const snapshot: ActiveTradesSnapshot = {
  readAt: 1,
  activeTrades: [
    {
      id: "position-1",
      walletId: "wallet-1",
      walletLabel: "Main",
      accountType: "Real",
      protocol: "Hyperliquid",
      marketKey: "hyperliquid:mainnet:BTC",
      market: "BTC",
      side: "long",
      orderKind: "grid",
      value: 1_250,
      profit: 42,
      profitShare: 0.1,
    },
  ],
  activeTradesUnavailable: [],
  watchingOrders: [
    {
      id: "watch-1",
      walletId: "wallet-1",
      walletLabel: "Main",
      accountType: "Real",
      protocol: "Hyperliquid",
      marketKey: "hyperliquid:mainnet:BTC",
      market: "BTC",
      orderKind: "manual",
      waitingPrices: [{ px: 95, side: "buy", watched: true }],
      mark: 100,
      createdAt: 2,
    },
    {
      id: "ladder-1",
      walletId: "wallet-2",
      walletLabel: "Practice",
      accountType: "Practice",
      protocol: "Aster",
      marketKey: "aster:mainnet:SOLUSDT",
      market: "SOLUSDT",
      orderKind: "dca",
      waitingPrices: [{ px: 99, side: "buy" }],
      mark: 100,
      createdAt: 1,
    },
  ],
}

let host: HTMLDivElement
let root: Root
const saved: { kind: string; columns: string[] }[] = []

/** The header's part: holds the hidden columns and notes every save. */
function Dropdown() {
  const [hidden, setHidden] = React.useState<HiddenTradeColumns>({})
  return (
    <ActiveTradesDropdown
      snapshot={snapshot}
      hidden={hidden}
      onHiddenChange={(kind, columns) => {
        saved.push({ kind, columns })
        setHidden((was) => ({ ...was, [kind]: columns }))
      }}
    />
  )
}

beforeEach(async () => {
  tabStyle.value = "pills"
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  saved.length = 0
  await act(async () =>
    root.render(
      <TooltipProvider>
        <Dropdown />
      </TooltipProvider>
    )
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (one) => one.textContent?.trim() === name
  )
  if (!found) throw new Error(`Button not found: ${name}`)
  return found
}

function headings(): string[] {
  return Array.from(host.querySelectorAll("thead th")).map(
    (heading) => heading.textContent ?? ""
  )
}

async function click(name: string): Promise<void> {
  await act(async () => {
    button(name).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function chooseTab(name: string): Promise<void> {
  await act(async () => {
    button(name).dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        ctrlKey: false,
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("the active-trades dropdown", () => {
  it("switches between open positions and every kind of watched order", async () => {
    expect(button("Active trades1").getAttribute("data-state")).toBe("active")
    expect(headings()).toEqual(["Ticker", "Type", "Order", "Value", "P/L"])
    expect(host.querySelector("tbody")?.textContent).toContain("Grid")

    await chooseTab("Watching2")

    expect(headings()).toEqual(["Ticker", "Order", "Wallet", "Distance"])
    expect(host.querySelector("tbody")?.textContent).toContain("Manual")
    expect(host.querySelector("tbody")?.textContent).toContain("DCA ladder")
    expect(host.querySelector("tbody")?.textContent).toContain("Practice")
  })

  it("shows percentage distances and sorts the nearest waiting order first", async () => {
    await chooseTab("Watching2")
    expect(host.querySelector("tbody")?.textContent).toContain("5.26% away")
    expect(host.querySelector("tbody")?.textContent).toContain("1.01% away")
    await click("Distance")
    expect(host.querySelector("tbody tr")?.textContent).toContain("SOLUSDT")
    await click("Distance")
    expect(host.querySelector("tbody tr")?.textContent).toContain("BTC")
  })

  it("uses checked choices to include more than one exchange", async () => {
    await chooseTab("Watching2")
    await click("Filter")

    expect(button("Aster1").getAttribute("aria-checked")).toBe("true")
    expect(button("Hyperliquid1").getAttribute("aria-checked")).toBe("true")

    await click("Aster1")

    expect(button("Filter (1)")).toBeTruthy()
    expect(host.querySelector("tbody")?.textContent).toContain("BTC")
    expect(host.querySelector("tbody")?.textContent).not.toContain("SOLUSDT")
  })

  it("hides a column from the ⋮, in the rows and the Total row alike", async () => {
    await act(async () => {
      const more = host.querySelector<HTMLButtonElement>('button[aria-label="Columns"]')
      if (!more) throw new Error("No ⋮")
      more.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      const row = document.querySelector<HTMLElement>('[aria-label="Hide Value"]')
      if (!row) throw new Error("No Value row")
      row.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(saved).toEqual([{ kind: "active", columns: ["value"] }])
    expect(headings()).toEqual(["Ticker", "Type", "Order", "P/L"])
    expect(host.querySelectorAll("tbody tr:first-child td")).toHaveLength(4)
    expect(host.querySelectorAll("tfoot td")).toHaveLength(4)
    expect(host.querySelector("tfoot")?.textContent).toContain("+$42.00")
  })

  it("draws its tabs the way the Dashboard tabs setting says", async () => {
    expect(host.querySelectorAll('[data-slot="dashboard-tab"]')).toHaveLength(0)
    expect(host.querySelectorAll('[data-slot="tabs-trigger"]')).toHaveLength(2)

    tabStyle.value = "underline"
    await act(async () =>
      root.render(
        <TooltipProvider>
          <Dropdown />
        </TooltipProvider>
      )
    )

    const tabs = host.querySelectorAll('[data-slot="dashboard-tab"]')
    expect(Array.from(tabs).map((tab) => tab.textContent)).toEqual([
      "Active trades1",
      "Watching2",
    ])
  })
})

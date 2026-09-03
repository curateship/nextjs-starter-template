// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActiveTradesDropdown } from "@/components/trade/active-trades-dropdown"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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
      createdAt: 1,
    },
  ],
}

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(<ActiveTradesDropdown snapshot={snapshot} />)
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

    expect(headings()).toEqual(["Ticker", "Order", "Wallet"])
    expect(host.querySelector("tbody")?.textContent).toContain("Manual")
    expect(host.querySelector("tbody")?.textContent).toContain("DCA ladder")
    expect(host.querySelector("tbody")?.textContent).toContain("Practice")
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
})

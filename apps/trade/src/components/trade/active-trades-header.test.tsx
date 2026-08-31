// @vitest-environment jsdom

import { act } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loadActiveTradesHeader } = vi.hoisted(() => ({
  loadActiveTradesHeader: vi.fn(),
}))

vi.mock("@/lib/api/trade/active-trades-header", () => ({
  loadActiveTradesHeader,
}))

vi.mock("@/components/trade/active-trades-widget", () => ({
  ActiveTradesWidget: ({ headerAction }: { headerAction?: ReactNode }) => (
    <div>{headerAction}</div>
  ),
}))

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { default: ActiveTradesHeader } =
  await import("@/components/trade/active-trades-header")

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  loadActiveTradesHeader.mockResolvedValue({
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
        value: 1_250,
        profit: -42,
        profitShare: -0.0336,
      },
    ],
    activeTradesUnavailable: [],
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("the Active Trades header", () => {
  it("hides and restores the header profit from the eye button", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$1,250")
    expect(trigger?.textContent).toContain("-$42")

    const hide = host.querySelector<HTMLButtonElement>(
      '[aria-label="Hide header profit and loss"]'
    )
    await act(async () => hide?.click())

    expect(trigger?.textContent).toContain("$1,250")
    expect(trigger?.textContent).not.toContain("-$42")
    expect(trigger?.getAttribute("aria-label")).toContain(
      "profit and loss hidden"
    )

    const show = host.querySelector<HTMLButtonElement>(
      '[aria-label="Show header profit and loss"]'
    )
    expect(show?.getAttribute("aria-pressed")).toBe("true")
    await act(async () => show?.click())

    expect(trigger?.textContent).toContain("-$42")
  })
})

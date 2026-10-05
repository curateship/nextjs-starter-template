// @vitest-environment jsdom

import { act } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setHidePnl } from "@/lib/trade/hide-pnl"

const { loadActiveTradesHeader, loadLastHeaderFigures } = vi.hoisted(() => ({
  loadActiveTradesHeader: vi.fn(),
  // Nothing remembered by default, so every test below still measures the
  // button with only its own read behind it.
  loadLastHeaderFigures: vi.fn<
    () => Promise<{ value: string; profit: string; profitValue: number } | null>
  >(async () => null),
}))

vi.mock("@/lib/api/trade/active-trades-header", () => ({
  loadActiveTradesHeader,
  loadLastHeaderFigures,
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

vi.mock("@/components/trade/active-trades-dropdown", () => ({
  ActiveTradesDropdown: () => <div />,
}))

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => (
    <div data-testid="active-trades-popover" className={className}>
      {children}
    </div>
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
    snapshot: {
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
          orderKind: "manual",
          value: 1_250,
          profit: -42,
          profitShare: -0.0336,
        },
      ],
      activeTradesUnavailable: [],
      watchingOrders: [],
    },
  })
  setHidePnl(false)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("the Active Trades header", () => {
  it("renders for members as well as admins", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="member" />))

    expect(
      host.querySelector("[data-active-trades-header-trigger]")
    ).not.toBeNull()
  })

  it("grows with its rows until the middle of the screen", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    const popover = host.querySelector<HTMLElement>(
      '[data-testid="active-trades-popover"]'
    )
    expect(popover?.className).toContain(
      "max-h-[var(--radix-popover-content-available-height)]"
    )
    expect(
      popover?.className.split(" ").some((name) => name.startsWith("h-["))
    ).toBe(false)
  })

  it("shows loading until the header read finishes", async () => {
    loadActiveTradesHeader.mockReturnValueOnce(new Promise(() => {}))

    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    expect(host.textContent).toContain("Reading active trades")
    expect(host.textContent).not.toContain("Try again")
  })

  it("shows the figures it last knew while the exchanges are still being read", async () => {
    // The one Tyler asked for, 4 October 2026: "Just show the old numbers until
    // theres a new one." A read where a venue stays quiet has no total in it,
    // and after a reload there is nothing in memory to fall back on, so the
    // button sat on two dashes for 26 seconds. The last complete pair comes
    // from the server instead, and lands long before the exchanges answer.
    loadActiveTradesHeader.mockReturnValueOnce(new Promise(() => {}))
    loadLastHeaderFigures.mockResolvedValueOnce({
      value: "$5,439",
      profit: "-$2",
      profitValue: -2.31,
    })

    await act(async () => root.render(<ActiveTradesHeader role="admin" />))
    await act(async () => undefined)

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$5,439")
    expect(trigger?.textContent).toContain("-$2")
    expect(trigger?.textContent).not.toContain("—")
  })

  it("never puts an old total back over a fresh one", async () => {
    // The remembered pair can answer after the real read. It only ever fills
    // figures that are still empty, so a late answer cannot undo a live total.
    loadActiveTradesHeader.mockResolvedValueOnce({
      snapshot: {
        activeTrades: [{ value: 1000, profit: 16, profitShare: 1.6 }],
        activeTradesUnavailable: [],
        watchingOrders: [],
        watchingUnavailable: [],
      },
    })
    loadLastHeaderFigures.mockResolvedValueOnce({
      value: "$5,439",
      profit: "-$2",
      profitValue: -2.31,
    })

    await act(async () => root.render(<ActiveTradesHeader role="admin" />))
    await act(async () => undefined)

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$1,000")
    expect(trigger?.textContent).not.toContain("$5,439")
  })

  it("retries a failed read and replaces the error with trades", async () => {
    loadActiveTradesHeader.mockRejectedValueOnce(new Error("Unavailable"))

    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    expect(host.textContent).toContain("Active trades could not be read.")
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again"
    )
    expect(retry).toBeDefined()
    await act(async () => retry?.click())

    expect(host.textContent).not.toContain("Active trades could not be read.")
    expect(host.textContent).toContain("$1,250")
  })

  it("blurs the header profit while the switch is on, keeping its place", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$1,250")
    expect(trigger?.textContent).toContain("-$42")

    await act(async () => setHidePnl(true))

    // Still there and still the same width — frosted, not removed. A figure
    // that vanished would move the controls beside it every time.
    expect(trigger?.textContent).toContain("-$42")
    expect(host.querySelector(".blur-\\[5px\\]")).not.toBeNull()

    await act(async () => setHidePnl(false))
    expect(host.querySelector(".blur-\\[5px\\]")).toBeNull()
  })

  it("keeps the last figures when an exchange stops answering", async () => {
    vi.useFakeTimers()
    try {
      await act(async () => root.render(<ActiveTradesHeader role="admin" />))
      const trigger = host.querySelector<HTMLButtonElement>(
        "[data-active-trades-header-trigger]"
      )
      expect(trigger?.textContent).toContain("$1,250")

      // The next read comes back with the exchange missing, which has no
      // total to draw. The button holds the one it had rather than blanking
      // to dashes (Tyler, 29 Sep 2026).
      loadActiveTradesHeader.mockResolvedValue({
        snapshot: {
          readAt: 2,
          activeTrades: [],
          activeTradesUnavailable: ["Hyperliquid"],
          watchingOrders: [],
        },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      expect(trigger?.textContent).toContain("$1,250")
      expect(trigger?.textContent).toContain("-$42")
    } finally {
      vi.useRealTimers()
    }
  })

  it("has no eye button of its own any more", async () => {
    // One switch, in the header's settings cog, for every figure in the app.
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))
    expect(
      host.querySelector('[aria-label="Hide header profit and loss"]')
    ).toBeNull()
  })
})

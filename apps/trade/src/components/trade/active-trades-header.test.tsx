// @vitest-environment jsdom

import { act } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loadActiveTradesHeader, saveHeaderProfitVisibility } = vi.hoisted(
  () => ({
    loadActiveTradesHeader: vi.fn(),
    saveHeaderProfitVisibility: vi.fn(),
  })
)

vi.mock("@/lib/api/trade/active-trades-header", () => ({
  loadActiveTradesHeader,
  saveHeaderProfitVisibility,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

vi.mock("@/components/trade/active-trades-dropdown", () => ({
  ActiveTradesDropdown: ({ headerAction }: { headerAction?: ReactNode }) => (
    <div>{headerAction}</div>
  ),
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
    headerProfitVisible: true,
  })
  saveHeaderProfitVisibility.mockResolvedValue({ saved: true })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("the Active Trades header", () => {
  it("grows with its rows until the middle of the screen", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    const popover = host.querySelector<HTMLElement>(
      '[data-testid="active-trades-popover"]'
    )
    expect(popover?.className).toContain("max-h-[calc(50vh-4rem)]")
    expect(
      popover?.className.split(" ").some((name) => name.startsWith("h-["))
    ).toBe(false)
  })

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
    expect(saveHeaderProfitVisibility).toHaveBeenCalledWith(false)

    const show = host.querySelector<HTMLButtonElement>(
      '[aria-label="Show header profit and loss"]'
    )
    expect(show?.getAttribute("aria-pressed")).toBe("true")
    await act(async () => show?.click())

    expect(trigger?.textContent).toContain("-$42")
    expect(saveHeaderProfitVisibility).toHaveBeenLastCalledWith(true)
  })

  it("opens with the account's saved hidden choice", async () => {
    loadActiveTradesHeader.mockResolvedValueOnce({
      ...(await loadActiveTradesHeader()),
      headerProfitVisible: false,
    })

    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$1,250")
    expect(trigger?.textContent).not.toContain("-$42")
  })

  it("follows the eye choice restored by a named layout", async () => {
    await act(async () => root.render(<ActiveTradesHeader role="admin" />))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("trade-header-profit-visibility", { detail: false })
      )
    })

    const trigger = host.querySelector<HTMLButtonElement>(
      "[data-active-trades-header-trigger]"
    )
    expect(trigger?.textContent).toContain("$1,250")
    expect(trigger?.textContent).not.toContain("-$42")
    expect(saveHeaderProfitVisibility).not.toHaveBeenCalled()
  })
})

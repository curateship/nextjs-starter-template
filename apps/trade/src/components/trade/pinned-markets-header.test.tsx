// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), userId: "" }))
vi.mock("@/lib/api/trade/pinned-markets", () => ({
  loadHeaderPinnedMarkets: api.load,
  saveHeaderPinnedMarket: api.save,
}))
vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: api.userId } }) }),
  Link: ({
    to,
    children,
    ...props
  }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
import PinnedMarketsHeader from "@/components/trade/pinned-markets-header"
import { PinnedMarketButton } from "@/components/trade/pinned-market-button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { showErrorToast } from "@/lib/toast/error-toast"

const key = (symbol: string) => `hyperliquid:mainnet:${symbol}`
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let pins: string[]
let serial = 0
const snapshot = () => ({
  pins,
  quotes: pins.map((key) => ({
    key,
    symbol: key.split(":")[2],
    price: 61240,
    change24h: 0.012,
  })),
})
async function mount(symbol = "BTC") {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <PinnedMarketsHeader role="admin" fallback={<a href="/home">Home</a>} />
        <PinnedMarketButton marketKey={key(symbol)} />
      </TooltipProvider>
    )
  })
}
async function click(label: string) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )
  expect(button).not.toBeNull()
  await act(async () => {
    button!.click()
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.clearAllMocks()
  api.userId = `pins-test-${++serial}`
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
  pins = []
  api.load.mockImplementation(async () => snapshot())
  api.save.mockImplementation(async (marketKey: string, pinned: boolean) => {
    pins = pinned
      ? [...pins, marketKey]
      : pins.filter((pin) => pin !== marketKey)
    return { pins, error: null }
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe("header market pins", () => {
  it("loads a saved list once and waits for the next scheduled refresh", async () => {
    pins = [key("BTC")]
    await mount()
    expect(api.load).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(api.load).toHaveBeenCalledTimes(2)
  })
  it("does not restore a removed pin when an older read finishes", async () => {
    pins = [key("BTC")]
    await mount()
    const old = snapshot()
    let finish!: (value: ReturnType<typeof snapshot>) => void
    api.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    await click("Unpin BTC, hyperliquid, mainnet from header")
    await act(async () => { finish(old) })
    expect(host.querySelector('a[aria-label^="Open BTC"]')).toBeNull()
    expect(host.textContent).toContain("Home")
  })
  it("keeps the normal navigation beside the pins, and pins and unpins", async () => {
    await mount()
    expect(host.textContent).toContain("Home")
    await click("Pin to header")
    // A pin is ADDED to the header, it does not take the section's links out
    // of it. Both are there at once.
    expect(host.textContent).toContain("Home")
    // The chip carries the day's change and no price; the price is left to
    // the tooltip, which is not rendered until it opens.
    expect(host.textContent).toContain("+1.20%")
    expect(host.textContent).not.toContain("$61,240")
    expect(
      host.querySelector('a[aria-label^="Open BTC"]')?.getAttribute("href")
    ).toBe("/protocols/hyper-liquid?market=hyperliquid%3Amainnet%3ABTC")
    expect(
      host
        .querySelector('[aria-label="Unpin from header"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true")
    expect(
      host
        .querySelector('[aria-label="Unpin from header"] svg')
        ?.getAttribute("class")
    ).toContain("fill-amber-500")
    await click("Unpin BTC, hyperliquid, mainnet from header")
    expect(host.textContent).toContain("Home")
    expect(host.textContent).not.toContain("+1.20%")
  })
  it("pushes the pins to the far right of the header", async () => {
    await mount()
    await click("Pin to header")
    // The chips sit against the right-hand controls rather than trailing the
    // navigation links, so neither moves when the other changes length.
    const chips = host.querySelector('[aria-label="Pinned markets"]')
    expect(chips?.closest("[data-slot='scroll-area']")?.className).toContain(
      "ml-auto"
    )
  })
  it("names five existing pins when a sixth is attempted without saving", async () => {
    pins = ["BTC", "ETH", "SOL", "DOGE", "AVAX"].map(key)
    await mount("XRP")
    await click("Pin to header")
    expect(api.save).not.toHaveBeenCalled()
    expect(showErrorToast).toHaveBeenCalledWith(
      expect.stringContaining("BTC, ETH, SOL, DOGE, AVAX")
    )
  })
  it("replaces a failed figure with a dash and stops polling while hidden", async () => {
    pins = [key("BTC")]
    await mount()
    api.load.mockRejectedValue(new Error("offline"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(host.textContent).not.toContain("+1.20%")
    expect(host.textContent).toContain("—")
    const reads = api.load.mock.calls.length
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(45000)
    })
    expect(api.load).toHaveBeenCalledTimes(reads)
    api.load.mockImplementation(async () => snapshot())
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(host.textContent).toContain("+1.20%")
  })

  it("keeps the percentage on screen while the next read is in flight", async () => {
    pins = [key("BTC")]
    await mount()
    expect(host.textContent).toContain("+1.20%")
    // A read that has left but not landed. The chip must still show the
    // figure it had: blanking it here is what made the row shrink and jump
    // every fifteen seconds.
    let finish!: (value: ReturnType<typeof snapshot>) => void
    api.load.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("+1.20%")
    expect(host.textContent).not.toContain("—")

    const next = snapshot()
    next.quotes[0].change24h = -0.034
    await act(async () => {
      finish(next)
    })
    expect(host.textContent).toContain("-3.40%")
    expect(host.textContent).not.toContain("+1.20%")
  })
  it("picks up pins changed by another browser on the next refresh", async () => {
    pins = [key("BTC")]
    await mount()
    pins = [key("ETH")]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(host.querySelector('a[aria-label^="Open BTC"]')).toBeNull()
    expect(host.querySelector('a[aria-label^="Open ETH"]')).not.toBeNull()
  })
  it("rolls a refused save back and leaves a retry for an initial read failure", async () => {
    api.load.mockRejectedValueOnce(new Error("offline"))
    await mount()
    expect(host.textContent).toContain("Retry header pins")
    await act(async () => {
      ;[...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Retry header pins")!
        .click()
    })
    api.save.mockRejectedValueOnce(new Error("offline"))
    await click("Pin to header")
    expect(host.textContent).toContain("Home")
    expect(showErrorToast).toHaveBeenCalledWith(
      "The header pin could not be saved. Try again."
    )
  })
})

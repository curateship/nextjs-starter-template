// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PriceConverter } from "@/components/free-tools/price-converter"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ConverterPrices } from "@/lib/free-tools/price-converter"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: unknown }) => children,
}))
vi.mock("@/lib/api/trade/price-converter", () => ({
  readConverterPrices: vi.fn(),
}))

const PRICES: ConverterPrices = {
  exchange: "Hyperliquid",
  coins: [
    { symbol: "BTC", price: 64_000, ownPage: true },
    { symbol: "NEWCOIN", price: null, ownPage: false },
  ],
  ageMs: 3_000,
}

let root: Root
let host: HTMLDivElement

function draw(prices: ConverterPrices, symbol: string) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <TooltipProvider>
        <PriceConverter prices={prices} symbol={symbol} signedIn />
      </TooltipProvider>
    )
  })
}

describe("the price converter's answer", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it("names the exchange and the age, and marks the price old past a minute", () => {
    draw(PRICES, "BTC")
    expect(host.textContent).toContain("1 BTC at $64,000 = $64,000.00")
    expect(host.textContent).toContain(
      "Hyperliquid price for one BTC: $64,000, read 3 seconds ago."
    )
    expect(host.textContent).not.toContain("Old price.")

    act(() => vi.advanceTimersByTime(58_000))
    expect(host.textContent).toContain("read 1 minute ago.")
    expect(host.textContent).toContain("Old price.")
  })

  it("shows a dash for a coin with no price", () => {
    draw(PRICES, "NEWCOIN")
    const answer = host.querySelector<HTMLInputElement>("#convert-answer")
    expect(answer?.value).toBe("—")
    expect(host.textContent).toContain(
      "Hyperliquid has not sent a price for NEWCOIN yet, so there is no answer."
    )
    expect(host.textContent).toContain("Hyperliquid price for one NEWCOIN: —")
  })

  it("says so when the exchange has sent nothing since the server started", () => {
    draw({ ...PRICES, ageMs: null }, "BTC")
    expect(host.textContent).toContain("no price received yet.")
  })
})

// @vitest-environment jsdom

import { act } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { MarketSearchAnswer } from "@/lib/trade/market-search"

const { searchAllMarkets } = vi.hoisted(() => ({
  searchAllMarkets: vi.fn(),
}))

vi.mock("@/lib/api/trade/market-search", () => ({ searchAllMarkets }))

// The panel's own look belongs to the shell. These tests are about what the
// rows say and which search is believed, so the popover is a plain box here.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="market-search-panel">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { default: MarketSearchHeader } =
  await import("@/components/trade/market-search-header")

function answer(
  hits: MarketSearchAnswer["hits"],
  rest: Partial<MarketSearchAnswer> = {}
): MarketSearchAnswer {
  return { hits, more: 0, unavailable: [], ...rest }
}

function hit(symbol: string, protocolLabel: string, protocol = "hyperliquid") {
  return {
    key: `${protocol}:mainnet:${symbol}`,
    symbol,
    protocol: protocol as MarketSearchAnswer["hits"][number]["protocol"],
    protocolLabel,
    subExchange: null,
    href: `/${protocol}?market=${protocol}%3Amainnet%3A${symbol}`,
  }
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  searchAllMarkets.mockReset()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function field() {
  const found = host.querySelector("input")
  if (!found) throw new Error("The search field was not drawn.")
  return found
}

// React keeps its own record of a controlled input's value, so assigning
// `input.value` updates that record too and the change event is then dropped as
// "nothing new". The setter off the prototype writes the DOM without touching
// React's record, which is what a real keystroke looks like.
const writeValue = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set

async function type(words: string) {
  const input = field()
  await act(async () => {
    writeValue?.call(input, words)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function rows() {
  return [...host.querySelectorAll('[role="option"]')].map((row) =>
    [...row.children].map((part) => part.textContent)
  )
}

it("shows the ticker and the exchange it belongs to, one search per word", async () => {
  searchAllMarkets.mockResolvedValue(
    answer([hit("BTC", "Hyperliquid"), hit("BTC", "Binance", "binance")])
  )
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("bt")
  await type("btc")
  // Nothing has gone out yet: the field waits for the typing to stop.
  expect(searchAllMarkets).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTimeAsync(250))
  expect(searchAllMarkets.mock.calls).toEqual([["btc"]])
  expect(rows()).toEqual([
    ["BTC", "Hyperliquid"],
    ["BTC", "Binance"],
  ])
})

it("keeps the newest list when an older search answers late", async () => {
  let answerBt: (value: MarketSearchAnswer) => void = () => {}
  searchAllMarkets.mockImplementation((query: string) =>
    query === "bt"
      ? new Promise<MarketSearchAnswer>((resolve) => {
          answerBt = resolve
        })
      : Promise.resolve(answer([hit("BTC", "Hyperliquid")]))
  )
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("bt")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  await type("btc")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  expect(rows()).toEqual([["BTC", "Hyperliquid"]])

  // The slow answer for "bt" lands last and must change nothing.
  await act(async () => {
    answerBt(answer([hit("BTT", "KuCoin", "kucoin")]))
  })
  expect(rows()).toEqual([["BTC", "Hyperliquid"]])
})

it("says which exchanges did not answer, and how many matches were left out", async () => {
  searchAllMarkets.mockResolvedValue(
    answer([hit("SOL", "Hyperliquid")], {
      more: 12,
      unavailable: ["Aster", "Binance"],
    })
  )
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("sol")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  expect(host.textContent).toContain("12 more matches")
  expect(host.textContent).toContain("Aster, Binance did not answer.")
})

it("explains a failed search and tries again when asked", async () => {
  searchAllMarkets.mockRejectedValue(new Error("Unavailable"))
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("sol")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  expect(host.textContent).toContain("The markets could not be searched.")

  searchAllMarkets.mockResolvedValue(answer([hit("SOL", "Hyperliquid")]))
  const retry = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Try again")
  )
  if (!retry) throw new Error("The failed search offered no Try again.")
  await act(async () => retry.click())
  expect(rows()).toEqual([["SOL", "Hyperliquid"]])
})

it("says a search is running while the rows still answer older words", async () => {
  let answerBtc: (value: MarketSearchAnswer) => void = () => {}
  searchAllMarkets.mockImplementation((query: string) =>
    query === "bt"
      ? Promise.resolve(answer([hit("BTT", "KuCoin", "kucoin")]))
      : new Promise<MarketSearchAnswer>((resolve) => {
          answerBtc = resolve
        })
  )
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("bt")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  await type("btc")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  // The older rows are still there, and the panel says why.
  expect(rows()).toEqual([["BTT", "KuCoin"]])
  expect(host.textContent).toContain("Searching every exchange")

  await act(async () => {
    answerBtc(answer([hit("BTC", "Hyperliquid")]))
  })
  expect(rows()).toEqual([["BTC", "Hyperliquid"]])
  expect(host.textContent).not.toContain("Searching every exchange")
})

// A cmd-, ctrl-, shift- or alt-click is a request for another tab. Cancelling it
// would open the market in this one and lose the tab the person meant to keep.
it("leaves a cmd-click to the browser", async () => {
  searchAllMarkets.mockResolvedValue(answer([hit("BTC", "Hyperliquid")]))
  await act(async () => root.render(<MarketSearchHeader role="member" />))

  await type("btc")
  await act(async () => vi.advanceTimersByTimeAsync(250))
  const row = host.querySelector('[role="option"]')
  if (!row) throw new Error("No market row was drawn.")
  expect(row.getAttribute("href")).toBe(
    "/hyperliquid?market=hyperliquid%3Amainnet%3ABTC"
  )

  const held = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    metaKey: true,
  })
  await act(async () => {
    row.dispatchEvent(held)
  })
  expect(held.defaultPrevented).toBe(false)

  // A plain click is the one the field handles itself. jsdom cannot navigate, so
  // it logs "Not implemented: navigation to another Document" and the cancelled
  // event is the proof.
  const plain = new MouseEvent("click", { bubbles: true, cancelable: true })
  await act(async () => {
    row.dispatchEvent(plain)
  })
  expect(plain.defaultPrevented).toBe(true)
})

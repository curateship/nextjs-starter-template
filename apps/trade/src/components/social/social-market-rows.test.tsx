// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SocialMarketRows } from "@/components/social/social-market-rows"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"

/**
 * The grouped markets list, which is the one screen stocks changed.
 *
 * Driven here rather than in the browser because no post Trade holds names a
 * stock yet, so a real creator's panel cannot show a stock group. The browser
 * check proved the switch, the save and that a coin-only panel is unchanged.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function draw(rows: SocialMarketRow[], now: number) {
  act(() => {
    root.render(
      <SocialMarketRows
        rows={rows}
        selected={null}
        onSelect={vi.fn()}
        now={now}
      />
    )
  })
}

const coin = (market: string, posts: number): SocialMarketRow => ({
  market,
  kind: "coin",
  marketKey: `hyperliquid:mainnet:${market}`,
  posts,
})

const stock = (market: string, posts: number): SocialMarketRow => ({
  market,
  kind: "stock",
  marketKey: `edgex:mainnet:${market}USDC`,
  posts,
})

const gold: SocialMarketRow = {
  market: "XAU",
  kind: "commodity",
  marketKey: "edgex:mainnet:XAUUSDC",
  posts: 2,
}

/** Wednesday 09:45 New York, so the US market is open. */
const IN_HOURS = Date.UTC(2026, 6, 1, 13, 45)
/** Sunday 03:00 New York, so it is shut until Monday. */
const SUNDAY = Date.UTC(2026, 6, 5, 7, 0)

const words = () => host.textContent ?? ""
const tickers = () =>
  [...host.querySelectorAll("button[aria-pressed]")].map((button) =>
    (button.textContent ?? "").trim()
  )

describe("the grouped markets list", () => {
  it("heads nothing when every row is a coin", () => {
    draw([coin("SOL", 4), coin("ETH", 2)], IN_HOURS)

    expect(words()).not.toContain("Coins")
    expect(tickers()).toEqual(["$SOL4", "$ETH2"])
  })

  it("heads each kind once there is more than one", () => {
    draw([coin("SOL", 4), stock("TSLA", 3), gold], IN_HOURS)

    expect(words()).toContain("Coins")
    expect(words()).toContain("Stocks")
    expect(words()).toContain("Metals and oil")
  })

  it("puts the coins first, whatever order the rows arrive in", () => {
    draw([stock("TSLA", 9), coin("SOL", 1)], IN_HOURS)

    expect(tickers()).toEqual(["$SOL1", "$TSLA9"])
  })

  it("says nothing about hours while the market is open", () => {
    draw([coin("SOL", 4), stock("TSLA", 3)], IN_HOURS)

    expect(words()).not.toContain("Shut")
  })

  it("says when a shut market next opens, once per group", () => {
    draw([coin("SOL", 4), stock("TSLA", 3), stock("NVDA", 1)], SUNDAY)

    expect(words()).toContain("Shut, opens Mon 09:30 New York")
    expect(words().match(/Shut, opens/g)).toHaveLength(1)
  })

  it("never says a coin is shut", () => {
    draw([coin("SOL", 4), stock("TSLA", 3)], SUNDAY)

    // The Coins heading's own words are the word Coins and nothing else, while
    // the Stocks heading beside it is carrying the shut notice.
    const headings = [...host.querySelectorAll("div")]
      .map((one) => (one.textContent ?? "").trim())
      .filter((text) => text.startsWith("Coins"))
    expect(headings).toContain("Coins")
  })
})

import { describe, expect, it } from "vitest"

import type { LiveFill } from "@/lib/trade/live-trades"
import { fillOwnersFrom, type OwnerLadder } from "@/server/trade/fill-owners"
import { tradeMaker } from "@/lib/trade/trade-maker"

function fill(orderId: string, at: number, marketKey = "hyperliquid:mainnet:BTC"): LiveFill {
  return {
    fillId: `${orderId}-fill`,
    orderId,
    walletId: "w1",
    marketKey,
    side: "buy",
    px: 100,
    sz: 1,
    at,
    closedPnl: 0,
    fee: 0,
    dir: "Open Long",
    liquidation: false,
  }
}

function ladder(input: Partial<OwnerLadder> & Pick<OwnerLadder, "id" | "kind" | "createdAt">): OwnerLadder {
  return {
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    status: "active",
    flowRunId: null,
    updatedAt: input.createdAt,
    ...input,
  }
}

describe("who placed each fill", () => {
  it("gives a fill to the smart order working its coin at that moment", () => {
    const [dca, grid, hand] = fillOwnersFrom(
      [fill("a", 150), fill("b", 450), fill("c", 50)],
      [
        ladder({ id: "dca-1", kind: "dca", createdAt: 100, status: "done", updatedAt: 200 }),
        ladder({ id: "grid-1", kind: "grid", createdAt: 400 }),
      ],
      []
    )
    expect(dca.owner).toEqual({ kind: "dca", ladderId: "dca-1", flowRunId: null })
    expect(grid.owner).toEqual({ kind: "grid", ladderId: "grid-1", flowRunId: null })
    // Before any smart order was placed: by hand, with nothing on it.
    expect(hand.owner).toBeUndefined()
  })

  it("leaves a fill after a finished order ended, and on another coin, as placed by hand", () => {
    const [after, other] = fillOwnersFrom(
      [fill("a", 300), fill("b", 150, "hyperliquid:mainnet:ETH")],
      [ladder({ id: "dca-1", kind: "dca", createdAt: 100, status: "done", updatedAt: 200 })],
      []
    )
    expect(after.owner).toBeUndefined()
    expect(other.owner).toBeUndefined()
  })

  it("matches a bot's order exactly by its order id", () => {
    const [botFill] = fillOwnersFrom(
      [fill("bot-order", 50)],
      [ladder({ id: "sig-1", kind: "signal", createdAt: 10, flowRunId: "run-9" })],
      [{ walletId: "w1", orderId: "bot-order", flowRunId: "run-9", ladderId: "sig-1" }]
    )
    expect(botFill.owner).toEqual({ kind: "signal", ladderId: "sig-1", flowRunId: "run-9" })
    expect(tradeMaker([botFill])).toBe("bot")
  })
})

describe("who placed a trade", () => {
  it("names a copy first, then a bot, then the smart order, else by hand", () => {
    const grid = { owner: { kind: "grid" as const, ladderId: "g", flowRunId: null } }
    const watch = { owner: { kind: "watch" as const, ladderId: "w", flowRunId: null } }
    expect(tradeMaker([grid], "sam")).toBe("copied")
    expect(tradeMaker([grid])).toBe("grid")
    // A watched price is a plain order waiting to go out.
    expect(tradeMaker([watch])).toBe("hand")
    expect(tradeMaker([{}])).toBe("hand")
  })
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CloseAllChoices,
  type CloseAllPick,
} from "@/components/trade/close-all-menu"
import type { TradeOrder, TradePosition } from "@/lib/trade/paper"
import type { SmartGrid, SmartLadder } from "@/lib/trade/smart-plan"

/**
 * The list Close all opens, and the words under it.
 *
 * These are about the WORDS, because the words are the whole safety of this
 * button. Somebody presses it in a fast market, reads a line, and presses
 * again. Three things it must say, and each is reasonable to assume the other
 * way round: stopping a ladder sells nothing, a cancelled ladder loses its
 * plan, and an order still waiting can buy straight back in.
 * Real money has to carry its figure.
 *
 * They are also about the ticks: what is unticked must never be described as
 * about to happen.
 */

function ladder(id: string, kind: "dca" | "grid", walletId: string) {
  return {
    id,
    walletId,
    marketKey: `hyperliquid:mainnet:${id}`,
    status: "active",
    flowRunId: null,
    createdAt: 1,
    updatedAt: 1,
    kind,
    plan: {},
  } as unknown as SmartLadder | SmartGrid
}

function position(
  marketKey: string,
  walletId: string,
  real = false
): TradePosition {
  return {
    id: `${walletId}:${marketKey}`,
    walletId,
    marketKey,
    // 100 coins at $1 each — $100 of cost, and no live price in the store, so
    // the entry price is what the dollars are worked out from.
    szi: 100,
    entryPx: 1,
    leverage: 1,
    maxLeverage: 10,
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
    ...(real ? { live: { liquidationPx: null } } : {}),
  } as TradePosition
}

function watch(id: string, walletId: string): TradeOrder {
  return {
    id,
    walletId,
    marketKey: `hyperliquid:mainnet:${id}`,
    side: "buy",
    px: 1,
    sz: 1,
    leverage: 1,
    maxLeverage: 10,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
    createdAt: 1,
    updatedAt: 1,
    watched: true,
  } as TradeOrder
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const ALL: CloseAllPick = { positions: true, watched: true, smart: true }

async function ask(input: {
  positions?: TradePosition[]
  managed?: number
  watched?: TradeOrder[]
  smart?: (SmartLadder | SmartGrid)[]
  restingOrders?: number
  realWallets?: string[]
  picked?: CloseAllPick
  onConfirm?: (doing: CloseAllPick) => void
}) {
  await act(async () => {
    root.render(
      <CloseAllChoices
        positions={input.positions ?? []}
        managed={input.managed ?? 0}
        watched={input.watched ?? []}
        smart={input.smart ?? []}
        restingOrders={input.restingOrders ?? 0}
        markets={new Map()}
        realWallets={new Set(input.realWallets ?? [])}
        picked={input.picked ?? ALL}
        onPick={() => {}}
        onConfirm={input.onConfirm ?? (() => {})}
      />
    )
  })
  const rows = [...host.querySelectorAll("label")].map((one) => {
    const line = one.parentElement
    return {
      label: one.textContent?.trim() ?? "",
      count: line?.lastElementChild?.textContent?.trim() ?? "",
      ticked:
        line?.querySelector("[data-slot=checkbox]")?.getAttribute("aria-checked") ===
        "true",
    }
  })
  return { rows, body: host.textContent ?? "" }
}

describe("the list Close all opens", () => {
  it("offers all three, ticked, with what each one holds", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      watched: [watch("ETH", "practice"), watch("SOL", "practice")],
      smart: [ladder("DOGE", "dca", "practice")],
    })

    expect(said.rows.map((one) => one.label)).toEqual([
      "Positions",
      "Watched",
      "Smart",
    ])
    expect(said.rows.map((one) => one.count)).toEqual(["1", "2", "1"])
    expect(said.rows.every((one) => one.ticked)).toBe(true)
  })

  it("says None for a kind there is nothing of", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
    })

    expect(said.rows[1].count).toBe("None")
    expect(said.rows[2].count).toBe("None")
    // Nothing of a kind means nothing said about that kind either.
    expect(said.body).not.toContain("watched price")
  })

  it("says what stopping a smart order does and does not do", async () => {
    const said = await ask({
      smart: [ladder("BTC", "dca", "practice"), ladder("ETH", "grid", "practice")],
    })

    expect(said.body).toContain("1 ladder and 1 grid stop")
    expect(said.body).toContain("What they already bought stays open")
    expect(said.body).toContain("ends that ladder for good")
  })

  it("leaves the ladder sentence out when there are only grids", async () => {
    const said = await ask({ smart: [ladder("ETH", "grid", "practice")] })

    expect(said.body).toContain("1 grid stop")
    expect(said.body).not.toContain("ends that ladder for good")
  })

  it("says why the row can count more than the Positions tab lists", async () => {
    const said = await ask({
      positions: [
        position("hyperliquid:mainnet:BTC", "practice"),
        position("hyperliquid:mainnet:CHIP", "practice"),
      ],
      managed: 1,
      smart: [ladder("CHIP", "grid", "practice")],
    })

    expect(said.rows[0].count).toBe("2")
    expect(said.body).toContain("1 of them is a coin a ladder or grid is running")
    expect(said.body).toContain("it closes with the rest")
  })

  it("warns that a resting order can buy straight back in", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      restingOrders: 2,
    })

    expect(said.body).toContain("2 waiting orders are left alone")
  })

  it("says nothing about resting orders when no position is going", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      restingOrders: 2,
      picked: { positions: false, watched: true, smart: true },
    })

    expect(said.body).not.toContain("waiting orders are left alone")
  })

  it("puts real money's figure under the ticks", async () => {
    const said = await ask({
      positions: [
        position("hyperliquid:mainnet:BTC", "live", true),
        position("hyperliquid:mainnet:ETH", "practice"),
      ],
      smart: [ladder("SOL", "dca", "live")],
      realWallets: ["live"],
    })

    // The real position's $100, never the $200 total.
    expect(said.body).toContain("2 of them are on real money.")
    expect(said.body).toContain("The real position is holding $100.00 right now")
    expect(said.rows[0].count).toBe("2, 1 real")
    // Every smart order is real, so the count is not printed twice.
    expect(said.rows[2].count).toBe("1 real")
  })

  it("counts real money across only what is ticked", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "live", true)],
      smart: [ladder("SOL", "dca", "live")],
      realWallets: ["live"],
      picked: { positions: false, watched: true, smart: true },
    })

    // The untouched real position is not counted, and its dollars are not
    // named, because this press is not going to sell it.
    expect(said.body).toContain("One of them is on real money.")
    expect(said.body).not.toContain("holding $100.00")
  })

  it("never claims real money when none of it is", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
    })

    expect(said.body).not.toContain("real money")
    expect(said.body).toContain("This cannot be undone")
  })

  it("describes only what is ticked", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      watched: [watch("ETH", "practice")],
      smart: [ladder("SOL", "dca", "practice")],
      picked: { positions: false, watched: true, smart: false },
    })

    expect(said.body).toContain("The watched price is called off")
    expect(said.body).not.toContain("is closed at whatever")
    expect(said.body).not.toContain("ends that ladder for good")
  })

  it("hands back what will happen, not what is ticked", async () => {
    // Watched is ticked and there are watched prices; Positions and Smart are
    // ticked too but there are none of either. A press used to ask the server
    // to close everything anyway, and it answered "0 positions closed."
    const asked: CloseAllPick[] = []
    await ask({
      watched: [watch("ETH", "practice")],
      onConfirm: (doing) => asked.push(doing),
    })
    const confirm = [...host.querySelectorAll("button")].find((one) =>
      one.textContent?.includes("Confirm close all")
    )
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(asked).toEqual([{ positions: false, watched: true, smart: false }])
  })

  it("says so when nothing is ticked, instead of promising anything", async () => {
    const said = await ask({
      positions: [position("hyperliquid:mainnet:BTC", "practice")],
      picked: { positions: false, watched: false, smart: false },
    })

    expect(said.body).toContain("Nothing is ticked")
    expect(said.body).not.toContain("This cannot be undone")
    // Still pressable — a greyed-out button cannot say why it is off.
    const confirm = [...host.querySelectorAll("button")].find((one) =>
      one.textContent?.includes("Confirm close all")
    )
    expect(confirm?.disabled).toBe(false)
  })
})

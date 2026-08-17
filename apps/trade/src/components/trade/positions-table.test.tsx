import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"

/**
 * The three answers an empty bottom-panel table can give, told apart.
 *
 * "Nothing here", "still reading" and "could not read" are different answers,
 * and only the first is safe to act on. These render each table with no rows
 * in all three states and check the words: a table that is still waiting or
 * failed must never show the empty state's "No open positions", because that
 * is a claim about money it has not looked at.
 */

const shared = {
  markets: new Map(),
  walletName: () => "Practice",
  busy: false,
  onSelectMarket: () => {},
  onRetry: () => {},
}

function drawPositions(state: { loading: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <PositionsTable
      {...shared}
      {...state}
      positions={[]}
      smartOrders={[]}
      onEdit={() => {}}
      onFlip={() => {}}
      onClose={() => {}}
    />
  )
}

function drawOrders(state: { loading: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <OpenOrdersTable {...shared} {...state} orders={[]} onCancel={() => {}} />
  )
}

function drawTrades(state: { loading: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <TradesTable
      {...shared}
      {...state}
      trades={[]}
      selectedId={null}
      onSelectTrade={() => {}}
      onRemove={() => {}}
    />
  )
}

describe("the bottom panel's tables say what they know", () => {
  it("claims empty only after a read has landed", () => {
    expect(drawPositions({ loading: false, failed: false })).toContain(
      "No open positions"
    )
    expect(drawOrders({ loading: false, failed: false })).toContain(
      "No open orders"
    )
    expect(drawTrades({ loading: false, failed: false })).toContain(
      "No finished trades yet"
    )
  })

  it("says it is still reading before the first answer, inside the table frame", () => {
    for (const [draw, label] of [
      [drawPositions, "Reading what you are holding"],
      [drawOrders, "Reading your open orders"],
      [drawTrades, "Reading your finished trades"],
    ] as const) {
      const html = draw({ loading: true, failed: false })
      expect(html).toContain(label)
      // The real header is already up, so nothing moves when the rows land.
      expect(html).toContain("<thead>")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })

  it("says the read failed, with a retry, never that things are empty", () => {
    for (const draw of [drawPositions, drawOrders, drawTrades]) {
      const html = draw({ loading: false, failed: true })
      expect(html).toContain("could not be read")
      expect(html).toContain("Try again")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })
})

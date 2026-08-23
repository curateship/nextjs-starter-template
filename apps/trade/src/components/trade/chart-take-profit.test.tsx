// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartTakeProfit } from "@/components/trade/chart-take-profit"
import type { TradePosition } from "@/lib/trade/paper"

let host: HTMLDivElement
let root: Root

const position: TradePosition = {
  id: "position-1",
  walletId: "wallet-1",
  marketKey: "hyperliquid:BTC",
  szi: 2,
  entryPx: 100,
  leverage: 2,
  maxLeverage: 50,
  tpPx: null,
  slPx: 90,
  feesPaid: 0,
  updatedAt: 0,
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

function button(name: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (one) => one.textContent === name
  )
  if (!found) throw new Error(`Missing ${name} button`)
  return found
}

describe("the chart take-profit window", () => {
  it("sets the whole position at the clicked price by default", async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    await act(async () =>
      root.render(
        <ChartTakeProfit
          state={{ positionId: position.id, px: 120, x: 40, y: 60 }}
          position={position}
          wallet="Practice"
          onSave={onSave}
          onClose={onClose}
        />
      )
    )

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      "Take profit"
    )
    expect(host.textContent).toContain("Projected: +$40.00")
    expect(host.textContent).not.toContain("At $120")
    const projected = Array.from(host.querySelectorAll("p")).find((one) =>
      one.textContent?.startsWith("Projected:")
    )
    expect(projected?.className).not.toContain("text-emerald")
    expect(projected?.querySelector("span")?.className).toContain(
      "text-emerald"
    )
    await act(async () => button("Set target").click())

    expect(onSave).toHaveBeenCalledWith({
      tpPx: 120,
      tpSz: null,
      slPx: 90,
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("can take only part of the position", async () => {
    const onSave = vi.fn()
    await act(async () =>
      root.render(
        <ChartTakeProfit
          state={{ positionId: position.id, px: 120, x: 40, y: 60 }}
          position={position}
          wallet="Practice"
          onSave={onSave}
          onClose={() => {}}
        />
      )
    )

    await act(async () => button("25%").click())
    expect(host.textContent).toContain("+$10.00")
    await act(async () => button("Set target").click())

    expect(onSave).toHaveBeenCalledWith({
      tpPx: 120,
      tpSz: 0.5,
      slPx: 90,
    })
  })
})

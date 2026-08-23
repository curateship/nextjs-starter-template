// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BracketsDialog } from "@/components/trade/brackets-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradePosition } from "@/lib/trade/paper"

const position: TradePosition = {
  id: "position",
  walletId: "wallet",
  marketKey: "hyperliquid:mainnet:BTC",
  szi: 1,
  entryPx: 100,
  leverage: 1,
  maxLeverage: 50,
  tpPx: null,
  tpSz: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 1,
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

describe("the stop-and-target window's clicked price", () => {
  it("prefills the stop from the chart without inventing a target", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BracketsDialog
            position={position}
            startSlPx={95}
            busy={false}
            onSave={async () => true}
            onClose={() => {}}
          />
        </TooltipProvider>
      )
    })

    expect(
      document.querySelector<HTMLInputElement>("#brackets-stop")?.value
    ).toBe("5")
    expect(
      document.querySelector<HTMLInputElement>("#brackets-target")?.value
    ).toBe("")
  })
})

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

/** Types into a controlled input the way React's own change handler sees it. */
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`no ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function saveButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find(
      (one) => one.textContent?.trim() === "Save changes"
    ) ?? null
  )
}

describe("the stop-and-target window says why it will not save", () => {
  it("names the box, outlines it, and points the button at the reason", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BracketsDialog
            position={position}
            fills={[]}
            busy={false}
            onSave={async () => true}
            onClose={() => {}}
          />
        </TooltipProvider>
      )
    })

    // Nothing typed yet: both boxes are empty, which means no lines at all —
    // a perfectly good thing to save.
    expect(document.getElementById("brackets-refusal")).toBeNull()
    expect(saveButton()?.disabled).toBe(false)

    await type("#brackets-target", "nonsense")
    const refusal = document.getElementById("brackets-refusal")
    expect(refusal?.textContent).toContain("Take profit %")
    expect(
      document
        .querySelector("#brackets-target")
        ?.getAttribute("aria-invalid")
    ).toBe("true")
    expect(saveButton()?.disabled).toBe(true)
    // The reason is tied to the button rather than left as loose text near it.
    expect(saveButton()?.getAttribute("aria-describedby")).toBe(
      "brackets-refusal"
    )

    // A long's stop cannot be a hundred percent away: that is a price of
    // nothing, and the window says so instead of greying out in silence.
    await type("#brackets-target", "5")
    await type("#brackets-stop", "150")
    expect(document.getElementById("brackets-refusal")?.textContent).toContain(
      "Stop loss %"
    )

    await type("#brackets-stop", "2")
    expect(document.getElementById("brackets-refusal")).toBeNull()
    expect(saveButton()?.disabled).toBe(false)
  })
})

describe("the stop-and-target window's clicked price", () => {
  it("prefills the stop from the chart without inventing a target", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BracketsDialog
            position={position}
            fills={[]}
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

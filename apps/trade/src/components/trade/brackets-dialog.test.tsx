// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  targets: [],
  tpPx: null,
  tpSz: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 1,
}

let host: HTMLDivElement
let root: Root

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
})

/** Types into a controlled input the way React's own change handler sees it. */
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`no ${selector}`)
  await typeInput(input, value)
}

async function typeInput(input: HTMLInputElement, value: string) {
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

    const add = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Add target"
    )
    await act(async () => add?.click())
    await type('[id^="brackets-target-price-"]', "90")
    await type('[id^="brackets-target-size-"]', "50")
    await act(async () => saveButton()?.click())
    const refusal = document.getElementById("brackets-refusal")
    expect(refusal?.textContent).toContain("Each target needs a price above")
    expect(
      document
        .querySelector('[id^="brackets-target-price-"]')
        ?.getAttribute("aria-invalid")
    ).toBe("true")
    expect(saveButton()?.disabled).toBe(false)
    // The reason is tied to the button rather than left as loose text near it.
    expect(saveButton()?.getAttribute("aria-describedby")).toBe(
      "brackets-refusal"
    )

    // A long's stop cannot be a hundred percent away: that is a price of
    // nothing, and the window says so instead of greying out in silence.
    await type('[id^="brackets-target-price-"]', "110")
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
      document.querySelectorAll('[id^="brackets-target-price-"]')
    ).toHaveLength(0)
  })
})

describe("several take-profit levels", () => {
  it("saves three fixed slices and shows their running coverage", async () => {
    const onSave = vi.fn(async () => true)
    const onClose = vi.fn()
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BracketsDialog
            position={{ ...position, szi: 12 }}
            fills={[]}
            busy={false}
            onSave={onSave}
            onClose={onClose}
          />
        </TooltipProvider>
      )
    })

    for (let index = 0; index < 3; index += 1) {
      const add = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Add target"
      )
      await act(async () => add?.click())
    }

    const prices = [
      ...document.querySelectorAll<HTMLInputElement>(
        '[id^="brackets-target-price-"]'
      ),
    ]
    const sizes = [
      ...document.querySelectorAll<HTMLInputElement>(
        '[id^="brackets-target-size-"]'
      ),
    ]
    expect(prices).toHaveLength(3)
    expect(sizes).toHaveLength(3)
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Add target"
      )
    ).toBe(false)

    for (const [index, px] of [110, 120, 135].entries()) {
      await typeInput(prices[index], String(px))
      await typeInput(sizes[index], String(px * 4))
    }
    expect(document.body.textContent).toContain(
      "$1,200.00 of $1,200.00 covered at the entry price."
    )

    await act(async () => saveButton()?.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ szi: 12 }), {
      targets: [
        { px: 110, sz: 4 },
        { px: 120, sz: 4 },
        { px: 135, sz: 4 },
      ],
      slPx: null,
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

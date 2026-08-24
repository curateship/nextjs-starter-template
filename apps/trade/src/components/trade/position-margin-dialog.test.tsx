// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"

import { PositionMarginDialog } from "@/components/trade/position-margin-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradePosition } from "@/lib/trade/paper"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

/**
 * The window that changes how much borrowed money a position runs on.
 *
 * **These are about what it refuses**, because every one of those refusals
 * stands between somebody and real money. Taking margin out until the exchange
 * would take the trade before the stop does is the important one: the stop is
 * the worst case somebody agreed to, and a liquidation inside it quietly
 * replaces that worst case with a bigger one.
 */

/** $1,000 of a coin bought at $100, with $200 behind it — so 5×. */
function live(over: Partial<TradePosition> = {}): TradePosition {
  return {
    id: "live:w1:BTC",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    szi: 10,
    entryPx: 100,
    leverage: 5,
    maxLeverage: 5,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
    live: {
      marginUsed: 200,
      liquidationPx: 84,
      tpOrderId: null,
      slOrderId: null,
    },
    ...over,
  }
}

type Pressed = { leverage: number[]; dollars: number[] }

async function open(position: TradePosition, maxLeverage: number | null = 20) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const pressed: Pressed = { leverage: [], dollars: [] }
  await act(async () => {
    root.render(
      <TooltipProvider>
        <PositionMarginDialog
          position={position}
          maxLeverage={maxLeverage}
          walletName="Main"
          canChangeLeverage={true}
          leverageRefusal={null}
          canAdjustMargin={true}
          marginRefusal={null}
          busy={false}
          onSetLeverage={(_one, leverage) => pressed.leverage.push(leverage)}
          onAdjustMargin={(_one, dollars) => pressed.dollars.push(dollars)}
          onDismiss={() => {}}
        />
      </TooltipProvider>
    )
  })

  const find = <T extends Element>(selector: string) =>
    document.querySelector<T>(selector)
  // React tracks a controlled input's value itself, so assigning `.value`
  // changes the DOM and nothing else. The prototype setter is what React
  // watches — the same trick the stop-and-target window's tests use.
  const type = async (selector: string, value: string) => {
    const box = find<HTMLInputElement>(selector)
    if (!box) throw new Error(`no ${selector}`)
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    await act(async () => {
      setter?.call(box, value)
      box.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const button = (words: string) =>
    [...document.querySelectorAll("button")].find((one) =>
      (one.textContent ?? "").includes(words)
    )

  return {
    pressed,
    type,
    button,
    refusal: (id: string) => find(`#${id}`)?.textContent ?? null,
    invalid: (selector: string) =>
      find(selector)?.getAttribute("aria-invalid") === "true",
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

describe("changing leverage and margin on an open position", () => {
  it("opens on the position's own leverage with nothing to press", async () => {
    const window = await open(live())
    expect(
      document.querySelector<HTMLInputElement>("#margin-leverage")?.value
    ).toBe("5")
    expect(window.button("Change to 5×")?.disabled).toBe(true)
    expect(window.button("Move margin")?.disabled).toBe(true)
    await window.close()
  })

  it("refuses leverage past what the market allows, and says the cap", async () => {
    const window = await open(live(), 20)
    await window.type("#margin-leverage", "50")
    expect(window.refusal("margin-leverage-refusal")).toContain(
      "between 1 and 20"
    )
    expect(window.invalid("#margin-leverage")).toBe(true)
    expect(window.button("Change to")?.disabled).toBe(true)
    await window.close()
  })

  it("treats an empty leverage box as leaving it alone, not as a mistake", async () => {
    const window = await open(live())
    await window.type("#margin-leverage", "")
    // No refusal: an empty box means "as it is", the same as the stop-and-target
    // window's empty percent boxes. The button simply has nothing to do.
    expect(window.refusal("margin-leverage-refusal")).toBeNull()
    expect(window.invalid("#margin-leverage")).toBe(false)
    expect(window.button("Change to")?.disabled).toBe(true)
    await window.close()
  })

  it("sends the leverage that was typed", async () => {
    const window = await open(live())
    await window.type("#margin-leverage", "3")
    const press = window.button("Change to 3×")
    expect(press?.disabled).toBe(false)
    await act(async () => press?.click())
    expect(window.pressed.leverage).toEqual([3])
    await window.close()
  })

  it("refuses taking out more margin than is behind the position", async () => {
    const window = await open(live())
    await window.type("#margin-dollars", "-500")
    expect(window.refusal("margin-dollars-refusal")).toContain(
      "would leave nothing behind it"
    )
    expect(window.button("Take back")?.disabled).toBe(true)
    await window.close()
  })

  /**
   * The rule this whole window exists to protect. A stop at $95 on a $1,000
   * position with $200 behind it: taking $150 back leaves $50, which is 20×,
   * and 20× liquidates well above $95. The exchange would take the trade
   * before the stop could, so the stop stops being the worst case.
   */
  it("refuses margin out that would put liquidation inside the stop", async () => {
    const window = await open(live({ slPx: 95 }), 20)
    await window.type("#margin-dollars", "-150")
    const said = window.refusal("margin-dollars-refusal") ?? ""
    expect(said).toContain("liquidation price")
    expect(said).toContain("before the stop")
    expect(said).toContain("95")
    expect(window.button("Take back")?.disabled).toBe(true)
    await window.close()
  })

  it("allows margin out that stays clear of the stop", async () => {
    const window = await open(live({ slPx: 60 }), 20)
    await window.type("#margin-dollars", "-20")
    expect(window.refusal("margin-dollars-refusal")).toBeNull()
    const press = window.button("Take back")
    expect(press?.disabled).toBe(false)
    await act(async () => press?.click())
    expect(window.pressed.dollars).toEqual([-20])
    await window.close()
  })

  it("refuses more cash behind a position already worth less than its margin", async () => {
    // 1× already: the cash behind it is the whole position, so more of it buys
    // no more room. Leverage cannot go under 1× on any of these venues.
    const window = await open(
      live({ leverage: 1, live: { marginUsed: 1_000, liquidationPx: 1, tpOrderId: null, slOrderId: null } })
    )
    await window.type("#margin-dollars", "50")
    expect(window.refusal("margin-dollars-refusal")).toContain(
      "buys no more room"
    )
    expect(window.button("Put ")?.disabled).toBe(true)
    await window.close()
  })

  it("says a practice wallet has no lender, rather than pretending", async () => {
    const paper: TradePosition = {
      id: "BTC",
      walletId: "w1",
      marketKey: "hyperliquid:mainnet:BTC",
      szi: 10,
      entryPx: 100,
      leverage: 5,
      maxLeverage: 20,
      targets: [],
      tpPx: null,
      slPx: null,
      feesPaid: 0,
      updatedAt: 1,
    }
    const window = await open(paper)
    expect(document.body.textContent).toContain("no lender to renegotiate with")
    expect(document.querySelector("#margin-leverage")).toBeNull()
    expect(document.querySelector("#margin-dollars")).toBeNull()
    await window.close()
  })

  it("says the exchange's own reason when it cannot do one half", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <PositionMarginDialog
            position={live()}
            maxLeverage={20}
            walletName="Main"
            canChangeLeverage={false}
            leverageRefusal="KuCoin keeps leverage per market for cross margin only."
            canAdjustMargin={false}
            marginRefusal="Adding or taking back the cash behind one KuCoin position has not been built."
            busy={false}
            onSetLeverage={() => {}}
            onAdjustMargin={() => {}}
            onDismiss={() => {}}
          />
        </TooltipProvider>
      )
    })
    expect(document.body.textContent).toContain("cross margin only")
    expect(document.body.textContent).toContain("has not been built")
    expect(document.querySelector("#margin-leverage")).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })
})

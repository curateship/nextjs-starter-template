// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"

import { PositionMarginDialog } from "@/components/trade/position-margin-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradePosition } from "@/lib/trade/paper"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

type Pressed = { leverage: number[]; dollars: number[]; dismissed: number }

async function open(
  position: TradePosition,
  maxLeverage: number | null = 20,
  /** What the exchange answers to each change. */
  took = true
) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const pressed: Pressed = { leverage: [], dollars: [], dismissed: 0 }
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
          onSetLeverage={async (_one, leverage) => {
            pressed.leverage.push(leverage)
            return took
          }}
          onAdjustMargin={async (_one, dollars) => {
            pressed.dollars.push(dollars)
            return took
          }}
          onDismiss={() => {
            pressed.dismissed += 1
          }}
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
  it("reads Done and only closes when nothing was changed", async () => {
    const window = await open(live())
    expect(
      document.querySelector<HTMLInputElement>("#margin-leverage")?.value
    ).toBe("5")
    const done = window.button("Done")
    expect(done?.disabled).toBe(false)
    await act(async () => done?.click())
    expect(window.pressed.leverage).toEqual([])
    expect(window.pressed.dollars).toEqual([])
    expect(window.pressed.dismissed).toBe(1)
    await window.close()
  })

  it("is named after the change it will send", async () => {
    const window = await open(live())
    await window.type("#margin-dollars", "200")
    expect(window.button("Put $200.00 behind it")).toBeDefined()
    await window.type("#margin-leverage", "3")
    expect(window.button("Change to 3× and put $200.00 behind it")).toBeDefined()
    await window.close()
  })

  /**
   * The bug this window was rebuilt for: a margin typed and Done pressed did
   * nothing, because Done only closed the window and the sending sat on a
   * smaller button beside the box.
   */
  it("sends what was typed and closes once the exchange took it", async () => {
    const window = await open(live())
    await window.type("#margin-dollars", "200")
    await act(async () => window.button("Put ")?.click())
    expect(window.pressed.dollars).toEqual([200])
    expect(window.pressed.dismissed).toBe(1)
    await window.close()
  })

  it("stays open when the exchange refused the change", async () => {
    const window = await open(live(), 20, false)
    await window.type("#margin-dollars", "200")
    await act(async () => window.button("Put ")?.click())
    expect(window.pressed.dollars).toEqual([200])
    expect(window.pressed.dismissed).toBe(0)
    await window.close()
  })

  it("sends leverage first, then margin, and stops after a refusal", async () => {
    const window = await open(live(), 20, false)
    await window.type("#margin-leverage", "3")
    await window.type("#margin-dollars", "200")
    await act(async () => window.button("Change to 3× and")?.click())
    expect(window.pressed.leverage).toEqual([3])
    // The leverage change was refused, so the margin was never sent behind it.
    expect(window.pressed.dollars).toEqual([])
    expect(window.pressed.dismissed).toBe(0)
    await window.close()
  })

  it("refuses leverage past what the market allows, and says the cap", async () => {
    const window = await open(live(), 20)
    await window.type("#margin-leverage", "50")
    expect(window.refusal("margin-leverage-refusal")).toBeNull()
    expect(window.invalid("#margin-leverage")).toBe(false)
    await act(async () => window.button("Change to")?.click())
    expect(window.refusal("margin-leverage-refusal")).toContain(
      "between 1 and 20"
    )
    expect(window.invalid("#margin-leverage")).toBe(true)
    expect(window.button("Change to")?.disabled).toBe(false)
    await window.close()
  })

  it("treats an empty leverage box as leaving it alone, not as a mistake", async () => {
    const window = await open(live())
    await window.type("#margin-leverage", "")
    expect(window.refusal("margin-leverage-refusal")).toBeNull()
    expect(window.invalid("#margin-leverage")).toBe(false)
    // Nothing to send, so the button is plain Done and just closes.
    await act(async () => window.button("Done")?.click())
    expect(window.pressed.leverage).toEqual([])
    expect(window.pressed.dismissed).toBe(1)
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
    expect(window.refusal("margin-dollars-refusal")).toBeNull()
    await act(async () => window.button("Take back")?.click())
    expect(window.refusal("margin-dollars-refusal")).toContain(
      "would leave nothing behind it"
    )
    expect(window.button("Take back")?.disabled).toBe(false)
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
    await act(async () => window.button("Take back")?.click())
    const said = window.refusal("margin-dollars-refusal") ?? ""
    expect(said).toContain("liquidation price")
    expect(said).toContain("before the stop")
    expect(said).toContain("95")
    expect(window.button("Take back")?.disabled).toBe(false)
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
      live({
        leverage: 1,
        live: {
          marginUsed: 1_000,
          liquidationPx: 1,
          tpOrderId: null,
          slOrderId: null,
        },
      })
    )
    await window.type("#margin-dollars", "50")
    await act(async () => window.button("Put ")?.click())
    expect(window.refusal("margin-dollars-refusal")).toContain(
      "buys no more room"
    )
    expect(window.button("Put ")?.disabled).toBe(false)
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
            onSetLeverage={async () => true}
            onAdjustMargin={async () => true}
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

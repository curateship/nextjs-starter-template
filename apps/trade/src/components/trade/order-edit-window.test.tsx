// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OrderEditWindow } from "@/components/trade/order-edit-window"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradeOrder } from "@/lib/trade/paper"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const order: TradeOrder = {
  id: "watch-1",
  walletId: "paper-1",
  marketKey: "hyperliquid:mainnet:BTC",
  side: "buy",
  px: 100,
  sz: 1,
  leverage: 1,
  maxLeverage: 20,
  reduceOnly: false,
  tpPx: null,
  slPx: null,
  createdAt: 1,
  updatedAt: 1,
  watched: true,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1_000,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  })
  // The exit's Percent or Price menu scrolls its chosen item into view, which
  // jsdom does not do.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

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

describe("editing a waiting watched order", () => {
  it("opens beside the chart cog instead of as a modal and saves a stop alone", async () => {
    const onSave = vi.fn(async () => true)
    const onClose = vi.fn()
    const anchor = document.createElementNS("http://www.w3.org/2000/svg", "g")
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      x: 700,
      y: 300,
      left: 700,
      top: 300,
      right: 722,
      bottom: 322,
      width: 22,
      height: 22,
      toJSON: () => ({}),
    })

    await act(async () => {
      root.render(
        <TooltipProvider>
          <OrderEditWindow
            order={order}
            wallet="Practice"
            anchor={anchor}
            wide
            busy={false}
            onSave={onSave}
            onClose={onClose}
          />
        </TooltipProvider>
      )
    })

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    const window = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(window?.style.left).toBe("388px")
    expect(window?.style.top).toBe("31px")
    expect(window?.firstElementChild?.textContent).toBe(
      "Order settingsPractice"
    )

    const leverage = document.querySelector<HTMLElement>(
      '[role="slider"][aria-label="Leverage"]'
    )
    expect(leverage?.getAttribute("aria-valuenow")).toBe("1")
    expect(leverage?.getAttribute("aria-valuemax")).toBe("20")
    await act(async () => {
      leverage?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      )
    })
    expect(leverage?.getAttribute("aria-valuenow")).toBe("2")

    await type("#order-stop", "5%")
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save changes"
    )
    await act(async () => save?.click())

    expect(onSave).toHaveBeenCalledWith("paper-1", "watch-1", {
      sz: 1,
      leverage: 2,
      tpPx: null,
      slPx: 95,
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

async function open(shown: TradeOrder, wallet = "Practice") {
  const onSave = vi.fn(async () => true)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <OrderEditWindow
          order={shown}
          wallet={wallet}
          wide
          busy={false}
          onSave={onSave}
          onClose={() => {}}
        />
      </TooltipProvider>
    )
  })
  return onSave
}

async function pickExitUnit(unit: "Percent" | "Price") {
  const trigger = document.querySelector<HTMLElement>(
    '[aria-label="How exit is measured"]'
  )
  await act(async () => {
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent === unit
  )
  if (!option) throw new Error(`no ${unit} option`)
  await act(async () => {
    option.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
}

async function saveChanges() {
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Save changes"
  )
  await act(async () => save?.click())
}

describe("the order settings header", () => {
  it("names the wallet and colours a long's title the long way", async () => {
    await open(order)
    const title = document.querySelector('[role="dialog"] .font-semibold')
    expect(title?.textContent).toBe("Order settings")
    expect(title?.className).toContain("text-emerald-600")
    expect(document.querySelector('[title="Practice"]')?.textContent).toBe(
      "Practice"
    )
  })

  it("names the wallet and colours a short's title the short way", async () => {
    await open({ ...order, side: "sell" }, "A very long wallet name here")
    const title = document.querySelector('[role="dialog"] .font-semibold')
    expect(title?.className).toContain("text-destructive")
    expect(title?.className).not.toContain("text-emerald-600")
    const wallet = document.querySelector<HTMLElement>(
      '[title="A very long wallet name here"]'
    )
    expect(wallet?.className).toContain("truncate")
  })

  it("shows no wallet name when the wallet is not loaded", async () => {
    await open(order, "")
    const header = document.querySelector('[role="dialog"]')?.firstElementChild
    expect(header?.textContent).toBe("Order settings")
  })
})

describe("the order settings exit", () => {
  it("says Exit, never target, when there is none", async () => {
    await open(order)
    expect(document.body.textContent).toContain("No exit set.")
    expect(document.body.textContent).not.toMatch(/target/i)
  })

  it("saves the same exit from a price as from a percent", async () => {
    const byPercent = await open(order)
    await type("#order-target", "10")
    await saveChanges()
    expect(byPercent).toHaveBeenCalledWith(
      "paper-1",
      "watch-1",
      expect.objectContaining({ tpPx: expect.closeTo(110, 9) })
    )

    const byPrice = await open({ ...order, id: "watch-2" })
    await pickExitUnit("Price")
    expect(document.body.textContent).toContain("Exit price")
    await type("#order-target", "110")
    await saveChanges()
    expect(byPrice).toHaveBeenCalledWith(
      "paper-1",
      "watch-2",
      expect.objectContaining({ tpPx: 110 })
    )
  })

  it("starts the price box on the exit the order already has", async () => {
    await open({ ...order, side: "sell", tpPx: 89.99999999999999 })
    await pickExitUnit("Price")
    expect(
      document.querySelector<HTMLInputElement>("#order-target")?.value
    ).toBe("90")
  })

  it("refuses a short's exit price above the order", async () => {
    const onSave = await open({ ...order, side: "sell" })
    await pickExitUnit("Price")
    await type("#order-target", "105")
    await saveChanges()
    expect(onSave).not.toHaveBeenCalled()
    expect(
      document
        .querySelector<HTMLInputElement>("#order-target")
        ?.getAttribute("aria-invalid")
    ).toBe("true")
  })
})

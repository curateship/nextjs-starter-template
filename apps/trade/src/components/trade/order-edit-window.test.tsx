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
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
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
    expect(window?.firstElementChild?.textContent).toBe("Order settings")

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

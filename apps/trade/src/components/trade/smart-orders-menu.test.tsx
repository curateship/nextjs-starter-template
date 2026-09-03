// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SmartOrdersMenu } from "@/components/trade/smart-orders-menu"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { hasPointerCapture?: unknown })
    .hasPointerCapture
  delete (HTMLElement.prototype as { setPointerCapture?: unknown })
    .setPointerCapture
  delete (HTMLElement.prototype as { releasePointerCapture?: unknown })
    .releasePointerCapture
})

describe("the collapsed smart-orders menu", () => {
  it("opens the existing panel from the bot icon", async () => {
    await act(async () => {
      root.render(
        <SmartOrdersMenu>
          <div>Smart orders and Bots</div>
        </SmartOrdersMenu>
      )
    })

    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open smart orders and bots"]'
    )!
    expect(trigger.dataset.slot).toBe("popover-trigger")
    expect(document.body.textContent).not.toContain("Smart orders and Bots")

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })

    expect(document.body.textContent).toContain("Smart orders and Bots")
    const menu = document.body.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )!
    expect(menu.className).toContain("w-[18.5rem]")
    expect(menu.className).not.toContain("h-[36rem]")
  })
})

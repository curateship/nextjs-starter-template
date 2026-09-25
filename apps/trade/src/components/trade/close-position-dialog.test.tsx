// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClosePositionDialog } from "@/components/trade/close-position-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradePosition } from "@/lib/trade/paper"

const position: TradePosition = {
  id: "lighter-position",
  walletId: "lighter-wallet",
  marketKey: "lighter:mainnet:ETH",
  szi: 0.0922,
  entryPx: 2_400,
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
  // The Order type menu scrolls its chosen item into view, which jsdom does
  // not do.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

function renderDialog(handlers: {
  onCloseAll?: () => void
  onClosePart?: (...args: unknown[]) => void
}) {
  return act(async () => {
    root.render(
      <TooltipProvider>
        <ClosePositionDialog
          position={position}
          mark={2_400}
          walletName="Lighter"
          busy={false}
          onCloseAll={handlers.onCloseAll ?? (() => undefined)}
          onClosePart={handlers.onClosePart ?? (() => undefined)}
          onDismiss={() => undefined}
        />
      </TooltipProvider>
    )
  })
}

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (one) => one.textContent?.trim() === label
  )
  if (!found) throw new Error(`no ${label} button`)
  return found
}

async function pickHow(label: "Market" | "Limit") {
  const trigger = document.querySelector<HTMLElement>("#close-how")
  await act(async () => {
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent === label
  )
  if (!option) throw new Error(`no ${label} option`)
  await act(async () => {
    option.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
}

describe("market or limit", () => {
  it("starts on market for all of it and limit for a part", async () => {
    const onClosePart = vi.fn()
    await renderDialog({ onClosePart })
    const how = () => document.querySelector("#close-how")?.textContent
    expect(how()).toBe("Market")

    await act(async () => button("50%").click())
    expect(how()).toBe("Limit")

    await act(async () => button("Sell $110.64").click())
    expect(onClosePart).toHaveBeenCalledWith(position, {
      size: { unit: "usd", amount: 110.64 },
      how: "limit",
    })
  })

  it("sends all of it as a chased limit when Limit is picked", async () => {
    const onCloseAll = vi.fn()
    const onClosePart = vi.fn()
    await renderDialog({ onCloseAll, onClosePart })
    await pickHow("Limit")
    expect(document.body.textContent).toContain(
      "sold with a limit that follows the price"
    )

    await act(async () => button("Close all of it").click())
    expect(onCloseAll).not.toHaveBeenCalled()
    expect(onClosePart).toHaveBeenCalledWith(position, {
      size: { unit: "all" },
      how: "limit",
    })
  })

  it("keeps a picked Market when the amount becomes a part", async () => {
    const onClosePart = vi.fn()
    await renderDialog({ onClosePart })
    await act(async () => button("50%").click())
    await pickHow("Market")
    await act(async () => button("25%").click())
    expect(document.querySelector("#close-how")?.textContent).toBe("Market")
    expect(document.body.textContent).toContain(
      "sold at whatever the market costs right now"
    )

    await act(async () => button("Sell $55.32").click())
    expect(onClosePart).toHaveBeenCalledWith(position, {
      size: { unit: "usd", amount: 55.32 },
      how: "market",
    })
  })
})

describe("closing a whole position", () => {
  it("keeps the all-of-it preset valid while the live mark moves", async () => {
    const onCloseAll = vi.fn()
    const render = async (mark: number) => {
      await act(async () => {
        root.render(
          <TooltipProvider>
            <ClosePositionDialog
              position={position}
              mark={mark}
              walletName="Lighter"
              busy={false}
              onCloseAll={onCloseAll}
              onClosePart={() => undefined}
              onDismiss={() => undefined}
            />
          </TooltipProvider>
        )
      })
    }

    await render(2_465.4)
    expect(
      document.querySelector<HTMLInputElement>("#close-amount")?.value
    ).toBe("227.31")

    await render(2_464.32)
    expect(
      document.querySelector<HTMLInputElement>("#close-amount")?.value
    ).toBe("227.21")

    const close = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Close all of it"))
    expect(close).not.toBeUndefined()
    expect(document.body.textContent).not.toContain("This position only holds")

    await act(async () => close?.click())
    expect(onCloseAll).toHaveBeenCalledWith(position)
  })

  it("still refuses a larger amount typed by hand", async () => {
    const onCloseAll = vi.fn()
    const onClosePart = vi.fn()
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ClosePositionDialog
            position={position}
            mark={2_464.32}
            walletName="Lighter"
            busy={false}
            onCloseAll={onCloseAll}
            onClosePart={onClosePart}
            onDismiss={() => undefined}
          />
        </TooltipProvider>
      )
    })

    const input = document.querySelector<HTMLInputElement>("#close-amount")
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    await act(async () => {
      setter?.call(input, "230")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const sell = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Sell")
    await act(async () => sell?.click())

    expect(document.body.textContent).toContain("This position only holds")
    expect(input?.getAttribute("aria-invalid")).toBe("true")
    expect(onCloseAll).not.toHaveBeenCalled()
    expect(onClosePart).not.toHaveBeenCalled()
  })
})

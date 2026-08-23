// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/liquidation-warning-settings", () => ({
  getLiquidationWarningLoadErrorMessage: vi.fn(() => "Could not load"),
  getLiquidationWarningSaveErrorMessage: vi.fn(() => "Could not save"),
  loadLiquidationWarningSettings: vi.fn(),
  saveLiquidationWarningSettings: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import { LiquidationWarningSettings } from "@/components/workers/liquidation-warning-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  loadLiquidationWarningSettings,
  saveLiquidationWarningSettings,
} from "@/lib/api/liquidation-warning-settings"
import { showErrorToast } from "@/lib/toast/error-toast"

let host: HTMLDivElement
let root: Root

function enter(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setValue?.call(input, value)
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
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

describe("liquidation warning settings", () => {
  it("draws blank as off and saves either distance", async () => {
    vi.mocked(loadLiquidationWarningSettings).mockResolvedValue({
      usd: null,
      pct: 50,
    })
    vi.mocked(saveLiquidationWarningSettings).mockResolvedValue({
      usd: 5.1,
      pct: null,
    })

    await act(async () => {
      root.render(
        <TooltipProvider>
          <LiquidationWarningSettings />
        </TooltipProvider>
      )
    })

    const usd = host.querySelector<HTMLInputElement>("#liquidation-warning-usd")
    const pct = host.querySelector<HTMLInputElement>("#liquidation-warning-pct")
    expect(usd?.value).toBe("")
    expect(pct?.value).toBe("50")
    expect(host.textContent).toContain("Leave both blank to switch it off")

    await act(async () => {
      enter(usd!, "5.1")
      enter(pct!, "")
      host.querySelector("form")!.requestSubmit()
    })

    expect(saveLiquidationWarningSettings).toHaveBeenCalledWith({
      usd: 5.1,
      pct: null,
    })
  })

  it("refuses more than 100 out of 100", async () => {
    vi.mocked(loadLiquidationWarningSettings).mockResolvedValue({
      usd: null,
      pct: null,
    })
    await act(async () => {
      root.render(
        <TooltipProvider>
          <LiquidationWarningSettings />
        </TooltipProvider>
      )
    })
    const pct = host.querySelector<HTMLInputElement>("#liquidation-warning-pct")!
    await act(async () => {
      enter(pct, "101")
      host.querySelector("form")!.requestSubmit()
    })

    expect(saveLiquidationWarningSettings).not.toHaveBeenCalled()
    expect(pct.getAttribute("aria-invalid")).toBe("true")
    expect(showErrorToast).not.toHaveBeenCalled()
  })

  it("offers to try the load again after a failure", async () => {
    vi.mocked(loadLiquidationWarningSettings)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ usd: 12, pct: null })

    await act(async () => {
      root.render(
        <TooltipProvider>
          <LiquidationWarningSettings />
        </TooltipProvider>
      )
    })

    expect(host.textContent).toContain(
      "The liquidation warning could not be loaded."
    )
    expect(showErrorToast).toHaveBeenCalledWith("Could not load")

    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click()
    })

    expect(loadLiquidationWarningSettings).toHaveBeenCalledTimes(2)
    expect(
      host.querySelector<HTMLInputElement>("#liquidation-warning-usd")?.value
    ).toBe("12")
  })
})

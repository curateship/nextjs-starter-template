// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn<() => Promise<boolean>>(),
  save: vi.fn<(paused: boolean) => Promise<boolean>>(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
const errors = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("@/lib/api/trade/line-alert-settings", () => ({
  getLineAlertsPausedLoadErrorMessage: vi.fn(() => "Could not load"),
  getLineAlertsPausedSaveErrorMessage: vi.fn(() => "Could not save"),
  loadLineAlertsPausedSetting: api.load,
  saveLineAlertsPausedSetting: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: errors.show }))
vi.mock("sonner", () => ({ toast: toasts }))

import { LineAlertSettings } from "@/components/trade/line-alert-settings"

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
  vi.clearAllMocks()
})

function toggle() {
  return host.querySelector<HTMLButtonElement>('[role="switch"]')
}

describe("the master switch for line alerts", () => {
  it("reads on for an account that is not paused, and pauses on one press", async () => {
    api.load.mockResolvedValue(false)
    api.save.mockResolvedValue(true)
    await act(async () => root.render(<LineAlertSettings />))
    expect(toggle()?.getAttribute("aria-checked")).toBe("true")

    await act(async () => toggle()!.click())
    expect(api.save).toHaveBeenCalledWith(true)
    expect(toggle()?.getAttribute("aria-checked")).toBe("false")
    expect(toasts.success).toHaveBeenCalledWith(
      "Line alerts are paused. Every line keeps its alert, and none fires until this is back on."
    )
  })

  it("reads off for a paused account and switches the alerts back on", async () => {
    api.load.mockResolvedValue(true)
    api.save.mockResolvedValue(false)
    await act(async () => root.render(<LineAlertSettings />))
    expect(toggle()?.getAttribute("aria-checked")).toBe("false")

    await act(async () => toggle()!.click())
    expect(api.save).toHaveBeenCalledWith(false)
    expect(toggle()?.getAttribute("aria-checked")).toBe("true")
    expect(toasts.success).toHaveBeenCalledWith("Line alerts are on.")
  })

  it("puts the switch back and says why when the save is refused", async () => {
    api.load.mockResolvedValue(false)
    api.save.mockRejectedValue(new Error("nope"))
    await act(async () => root.render(<LineAlertSettings />))

    await act(async () => toggle()!.click())
    expect(toggle()?.getAttribute("aria-checked")).toBe("true")
    expect(errors.show).toHaveBeenCalledWith("Could not save")
  })

  it("offers another go when the setting cannot be read", async () => {
    api.load.mockRejectedValueOnce(new Error("nope"))
    await act(async () => root.render(<LineAlertSettings />))
    expect(toggle()).toBeNull()
    expect(host.textContent).toContain(
      "The line alerts setting could not be loaded."
    )
    expect(errors.show).toHaveBeenCalledWith("Could not load")

    api.load.mockResolvedValue(true)
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click()
    })
    expect(toggle()?.getAttribute("aria-checked")).toBe("false")
  })
})

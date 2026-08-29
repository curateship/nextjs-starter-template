// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  save: vi.fn(),
}))
const sounds = vi.hoisted(() => ({
  prime: vi.fn(() => Promise.resolve(true)),
}))
const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock("@/app/page-title", () => ({ useTradePageTitle: vi.fn() }))
vi.mock("@/components/trade/trade-sounds", () => ({
  useRememberedTradeSoundSetting: () => false,
}))
vi.mock("@/lib/api/trade/trade-sound-settings", () => ({
  getTradeSoundSettingsLoadErrorMessage: vi.fn(() => "Could not load"),
  getTradeSoundSettingsSaveErrorMessage: vi.fn(() => "Could not save"),
  loadTradeSoundSettings: vi.fn(),
  saveTradeSoundSettings: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))
vi.mock("@/lib/trade/trade-sounds", () => ({
  ensureTradeSoundSetting: vi.fn(() => Promise.resolve(false)),
  primeTradeSounds: sounds.prime,
  rememberTradeSoundSetting: vi.fn(),
  TRADE_SOUND_SETTINGS_CHANNEL: "trade-sound-settings",
}))
vi.mock("sonner", () => ({ toast: toasts }))

import TradeSoundSettings from "@/components/trade/trade-sound-settings"

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

describe("trade sound settings", () => {
  it("starts the fill preview inside the switch click", async () => {
    api.save.mockResolvedValue({ enabled: true })
    await act(async () => root.render(<TradeSoundSettings />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    })

    expect(sounds.prime).toHaveBeenCalledOnce()
    expect(api.save).toHaveBeenCalledWith(true)
    expect(toasts.success).toHaveBeenCalledWith(
      "Trade sounds are on. That was the fill sound."
    )
  })

  it("explains when the browser refuses the preview", async () => {
    sounds.prime.mockResolvedValueOnce(false)
    api.save.mockResolvedValue({ enabled: true })
    await act(async () => root.render(<TradeSoundSettings />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    })

    expect(toasts.warning).toHaveBeenCalledWith(
      "Trade sounds are on, but the test sound could not play. Allow sound for this site, then switch sounds off and on again."
    )
  })
})

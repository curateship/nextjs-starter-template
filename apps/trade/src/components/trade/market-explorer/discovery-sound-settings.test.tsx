// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  prime: vi.fn(),
  play: vi.fn(),
  error: vi.fn(),
}))
vi.mock("@/lib/api/trade/explorer-sound", () => ({
  loadDiscoverySound: api.load,
  saveDiscoverySound: api.save,
}))
vi.mock("@/lib/trade/discovery-sound", () => ({
  primeDiscoverySound: api.prime,
  playDiscoverySound: api.play,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: api.error }))
import { DiscoverySoundSettings } from "./discovery-sound-settings"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  api.load.mockResolvedValue(false)
  api.save.mockResolvedValue(true)
  api.prime.mockResolvedValue(true)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
it("previews and saves the optional sound, then restores the switch after a save failure", async () => {
  await act(async () => root.render(<DiscoverySoundSettings />))
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  await act(async () => toggle.click())
  expect(api.save).toHaveBeenCalledWith(true)
  expect(api.play).toHaveBeenCalledOnce()
  expect(toggle.getAttribute("aria-checked")).toBe("true")
  api.save.mockRejectedValueOnce(new Error("failed"))
  await act(async () => toggle.click())
  expect(toggle.getAttribute("aria-checked")).toBe("true")
  expect(api.error).toHaveBeenCalledWith(
    "Discovery sounds could not be saved. Try again."
  )
})
it("offers a retry if the account setting does not load", async () => {
  api.load.mockRejectedValueOnce(new Error("failed"))
  await act(async () => root.render(<DiscoverySoundSettings />))
  expect(host.textContent).toContain("Retry discovery sound settings")
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click()
  )
  expect(host.querySelector('[role="switch"]')).not.toBeNull()
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneRecord } from "@/lib/api/phones/phones"

const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))
const api = vi.hoisted(() => ({ runSetupCheck: vi.fn(), wipePhone: vi.fn() }))
vi.mock("@/lib/api/phones/phones", () => ({
  ...api,
  getPhoneErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const healthApi = vi.hoisted(() => ({
  checkIcloud: vi.fn(),
  loadIcloudState: vi.fn(),
  loadSelfTest: vi.fn(),
  runSelfTest: vi.fn(),
  updateApp: vi.fn(),
}))
vi.mock("@/lib/api/phones/health", () => ({
  ...healthApi,
  getPhoneHealthErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const screenApi = vi.hoisted(() => ({
  closeScreenWindow: vi.fn(async () => {}),
  loadScreen: vi.fn(),
  sendToScreen: vi.fn(),
  setScreenControl: vi.fn(),
}))
vi.mock("@/lib/api/phones/screen", () => ({
  ...screenApi,
  getScreenErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const settingsApi = vi.hoisted(() => ({ loadPhoneSettings: vi.fn(), savePhoneSettingsFn: vi.fn(), saveTestPhone: vi.fn() }))
vi.mock("@/lib/api/phones/settings", () => ({
  ...settingsApi,
  getPhoneSettingsErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
vi.mock("@/components/settings/use-reported-save-status", () => ({ useReportedSaveStatus: () => () => {} }))

import { TooltipProvider } from "@/components/ui/tooltip"

import { PhoneScreenDialog } from "./phone-screen-dialog"
import PhoneSettingsPanel from "./phone-settings"
import { PhoneSetupPanel } from "./phone-setup-panel"
import { SelfTestDialog } from "./self-test-dialog"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function phone(patch: Partial<PhoneRecord>): PhoneRecord {
  return {
    id: "i1",
    name: "iPhone 12",
    model: "iPhone 12",
    kind: "iphone",
    androidVersion: "17.6",
    serial: "00008030-000A",
    simCarrier: "Fido",
    simNumber: "555 0101",
    connection: "sim",
    proxy: null,
    held: false,
    notes: "",
    folderId: null,
    labelId: null,
    tags: [],
    shelfSlot: "",
    usbPort: "usb:1-1",
    status: "connected",
    offlineReason: "",
    inUse: false,
    lastSeenAt: new Date(),
    accounts: [],
    vitals: { batteryPercent: 82, temperatureC: 31, storageUsedPercent: 60, signal: "not_reported", at: new Date() },
    apps: { reddit: "2025.40.0" },
    setupCheck: null,
    needsWipeAt: null,
    wipedAt: null,
    heldImportantAt: null,
    addressStop: null,
    setupChecking: false,
    createdAt: new Date(),
    ...patch,
  }
}

/**
 * The windows that say different things for an iPhone (phone farm file 08),
 * rendered from the real components with the server faked: the Setup tab's
 * Check iCloud and wipe words, the screen window's swipe keys and texted-code
 * line, the second test-phone slot in Settings → Phones, and the Self-test
 * window's iPhone side with App Store wording.
 */
describe("iPhone windows", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    for (const fn of Object.values(healthApi)) fn.mockReset()
    for (const fn of Object.values(screenApi)) fn.mockReset()
    for (const fn of Object.values(settingsApi)) fn.mockReset()
    screenApi.closeScreenWindow.mockResolvedValue(undefined)
    toasts.errors = []
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(node: React.ReactNode) {
    await act(async () => {
      root.render(<TooltipProvider>{node}</TooltipProvider>)
    })
  }

  const text = () => document.body.textContent ?? ""
  const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (one) => one.textContent?.trim() === name || one.getAttribute("aria-label") === name
    )

  it("shows Check iCloud on an iPhone's Setup tab, the last read in words, and refuses the wipe with the reason", async () => {
    healthApi.loadIcloudState.mockResolvedValue({ signedOut: false, appleId: "tyler@example.com", checkedAt: new Date() })
    healthApi.checkIcloud.mockResolvedValue("act1")
    api.wipePhone.mockRejectedValue(new Error("Sign out of iCloud on its screen first (Settings, your name, Sign Out), then press Check iCloud. An iPhone erased while signed in is locked to that Apple ID."))
    await render(<PhoneSetupPanel phone={phone({})} onChanged={async () => {}} />)
    expect(text()).toContain("Read as signed in to an Apple ID (tyler@example.com)")
    expect(text()).toContain("App Store setting")
    await act(async () => button("Check iCloud")!.click())
    expect(healthApi.checkIcloud).toHaveBeenCalledWith("i1")

    await act(async () => button("Wipe the phone")!.click())
    expect(text()).toContain("Erase All Content and Settings")
    expect(text()).toContain("tap Trust this computer")
    const confirm = Array.from(document.querySelectorAll("button")).filter((one) => one.textContent?.trim() === "Wipe the phone").at(-1)!
    await act(async () => confirm.click())
    expect(api.wipePhone).toHaveBeenCalledWith("i1")
    expect(toasts.errors.at(-1)).toContain("Sign out of iCloud on its screen first")

    // An Android's tab has no iCloud to check.
    await render(<PhoneSetupPanel phone={phone({ id: "a1", kind: "android", name: "Pixel 8a" })} onChanged={async () => {}} />)
    expect(button("Check iCloud")).toBeUndefined()
    expect(text()).toContain("Play Store setting")
  })

  it("names an iPhone's keys as swipes and says the code is read off Messages", async () => {
    screenApi.loadScreen.mockResolvedValue({ frame: null, controlUntil: null, codes: [], texted: null })
    await render(<PhoneScreenDialog phone={phone({})} onClose={() => {}} onChanged={async () => {}} />)
    expect(button("Back (swipe)")).toBeDefined()
    expect(button("App switcher (swipe)")).toBeDefined()
    expect(button("Recent apps")).toBeUndefined()
    expect(text()).toContain("reads the newest code off the Messages app while this window is open with control on")

    await render(<PhoneScreenDialog phone={phone({ id: "a1", kind: "android" })} onClose={() => {}} onChanged={async () => {}} />)
    expect(button("Back")).toBeDefined()
    expect(button("Recent apps")).toBeDefined()
  })

  it("has a test-phone slot per kind in Settings → Phones, each listing its own kind only", async () => {
    settingsApi.loadPhoneSettings.mockResolvedValue({
      maxWorking: 5,
      screenshotDays: 7,
      shelfRows: 2,
      shelfColumns: 5,
      testPhoneId: null,
      testPhoneIphoneId: "i1",
      phones: [
        { id: "a1", name: "Pixel 8a", kind: "android", accounts: 0 },
        { id: "i1", name: "iPhone 12", kind: "iphone", accounts: 0 },
      ],
    })
    await render(<PhoneSettingsPanel />)
    expect(text()).toContain("The Android the daily self-test runs on")
    expect(text()).toContain("The iPhone the daily self-test runs on")
    const iphoneSlot = document.getElementById("promo-phones-test-iphone")!
    expect(iphoneSlot.textContent).toContain("iPhone 12")
    const androidSlot = document.getElementById("promo-phones-test-phone")!
    expect(androidSlot.textContent).toContain("None, no self-test on Android")
  })

  it("shows the iPhone side of the Self-test window with App Store words, and runs it for that kind", async () => {
    healthApi.loadSelfTest.mockResolvedValue({
      android: { testPhone: null, lastAskedAt: null, checks: [], rollouts: [] },
      iphone: {
        testPhone: { id: "i1", name: "iPhone 12" },
        lastAskedAt: new Date(),
        checks: [{ action: "reddit/comment", passed: false, step: "Open the reply box", error: "Not on screen.", checkedAt: new Date(), phoneActionId: null }],
        rollouts: [{ app: "reddit", status: "available", fromVersion: "2025.40.0", toVersion: "", note: "", changedAt: new Date() }],
      },
    })
    healthApi.runSelfTest.mockResolvedValue(undefined)
    await render(<SelfTestDialog open phones={[phone({})]} onClose={() => {}} onChanged={async () => {}} />)
    expect(text()).toContain("The self-test on iPhone")
    expect(text()).toContain("Jobs that need it on an iPhone are refused until it passes.")
    expect(text()).toContain("The iPhone test phone has 2025.40.0.")
    expect(text()).toContain("Settings, App Store, App Updates")
    expect(button("Update the other iPhones")).toBeDefined()
    const runs = Array.from(document.querySelectorAll("button")).filter((one) => one.textContent?.trim() === "Run it now")
    expect(runs).toHaveLength(2)
    await act(async () => runs[1].click())
    expect(healthApi.runSelfTest).toHaveBeenCalledWith("iphone")
  })
})

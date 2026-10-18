// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneRecord, PhonesPage } from "@/lib/api/phones/phones"
import type { PhonesSearch } from "@/lib/phones/phones-search"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 } }),
}))
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))

const api = vi.hoisted(() => ({
  askRackLog: vi.fn(),
  changePhones: vi.fn(),
  disconnectPhoneRack: vi.fn(),
  loadPhoneActions: vi.fn(),
  loadPhoneJobs: vi.fn(),
  loadRackLog: vi.fn(),
  loadWaitingPhoneJobs: vi.fn(),
  makePairingCode: vi.fn(),
  pauseRack: vi.fn(),
  resumeRack: vi.fn(),
  runPhoneAction: vi.fn(),
  savePhone: vi.fn(),
}))
vi.mock("@/lib/api/phones/phones", () => ({
  ...api,
  getPhoneErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const healthApi = vi.hoisted(() => ({
  clearActionPictures: vi.fn(),
  loadPhoneHistory: vi.fn(),
  loadPhoneReadings: vi.fn(),
  loadSelfTest: vi.fn(),
  loadStepPictures: vi.fn(),
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
  loadWall: vi.fn(),
  sendToScreen: vi.fn(),
  setScreenControl: vi.fn(),
}))
vi.mock("@/lib/api/phones/screen", () => ({
  ...screenApi,
  getScreenErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const jobsApi = vi.hoisted(() => ({
  cancelWaitingJobs: vi.fn(),
  retryFailedJobs: vi.fn(),
}))
vi.mock("@/lib/api/social/jobs", () => ({
  ...jobsApi,
  getJobsErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

import { TooltipProvider } from "@/components/ui/tooltip"

import { PhonesDashboard } from "./phones-dashboard"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function phone(patch: Partial<PhoneRecord>): PhoneRecord {
  return {
    id: "p1",
    name: "Pixel 8a",
    model: "Pixel 8a",
    kind: "android",
    androidVersion: "16",
    serial: "A1",
    simCarrier: "Mint Mobile",
    simNumber: "555 0100",
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
    vitals: { batteryPercent: 82, temperatureC: 31, storageUsedPercent: 60, signal: "in_service", at: new Date() },
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

const PAGE: PhonesPage = {
  phones: [
    phone({ accounts: [{ id: "a1", platform: "reddit", handle: "quiet_builder", blocked: false }] }),
    phone({
      id: "p2",
      name: "Galaxy A15",
      serial: "B2",
      status: "offline",
      offlineReason: "Not plugged in",
      shelfSlot: "4",
      connection: "wifi",
      proxy: { id: "x1", label: "US home line", host: "gate.test" },
    }),
  ],
  racks: [
    {
      id: "r1",
      name: "Tyler's Mac",
      wdaExpiresAt: null,
      platform: "macOS 26.0",
      version: "2026.10.13.1",
      live: true,
      seenAt: new Date(),
      pairedAt: new Date(),
      updateNote: "Went back to 2026.10.13.1, because 0.0.0-broken stopped with code 1 before it checked in.",
      upToDate: true,
    },
  ],
  rackVersion: "2026.10.13.1",
  pausedAt: null,
  testPhoneId: null,
  testPhoneIphoneId: null,
  folders: [],
  labels: [],
  proxies: [{ id: "x1", label: "US home line", host: "gate.test" }],
  shelfRows: 2,
  shelfColumns: 5,
  projects: [],
}

/**
 * The Phones dashboard, rendered from the real components with the server
 * faked: what each row says, the rack window's code and Disconnect, and a
 * phone's window asking the rack for a check.
 */
describe("Phones dashboard", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (const fn of Object.values(api)) fn.mockReset()
    for (const fn of Object.values(screenApi)) fn.mockReset()
    for (const fn of Object.values(healthApi)) fn.mockReset()
    for (const fn of Object.values(jobsApi)) fn.mockReset()
    screenApi.closeScreenWindow.mockResolvedValue(undefined)
    navigation.navigate.mockReset()
    toasts.errors = []
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function render(page: PhonesPage, openId?: string, filters?: PhonesSearch) {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <PhonesDashboard initial={page} openId={openId} filters={filters} />
        </TooltipProvider>
      )
    })
  }
  const rowNames = () =>
    Array.from(container.querySelectorAll("tbody tr")).map((row) => row.querySelector("td:nth-child(2) button")?.textContent ?? "")

  const text = () => document.body.textContent ?? ""
  const button = (name: string) => {
    const found = Array.from(document.querySelectorAll("button")).find(
      (one) => one.textContent?.trim() === name || one.getAttribute("aria-label") === name
    )
    if (!found) throw new Error(`No button "${name}"`)
    return found
  }
  const openTab = async (name: string) => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((one) => one.textContent === name)!
    await act(async () => {
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
  }
  const click = async (name: string) => {
    await act(async () => {
      button(name).click()
    })
  }

  it("shows each phone with its account, status, slot and carrier", async () => {
    await render(PAGE)
    const rows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent)
    expect(rows[0]).toContain("Galaxy A15")
    expect(rows[0]).toContain("Offline· slot 4")
    expect(rows[0]).toContain("Not plugged in")
    expect(rows[0]).toContain("Wi-Fi through US home line")
    expect(rows[1]).toContain("Pixel 8a")
    expect(rows[1]).toContain("Reddit: u/quiet_builder")
    expect(rows[1]).toContain("Connected")
    expect(rows[1]).toContain("Mint Mobile 555 0100")
  })

  it("says how to start when there are no phones and no rack", async () => {
    await render({ ...PAGE, phones: [], racks: [] })
    expect(text()).toContain("No phones yet. Press Rack to connect the computer the phones plug into")
  })

  it("makes a pairing code with the whole command, and disconnects the rack after asking", async () => {
    api.makePairingCode.mockResolvedValue({
      code: "ABCD-EFGH",
      expiresAt: new Date(),
      command: "curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH",
    })
    api.disconnectPhoneRack.mockResolvedValue(undefined)
    await render(PAGE)

    await click("Rack connected")
    expect(text()).toContain("macOS 26.0")
    expect(text()).toContain("2026.10.13.1, the newest")
    expect(text()).toContain("Went back to 2026.10.13.1")

    await click("Make a pairing code")
    expect(text()).toContain("curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH")

    await click("Disconnect this rack")
    expect(text()).toContain("Disconnect this rack?")
    expect(api.disconnectPhoneRack).not.toHaveBeenCalled()
    await click("Disconnect rack")
    expect(api.disconnectPhoneRack).toHaveBeenCalledWith("r1")
  })

  it("opens a phone's window and asks the rack to read the system version", async () => {
    api.loadPhoneActions.mockResolvedValue([])
    api.runPhoneAction.mockResolvedValue({ id: "act1" })
    await render(PAGE, "p1")
    expect(text()).toContain("Where it sits")
    expect((document.getElementById("phone-usb") as HTMLInputElement).value).toBe("usb:1-1")

    await openTab("Actions")
    expect(text()).toContain("Nothing has run on this phone yet.")

    api.loadPhoneActions.mockResolvedValue([
      {
        id: "act1",
        action: "phone/android-version",
        status: "done",
        answer: "Settings says Android 16, the same as Android itself reports.",
        error: "",
        recovered: "",
        createdAt: new Date(),
        finishedAt: new Date(),
        steps: ["Opened About phone", "Read Android 16"],
      },
    ])
    await click("Read the system version from Settings")
    expect(api.runPhoneAction).toHaveBeenCalledWith("p1", "phone/android-version")
    expect(text()).toContain("Settings says Android 16, the same as Android itself reports.")

    healthApi.loadStepPictures.mockResolvedValue([
      { id: "s1", step: "Opened About phone", src: "data:image/jpeg;base64,/9j/AAAA" },
      { id: "s2", step: "Read Android 16", src: null },
    ])
    await click("Show the 2 steps")
    expect(healthApi.loadStepPictures).toHaveBeenCalledWith("act1")
    expect(document.querySelector('img[alt="Step 1: Opened About phone"]')).not.toBeNull()
    expect(text()).toContain("This picture could not be kept.")
  })

  it("shows where a failed action stopped, and clears its pictures", async () => {
    api.loadPhoneActions.mockResolvedValue([
      {
        id: "act2",
        action: "reddit/comment",
        status: "failed",
        answer: "",
        error: "The app stopped responding, so the rack closed it and opened it again.",
        recovered: "app",
        createdAt: new Date(),
        finishedAt: new Date(),
        steps: ["Opened the post", "Open the reply box"],
      },
    ])
    healthApi.clearActionPictures.mockResolvedValue(undefined)
    await render(PAGE, "p1")
    await openTab("Actions")
    expect(text()).toContain("Stopped at: Open the reply box")
    expect(text()).toContain("The app froze, so the rack closed it and opened it again.")
    await click("Clear the pictures")
    expect(healthApi.clearActionPictures).toHaveBeenCalledWith("act2")
  })

  it("shows the phone's health and history in its window", async () => {
    healthApi.loadPhoneReadings.mockResolvedValue([])
    healthApi.loadPhoneHistory.mockResolvedValue([
      { id: "e1", kind: "ran_hot", detail: "The battery reached 46.2°C.", at: new Date() },
      { id: "e2", kind: "plugged_in", detail: "On USB port usb:1-1.", at: new Date() },
    ])
    await render(PAGE, "p1")
    await openTab("Health")
    expect(text()).toContain("82 out of 100")
    expect(text()).toContain("31.0°C")
    expect(text()).toContain("Has a signal")
    expect(text()).toContain("No readings yet. A point is kept every ten minutes.")
    expect(text()).toContain("2025.40.0")
    await openTab("History")
    expect(text()).toContain("Ran hot")
    expect(text()).toContain("The battery reached 46.2°C.")
    expect(text().indexOf("Ran hot")).toBeLessThan(text().indexOf("Plugged in"))
  })

  it("lists app versions on each row, and keeps the other phones' update pressable but refused until the test passes", async () => {
    healthApi.loadSelfTest.mockResolvedValue({
      android: {
        testPhone: { id: "p2", name: "Galaxy A15" },
        lastAskedAt: new Date(),
        checks: [{ action: "reddit/comment", passed: false, step: "Open the reply box", error: "Could not find it.", checkedAt: new Date(), phoneActionId: null }],
        rollouts: [{ app: "reddit", status: "available", fromVersion: "2025.40.0", toVersion: "", note: "", changedAt: new Date() }],
      },
      iphone: { testPhone: null, lastAskedAt: null, checks: [], rollouts: [] },
    })
    healthApi.updateApp.mockRejectedValue(new Error("The test phone has to pass the self-test on the new version before the other phones update."))
    await render(PAGE)
    expect(text()).toContain("Reddit 2025.40.0")
    await click("Self-test")
    expect(text()).toContain("Post a Reddit comment: broken")
    expect(text()).toContain("A newer version is out. The Android test phone has 2025.40.0.")
    const others = Array.from(document.querySelectorAll("button")).filter((button) => button.textContent === "Update the other Androids")
    expect(others[0].disabled).toBe(false)
    await act(async () => {
      others[0].click()
    })
    expect(healthApi.updateApp).toHaveBeenCalledWith("reddit", "others", "android")
    expect(toasts.errors.at(-1)).toContain("has to pass the self-test")
  })

  it("pauses the rack, and asks which waiting jobs to drop before resuming", async () => {
    api.pauseRack.mockResolvedValue(undefined)
    await render(PAGE)
    const pauseSwitch = () => document.getElementById("phones-rack-paused") as HTMLButtonElement
    expect(document.querySelector('label[for="phones-rack-paused"]')?.textContent).toBe("Pause the rack")
    await act(async () => {
      pauseSwitch().click()
    })
    expect(api.pauseRack).toHaveBeenCalled()

    api.loadWaitingPhoneJobs.mockResolvedValue([
      { id: "j1", kind: "comment", phoneName: "Pixel 8a", createdAt: new Date() },
      { id: "j2", kind: "health", phoneName: "Pixel 8a", createdAt: new Date() },
    ])
    api.resumeRack.mockResolvedValue({ dropped: 1 })
    await render({ ...PAGE, pausedAt: new Date() })
    expect(document.querySelector('label[for="phones-rack-paused"]')?.textContent).toBe("Rack paused")
    await act(async () => {
      pauseSwitch().click()
    })
    expect(text()).toContain("Resume the rack?")
    const firstTick = document.querySelector('[role="checkbox"][id="drop-j1"]') as HTMLButtonElement
    await act(async () => {
      firstTick.click()
    })
    await click("Drop 1 and resume")
    expect(api.resumeRack).toHaveBeenCalledWith(["j1"])
  })

  it("opens a phone's screen, sends nothing with control off, and taps with it on", async () => {
    screenApi.loadScreen.mockResolvedValue({
      frame: { src: "data:image/jpeg;base64,/9j/AA", width: 1080, height: 2400, seq: 1, at: new Date() },
      controlUntil: null,
      codes: [{ accountId: "a1", handle: "quiet_builder", code: "482913", secondsLeft: 12 }],
      texted: { code: "556677", from: "Reddit", at: new Date() },
    })
    await render(PAGE)
    await click("Show the screen of Pixel 8a")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(document.querySelector('img[alt="Pixel 8a\'s screen"]')).not.toBeNull()
    expect(text()).toContain("482913")
    expect(text()).toContain("556677")

    await click("Back")
    expect(screenApi.sendToScreen).not.toHaveBeenCalled()
    expect(toasts.errors).toContain("Control is off. Switch it on under the screen first.")

    screenApi.setScreenControl.mockResolvedValue({ controlUntil: new Date(Date.now() + 900_000) })
    const control = document.getElementById("phone-screen-control") as HTMLButtonElement
    await act(async () => {
      control.click()
    })
    expect(screenApi.setScreenControl).toHaveBeenCalledWith("p1", true)
    screenApi.sendToScreen.mockResolvedValue(undefined)
    await click("Back")
    expect(screenApi.sendToScreen).toHaveBeenCalledWith("p1", { kind: "key", key: "back" })
  })

  it("refuses to save a phone with no name, keeping what was typed", async () => {
    await render(PAGE, "p1")
    const name = document.getElementById("phone-name") as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(name, "")
      name.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click("Save changes")
    expect(api.savePhone).not.toHaveBeenCalled()
    expect(toasts.errors).toEqual(["Give the phone a name first."])
    expect(name.getAttribute("aria-invalid")).toBe("true")
  })

  describe("file 09, seeing the rack", () => {
    const iphone = phone({
      id: "p3",
      name: "iPhone 15",
      kind: "iphone",
      serial: "00008030-UDID",
      simCarrier: "T-Mobile",
      shelfSlot: "7",
      needsWipeAt: new Date(),
    })
    const SHELF: PhonesPage = {
      ...PAGE,
      phones: [...PAGE.phones, iphone],
      projects: [{ id: "proj1", name: "Running shoes", phoneIds: ["p1"] }],
    }

    it("narrows the rows by status, kind, carrier, project, wiping and the search box, from the address", async () => {
      await render(SHELF, undefined, { status: "offline" })
      expect(rowNames()).toEqual(["Galaxy A15"])
      await render(SHELF, undefined, { kind: "iphone" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await render(SHELF, undefined, { carrier: "T-Mobile" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await render(SHELF, undefined, { project: "proj1" })
      expect(rowNames()).toEqual(["Pixel 8a"])
      await render(SHELF, undefined, { wipe: "needed" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await render(SHELF, undefined, { q: "UDID" })
      expect(rowNames()).toEqual(["iPhone 15"])
      expect((document.querySelector('input[name="phone-search"]') as HTMLInputElement).value).toBe("UDID")
    })

    it("puts a picked filter into the address, and typing into the search box after it settles", async () => {
      await render(SHELF)
      const search = document.querySelector('input[name="phone-search"]') as HTMLInputElement
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
        setter.call(search, "B2")
        search.dispatchEvent(new Event("input", { bubbles: true }))
      })
      expect(rowNames()).toEqual(["Galaxy A15"])
      expect(navigation.navigate).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(navigation.navigate).toHaveBeenCalledTimes(1)
      const call = navigation.navigate.mock.calls[0][0] as { replace: boolean; search: (previous: Record<string, unknown>) => Record<string, unknown> }
      expect(call.replace).toBe(true)
      expect(call.search({ status: "offline" })).toEqual({ status: "offline", q: "B2" })
    })

    it("draws the map by slot: slot 7 on the second row, second from the left, and lists a phone with no slot under it", async () => {
      await render({ ...SHELF, phones: [iphone, PAGE.phones[1], PAGE.phones[0]] })
      await click("Map: the shelf drawn by slot")
      expect(text()).toContain("The shelf, 2 rows of 5")
      const cells = Array.from(document.querySelectorAll('ol[aria-label="The shelf"] > li'))
      expect(cells).toHaveLength(10)
      const seven = document.querySelector('[data-slot="7"]')!
      expect(seven.getAttribute("data-row")).toBe("2")
      expect(seven.getAttribute("data-column")).toBe("2")
      expect(seven.textContent).toContain("iPhone 15")
      expect(seven.textContent).toContain("Connected")
      const four = document.querySelector('[data-slot="4"]')!
      expect(four.textContent).toContain("Galaxy A15")
      expect(four.textContent).toContain("Offline")
      expect(document.querySelector('[data-slot="1"]')!.textContent).toBe("1")
      expect(text()).toContain("Not on the shelf")
      expect(text()).toContain("Pixel 8aConnected, no slot typed")

      await click("Open Galaxy A15, slot 4")
      const call = navigation.navigate.mock.calls.at(-1)![0] as { search: (previous: Record<string, unknown>) => Record<string, unknown> }
      expect(call.search({})).toEqual({ open: "p2" })
    })

    it("shows a picture of each connected phone on the wall, a status word for an offline one, and opens a screen from a tile", async () => {
      screenApi.loadWall.mockResolvedValue({
        phones: [
          { id: "p1", name: "Pixel 8a", status: "connected", src: "data:image/jpeg;base64,/9j/AA", at: new Date() },
          { id: "p2", name: "Galaxy A15", status: "offline", src: null, at: null },
        ],
      })
      screenApi.loadScreen.mockResolvedValue({ frame: null, controlUntil: null, codes: [], texted: null })
      await render(PAGE)
      await click("Wall: a live picture of every connected phone")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(screenApi.loadWall).toHaveBeenCalledTimes(1)
      const tiles = Array.from(document.querySelectorAll('button[aria-label^="Open the screen of"]'))
      expect(tiles).toHaveLength(2)
      expect(tiles[0].querySelector("img")?.getAttribute("alt")).toBe("Pixel 8a's screen")
      expect(tiles[1].querySelector("img")).toBeNull()
      expect(tiles[1].textContent).toContain("Offline")

      // Every 5 seconds, Tyler's choice of 18 Oct 2026.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(screenApi.loadWall).toHaveBeenCalledTimes(2)

      await click("Open the screen of Pixel 8a")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(document.getElementById("phone-screen-control")).not.toBeNull()
      expect(screenApi.loadScreen).toHaveBeenCalledWith("p1", 0)
    })

    it("lists a phone's jobs on its Jobs tab, and cancels one through the Jobs window's own call", async () => {
      api.loadPhoneJobs.mockResolvedValue({
        program: { running: true, seenAt: new Date(), startedAt: new Date() },
        jobs: [
          {
            id: "j1",
            kind: "comment",
            status: "queued",
            what: 'Post a comment: "Best trail shoes?"',
            where: "u/quiet_builder · Pixel 8a",
            project: "Running shoes",
            attempts: 0,
            maxAttempts: 1,
            lastError: "",
            addedAt: new Date(),
            claimedAt: null,
            runAfter: null,
            finishedAt: null,
            laneBusy: false,
            canRetry: false,
          },
        ],
      })
      jobsApi.cancelWaitingJobs.mockResolvedValue({ completed: ["j1"], skipped: [] })
      await render(PAGE, "p1")
      await openTab("Jobs")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(api.loadPhoneJobs).toHaveBeenCalledWith("p1")
      expect(text()).toContain('Post a comment: "Best trail shoes?"')
      expect(text()).toContain("u/quiet_builder · Pixel 8a · for Running shoes")
      await click('Cancel Post a comment: "Best trail shoes?"')
      expect(jobsApi.cancelWaitingJobs).toHaveBeenCalledWith(["j1"])
      expect(api.loadPhoneJobs).toHaveBeenCalledTimes(2)
    })

    it("asks the rack for its log, waits in words, shows the lines when they arrive, and says when the tool's signature has run out", async () => {
      api.askRackLog.mockResolvedValue(undefined)
      // The tab reads what Promo holds before it asks (nothing yet), then polls.
      api.loadRackLog.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({
        lines: ["12:00 started", "12:01 reddit/comment on A1 failed: Could not find the reply box"],
        at: new Date(),
      })
      const past = new Date("2026-10-01T10:00:00Z")
      await render({ ...PAGE, racks: [{ ...PAGE.racks[0], wdaExpiresAt: past }] })
      await click("Rack connected")
      expect(text()).toContain("WebDriverAgent signed until")
      expect(text()).toContain(", which has passed")

      await openTab("Log")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(api.askRackLog).toHaveBeenCalledWith("r1")
      expect(text()).toContain("The rack has not answered yet.")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(text()).toContain("The rack's last 2 lines")
      expect(document.querySelector("pre")?.textContent).toBe(
        "12:00 started\n12:01 reddit/comment on A1 failed: Could not find the reply box"
      )
    })

    it("says the rack is not checking in on the Log tab when it is not", async () => {
      await render({ ...PAGE, racks: [{ ...PAGE.racks[0], live: false, seenAt: new Date(Date.now() - 600_000) }] })
      await click("Rack not checking in")
      await openTab("Log")
      expect(api.askRackLog).not.toHaveBeenCalled()
      expect(text()).toContain("The rack is not checking in, so it cannot send its log.")
    })
  })
})

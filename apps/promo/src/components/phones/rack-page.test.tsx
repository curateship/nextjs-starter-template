// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneRecord, RackPage, RacksPage, RackView } from "@/lib/api/phones/phones"
import type { RackSearch } from "@/lib/phones/rack-search"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
}))
vi.mock("@/components/shell/shell-layout", () => {
  const runtime = { config: { dashboardRowsPerPage: 25, styling: { dashboardTabs: "pills" } } }
  return { useShellRuntime: () => runtime, useOptionalShellRuntime: () => runtime }
})
vi.mock("@/components/social/guest/guest-mode", () => ({ usePromoSaveStatus: () => () => {}, usePromoGuest: () => null }))
// The description is the shell's editor, tested where it lives; here it is a plain box.
vi.mock("@/components/shared/rich-text-editor", () => ({ DocumentEditor: () => <div data-testid="editor" /> }))
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))

const api = vi.hoisted(() => ({
  addPhone: vi.fn(),
  askRackLog: vi.fn(),
  changePhones: vi.fn(),
  checkPhoneSerial: vi.fn(),
  disconnectPhoneRack: vi.fn(),
  loadPhoneActions: vi.fn(),
  loadPhoneJobs: vi.fn(),
  loadRack: vi.fn(),
  loadRackJobs: vi.fn(),
  loadRackLog: vi.fn(),
  loadWaitingPhoneJobs: vi.fn(),
  makePairingCode: vi.fn(),
  makeRack: vi.fn(),
  pauseRack: vi.fn(),
  removeRacks: vi.fn(),
  resumeRack: vi.fn(),
  runPhoneAction: vi.fn(),
  savePhoneFields: vi.fn(),
  saveRack: vi.fn(),
}))
vi.mock("@/lib/api/phones/phones", () => ({
  ...api,
  getPhoneErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const settingsApi = vi.hoisted(() => ({ saveTestPhone: vi.fn() }))
vi.mock("@/lib/api/phones/settings", () => settingsApi)
vi.mock("@/lib/api/saved-views", () => ({ deleteView: vi.fn(), saveView: vi.fn(), updateView: vi.fn() }))
// A phone's accounts over time, on its History tab (Bans task, part 2).
const bansApi = vi.hoisted(() => ({ loadPhoneTenancies: vi.fn() }))
vi.mock("@/lib/api/bans", () => ({ ...bansApi, getBansErrorMessage: () => "failed" }))
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

import { NewRackDialog } from "./new-rack-dialog"
import { PhonePanel } from "./phone-panel"
import { RackPanel } from "./rack-panel"
import { RackPhonesPanel } from "./rack-phones-panel"
import { RacksDashboard } from "./racks-dashboard"

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
    rackId: "r1",
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
    bannedOn: {},
    createdAt: new Date(),
    ...patch,
  }
}

const RACK: RackView = {
  id: "r1",
  name: "Tyler's Mac",
  description: { type: "doc", content: [] },
  descriptionText: "The shelf by the window",
  bannerUrl: "",
  notes: "",
  state: "live",
  wdaExpiresAt: null,
  platform: "macOS 26.0",
  version: "2026.10.13.1",
  live: true,
  seenAt: new Date(),
  pairedAt: new Date(),
  disconnectedAt: null,
  createdAt: new Date(),
  updateNote: "Went back to 2026.10.13.1, because 0.0.0-broken stopped with code 1 before it checked in.",
  upToDate: true,
}

const PIXEL = phone({ accounts: [{ id: "a1", platform: "reddit", handle: "quiet_builder", blocked: false }] })
const GALAXY = phone({
  id: "p2",
  name: "Galaxy A15",
  serial: "B2",
  status: "offline",
  offlineReason: "Not plugged in",
  shelfSlot: "4",
  connection: "wifi",
  proxy: { id: "x1", label: "US home line", host: "gate.test" },
})
const IPHONE = phone({
  id: "p3",
  name: "iPhone 15",
  kind: "iphone",
  serial: "00008030-UDID",
  simCarrier: "T-Mobile",
  shelfSlot: "7",
  needsWipeAt: new Date(),
})

const PAGE: RackPage = {
  rack: RACK,
  racks: [RACK],
  phones: [PIXEL, GALAXY],
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
  jobsWaiting: 3,
}

const JOB_LIST = {
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
}

/**
 * The Racks dashboard and a rack's page (`workspace/tasks/Phone farm/12-racks-dashboard.md`),
 * rendered from the real components with the server faked. Every behaviour
 * the Phones dashboard's test covered is here, on the panel it moved to:
 * the rows, the filters, the rack program and its log, a phone's tabs and
 * screen, the shelf, the wall, the jobs, Pause and Self-test.
 */
describe("racks", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (const group of [api, screenApi, healthApi, jobsApi, settingsApi, bansApi]) {
      for (const fn of Object.values(group)) fn.mockReset()
    }
    screenApi.closeScreenWindow.mockResolvedValue(undefined)
    navigation.navigate.mockReset()
    toasts.errors = []
    localStorage.clear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function draw(node: React.ReactNode) {
    await act(async () => {
      root.render(<TooltipProvider>{node}</TooltipProvider>)
    })
  }
  const text = () => document.body.textContent ?? ""
  const button = (name: string) => {
    const found = Array.from(document.querySelectorAll("button")).find(
      (one) => one.textContent?.trim() === name || one.getAttribute("aria-label") === name
    )
    if (!found) throw new Error(`No button "${name}"`)
    return found
  }
  const click = async (name: string) => {
    await act(async () => {
      button(name).click()
    })
  }
  const settle = async (ms = 10) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }
  const type = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value)
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  describe("the middle panel: the rack's phones", () => {
    const onSearch = vi.fn()
    const onOpen = vi.fn()
    const phones = (page: RackPage, search: RackSearch = {}) =>
      draw(<RackPhonesPanel page={page} search={search} views={[]} onSearch={onSearch} onOpen={onOpen} onChanged={async () => {}} />)
    const rowNames = () =>
      Array.from(container.querySelectorAll("tbody tr"))
        .map((row) => row.querySelector("td button")?.textContent ?? "")
        .filter(Boolean)

    beforeEach(() => {
      onSearch.mockReset()
      onOpen.mockReset()
    })

    it("lists each phone in shelf-slot order, with its account, status and carrier", async () => {
      await phones(PAGE)
      const rows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent)
      expect(rows[0]).toContain("Galaxy A15")
      expect(rows[0]).toContain("Offline")
      expect(rows[0]).toContain("Not plugged in")
      expect(rows[0]).toContain("Wi-Fi through US home line")
      expect(rows[1]).toContain("Pixel 8a")
      expect(rows[1]).toContain("Reddit: u/quiet_builder")
      expect(rows[1]).toContain("Mint Mobile 555 0100")
      expect(rows[1]).toContain("Reddit 2025.40.0")
      expect(text()).toContain("Phones2")
    })

    it("says which apps banned an account on a phone, and filters to them from the address (Bans task, parts 1 and 4)", async () => {
      const page = { ...PAGE, phones: [PIXEL, { ...GALAXY, bannedOn: { instagram: 2, tiktok: 1 } }] }
      await phones(page)
      expect(text()).toContain("Banned on: Instagram twice, TikTok once")
      await phones(page, { banned: "instagram" })
      expect(rowNames()).toEqual(["Galaxy A15"])
    })

    it("narrows the rows by status, kind, carrier, project, wiping and the search box, from the address", async () => {
      const shelf = { ...PAGE, phones: [PIXEL, GALAXY, IPHONE], projects: [{ id: "proj1", name: "Running shoes", phoneIds: ["p1"] }] }
      await phones(shelf, { status: "offline" })
      expect(rowNames()).toEqual(["Galaxy A15"])
      await phones(shelf, { kind: "iphone" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await phones(shelf, { carrier: "T-Mobile" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await phones(shelf, { project: "proj1" })
      expect(rowNames()).toEqual(["Pixel 8a"])
      await phones(shelf, { wipe: "needed" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await phones(shelf, { q: "UDID" })
      expect(rowNames()).toEqual(["iPhone 15"])
      await phones(shelf, { group: "status" })
      // The iPhone is connected, so two phones are and one is not.
      expect(text()).toContain("Connected · 2")
      expect(text()).toContain("Offline · 1")
    })

    it("says how to start when the rack has no phones", async () => {
      await phones({ ...PAGE, phones: [] })
      expect(text()).toContain("No phones on this rack yet. Plug a phone into this rack, or add one with New phone.")
    })

    it("holds the ticked phones from the N selected menu, in one request", async () => {
      api.changePhones.mockResolvedValue({ done: ["p1", "p2"], skipped: [] })
      await phones(PAGE)
      await click("Mass select")
      for (const name of ["Select Galaxy A15", "Select Pixel 8a"]) await click(name)
      await click("2 selected")
      await click("Hold")
      expect(api.changePhones).toHaveBeenCalledWith({ action: "hold", ids: ["p2", "p1"], held: true })
    })

    it("shows the rack's own wall every 5 seconds, and opens a phone from a tile", async () => {
      screenApi.loadWall.mockResolvedValue({
        phones: [
          { id: "p1", name: "Pixel 8a", status: "connected", src: "data:image/jpeg;base64,/9j/AA", at: new Date() },
          { id: "p2", name: "Galaxy A15", status: "offline", src: null, at: null },
        ],
      })
      await phones(PAGE, { list: "wall" })
      await settle()
      expect(screenApi.loadWall).toHaveBeenCalledWith("r1")
      const tiles = Array.from(document.querySelectorAll('button[aria-label^="Open "][aria-label$="\'s screen"]'))
      expect(tiles).toHaveLength(2)
      expect(tiles[0].querySelector("img")?.getAttribute("alt")).toBe("Pixel 8a's screen")
      expect(tiles[1].textContent).toContain("Offline")
      // Every 5 seconds, Tyler's choice of 18 Oct 2026.
      await settle(5_000)
      expect(screenApi.loadWall).toHaveBeenCalledTimes(2)
      await click("Open Pixel 8a's screen")
      expect(onOpen).toHaveBeenCalledWith("p1")
    })

    it("lists every job on the rack's phones on the Jobs tab", async () => {
      api.loadRackJobs.mockResolvedValue(JOB_LIST)
      await phones(PAGE, { list: "jobs" })
      await settle()
      expect(api.loadRackJobs).toHaveBeenCalledWith("r1")
      expect(text()).toContain('Post a comment: "Best trail shoes?"')
    })

    it("makes a phone on this rack from New phone, saying first when the serial is taken", async () => {
      api.checkPhoneSerial.mockResolvedValue({ taken: true })
      api.addPhone.mockResolvedValue({ id: "p9" })
      await phones(PAGE)
      await click("New phone")
      await type(document.getElementById("new-phone-name") as HTMLInputElement, "Spare")
      await type(document.getElementById("new-phone-serial") as HTMLInputElement, "A1")
      await settle(500)
      expect(api.checkPhoneSerial).toHaveBeenCalledWith("A1")
      expect(text()).toContain("Another phone already has that serial.")
      await click("Create phone")
      expect(api.addPhone).toHaveBeenCalledWith("r1", expect.objectContaining({ name: "Spare", serial: "A1", kind: "android" }))
      expect(onOpen).toHaveBeenCalledWith("p9")
    })
  })

  describe("the right panel: the open phone", () => {
    const onDeleted = vi.fn()
    const SECTION_WORDS = { settings: "Settings", setup: "Setup", health: "Health", actions: "Actions", jobs: "Jobs", history: "History" }
    /**
     * Draws the phone, its screen always showing; a section is opened the way
     * a person does, from the ⋮ (Tyler, 6 Nov 2026: "All these options should
     * go into the 3 vertical dots dropdown").
     */
    const panel = async (section?: keyof typeof SECTION_WORDS, open: PhoneRecord | null = PIXEL) => {
      await draw(<PhonePanel phone={open} page={PAGE} onChanged={async () => {}} onDeleted={onDeleted} />)
      if (!section || !open) return
      if (!document.querySelector("[data-slot=popover-content]")) await click(`More for ${open.name}`)
      const row = Array.from(document.querySelectorAll("[data-slot=popover-content] button")).find(
        (one) => one.querySelector("span")?.textContent === SECTION_WORDS[section]
      )
      if (!row) throw new Error(`No ${section} row in the menu`)
      if (row.getAttribute("aria-expanded") !== "true") {
        await act(async () => {
          ;(row as HTMLButtonElement).click()
        })
      }
    }

    beforeEach(() => {
      screenApi.loadScreen.mockResolvedValue({ frame: null, controlUntil: null, codes: [], texted: null })
    })

    it("asks the rack to read the system version, and opens a step's picture full size", async () => {
      api.loadPhoneActions.mockResolvedValue([])
      api.runPhoneAction.mockResolvedValue({ id: "act1" })
      await panel("actions")
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
      await click("Read the version")
      expect(api.runPhoneAction).toHaveBeenCalledWith("p1", "phone/android-version")
      expect(text()).toContain("Settings says Android 16, the same as Android itself reports.")
      healthApi.loadStepPictures.mockResolvedValue([
        { id: "s1", step: "Opened About phone", src: "data:image/jpeg;base64,/9j/AAAA" },
        { id: "s2", step: "Read Android 16", src: null },
      ])
      await click("Show the 2 steps")
      expect(healthApi.loadStepPictures).toHaveBeenCalledWith("act1")
      expect(text()).toContain("This picture could not be kept.")
      await click("Open step 1 full size")
      expect(document.querySelector('[role="dialog"] img[alt="Step 1: Opened About phone"]')).not.toBeNull()
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
      await panel("actions")
      expect(text()).toContain("Stopped at: Open the reply box")
      expect(text()).toContain("The app froze, so the rack closed it and opened it again.")
      await click("Clear the pictures")
      expect(healthApi.clearActionPictures).toHaveBeenCalledWith("act2")
    })

    it("shows the phone's health and its history", async () => {
      healthApi.loadPhoneReadings.mockResolvedValue([])
      healthApi.loadPhoneHistory.mockResolvedValue([
        { id: "e1", kind: "moved_rack", detail: "Moved from Desk rack to Garage rack.", at: new Date() },
        { id: "e2", kind: "plugged_in", detail: "On USB port usb:1-1.", at: new Date() },
      ])
      bansApi.loadPhoneTenancies.mockResolvedValue([
        { id: "t1", accountId: "a1", platform: "instagram", handle: "quiet.maple", arrivedAt: new Date(), leftAt: new Date(), leftHow: "banned" },
      ])
      await panel("health")
      await settle()
      expect(text()).toContain("82 out of 100")
      expect(text()).toContain("31.0°C")
      expect(text()).toContain("Has a signal")
      expect(text()).toContain("No readings yet. A point is kept every ten minutes.")
      expect(text()).toContain("2025.40.0")
      await panel("history")
      await settle()
      expect(text()).toContain("@quiet.maple")
      expect(text()).toContain("Moved rack")
      expect(text()).toContain("Moved from Desk rack to Garage rack.")
      expect(text().indexOf("Moved rack")).toBeLessThan(text().indexOf("Plugged in"))
    })

    it("streams the screen, sends nothing with control off, taps with it on, keeps it with the menu open, and closes the window on leaving", async () => {
      screenApi.loadScreen.mockResolvedValue({
        frame: { src: "data:image/jpeg;base64,/9j/AA", width: 1080, height: 2400, seq: 1, at: new Date() },
        controlUntil: null,
        codes: [{ accountId: "a1", handle: "quiet_builder", code: "482913", secondsLeft: 12 }],
        texted: { code: "556677", from: "Reddit", at: new Date() },
      })
      await panel()
      await settle()
      expect(document.querySelector('img[alt="Pixel 8a\'s screen"]')).not.toBeNull()
      expect(text()).toContain("482913")
      expect(text()).toContain("556677")

      await click("Back")
      expect(screenApi.sendToScreen).not.toHaveBeenCalled()
      expect(toasts.errors).toContain("Control is off. Switch it on under the screen first.")

      screenApi.setScreenControl.mockResolvedValue({ controlUntil: new Date(Date.now() + 900_000) })
      await act(async () => {
        ;(document.getElementById("phone-screen-control-p1") as HTMLButtonElement).click()
      })
      expect(screenApi.setScreenControl).toHaveBeenCalledWith("p1", true)
      screenApi.sendToScreen.mockResolvedValue(undefined)
      await click("Back")
      expect(screenApi.sendToScreen).toHaveBeenCalledWith("p1", { kind: "key", key: "back" })

      // The browser tab in the background only pauses the pictures: control stays.
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"))
      })
      const asked = screenApi.loadScreen.mock.calls.length
      await settle(2_000)
      expect(screenApi.loadScreen.mock.calls.length).toBe(asked)
      expect(screenApi.closeScreenWindow).not.toHaveBeenCalled()
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"))
      })

      // A section open in the ⋮ leaves the screen showing beside it, so control stays.
      await panel("settings")
      await settle()
      expect(screenApi.closeScreenWindow).not.toHaveBeenCalled()
      expect(document.querySelector('img[alt="Pixel 8a\'s screen"]')).not.toBeNull()

      // The phone goes from the panel: the window closes and control goes with it.
      await panel(undefined, null)
      expect(screenApi.closeScreenWindow).toHaveBeenCalledWith("p1")
    })

    it("saves only the field typed in, 700ms after the last letter, and refuses an empty name keeping it", async () => {
      api.savePhoneFields.mockResolvedValue(undefined)
      await panel("settings")
      await type(document.getElementById("phone-notes-p1") as HTMLTextAreaElement, "Top shelf")
      expect(api.savePhoneFields).not.toHaveBeenCalled()
      await settle(800)
      expect(api.savePhoneFields).toHaveBeenCalledWith("p1", { notes: "Top shelf" })

      const name = document.getElementById("phone-name-p1") as HTMLInputElement
      await type(name, "")
      await settle(800)
      expect(api.savePhoneFields).toHaveBeenCalledTimes(1)
      expect(toasts.errors.at(-1)).toContain("A phone needs a name")
      expect(name.getAttribute("aria-invalid")).toBe("true")
      expect(name.value).toBe("")
    })

    it("lists the phone's jobs and cancels one through the Jobs window's own call", async () => {
      api.loadPhoneJobs.mockResolvedValue(JOB_LIST)
      jobsApi.cancelWaitingJobs.mockResolvedValue({ completed: ["j1"], skipped: [] })
      await panel("jobs")
      await settle()
      expect(api.loadPhoneJobs).toHaveBeenCalledWith("p1")
      expect(text()).toContain("u/quiet_builder · Pixel 8a · for Running shoes")
      await click('Cancel Post a comment: "Best trail shoes?"')
      expect(jobsApi.cancelWaitingJobs).toHaveBeenCalledWith(["j1"])
      expect(api.loadPhoneJobs).toHaveBeenCalledTimes(2)
    })

    it("holds the phone from its header, and makes it the self-test phone from its menu", async () => {
      api.changePhones.mockResolvedValue({ done: ["p1"], skipped: [] })
      settingsApi.saveTestPhone.mockResolvedValue(undefined)
      await panel()
      await click("Hold Pixel 8a")
      expect(api.changePhones).toHaveBeenCalledWith({ action: "hold", ids: ["p1"], held: true })
      await click("More for Pixel 8a")
      await click("Use as the self-test phone")
      expect(settingsApi.saveTestPhone).toHaveBeenCalledWith("p1", "android")
    })

    it("tells how to get a phone when the rack has none", async () => {
      await panel(undefined, null)
      expect(text()).toContain("A phone opens here once this rack has one.")
    })
  })

  describe("the left panel: the rack", () => {
    const onSearch = vi.fn()
    const onOpenPhone = vi.fn()
    const onDisconnect = vi.fn()
    const rackPanel = (page: RackPage, search: RackSearch = {}) =>
      draw(
        <RackPanel
          page={page}
          search={search}
          onSearch={onSearch}
          onOpenPhone={onOpenPhone}
          onChanged={async () => {}}
          onDisconnect={onDisconnect}
          onDelete={() => {}}
        />
      )

    beforeEach(() => {
      onSearch.mockReset()
      onOpenPhone.mockReset()
    })

    it("shows the rack program, asks for its log, and says when the iPhone tool's signature has run out", async () => {
      api.askRackLog.mockResolvedValue(undefined)
      // The card reads what Promo holds before it asks (nothing yet), then polls.
      api.loadRackLog.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({
        lines: ["12:00 started", "12:01 reddit/comment on A1 failed: Could not find the reply box"],
        at: new Date(),
      })
      await rackPanel({ ...PAGE, rack: { ...RACK, wdaExpiresAt: new Date("2026-10-01T10:00:00Z") } })
      await settle()
      expect(text()).toContain("macOS 26.0")
      expect(text()).toContain("2026.10.13.1, the newest")
      expect(text()).toContain("Went back to 2026.10.13.1")
      expect(text()).toContain(", which has passed")
      expect(api.askRackLog).toHaveBeenCalledWith("r1")
      expect(text()).toContain("The rack has not answered yet.")
      await settle(3_000)
      expect(text()).toContain("The rack's last 2 lines")
      expect(document.querySelector("pre")?.textContent).toBe("12:00 started\n12:01 reddit/comment on A1 failed: Could not find the reply box")
    })

    it("says the rack is not checking in on its Log card when it is not", async () => {
      await rackPanel({ ...PAGE, rack: { ...RACK, live: false, state: "silent", seenAt: new Date(Date.now() - 600_000) } })
      expect(api.askRackLog).not.toHaveBeenCalled()
      expect(text()).toContain("The rack is not checking in, so it cannot send its log.")
    })

    it("installs a rack that never paired with a code made for it, and says Paired once the program joins", async () => {
      api.makePairingCode.mockResolvedValue({
        code: "ABCD-EFGH",
        expiresAt: new Date(Date.now() + 15 * 60_000),
        command: "curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH",
      })
      api.loadRack.mockResolvedValue({ ...RACK, state: "silent" })
      await rackPanel({ ...PAGE, rack: { ...RACK, state: "unpaired", live: false, pairedAt: null, seenAt: null } })
      expect(text()).toContain("Waiting for the rack program.")
      await click("Make a code")
      expect(api.makePairingCode).toHaveBeenCalledWith("r1")
      expect(text()).toContain("curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH")
      expect(text()).toContain("for 15 more minutes")
      await settle(3_100)
      expect(api.loadRack).toHaveBeenCalledWith("r1")
      expect(text()).toContain("Paired. The rack program is installed")
    })

    it("filters the list to a status from the counts, and opens the Jobs tab from the jobs waiting", async () => {
      await rackPanel(PAGE)
      expect(text()).toContain("Jobs waiting3")
      await act(async () => {
        Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.startsWith("Offline"))!.click()
      })
      expect(onSearch).toHaveBeenCalledWith({ status: "offline", list: undefined })
      await act(async () => {
        Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.startsWith("Jobs waiting"))!.click()
      })
      expect(onSearch).toHaveBeenCalledWith({ list: "jobs" })
    })

    it("draws the shelf by slot, lists a phone with no slot, opens a phone, and puts one in an empty slot", async () => {
      api.savePhoneFields.mockResolvedValue(undefined)
      await rackPanel({ ...PAGE, phones: [IPHONE, GALAXY, PIXEL] })
      expect(document.querySelectorAll('ol[aria-label="The shelf, 2 rows of 5"] > li')).toHaveLength(10)
      const seven = document.querySelector('[data-slot="7"]')!
      expect(seven.getAttribute("data-row")).toBe("2")
      expect(seven.getAttribute("data-column")).toBe("2")
      expect(seven.textContent).toContain("iPhone 15")
      expect(document.querySelector('[data-slot="4"]')!.textContent).toContain("Galaxy A15")
      expect(text()).toContain("Not on the shelf")
      expect(text()).toContain("no slot typed")
      await click("Open Galaxy A15, slot 4, Offline")
      expect(onOpenPhone).toHaveBeenCalledWith("p2")
      await click("Put a phone in slot 3")
      await act(async () => {
        Array.from(document.querySelectorAll<HTMLButtonElement>("[data-slot=popover-content] button")).find((one) => one.textContent === "Pixel 8a")!.click()
      })
      expect(api.savePhoneFields).toHaveBeenCalledWith("p1", { shelfSlot: "3" })
    })

    it("offers Disconnect for a connected rack in its menu", async () => {
      await rackPanel(PAGE)
      await click("Rack settings")
      await click("Disconnect this rack")
      expect(onDisconnect).toHaveBeenCalled()
    })
  })

  describe("the Racks dashboard", () => {
    const RACKS: RacksPage = {
      racks: [RACK, { ...RACK, id: "r2", name: "Garage rack", descriptionText: "", state: "unpaired", live: false, pairedAt: null, seenAt: null }],
      phones: [PIXEL, GALAXY, phone({ id: "p4", name: "Loose One", serial: "Z9", rackId: null, status: "offline", offlineReason: "Never seen by the rack" })],
      rackVersion: "2026.10.13.1",
      pausedAt: null,
      testPhoneId: null,
      testPhoneIphoneId: null,
    }

    it("counts each rack's phones online and needing a look, says whether it checks in, and gathers phones on no rack", async () => {
      await draw(<RacksDashboard initial={RACKS} search={{}} />)
      const rows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "")
      expect(rows.find((row) => row.includes("Tyler's Mac"))).toContain("1 of 2")
      expect(rows.find((row) => row.includes("Tyler's Mac"))).toContain("1 phone")
      expect(rows.find((row) => row.includes("Tyler's Mac"))).toContain("Checking in")
      expect(rows.find((row) => row.includes("Garage rack"))).toContain("Waiting for the rack program")
      expect(rows.find((row) => row.includes("Not on a rack"))).toContain("1 phone")
    })

    it("finds a phone by its serial from the search box, under the racks", async () => {
      await draw(<RacksDashboard initial={RACKS} search={{ q: "Z9" }} />)
      expect(text()).toContain("Phones")
      expect(text()).toContain("Loose One")
      expect(text()).toContain("Not on a rack · Z9")
    })

    it("pauses every rack, and asks which waiting jobs to drop before resuming", async () => {
      api.pauseRack.mockResolvedValue(undefined)
      await draw(<RacksDashboard initial={RACKS} search={{}} />)
      expect(document.querySelector('label[for="racks-paused"]')?.textContent).toBe("Pause every rack")
      await act(async () => {
        ;(document.getElementById("racks-paused") as HTMLButtonElement).click()
      })
      expect(api.pauseRack).toHaveBeenCalled()

      api.loadWaitingPhoneJobs.mockResolvedValue([
        { id: "j1", kind: "comment", phoneName: "Pixel 8a", createdAt: new Date() },
        { id: "j2", kind: "health", phoneName: "Pixel 8a", createdAt: new Date() },
      ])
      api.resumeRack.mockResolvedValue({ dropped: 1 })
      await draw(<RacksDashboard initial={{ ...RACKS, pausedAt: new Date() }} search={{}} />)
      expect(document.querySelector('label[for="racks-paused"]')?.textContent).toBe("Every rack paused")
      await act(async () => {
        ;(document.getElementById("racks-paused") as HTMLButtonElement).click()
      })
      expect(text()).toContain("Resume the rack?")
      await act(async () => {
        ;(document.querySelector('[role="checkbox"][id="drop-j1"]') as HTMLButtonElement).click()
      })
      await click("Drop 1 and resume")
      expect(api.resumeRack).toHaveBeenCalledWith(["j1"])
    })

    it("opens Self-test, which keeps the other phones' update pressable but refused until the test passes", async () => {
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
      await draw(<RacksDashboard initial={RACKS} search={{}} />)
      await click("Self-test and app updates")
      await settle()
      expect(text()).toContain("Post a Reddit comment: broken")
      const others = Array.from(document.querySelectorAll("button")).filter((one) => one.textContent === "Update the other Androids")
      expect(others[0].disabled).toBe(false)
      await act(async () => {
        others[0].click()
      })
      expect(healthApi.updateApp).toHaveBeenCalledWith("reddit", "others", "android")
      expect(toasts.errors.at(-1)).toContain("has to pass the self-test")
    })

    it("makes a rack with its name and description, then shows a code made for that rack", async () => {
      api.makeRack.mockResolvedValue({ id: "r9" })
      api.makePairingCode.mockResolvedValue({
        code: "WXYZ-2345",
        expiresAt: new Date(Date.now() + 15 * 60_000),
        command: "curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- WXYZ-2345",
      })
      await draw(<NewRackDialog open onClose={() => {}} onOpenRack={() => {}} />)
      await click("Create rack")
      expect(api.makeRack).not.toHaveBeenCalled()
      expect(toasts.errors.at(-1)).toBe("Give the rack a name first.")
      await type(document.getElementById("new-rack-name") as HTMLInputElement, "Desk rack")
      await type(document.getElementById("new-rack-description") as HTMLTextAreaElement, "By the window\nOn the house line")
      await click("Create rack")
      expect(api.makeRack).toHaveBeenCalledWith({
        name: "Desk rack",
        description: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "By the window" }] },
            { type: "paragraph", content: [{ type: "text", text: "On the house line" }] },
          ],
        },
      })
      await settle()
      expect(api.makePairingCode).toHaveBeenCalledWith("r9")
      expect(text()).toContain("Install Desk rack")
      expect(text()).toContain("bash -s -- WXYZ-2345")
    })
  })
})

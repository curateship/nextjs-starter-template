// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneRecord, PhonesPage, RackView } from "@/lib/api/phones/phones"
import type { RackSearch } from "@/lib/phones/rack-search"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
  // The three-panel frame's place reader, which the Racks section's header buttons load with.
  getRouteApi: () => ({ useLoaderData: () => ({}) }),
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
  loadPhonesPage: vi.fn(),
  loadWaitingPhoneJobs: vi.fn(),
  makePairingCode: vi.fn(),
  makeRack: vi.fn(),
  pauseRack: vi.fn(),
  removeRacks: vi.fn(),
  resumeRack: vi.fn(),
  runPhoneAction: vi.fn(),
  runSetupCheck: vi.fn(),
  wipePhone: vi.fn(),
  savePhoneFields: vi.fn(),
  saveRack: vi.fn(),
}))
vi.mock("@/lib/api/phones/phones", () => ({
  ...api,
  getPhoneErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))
const settingsApi = vi.hoisted(() => ({ saveTestPhone: vi.fn() }))
vi.mock("@/lib/api/phones/settings", () => settingsApi)
vi.mock("@/lib/api/saved-views", () => ({ deleteView: vi.fn(), saveView: vi.fn(), updateView: vi.fn(), loadSavedViews: vi.fn(async () => []) }))
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

import { PhonesSection } from "@/components/anti-detect/phones-section"
import { PhoneCountsBlock, RackBlocksProvider, RackProgramPanel, RacksBlock, type RackBlocks } from "@/components/anti-detect/rack-blocks"
import { BlockHeadingContext, type BlockMenuItem } from "@/components/shared/notes/block-card"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { TooltipProvider } from "@/components/ui/tooltip"

import { NewRackDialog } from "./new-rack-dialog"
import { PhonePanel } from "./phone-panel"
import { RackPhonesPanel } from "./rack-phones-panel"

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

const PAGE: PhonesPage = {
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
  jobsWaiting: { all: 3, byRack: { r1: 3 } },
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
 * The phones and racks of the Anti Detect dashboard (`workspace/tasks/Phone
 * farm/12-racks-dashboard.md`; since 12 Nov 2026 a rack has no page of its
 * own, Tyler: "I dont think a rack needs its own dashboard"), rendered from
 * the real components with the server faked: the phones list, the open
 * phone, the rack blocks on the left page (the rack program and its log,
 * the counts, the shelf), and the Phones section with Pause and Self-test.
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

  describe("the phones list", () => {
    const onSearch = vi.fn()
    const onOpen = vi.fn()
    const phones = (page: PhonesPage, search: RackSearch = {}, rackId: string | null = "r1") =>
      draw(
        <RackPhonesPanel page={page} rackId={rackId} search={search} views={[]} onSearch={onSearch} onOpen={onOpen} onChanged={async () => {}} />
      )
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
      expect(text()).toContain("No phones on this rack yet. Plug a phone into it, or add one with New phone.")
    })

    it("with no rack picked, has no Wall or Jobs tab, and New phone asks which rack", async () => {
      const second: RackView = { ...RACK, id: "r2", name: "Garage rack" }
      api.addPhone.mockResolvedValue({ id: "p9" })
      await phones({ ...PAGE, racks: [RACK, second] }, {}, null)
      expect(Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual([expect.stringContaining("Phones")])
      await click("New phone")
      expect(document.getElementById("new-phone-rack")).not.toBeNull()
      await type(document.getElementById("new-phone-name") as HTMLInputElement, "Spare")
      await click("Create phone")
      // The first rack, until another is chosen.
      expect(api.addPhone).toHaveBeenCalledWith("r1", expect.objectContaining({ name: "Spare" }))
    })

    it("puts the ticked phones on a rack from the N selected menu", async () => {
      api.changePhones.mockResolvedValue({ done: ["p1"], skipped: [] })
      await phones(PAGE, {}, null)
      await click("Mass select")
      await click("Select Pixel 8a")
      await click("1 selected")
      await click("Put on a rack")
      await click("Tyler's Mac")
      expect(api.changePhones).toHaveBeenCalledWith({ action: "rack", ids: ["p1"], rackId: "r1" })
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

    it("draws the rack's shelf on the Shelf tab: a phone with no slot listed, a phone opened, one put in an empty slot", async () => {
      api.savePhoneFields.mockResolvedValue(undefined)
      await phones({ ...PAGE, phones: [IPHONE, GALAXY, PIXEL] }, { list: "shelf" })
      expect(document.querySelectorAll('ol[aria-label="The shelf, 2 rows of 5"] > li')).toHaveLength(10)
      expect(document.querySelector('[data-slot="7"]')!.textContent).toContain("iPhone 15")
      expect(text()).toContain("Not on the shelf")
      await click("Open Galaxy A15, slot 4, Offline")
      expect(onOpen).toHaveBeenCalledWith("p2")
      await click("Put a phone in slot 3")
      await act(async () => {
        Array.from(document.querySelectorAll<HTMLButtonElement>("[data-slot=popover-content] button")).find((one) => one.textContent === "Pixel 8a")!.click()
      })
      expect(api.savePhoneFields).toHaveBeenCalledWith("p1", { shelfSlot: "3" })
    })

    it("asks the rack for its program's log on the Log tab, and says when it is not checking in", async () => {
      api.askRackLog.mockResolvedValue(undefined)
      // The tab reads what Promo holds before it asks (nothing yet), then polls.
      api.loadRackLog.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue({
        lines: ["12:00 started", "12:01 reddit/comment on A1 failed: Could not find the reply box"],
        at: new Date(),
      })
      await phones(PAGE, { list: "log" })
      await settle()
      expect(api.askRackLog).toHaveBeenCalledWith("r1")
      await settle(3_000)
      expect(document.querySelector("pre")?.textContent).toBe("12:00 started\n12:01 reddit/comment on A1 failed: Could not find the reply box")
      api.askRackLog.mockClear()
      await phones({ ...PAGE, racks: [{ ...RACK, live: false, state: "silent", seenAt: new Date(Date.now() - 600_000) }] }, { list: "log" })
      expect(text()).toContain("The rack is not checking in, so it cannot send its log.")
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
    const SECTION_WORDS = { control: "Control", settings: "Settings", setup: "Setup", health: "Health", actions: "Actions", jobs: "Jobs", history: "History" }
    /** Health, Jobs and History are tabs in the phone's box; the rest open from the ⋮. */
    const IN_THE_MENU = new Set(["control", "settings", "setup", "actions"])
    const TABS = new Set(["health", "jobs", "history"])
    /** Picks a tab the way a pointer does: Radix's tabs change on the press, not the click. */
    const pickTab = async (label: string) => {
      const found = Array.from(document.querySelectorAll("[role=tab]")).find((one) => one.textContent?.trim() === label)
      if (!found) throw new Error(`No ${label} tab`)
      await act(async () => {
        found.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
      })
    }
    /** Opens one of the ⋮'s sections the way a person does. */
    const openSection = async (section: keyof typeof SECTION_WORDS, name = "Pixel 8a") => {
      if (!document.querySelector("[data-slot=popover-content]")) await click(`More for ${name}`)
      // The ⋮'s tabs: Settings (Control's switch at its head), Setup, Actions.
      const label = section === "control" ? "Settings" : SECTION_WORDS[section]
      const found = Array.from(document.querySelectorAll("[data-slot=popover-content] [role=tab]")).find(
        (one) => one.textContent?.trim() === label
      )
      if (!found) throw new Error(`No ${label} tab in the menu`)
      await act(async () => {
        found.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
      })
    }
    /**
     * Draws the phone, its screen always showing, and opens a section: Health
     * and Jobs are cards in the panel, the rest are in the ⋮ (Tyler, 12 Nov
     * 2026: "control, setup, actions and history can go back into the 3 dot
     * dropdown but flatten the data").
     */
    const panel = async (section?: keyof typeof SECTION_WORDS, open: PhoneRecord | null = PIXEL) => {
      await draw(<PhonePanel phone={open} page={PAGE} onChanged={async () => {}} onDeleted={onDeleted} />)
      if (section && open && IN_THE_MENU.has(section)) await openSection(section, open.name)
      if (section && open && TABS.has(section)) await pickTab(SECTION_WORDS[section])
    }

    beforeEach(() => {
      screenApi.loadScreen.mockResolvedValue({ frame: null, controlUntil: null, codes: [], texted: null })
      // Every card reads as the panel opens; a test sets the one it is about.
      api.loadPhoneActions.mockResolvedValue([])
      api.loadPhoneJobs.mockResolvedValue({ ...JOB_LIST, jobs: [] })
      healthApi.loadPhoneReadings.mockResolvedValue([])
      healthApi.loadPhoneHistory.mockResolvedValue([])
      bansApi.loadPhoneTenancies.mockResolvedValue([])
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
      // Asked from the foot of the ⋮'s Settings, which shuts it; the answer shows in Actions.
      await openSection("settings")
      await click("Read the version")
      expect(api.runPhoneAction).toHaveBeenCalledWith("p1", "phone/android-version")
      await openSection("actions")
      await settle()
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
      // The switch is the ⋮'s Control row; the keys stay in the panel's footer.
      await openSection("control")
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
      await openSection("settings")
      await settle()
      expect(screenApi.closeScreenWindow).not.toHaveBeenCalled()
      expect(document.querySelector('img[alt="Pixel 8a\'s screen"]')).not.toBeNull()

      // The phone goes from the panel: the window closes and control goes with it.
      await panel(undefined, null)
      expect(screenApi.closeScreenWindow).toHaveBeenCalledWith("p1")
    })

    it("saves only the field typed in when it is left, and refuses an empty name keeping it", async () => {
      api.savePhoneFields.mockResolvedValue(undefined)
      // A row's button reads its name then its value, "NotesNone".
      const row = async (label: string) => {
        const found = Array.from(document.querySelectorAll("button")).find((one) => one.firstElementChild?.textContent === label)
        if (!found) throw new Error(`No ${label} row`)
        await act(async () => {
          found.click()
        })
      }
      await panel("settings")
      await row("Notes")
      const notes = document.getElementById("phone-notes-p1") as HTMLTextAreaElement
      await type(notes, "Top shelf")
      expect(api.savePhoneFields).not.toHaveBeenCalled()
      await act(async () => {
        notes.blur()
      })
      await settle()
      expect(api.savePhoneFields).toHaveBeenCalledWith("p1", { notes: "Top shelf" })

      await row("Name")
      const name = document.getElementById("phone-name-p1") as HTMLInputElement
      await type(name, "")
      await act(async () => {
        name.blur()
      })
      await settle()
      expect(api.savePhoneFields).toHaveBeenCalledTimes(1)
      expect(toasts.errors.at(-1)).toContain("A phone needs a name")
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

    it("checks the setup, and wipes only after the confirm, from the foot of the ⋮", async () => {
      api.runSetupCheck.mockResolvedValue(undefined)
      api.wipePhone.mockRejectedValue(new Error("Sign out of iCloud on its screen first."))
      await panel()
      await click("More for Pixel 8a")
      await click("Check the setup")
      expect(api.runSetupCheck).toHaveBeenCalledWith("p1")

      await click("More for Pixel 8a")
      await click("Wipe the phone")
      expect(api.wipePhone).not.toHaveBeenCalled()
      expect(text()).toContain("factory-resets it")
      const confirm = Array.from(document.querySelectorAll("button")).filter((one) => one.textContent?.trim() === "Wipe the phone").at(-1)!
      await act(async () => confirm.click())
      expect(api.wipePhone).toHaveBeenCalledWith("p1")
      expect(toasts.errors.at(-1)).toContain("Sign out of iCloud on its screen first")
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
      expect(text()).toContain("A phone opens here once there is one.")
    })
  })

  describe("the rack blocks on the left page", () => {
    const onPickRack = vi.fn()
    const onPhonesFilter = vi.fn()
    const onOpenPhone = vi.fn()
    const windows = { newRack: vi.fn(), settings: vi.fn(), disconnect: vi.fn(), remove: vi.fn() }
    let menu: BlockMenuItem[] | undefined
    const heading = { actions: null, setCount: () => {}, setMenu: (items: BlockMenuItem[] | undefined) => (menu = items), setReorder: () => {}, open: true }
    const value = (patch: Partial<RackBlocks> = {}): RackBlocks => ({
      page: PAGE,
      rack: "r1",
      onPickRack,
      phones: PAGE.phones,
      status: undefined,
      jobsOpen: false,
      onPhonesFilter,
      openPhoneId: undefined,
      onOpenPhone,
      onChanged: async () => {},
      windows,
      ...patch,
    })
    const block = (node: React.ReactNode, patch: Partial<RackBlocks> = {}) =>
      draw(
        <BlockHeadingContext.Provider value={heading}>
          <RackBlocksProvider value={value(patch)}>{node}</RackBlocksProvider>
        </BlockHeadingContext.Provider>
      )
    /** The Rack program tab of the left page's ⋮. */
    const program = (patch: Partial<RackBlocks> = {}) => draw(<RackProgramPanel blocks={value(patch)} />)

    /** A block's row, whose words run on into its count. */
    const pressRow = async (name: string) => {
      await act(async () => {
        Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.trim().startsWith(name))!.click()
      })
    }

    beforeEach(() => {
      for (const fn of [onPickRack, onPhonesFilter, onOpenPhone, ...Object.values(windows)]) fn.mockReset()
      menu = undefined
    })

    it("lists every rack and No rack, picks one, and offers New rack, the picked rack's settings and Disconnect in its ⋮", async () => {
      await block(<RacksBlock />, { page: { ...PAGE, phones: [PIXEL, GALAXY, phone({ id: "p4", name: "Loose One", rackId: null })] } })
      expect(text()).toContain("Tyler's Mac")
      expect(text()).toContain("No rack")
      await pressRow("No rack")
      expect(onPickRack).toHaveBeenCalledWith("none")
      expect(menu?.map((item) => item.label)).toEqual(["New rack", "Tyler's Mac: settings", "Disconnect Tyler's Mac"])
      menu?.[2].onSelect()
      expect(windows.disconnect).toHaveBeenCalledWith("r1")
    })

    it("shows the picked rack's program in the Rack program tab, and says when the iPhone tool's signature has run out", async () => {
      await program({ page: { ...PAGE, racks: [{ ...RACK, wdaExpiresAt: new Date("2026-10-01T10:00:00Z") }] } })
      expect(text()).toContain("macOS 26.0")
      expect(text()).toContain("2026.10.13.1, the newest")
      expect(text()).toContain("Went back to 2026.10.13.1")
      expect(text()).toContain(", which has passed")
    })

    it("with no rack picked, lists each rack's check-in in Rack program, a press picking it", async () => {
      await program({ rack: "" })
      expect(text()).toContain("Checking in")
      await pressRow("Tyler's Mac")
      expect(onPickRack).toHaveBeenCalledWith("r1")
    })

    it("installs a rack that never paired with a code made for it, and says Paired once the program joins", async () => {
      api.makePairingCode.mockResolvedValue({
        code: "ABCD-EFGH",
        expiresAt: new Date(Date.now() + 15 * 60_000),
        command: "curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH",
      })
      api.loadRack.mockResolvedValue({ ...RACK, state: "silent" })
      await program({ page: { ...PAGE, racks: [{ ...RACK, state: "unpaired", live: false, pairedAt: null, seenAt: null }] } })
      expect(text()).toContain("Waiting for the rack program.")
      await click("Make a code")
      expect(api.makePairingCode).toHaveBeenCalledWith("r1")
      expect(text()).toContain("for 15 more minutes")
      await settle(3_100)
      expect(api.loadRack).toHaveBeenCalledWith("r1")
      expect(text()).toContain("Paired. The rack program is installed")
    })

    it("sets a status in Phones from the counts, and opens a picked rack's Jobs tab from the jobs waiting", async () => {
      await block(<PhoneCountsBlock />)
      expect(text()).toContain("Jobs waiting3")
      await act(async () => {
        Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.startsWith("Offline"))!.click()
      })
      expect(onPhonesFilter).toHaveBeenCalledWith({ status: "offline" })
      await act(async () => {
        Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.startsWith("Jobs waiting"))!.click()
      })
      expect(onPhonesFilter).toHaveBeenCalledWith({ list: "jobs" })
    })
  })

  describe("the Anti Detect dashboard's Phones", () => {
    // The dashboard's frame, drawn plainly: the list, the phone on the right and the windows.
    const frame: CrmFrame = (panels) => (
      <>
        {panels.middle}
        {panels.right?.content}
        {panels.windows}
      </>
    )
    const windows = { newRack: vi.fn(), settings: vi.fn(), disconnect: vi.fn(), remove: vi.fn() }
    const LOOSE = phone({ id: "p4", name: "Loose One", serial: "Z9", rackId: null, status: "offline", offlineReason: "Never seen by the rack" })
    const ALL: PhonesPage = {
      ...PAGE,
      racks: [RACK, { ...RACK, id: "r2", name: "Garage rack", descriptionText: "", state: "unpaired", live: false, pairedAt: null, seenAt: null }],
      phones: [PIXEL, GALAXY, LOOSE],
    }
    const section = (search: Record<string, unknown> = {}, projectPhones: ReadonlySet<string> | null = null, page: PhonesPage = ALL) =>
      draw(<PhonesSection initial={page} search={{ section: "phones", ...search }} projectPhones={projectPhones} rackWindows={windows} frame={frame} />)
    const names = () =>
      Array.from(container.querySelectorAll("tbody tr"))
        .map((row) => row.querySelector("td button")?.textContent ?? "")
        .filter(Boolean)

    it("lists every phone on every rack, and one rack's, or the ones on no rack, from the Rack filter", async () => {
      await section()
      expect(names()).toEqual(expect.arrayContaining(["Pixel 8a", "Galaxy A15", "Loose One"]))
      await section({ rack: "r1" })
      expect(names()).toEqual(expect.arrayContaining(["Pixel 8a", "Galaxy A15"]))
      expect(names()).not.toContain("Loose One")
      await section({ rack: "none" })
      expect(names()).toEqual(["Loose One"])
    })

    it("narrows to the phones a picked project's accounts are on", async () => {
      await section({}, new Set(["p2"]))
      expect(names()).toEqual(["Galaxy A15"])
    })

    it("reads the phone kind from phoneKind, and writes it back there", async () => {
      await section({ phoneKind: "iphone" }, null, { ...ALL, phones: [PIXEL, IPHONE] })
      expect(names()).toEqual(["iPhone 15"])
    })

    it("pauses every rack from the ⋮, and asks which waiting jobs to drop before resuming", async () => {
      api.pauseRack.mockResolvedValue(undefined)
      api.loadPhonesPage.mockResolvedValue(ALL)
      await section()
      await click("More for phones")
      await click("Pause every rack")
      expect(api.pauseRack).toHaveBeenCalled()

      api.loadWaitingPhoneJobs.mockResolvedValue([
        { id: "j1", kind: "comment", phoneName: "Pixel 8a", createdAt: new Date() },
        { id: "j2", kind: "health", phoneName: "Pixel 8a", createdAt: new Date() },
      ])
      api.resumeRack.mockResolvedValue({ dropped: 1 })
      await section({}, null, { ...ALL, pausedAt: new Date() })
      expect(text()).toContain("Every rack is paused.")
      await click("More for phones")
      await click("Resume every rack")
      expect(text()).toContain("Resume the rack?")
      await act(async () => {
        ;(document.querySelector('[role="checkbox"][id="drop-j1"]') as HTMLButtonElement).click()
      })
      await click("Drop 1 and resume")
      expect(api.resumeRack).toHaveBeenCalledWith(["j1"])
    })

    it("opens New rack from the ⋮", async () => {
      await section()
      await click("More for phones")
      await click("New rack")
      expect(windows.newRack).toHaveBeenCalled()
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
      await section()
      await click("More for phones")
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

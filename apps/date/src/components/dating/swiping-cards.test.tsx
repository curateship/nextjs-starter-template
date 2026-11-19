// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  // The shell's three panels, reached through the widgets, read the signed-in route.
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "user" }, workspaces: { workspaces: [] } }) }),
  useNavigate: () => vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("@/components/settings/use-reported-save-status", () => ({ useReportedSaveStatus: () => vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn(), dismissErrorToast: vi.fn() }))
const saved = vi.hoisted(() => [] as unknown[])
vi.mock("@/lib/api/dating/settings", async () => {
  const { DEFAULT_DATING_SETTINGS } = await import("@/lib/dating/settings")
  return {
    loadDatingSettings: async () => DEFAULT_DATING_SETTINGS,
    saveDatingSettingsNow: async (values: unknown) => {
      saved.push(values)
      return values
    },
  }
})
vi.mock("@/lib/api/dating/phone", () => ({}))
const renamed = vi.hoisted(() => [] as string[])
vi.mock("@/lib/api/dating/profiles", () => ({
  renameProfile: async (name: string) => {
    renamed.push(name)
  },
  createProfile: async () => ({ accountId: "new", code: "123456", expiresAt: new Date() }),
}))
vi.mock("@/lib/api/dating/chats", () => ({
  loadGoogleCalendar: async () => ({ connected: false, available: false, email: "", lastError: "" }),
  disconnectGoogleCalendar: async () => {},
}))

import { DatesMonth } from "@/components/dating/dates-month"
import { DatingBlocksProvider, PhoneBlock, ProfilesBlock, type DatingBlocks } from "@/components/dating/dating-blocks"
import { DatingOverview } from "@/components/dating/dating-overview"
import { DatingRulesTab, DatingYouTab } from "@/components/dating/dating-settings"
import { SwipingDetails } from "@/components/dating/phone-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { showErrorToast } from "@/lib/toast/error-toast"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * What a browser would show of task "features/02-swiping-and-scoring": the
 * Swiping lines (in the dashboard's Phone view since
 * "features/05-dashboard-layout"), What's working and what a match costs (in
 * the dashboard's left panel), and the new Settings fields, drawn by the real
 * components with the data the dashboard sends.
 */

const at = new Date("2099-01-01T19:00:00Z")

const dashboard: DatingDashboard = {
  profile: { id: "account", name: "Tyler", app: "tinder", paused: false },
  profiles: [{ id: "account", name: "Tyler", app: "tinder", paused: false, phone: { name: "Pixel 8a", here: true }, waiting: 0, photoId: null }],
  phone: {
    id: "phone",
    name: "Pixel 8a",
    model: "",
    androidVersion: "",
    appVersion: "",
    paired: true,
    pairedAt: at,
    lastSeenAt: at,
    here: true,
    batteryPercent: 80,
    timeZone: "UTC",
    tinderVersion: "15.0",
    tinderInFront: true,
    facebookVersion: "",
    facebookInFront: false,
    inControl: true,
    phoneSwitchOn: true,
    running: true,
    runningSince: at,
    startedBy: "schedule",
    stopWhy: "",
    stopWhyAt: null,
    stoppedReason: null,
    stoppedAt: null,
    stoppedWords: "",
    stoppedPictureId: null,
  },
  settings: {
    likeAbove: 70,
    automate: false,
    swipesPerHour: 60,
    messagesPerHour: 20,
    spendCapDollars: 20,
    quietStart: 1,
    quietEnd: 7,
    timeZone: "UTC",
    swipesPerDay: 150,
    scheduleStart: 19,
    scheduleEnd: 22,
    maxDistanceKm: 25,
    ageMin: 28,
    ageMax: 36,
  },
  hour: { swipes: 12, messages: 1, swipesToday: 47 },
  spendDollars: 4.2,
  matchCost: { dollars: 4.2, matches: 3, dates: 0, perMatch: 1.4, perDate: null },
  learningFrom: 7,
  bands: [
    { from: 80, to: 89, likes: 40, matches: 9, replied: 5 },
    { from: 70, to: 79, likes: 3, matches: 1, replied: 0 },
  ],
  discovery: { state: "set", distance: "25 km", ageMin: 28, ageMax: 36, at },
  walks: { current: null, waiting: 0, recent: [] },
  leads: [],
  own: null,
  tally: [{ day: "2099-01-01", swipes: 47, likes: 20, matches: 3, messages: 4, datesProposed: 0 }],
  drafts: { unchanged: 0, of: 0 },
  openers: [],
  secondLook: [],
  compare: { rows: [], moveHours: null, words: "" },
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

async function mount(element: React.ReactElement) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<TooltipProvider>{element}</TooltipProvider>))
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function text(): string {
  return (host.textContent ?? "").replace(/\s+/g, " ")
}

describe("the Phone view's Swiping and the left panel", () => {
  it("shows today's swipes, the learning count and Tinder's filters, and leaves the rules to Settings", async () => {
    await mount(
      <div>
        <SwipingDetails data={dashboard} />
      </div>
    )
    const shown = text()
    expect(shown).toContain("Running since")
    expect(shown).toContain("started by the schedule")
    expect(shown).toContain("Swipes today47 of 150")
    expect(shown).toContain("Learning from 7 of your swipes")
    expect(shown).toContain("Tinder set to 25 km, ages 28 to 36")
    expect(shown).not.toContain("Quiet hours")
    expect(shown).not.toContain("Schedule")
  })

  it("says what a match costs, and counts liked cards by band, saying a thin band is not enough yet", async () => {
    await mount(
      <DatingOverview
        data={dashboard}
        layout={{ top: { columns: 2, spots: ["spend", "working"] }, bottom: { columns: 0, spots: [] } }}
        busy={null}
        onChange={vi.fn()}
        onReadCard={vi.fn()}
        onReadChats={vi.fn()}
        onChangeHours={vi.fn()}
      />
    )
    const shown = text()
    expect(shown).toContain("Cost per match$1.40")
    expect(shown).toContain("Cost per dateNone yet")
    expect(shown).toContain("80 to 899 of 40 likes matched, 5 replied")
    expect(shown).toContain("70 to 793 likes, not enough yet")
  })
})

/** The blocks' values, as the dashboard hands them down. */
function blocksFor(data: DatingDashboard, change: Partial<DatingBlocks> = {}): DatingBlocks {
  return {
    data,
    section: "all",
    onPickSection: vi.fn(),
    widgetCount: 5,
    sectionCounts: { all: 0, matches: 0, dates: 0 },
    sections: { hidden: [], order: [] },
    onHiddenSectionsChange: vi.fn(),
    onSectionOrderChange: vi.fn(),
    group: undefined,
    onGroup: vi.fn(),
    openId: undefined,
    onOpen: vi.fn(),
    onPickProfile: vi.fn(),
    onNewProfile: vi.fn(),
    onResumeProfile: vi.fn(),
    busy: null,
    onSecondLookLike: vi.fn(),
    ...change,
  }
}

describe("profiles on the Dating dashboard", () => {
  const two: DatingDashboard = {
    ...dashboard,
    profiles: [
      ...dashboard.profiles,
      { id: "hinge", name: "Weekends", app: "tinder", paused: true, phone: null, waiting: 3, photoId: null },
    ],
  }

  it("lists every profile with what waits, picks the open one, and switches on a press", async () => {
    const pick = vi.fn()
    await mount(
      <DatingBlocksProvider value={blocksFor(two, { onPickProfile: pick })}>
        <ProfilesBlock />
      </DatingBlocksProvider>
    )
    const shown = text()
    expect(shown).toContain("Weekends")
    expect(shown).toContain("Tinder, paused")
    expect(shown).toContain("Tinder, paused3")
    const rows = [...host.querySelectorAll("button")].filter((button) => /Tinder/.test(button.textContent ?? ""))
    expect(rows[0].getAttribute("aria-current")).toBe("true")
    await act(async () => rows[0].click())
    expect(pick).not.toHaveBeenCalled()
    await act(async () => rows[1].click())
    expect(pick).toHaveBeenCalledWith("hinge")
  })

  it("says a paused profile is paused in the Phone block, with Resume", async () => {
    const resume = vi.fn()
    await mount(
      <DatingBlocksProvider value={blocksFor({ ...dashboard, profile: { ...dashboard.profile, paused: true } }, { onResumeProfile: resume })}>
        <PhoneBlock />
      </DatingBlocksProvider>
    )
    expect(text()).toContain("Paused. Nothing runs until Resume.")
    expect(text()).toContain("swiping, 47 of 150")
    const button = [...host.querySelectorAll("button")].find((item) => item.textContent === "Resume") as HTMLButtonElement
    await act(async () => button.click())
    expect(resume).toHaveBeenCalled()
  })

  it("puts New profile under the Profiles block's rows", async () => {
    const make = vi.fn()
    await mount(
      <DatingBlocksProvider value={blocksFor(dashboard, { onNewProfile: make })}>
        <ProfilesBlock />
      </DatingBlocksProvider>
    )
    const buttons = [...host.querySelectorAll("button")]
    const last = buttons[buttons.length - 1] as HTMLButtonElement
    expect(last.textContent?.trim()).toBe("New profile")
    await act(async () => last.click())
    expect(make).toHaveBeenCalled()
  })
})

describe("the month on Dates", () => {
  it("writes each date in its day, opens on the month of the next one, and opens the lead on a press", async () => {
    const open = vi.fn()
    const lead = (id: string, name: string, dateAt: Date | null, dateAccepted = true) =>
      ({ id, name, dateAt, dateAccepted }) as Parameters<typeof DatesMonth>[0]["leads"][number]
    await mount(
      <DatesMonth
        leads={[lead("sofia", "Sofia", new Date(2099, 0, 14, 19, 0)), lead("noor", "Noor", null), lead("amara", "Amara", new Date(2099, 0, 20, 18, 0), false)]}
        onOpen={open}
      />
    )
    expect(text()).toContain("January 2099 · 1 date")
    const day = host.querySelector('[aria-label$="January 14: 1 date"]') as HTMLElement
    expect(day.textContent).toContain("7:00 PM Sofia")
    expect(text()).not.toContain("Amara")
    await act(async () => (day.querySelector("button") as HTMLButtonElement).click())
    expect(open).toHaveBeenCalledWith("sofia")
  })
})

describe("the Dating settings", () => {
  it("shows Furthest away, swipes a day and no schedule, and saves a People I know line once it reads", async () => {
    await mount(<DatingYouTab profile={dashboard.profile} />)
    expect(text()).toContain("Furthest away25 km")
    const row = [...host.querySelectorAll("button")].find((button) => button.textContent?.startsWith("People I know")) as HTMLButtonElement
    await act(async () => row.click())

    const box = document.querySelector("#date-known-people") as HTMLTextAreaElement
    const type = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, value)
        box.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }
    await type("Sarah")
    expect(box.getAttribute("aria-invalid")).toBe("true")
    await act(async () => box.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    expect(showErrorToast).toHaveBeenCalledWith('"Sarah" is not a name and an age, such as "Sarah, 31". Ages run from 18 to 99.')
    expect(saved).toHaveLength(0)

    await type("Sarah, 31")
    expect(box.getAttribute("aria-invalid")).toBeNull()
    await act(async () => box.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    expect(saved.at(-1)).toMatchObject({ knownPeople: [{ name: "Sarah", age: 31 }] })
  })

  it("shows the swipes a day and that there is no schedule on the Rules tab", async () => {
    await mount(<DatingRulesTab profile={dashboard.profile} />)
    expect(text()).toContain("Swipes a day150")
    expect(text()).toContain("No schedule: swiping runs when you press Start.")
  })
})

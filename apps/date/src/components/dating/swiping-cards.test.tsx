// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
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
import DatingSettingsTab from "@/components/dating/dating-settings"
import { LeadSummary } from "@/components/dating/lead-summary"
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
      <LeadSummary
        data={dashboard}
        group={undefined}
        busy={null}
        onGroup={vi.fn()}
        onStartOrStop={vi.fn()}
        onReadCard={vi.fn()}
        onReadChats={vi.fn()}
        openId={undefined}
        onOpen={vi.fn()}
        onOpenSettings={vi.fn()}
        onPickProfile={vi.fn()}
        onNewProfile={vi.fn()}
        onResumeProfile={vi.fn()}
      />
    )
    const shown = text()
    expect(shown).toContain("Cost per match$1.40")
    expect(shown).toContain("Cost per dateNone yet")
    expect(shown).toContain("80 to 899 of 40 likes matched, 5 replied")
    expect(shown).toContain("70 to 793 likes, not enough yet")
  })
})

describe("profiles on the Dating dashboard", () => {
  const two: DatingDashboard = {
    ...dashboard,
    profiles: [
      ...dashboard.profiles,
      { id: "hinge", name: "Weekends", app: "tinder", paused: true, phone: null, waiting: 3, photoId: null },
    ],
  }

  it("lists every profile with its phone and what waits, marks the open one, and switches on a press", async () => {
    const pick = vi.fn()
    await mount(
      <LeadSummary
        data={two}
        group={undefined}
        busy={null}
        onGroup={vi.fn()}
        onStartOrStop={vi.fn()}
        onReadCard={vi.fn()}
        onReadChats={vi.fn()}
        openId={undefined}
        onOpen={vi.fn()}
        onOpenSettings={vi.fn()}
        onPickProfile={pick}
        onNewProfile={vi.fn()}
        onResumeProfile={vi.fn()}
      />
    )
    const shown = text()
    expect(shown).toContain("Profiles · 2")
    expect(shown).toContain("TylerTinder · Pixel 8a here")
    expect(shown).toContain("Weekends · PausedTinder · no phone yet3 waiting")
    const rows = [...host.querySelectorAll("li > button")].filter((button) => /Tinder ·/.test(button.textContent ?? ""))
    expect(rows[0].getAttribute("aria-current")).toBe("true")
    await act(async () => (rows[0] as HTMLButtonElement).click())
    expect(pick).not.toHaveBeenCalled()
    await act(async () => (rows[1] as HTMLButtonElement).click())
    expect(pick).toHaveBeenCalledWith("hinge")
  })

  it("says a paused profile is paused at the top, with Resume", async () => {
    const resume = vi.fn()
    await mount(
      <LeadSummary
        data={{ ...dashboard, profile: { ...dashboard.profile, paused: true } }}
        group={undefined}
        busy={null}
        onGroup={vi.fn()}
        onStartOrStop={vi.fn()}
        onReadCard={vi.fn()}
        onReadChats={vi.fn()}
        openId={undefined}
        onOpen={vi.fn()}
        onOpenSettings={vi.fn()}
        onPickProfile={vi.fn()}
        onNewProfile={vi.fn()}
        onResumeProfile={resume}
      />
    )
    expect(text()).toContain("Paused. Nothing runs until Resume.")
    const button = [...host.querySelectorAll("button")].find((item) => item.textContent === "Resume") as HTMLButtonElement
    await act(async () => button.click())
    expect(resume).toHaveBeenCalled()
  })
  it("puts New profile as the last row of the Profiles section", async () => {
    const make = vi.fn()
    await mount(
      <LeadSummary
        data={dashboard}
        group={undefined}
        busy={null}
        onGroup={vi.fn()}
        onStartOrStop={vi.fn()}
        onReadCard={vi.fn()}
        onReadChats={vi.fn()}
        openId={undefined}
        onOpen={vi.fn()}
        onOpenSettings={vi.fn()}
        onPickProfile={vi.fn()}
        onNewProfile={make}
        onResumeProfile={vi.fn()}
      />
    )
    const list = [...host.querySelectorAll("ul")].find((ul) => /Tinder ·/.test(ul.textContent ?? "")) as HTMLUListElement
    const last = list.querySelector("li:last-child > button") as HTMLButtonElement
    expect(last.textContent).toBe("New profile")
    await act(async () => last.click())
    expect(make).toHaveBeenCalled()
  })
})

describe("the Dates tab's month", () => {
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
    await mount(<DatingSettingsTab profile={dashboard.profile} onRenamed={vi.fn()} />)
    expect((host.querySelector("#date-max-distance") as HTMLInputElement).value).toBe("25")
    expect((host.querySelector("#date-swipes-day") as HTMLInputElement).value).toBe("150")
    expect(text()).toContain("No schedule: swiping runs when you press Start.")

    const box = host.querySelector("#date-known-people") as HTMLTextAreaElement
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
})

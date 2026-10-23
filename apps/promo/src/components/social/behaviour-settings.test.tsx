// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BehaviourView } from "@/lib/api/social/behaviour"
import { BEHAVIOUR_DEFAULTS } from "@/lib/social/options"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))
const toasts = vi.hoisted(() => ({ shown: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.shown.push(message),
  dismissErrorToast: () => {},
}))

const api = vi.hoisted(() => ({
  loadBehaviour: vi.fn(),
  saveBehaviourFn: vi.fn(),
}))
vi.mock("@/lib/api/social/behaviour", () => ({
  ...api,
  getBehaviourErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

const xApi = vi.hoisted(() => ({
  loadXBehaviour: vi.fn(),
  saveXBehaviour: vi.fn(),
  changeXSearcher: vi.fn(),
}))
vi.mock("@/lib/api/social/x", () => ({
  ...xApi,
  getXErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

const X_START = { repliesPerDay: 100, repliesPerHour: 10, viewsPerDay: 500, followsPerDay: 5 }

const linkedinApi = vi.hoisted(() => ({
  loadLinkedinBehaviour: vi.fn(),
  saveLinkedinBehaviour: vi.fn(),
  changeLinkedinSearcher: vi.fn(),
}))
vi.mock("@/lib/api/social/linkedin", () => ({
  ...linkedinApi,
  getLinkedinErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

const LINKEDIN_START = { commentsPerDay: 20, viewsPerDay: 300, connectsPerWeek: 20 }

import BehaviourSettingsPanel from "./behaviour-settings"
import { TooltipProvider } from "@/components/ui/tooltip"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const DAY_MS = 86_400_000

/**
 * Settings → Behaviour, rendered from the real component with the server
 * faked: what it says about each account, and that a typed number saves the
 * whole record by itself, with no Save button.
 */
describe("Settings → Behaviour", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  const view = (patch: Partial<BehaviourView["settings"]> = {}): BehaviourView => ({
    settings: { readerProfileId: "reader-1", ...BEHAVIOUR_DEFAULTS, ...patch },
    readers: [{ id: "reader-1", name: "Reader" }],
    accounts: [
      {
        id: "a1",
        handle: "new_one",
        timeZone: "Europe/Berlin",
        redditCreatedAt: new Date(Date.now() - DAY_MS),
        warmUpEndsAt: new Date(Date.now() + 2 * DAY_MS),
        ageUnknown: false,
      },
    ],
  })

  async function render() {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BehaviourSettingsPanel />
        </TooltipProvider>
      )
    })
    // The load resolves in a later tick.
    await act(async () => {
      await Promise.resolve()
    })
  }

  function type(id: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.loadBehaviour.mockReset()
    api.saveBehaviourFn.mockReset()
    xApi.loadXBehaviour.mockReset()
    xApi.saveXBehaviour.mockReset()
    xApi.changeXSearcher.mockReset()
    xApi.loadXBehaviour.mockResolvedValue({ searchers: [], settings: X_START })
    linkedinApi.loadLinkedinBehaviour.mockReset()
    linkedinApi.saveLinkedinBehaviour.mockReset()
    linkedinApi.changeLinkedinSearcher.mockReset()
    linkedinApi.loadLinkedinBehaviour.mockResolvedValue({ searchers: [], settings: LINKEDIN_START })
    toasts.shown.length = 0
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("names the reader and says what runs in it, and each account's clock and warm-up", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    await render()

    const text = container.textContent ?? ""
    expect(text).toContain("The reader browser")
    expect(text).toContain("Keyword searches, reading a post's replies")
    expect(text).toContain("all run in Reader")
    expect(text).toContain("u/new_one: it is")
    expect(text).toContain("in Europe/Berlin")
    expect(text).toContain("u/new_one is 1 day old. Its warm-up ends")
    expect(text).toContain("An account under 90 days old may send 2 comments an hour and 6 a day.")
    // No Save button: it saves itself.
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Save")).toBe(false)
  })

  it("says searches are refused when no reader is picked", async () => {
    api.loadBehaviour.mockResolvedValue(view({ readerProfileId: null }))
    await render()
    expect(container.textContent).toContain(
      "With no reader, searches and reply reads are refused rather than run in your account's own browser."
    )
  })

  it("saves the whole record 700ms after a number is typed", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    api.saveBehaviourFn.mockImplementation(async (settings) => ({ ...view(), settings }))
    await render()

    type("promo-young-per-hour", "3")
    expect(api.saveBehaviourFn).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(api.saveBehaviourFn).toHaveBeenCalledTimes(1)
    expect(api.saveBehaviourFn.mock.calls[0][0]).toEqual({
      readerProfileId: "reader-1",
      ...BEHAVIOUR_DEFAULTS,
      youngPerHour: 3,
    })
    expect(container.textContent).toContain("may send 3 comments an hour")
  })

  it("puts the saved numbers back and says why when a save is refused", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    api.saveBehaviourFn.mockRejectedValue(new Error("Waking hours have to start and end at different times."))
    await render()

    type("promo-warm-up-days", "0")
    expect(container.textContent).toContain("Off. Accounts may comment from their first day.")
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(toasts.shown).toEqual(["Waking hours have to start and end at different times."])
    expect(container.textContent).not.toContain("Off. Accounts may comment from their first day.")
  })

  it("lists X's search accounts with their views today, and says when there is none", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    xApi.loadXBehaviour.mockResolvedValue({
      searchers: [
        {
          id: "s1",
          profileId: "p9",
          profileName: "X reader 1",
          handle: "quiet_reader",
          viewsToday: 312,
          viewsPerDay: 500,
          stoppedReason: "",
          lastUsedAt: null,
        },
      ],
      settings: X_START,
    })
    await render()

    const text = container.textContent ?? ""
    expect(text).toContain("X reader 1 · signed in as @quiet_reader")
    expect(text).toContain("312 of 500 views today")
    expect(text).toContain("A young X account may send 10 an hour and 100 a day.")
    expect(text).not.toContain("There is no X search account")
  })

  it("saves X's numbers 700ms after one is typed, with no Save button", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    xApi.saveXBehaviour.mockImplementation(async (settings) => settings)
    await render()
    expect(container.textContent).toContain("There is no X search account, so nothing on X is read")

    type("promo-x-viewsPerDay", "300")
    expect(xApi.saveXBehaviour).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(xApi.saveXBehaviour).toHaveBeenCalledTimes(1)
    expect(xApi.saveXBehaviour.mock.calls[0][0]).toEqual({ ...X_START, viewsPerDay: 300 })
    expect(container.textContent).toContain("Each search account sees up to 300 posts a day")
  })

  it("lists LinkedIn's search accounts with their views today, and shows the workday hours", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    linkedinApi.loadLinkedinBehaviour.mockResolvedValue({
      searchers: [
        {
          id: "l1",
          profileId: "p8",
          profileName: "LinkedIn reader 1",
          slug: "quiet-reader",
          viewsToday: 120,
          viewsPerDay: 300,
          stoppedReason: "",
          lastUsedAt: null,
        },
      ],
      settings: LINKEDIN_START,
    })
    await render()

    const text = container.textContent ?? ""
    expect(text).toContain("LinkedIn reader 1 · signed in as in/quiet-reader")
    expect(text).toContain("120 of 300 views today")
    expect(text).toContain("A young LinkedIn account may send 20 a day.")
    expect(text).toContain("Weekdays, 8:00 to 18:00 on the account's own clock")
    expect(text).not.toContain("There is no LinkedIn search account")
  })

  it("saves LinkedIn's numbers 700ms after one is typed, with no Save button", async () => {
    api.loadBehaviour.mockResolvedValue(view())
    linkedinApi.saveLinkedinBehaviour.mockImplementation(async (settings) => settings)
    await render()
    expect(container.textContent).toContain("There is no LinkedIn search account, so nothing on LinkedIn is read")

    type("promo-linkedin-connectsPerWeek", "15")
    expect(linkedinApi.saveLinkedinBehaviour).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(linkedinApi.saveLinkedinBehaviour).toHaveBeenCalledTimes(1)
    expect(linkedinApi.saveLinkedinBehaviour.mock.calls[0][0]).toEqual({ ...LINKEDIN_START, connectsPerWeek: 15 })
    expect(container.textContent).toContain("sends up to 15 connection requests a week")
  })
})

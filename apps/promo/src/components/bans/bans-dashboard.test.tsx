// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BanRow, BansPage } from "@/lib/api/bans"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
}))
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))
const api = vi.hoisted(() => ({
  answerUnknownScreen: vi.fn(async () => {}),
  cleanUpBannedAccount: vi.fn(async () => ({ wipeQueued: true, words: "" })),
  loadBanDetail: vi.fn(async () => ({ picture: null, actionsBefore: [] })),
  loadUnknownScreenPicture: vi.fn(async () => null),
  recordAppeal: vi.fn(async () => {}),
  recordAppealAnswer: vi.fn(async () => {}),
  releaseAppBrake: vi.fn(async () => {}),
}))
vi.mock("@/lib/api/bans", () => ({ ...api, getBansErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed") }))
vi.mock("@/lib/api/social/reddit-accounts", () => ({
  letRedditAccountRunAgain: vi.fn(async () => {}),
  getRedditAccountsErrorMessage: () => "failed",
}))

import { TooltipProvider } from "@/components/ui/tooltip"

import { BansDashboard } from "./bans-dashboard"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const NOW = Date.now()

function ban(patch: Partial<BanRow>): BanRow {
  return {
    id: "b1",
    at: new Date(NOW - 3_600_000),
    app: "instagram",
    kind: "suspended",
    words: "Your account has been suspended",
    account: { id: "a1", handle: "quiet.maple", retired: false },
    handle: "quiet.maple",
    phone: { id: "p1", name: "Pixel 8a" },
    proxy: null,
    simCarrier: "Mint Mobile",
    project: { id: "pr1", name: "Shop" },
    ageDays: 31,
    postsWeek: 4,
    seller: "Seller A",
    appeal: null,
    letRunAt: null,
    cleanedUpAt: null,
    looksBackAt: null,
    hasPicture: false,
    counts: true,
    stopped: true,
    cleanUpHeldBack: "",
    ...patch,
  }
}

const PAGE: BansPage = {
  bans: [
    ban({}),
    ban({ id: "b2", app: "reddit", kind: "locked", handle: "persona", account: { id: "a2", handle: "persona", retired: false }, counts: false, at: new Date(NOW - 40 * 86_400_000), seller: "" }),
  ],
  sellers: [{ seller: "Seller A", bought: 10, banned: 4, lostCents: 12_000 }],
  unknown: [
    { id: "q1", app: "tiktok", line: "Your account is under review", words: "Your account is under review OK", account: { id: "a3", platform: "tiktok", handle: "eats" }, phoneId: "p1", hasPicture: false, at: new Date(NOW) },
  ],
  brakes: [{ app: "instagram", at: new Date(NOW) }],
}

/**
 * The Bans dashboard and the Accounts counts strip, rendered from the real
 * components with the server faked (Bans task, parts 9, 11, 12, 16 and 17).
 */
describe("Bans dashboard", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockClear()
    navigation.navigate.mockReset()
    toasts.errors = []
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(page: BansPage, filters: Parameters<typeof BansDashboard>[0]["filters"] = {}) {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BansDashboard initial={page} filters={filters} />
        </TooltipProvider>
      )
    })
  }

  const buttonByText = (words: string) =>
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === words) as HTMLButtonElement | undefined

  it("lists every ban with its kind, says which do not count, and shows the brake, the question and the sellers above", async () => {
    await render(PAGE)
    const rows = Array.from(container.querySelectorAll("tbody tr"))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("@quiet.maple")
    expect(rows[0].textContent).toContain("Suspended")
    expect(rows[1].textContent).toContain("Recorded, not counted")
    expect(container.textContent).toContain("Every Instagram account is paused")
    expect(container.textContent).toContain("Promo doesn't know this screen. Is it a ban?")
    expect(container.textContent).toContain("Seller A: 4 bans out of 10 bought, $120 lost")
  })

  it("filters by the address, and an empty list says no account has been banned yet", async () => {
    await render(PAGE, { app: "reddit" })
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    await render(PAGE, { since: 30 })
    expect(Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent)).toHaveLength(1)
    await render({ bans: [], sellers: [], unknown: [], brakes: [] })
    expect(container.textContent).toContain("No account has been banned yet")
  })

  it("answers an unknown screen and releases the brake", async () => {
    await render(PAGE)
    await act(async () => buttonByText("It's a ban")?.click())
    expect(api.answerUnknownScreen).toHaveBeenCalledWith("q1", "ban")
    await act(async () => buttonByText("Release Instagram")?.click())
    expect(api.releaseAppBrake).toHaveBeenCalledWith("instagram")
  })

  it("opens a ban in its window with the appeal and Clean up, which asks once", async () => {
    await render(PAGE, { open: "b1" })
    expect(document.body.textContent).toContain("I appealed")
    await act(async () => buttonByText("Clean up")?.click())
    expect(document.body.textContent).toContain("Retire @quiet.maple as Banned and wipe its phone?")
    expect(api.cleanUpBannedAccount).not.toHaveBeenCalled()
    await act(async () => buttonByText("Yes, clean up")?.click())
    expect(api.cleanUpBannedAccount).toHaveBeenCalledWith("a1")
  })

  it("an iPhone not read signed out of iCloud says so instead of offering Clean up", async () => {
    await render({ ...PAGE, bans: [ban({ cleanUpHeldBack: "This is an iPhone. Sign out of iCloud on its screen first." })] }, { open: "b1" })
    expect(document.body.textContent).toContain("Sign out of iCloud on its screen first.")
    expect(buttonByText("Clean up")).toBeUndefined()
    expect(document.body.textContent).toContain("Check iCloud on its phone")
  })
})

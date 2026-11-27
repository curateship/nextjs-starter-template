// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BanRow, BansPage } from "@/lib/api/bans"
import type { ProfileRow, ProfilesPage } from "@/lib/api/browser/profiles"
import type { ProxyView } from "@/lib/api/browser/proxies"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
  // The three-panel frame's place reader, which the sections' header buttons load with.
  getRouteApi: () => ({ useLoaderData: () => ({}) }),
}))
vi.mock("@/components/shell/shell-layout", () => {
  const runtime = { config: { dashboardRowsPerPage: 25, styling: { dashboardTabs: "pills" } } }
  return { useShellRuntime: () => runtime, useOptionalShellRuntime: () => runtime }
})
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))
const bansApi = vi.hoisted(() => ({
  answerUnknownScreen: vi.fn(async () => {}),
  cleanUpBannedAccount: vi.fn(async () => ({ wipeQueued: true, words: "" })),
  loadBanDetail: vi.fn(async () => ({ picture: null, actionsBefore: [] })),
  loadUnknownScreenPicture: vi.fn(async () => null),
  recordAppeal: vi.fn(async () => {}),
  recordAppealAnswer: vi.fn(async () => {}),
  releaseAppBrake: vi.fn(async () => {}),
}))
vi.mock("@/lib/api/bans", () => ({ ...bansApi, getBansErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed") }))
vi.mock("@/lib/api/social/reddit-accounts", () => ({
  letRedditAccountRunAgain: vi.fn(async () => {}),
  getRedditAccountsErrorMessage: () => "failed",
}))
const profilesApi = vi.hoisted(() => ({
  changeProfiles: vi.fn(async () => {}),
  copyProfile: vi.fn(async () => ({ id: "f9" })),
  loadProfilesPage: vi.fn(),
  loadProfileHistory: vi.fn(async () => []),
  profileJob: vi.fn(async () => {}),
  removeProfiles: vi.fn(async () => ({ kept: [] })),
  saveProfile: vi.fn(async () => ({ id: "f1" })),
}))
vi.mock("@/lib/api/browser/profiles", () => ({ ...profilesApi, getProfileErrorMessage: () => "failed" }))
const proxiesApi = vi.hoisted(() => ({
  loadProxies: vi.fn(),
  removeProxies: vi.fn(async () => ({ deleted: [] })),
  runProxyTest: vi.fn(async () => ({ ok: true })),
  saveProxy: vi.fn(async () => ({ id: "x1" })),
}))
vi.mock("@/lib/api/browser/proxies", () => ({ ...proxiesApi, getProxyErrorMessage: () => "failed" }))

import { BansSection } from "@/components/anti-detect/bans-section"
import { AntiDetectOverview } from "@/components/anti-detect/anti-detect-overview"
import type { AntiDetectData } from "@/components/anti-detect/anti-detect-dashboard"
import { ProfilesSection } from "@/components/anti-detect/profiles-section"
import { ProxiesSection } from "@/components/anti-detect/proxies-section"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { TooltipProvider } from "@/components/ui/tooltip"

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

const BANS: BansPage = {
  bans: [
    ban({}),
    ban({
      id: "b2",
      app: "reddit",
      kind: "locked",
      handle: "persona",
      account: { id: "a2", handle: "persona", retired: false },
      counts: false,
      at: new Date(NOW - 40 * 86_400_000),
      seller: "",
      project: { id: "pr2", name: "Other" },
    }),
  ],
  sellers: [{ seller: "Seller A", bought: 10, banned: 4, lostCents: 12_000 }],
  unknown: [
    {
      id: "q1",
      app: "tiktok",
      line: "Your account is under review",
      words: "Your account is under review OK",
      account: { id: "a3", platform: "tiktok", handle: "eats" },
      phoneId: "p1",
      hasPicture: false,
      at: new Date(NOW),
    },
  ],
  brakes: [{ app: "instagram", at: new Date(NOW) }],
}

function profile(patch: Partial<ProfileRow>): ProfileRow {
  return {
    id: "f1",
    name: "Main",
    notes: "",
    browser: "stopped",
    proxy: null,
    folderId: null,
    labelId: null,
    tags: [],
    accounts: [],
    lastRanAt: null,
    onOldProxy: false,
    lastCountry: "",
    closing: false,
    checking: false,
    siteChecking: false,
    backingUp: false,
    ...patch,
  } as unknown as ProfileRow
}

const PROFILES: ProfilesPage = {
  profiles: [
    profile({}),
    profile({ id: "f2", name: "Warm one", tags: ["warm"], folderId: "d1", accounts: [{ id: "a1", platform: "reddit", handle: "quiet", blocked: false }] }),
  ],
  folders: [{ id: "d1", name: "Shop" }],
  labels: [],
  proxies: [],
} as unknown as ProfilesPage

function proxy(patch: Partial<ProxyView>): ProxyView {
  return {
    id: "x1",
    label: "US residential",
    kind: "residential",
    protocol: "http",
    host: "gate.example.com",
    port: 8080,
    username: "",
    hasPassword: false,
    country: "US",
    lastTestResult: { ok: true, country: "US" },
    lastTestedAt: null,
    usedBy: [],
    addresses: { changesToday: 0, current: null, total: 0 },
    monthlyCost: null,
    renewsOn: null,
    bannedOn: {},
    ...patch,
  } as unknown as ProxyView
}

const PROXIES = [proxy({}), proxy({ id: "x2", label: "Dead one", lastTestResult: { ok: false, country: "", error: "no answer" } as never })]

/** The dashboard's frame, drawn plainly: the list, the record on the right and the windows. */
const frame: CrmFrame = (panels) => (
  <>
    {panels.middle}
    {panels.right?.content}
    {panels.windows}
  </>
)

/**
 * The Anti Detect dashboard's sections and Overview, rendered from the real
 * components with the server faked (Tyler, 12 Nov 2026; before that the
 * Bans dashboard's own test, Bans task parts 9, 11, 12, 16 and 17).
 */
describe("the Anti Detect dashboard", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    for (const fn of Object.values(bansApi)) fn.mockClear()
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

  async function draw(node: React.ReactNode) {
    await act(async () => {
      root.render(<TooltipProvider>{node}</TooltipProvider>)
    })
  }

  const rows = () => Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "")
  const buttonByText = (words: string) =>
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === words || button.getAttribute("aria-label") === words) as
      | HTMLButtonElement
      | undefined

  describe("Bans", () => {
    it("lists every ban with its kind, and says which do not count", async () => {
      await draw(<BansSection page={BANS} search={{ section: "bans" }} projectId="" frame={frame} />)
      expect(rows()).toHaveLength(2)
      expect(rows()[0]).toContain("@quiet.maple")
      expect(rows()[0]).toContain("Suspended")
      expect(rows()[1]).toContain("Recorded, not counted")
    })

    it("filters by the address and by the project picked, and an empty list says no account has been banned yet", async () => {
      await draw(<BansSection page={BANS} search={{ section: "bans", app: "reddit" }} projectId="" frame={frame} />)
      expect(rows()).toHaveLength(1)
      await draw(<BansSection page={BANS} search={{ section: "bans", since: 30 }} projectId="" frame={frame} />)
      expect(rows()).toHaveLength(1)
      await draw(<BansSection page={BANS} search={{ section: "bans" }} projectId="pr2" frame={frame} />)
      expect(rows()).toEqual([expect.stringContaining("persona")])
      await draw(<BansSection page={{ bans: [], sellers: [], unknown: [], brakes: [] }} search={{ section: "bans" }} projectId="" frame={frame} />)
      expect(container.textContent).toContain("No account has been banned yet")
    })

    it("opens a ban on the right with the appeal and Clean up, which asks once", async () => {
      await draw(<BansSection page={BANS} search={{ section: "bans", open: "b1" }} projectId="" frame={frame} />)
      expect(document.body.textContent).toContain("I appealed")
      await act(async () => buttonByText("Clean up")?.click())
      expect(document.body.textContent).toContain("Retire @quiet.maple as Banned and wipe its phone?")
      expect(bansApi.cleanUpBannedAccount).not.toHaveBeenCalled()
      await act(async () => buttonByText("Yes, clean up")?.click())
      expect(bansApi.cleanUpBannedAccount).toHaveBeenCalledWith("a1")
    })

    it("an iPhone not read signed out of iCloud says so instead of offering Clean up", async () => {
      await draw(
        <BansSection
          page={{ ...BANS, bans: [ban({ cleanUpHeldBack: "This is an iPhone. Sign out of iCloud on its screen first." })] }}
          search={{ section: "bans", open: "b1" }}
          projectId=""
          frame={frame}
        />
      )
      expect(document.body.textContent).toContain("Sign out of iCloud on its screen first.")
      expect(buttonByText("Clean up")).toBeUndefined()
      expect(document.body.textContent).toContain("Check iCloud on its phone")
    })
  })

  describe("Overview", () => {
    const DATA = {
      profiles: { ...PROFILES, profiles: [profile({ browser: "open" })] },
      proxies: PROXIES,
      racks: { racks: [], phones: [], rackVersion: "", pausedAt: null, testPhoneId: null, testPhoneIphoneId: null },
      bans: BANS,
      projects: [],
      accounts: [],
    } as unknown as AntiDetectData
    const LAYOUT = {
      top: { columns: 2, spots: ["waiting-on-you", "bans-30-days"] },
      bottom: { columns: 1, spots: ["browsers-proxies"] },
    }

    it("shows the brake and the question waiting on you, the bans by app and seller, and the browsers running and proxies failing", async () => {
      await draw(<AntiDetectOverview data={DATA} reach={null} projectId="" layout={LAYOUT} onChange={() => {}} />)
      const words = container.textContent ?? ""
      expect(words).toContain("Every Instagram account is paused")
      expect(words).toContain("Promo doesn't know this screen. Is it a ban?")
      expect(words).toContain("4 bans out of 10 bought, $120 lost")
      expect(words).toContain("1 ban")
      expect(words).toContain("Main")
      expect(words).toContain("Dead one")
    })

    it("answers an unknown screen and releases the brake from Waiting on you", async () => {
      await draw(<AntiDetectOverview data={DATA} reach={null} projectId="" layout={LAYOUT} onChange={() => {}} />)
      await act(async () => buttonByText("It's a ban")?.click())
      expect(bansApi.answerUnknownScreen).toHaveBeenCalledWith("q1", "ban")
      await act(async () => buttonByText("Release Instagram")?.click())
      expect(bansApi.releaseAppBrake).toHaveBeenCalledWith("instagram")
    })
  })

  describe("Profiles and Proxies", () => {
    it("narrows Profiles to the project's profiles and to a folder or tag from the address", async () => {
      const reach = { profiles: new Set(["f2"]), phones: new Set<string>(), racks: new Set<string>(), proxies: new Set<string>() }
      await draw(<ProfilesSection initial={PROFILES} search={{}} reach={reach} frame={frame} />)
      expect(rows()).toEqual([expect.stringContaining("Warm one")])
      await draw(<ProfilesSection initial={PROFILES} search={{ tag: "warm" }} reach={null} frame={frame} />)
      expect(rows()).toEqual([expect.stringContaining("Warm one")])
      await draw(<ProfilesSection initial={PROFILES} search={{ folder: "none" }} reach={null} frame={frame} />)
      expect(rows()).toEqual([expect.stringContaining("Main")])
    })

    it("opens the browser from a profile's row", async () => {
      profilesApi.loadProfilesPage.mockResolvedValue(PROFILES)
      await draw(<ProfilesSection initial={PROFILES} search={{}} reach={null} frame={frame} />)
      await act(async () => buttonByText("Open the browser of Main")?.click())
      expect(profilesApi.profileJob).toHaveBeenCalledWith("f1", "open")
    })

    it("filters Proxies by their last test, and tests one from its row", async () => {
      proxiesApi.loadProxies.mockResolvedValue(PROXIES)
      await draw(<ProxiesSection initial={PROXIES} search={{ test: "failed" }} reach={null} frame={frame} />)
      expect(rows()).toEqual([expect.stringContaining("Dead one")])
      await act(async () => buttonByText("Test Dead one")?.click())
      expect(proxiesApi.runProxyTest).toHaveBeenCalledWith("x2")
    })
  })
})

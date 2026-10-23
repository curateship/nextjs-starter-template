// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LinkedinFindDetail, LinkedinModuleView, LinkedinPeople } from "@/lib/api/social/linkedin"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))
const api = vi.hoisted(() => ({
  acceptLinkedinRequests: vi.fn(),
  checkLinkedinWords: vi.fn(),
  draftLinkedinComments: vi.fn(),
  draftLinkedinConnectNote: vi.fn(),
  readLinkedinPeopleNow: vi.fn(),
  readLinkedinPostNow: vi.fn(),
  rewriteLinkedinWords: vi.fn(),
  saveLinkedinPostDraft: vi.fn(),
  sendLinkedinComment: vi.fn(),
  sendLinkedinConnect: vi.fn(),
  takeBackLinkedinComment: vi.fn(),
}))
vi.mock("@/lib/api/social/linkedin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/social/linkedin")>()),
  ...api,
  getLinkedinErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

import { TooltipProvider } from "@/components/ui/tooltip"

import { LinkedinFindPanel } from "./linkedin-find-panel"
import { LinkedinPeopleTab } from "./linkedin-people"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const NOW = new Date()

/** An account that may comment now: past its warm-up, inside its workday, nothing in the way. */
const account: LinkedinModuleView["accounts"][number] = {
  id: "account-1",
  handle: "sam-lee",
  runsIn: "Main",
  onPhone: false,
  important: false,
  premium: false,
  voice: null,
  followers: 120,
  seen: "",
  blocked: false,
  blockedReason: "",
  codeAsked: false,
  pages: [],
  posting: {
    paused: null,
    timeZone: "UTC",
    working: true,
    nextWorkAt: null,
    warmUp: { endsAt: null, ageUnknown: false },
    young: false,
    lastHour: 0,
    lastDay: 0,
    warnPerHour: 5,
    perDay: 20,
    limit: null,
  },
  held: [],
}

const find: LinkedinFindDetail = {
  id: "find-1",
  postId: "7300000000000000001",
  url: "https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/",
  text: "How do remote teams plan their week?",
  author: { name: "Jo Writer", headline: "Co-founder at Tiny", slug: "jo-writer", kind: "person", followers: 2_000 },
  postedAt: new Date(NOW.getTime() - 3_600_000),
  reactions: 4,
  comments: 2,
  reposts: 0,
  link: "",
  rank: 9,
  band: "strong",
  reason: "A founder, someone you sell to.",
  status: "new",
  named: "",
  matchedTitle: "founder",
  watched: false,
  feedAccount: null,
  keywords: ['"remote teams"'],
  topComments: [{ id: "7300000000000000555", name: "Lee", headline: "PM", slug: "lee", text: "We use a shared doc.", reactions: 9 }],
  canComment: true,
  old: false,
  readAt: NOW,
  reading: false,
  drafts: [],
  past: [],
  sentHere: [],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  toasts.errors = []
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function buttonNamed(words: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim().startsWith(words))
  if (!button) throw new Error(`No button "${words}"`)
  return button as HTMLButtonElement
}

function type(box: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(box, value)
  box.dispatchEvent(new Event("input", { bubbles: true }))
}

async function renderPanel() {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <LinkedinFindPanel
          projectId="project-1"
          find={find}
          loading={false}
          account={account}
          asPageId=""
          accountPicker={null}
          onSkip={async () => {}}
          onRepost={() => {}}
          onChanged={async () => {}}
        />
      </TooltipProvider>
    )
  })
}

describe("the LinkedIn post panel", () => {
  it("shows the writer's job title, the Sells to chip and the top comment", async () => {
    await renderPanel()
    expect(container.textContent).toContain("Co-founder at Tiny")
    expect(container.textContent).toContain("Sells to: founder")
    expect(container.textContent).toContain("We use a shared doc.")
    expect(container.textContent).toContain("likes the post a few seconds before it comments")
  })

  it("refuses a link in the box before anything is sent", async () => {
    await renderPanel()
    const box = container.querySelector("textarea") as HTMLTextAreaElement
    await act(async () => type(box, "Try pomoder.app for this"))
    await act(async () => buttonNamed("Post").click())
    expect(api.sendLinkedinComment).not.toHaveBeenCalled()
    expect(toasts.errors).toContain("A comment never carries a link. Take the link out first.")
  })

  it("sends a reply under the top comment picked with Answer this instead", async () => {
    api.sendLinkedinComment.mockResolvedValueOnce({ commentRowId: "row-1", jobId: "job-1", runAfter: null, undoUntil: new Date(Date.now() + 10_000), similarTo: "" })
    await renderPanel()
    await act(async () => buttonNamed("Answer this instead").click())
    const box = container.querySelector("textarea") as HTMLTextAreaElement
    await act(async () => type(box, "A shared doc works until the team grows past ten."))
    await act(async () => buttonNamed("Post").click())
    expect(api.sendLinkedinComment).toHaveBeenCalledWith(
      expect.objectContaining({ findId: "find-1", accountId: "account-1", underCommentId: "7300000000000000555", text: "A shared doc works until the team grows past ten." })
    )
  })
})

describe("the People tab", () => {
  const people: LinkedinPeople = {
    invites: [
      { id: "invite-founder", account: { id: "account-1", handle: "sam-lee" }, slug: "founder-b", name: "Founder B", headline: "Founder at Tiny", fits: "founder", note: "", status: "waiting", lastError: "", firstSeenAt: NOW },
      { id: "invite-student", account: { id: "account-1", handle: "sam-lee" }, slug: "student-a", name: "Student A", headline: "Student", fits: "", note: "", status: "waiting", lastError: "", firstSeenAt: NOW },
    ],
    viewers: [],
    connects: [],
    accounts: [{ id: "account-1", handle: "sam-lee", connectsThisWeek: 3, reading: false, premium: false, onPhone: false }],
    connectsPerWeek: 20,
  }

  it("lists the people the project sells to first, and accepts only what is ticked", async () => {
    api.acceptLinkedinRequests.mockResolvedValueOnce({ completed: ["invite-founder"], skipped: [] })
    await act(async () => {
      root.render(
        <TooltipProvider>
          <LinkedinPeopleTab projectId="project-1" data={people} loading={false} error={null} onRetry={() => {}} onChanged={async () => {}} />
        </TooltipProvider>
      )
    })
    const text = container.textContent ?? ""
    expect(text.indexOf("Founder B")).toBeLessThan(text.indexOf("Student A"))
    expect(api.acceptLinkedinRequests).not.toHaveBeenCalled()
    await act(async () => buttonNamed("Mass select").click())
    const tick = container.querySelector('[aria-label="Select Founder B"]') as HTMLElement
    await act(async () => tick.click())
    await act(async () => buttonNamed("Accept 1 selected").click())
    expect(api.acceptLinkedinRequests).toHaveBeenCalledWith(["invite-founder"])
  })
})

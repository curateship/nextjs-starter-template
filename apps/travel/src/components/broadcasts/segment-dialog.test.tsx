// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadMembers: vi.fn(),
  save: vi.fn(),
  loadContacts: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

vi.mock("@/lib/api/people/contacts", () => ({
  loadContactsPage: api.loadContacts,
}))

vi.mock("@/lib/api/people/contact-segments", () => ({
  countDraftSegment: vi.fn(async () => ({ matching: 0, everyone: 0 })),
  getSegmentErrorMessage: (error: unknown) => String(error),
  getSegmentLoadErrorMessage: (error: unknown) => String(error),
  getSegmentMembersErrorMessage: () =>
    "We could not load who is in this segment. Please try again.",
  loadSegmentMembers: api.loadMembers,
  saveSegment: api.save,
}))

import { SegmentDialog } from "@/components/broadcasts/segment-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SegmentItem } from "@/lib/api/people/contact-segments"

const ADA = { id: "c1", email: "ada@example.com" }
const GRACE = { id: "c2", email: "grace@example.com" }

const segment: SegmentItem = {
  id: "s1",
  name: "VIPs",
  description: "",
  kind: "static",
  rules: { conditions: [] },
  total: 1,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
}

const options = { tags: [], sources: [], plans: [], segments: [] }

/** A promise this test decides when to settle, so "still loading" is a state. */
function deferred<T>() {
  let settle!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, no) => {
    settle = resolve
    reject = no
  })
  return { promise, settle, reject }
}

function buttonNamed(name: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!button) throw new Error(`${name} button was not rendered`)
  return button
}

function checkbox(id: string) {
  const box = document.querySelector<HTMLButtonElement>(`#segment-contact-${id}`)
  if (!box) throw new Error(`${id} was not offered`)
  return box
}

async function openDialog() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SegmentDialog
          open
          segment={segment}
          options={options}
          onClose={vi.fn()}
          onSaved={vi.fn(async () => undefined)}
        />
      </TooltipProvider>
    )
  })
  return root
}

/** jsdom has no ResizeObserver, and the window's Select measures itself. */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("SegmentDialog waits for a hand-picked segment's people", () => {
  beforeEach(() => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
      StubResizeObserver
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.save.mockReset()
    api.save.mockResolvedValue({ id: "s1" })
    api.loadMembers.mockReset()
    api.loadContacts.mockReset()
    api.loadContacts.mockResolvedValue({ contacts: [ADA, GRACE] })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  /** Lets the contact search's own settle timer run, so its list is drawn. */
  async function settleSearch() {
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
  }

  it("cannot save while the people are still loading", async () => {
    const members = deferred<{ members: typeof ADA[] }>()
    api.loadMembers.mockReturnValue(members.promise)
    const root = await openDialog()
    await settleSearch()

    const save = buttonNamed("Save changes") as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(document.body.textContent).toContain("Loading who is already in it")

    await act(async () => save.click())
    expect(api.save).not.toHaveBeenCalled()

    await act(async () => {
      members.settle({ members: [ADA] })
    })
    expect((buttonNamed("Save changes") as HTMLButtonElement).disabled).toBe(
      false
    )

    await act(async () => root.unmount())
  })

  it("saves the people it loaded when only the name changed", async () => {
    api.loadMembers.mockResolvedValue({ members: [ADA] })
    const root = await openDialog()
    await settleSearch()

    const name = document.querySelector<HTMLInputElement>("#segment-name")
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(name, "VIPs renamed")
      name?.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await act(async () => buttonNamed("Save changes").click())
    expect(api.save).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ name: "VIPs renamed", contactIds: [ADA.id] })
    )

    await act(async () => root.unmount())
  })

  it("keeps somebody ticked while the people were still loading", async () => {
    const members = deferred<{ members: typeof ADA[] }>()
    api.loadMembers.mockReturnValue(members.promise)
    const root = await openDialog()
    await settleSearch()

    await act(async () => checkbox(GRACE.id).click())
    await act(async () => {
      members.settle({ members: [ADA] })
    })

    await act(async () => buttonNamed("Save changes").click())
    const [, saved] = api.save.mock.calls[0]
    expect([...saved.contactIds].sort()).toEqual([ADA.id, GRACE.id])

    await act(async () => root.unmount())
  })

  it("offers Try again and keeps Save off when the people fail to load", async () => {
    const first = deferred<{ members: typeof ADA[] }>()
    api.loadMembers.mockReturnValueOnce(first.promise)
    const root = await openDialog()
    await settleSearch()

    await act(async () => {
      first.reject(new Error("NETWORK"))
    })
    expect(document.body.textContent).toContain(
      "We could not load who is in this segment"
    )
    expect((buttonNamed("Save changes") as HTMLButtonElement).disabled).toBe(
      true
    )

    api.loadMembers.mockResolvedValue({ members: [ADA] })
    await act(async () => buttonNamed("Try again").click())
    expect((buttonNamed("Save changes") as HTMLButtonElement).disabled).toBe(
      false
    )

    await act(async () => buttonNamed("Save changes").click())
    expect(api.save).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ contactIds: [ADA.id] })
    )

    await act(async () => root.unmount())
  })
})

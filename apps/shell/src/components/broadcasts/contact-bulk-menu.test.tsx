// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  addIds: vi.fn(),
  addMatching: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

vi.mock("@/lib/api/people/contacts", () => ({
  deleteContacts: vi.fn(),
  deleteMatchingContacts: vi.fn(),
  getContactErrorMessage: (error: unknown) => String(error),
  setContactsStatus: vi.fn(),
  setMatchingContactsStatus: vi.fn(),
}))

vi.mock("@/lib/api/people/contact-segments", () => ({
  addContactsToWorkspaceSegment: api.addIds,
  addMatchingContactsToWorkspaceSegment: api.addMatching,
  getSegmentErrorMessage: (error: unknown) => String(error),
  removeContactsFromWorkspaceSegment: vi.fn(),
  removeMatchingContactsFromWorkspaceSegment: vi.fn(),
}))

import { ContactBulkMenu } from "@/components/broadcasts/contact-bulk-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SegmentItem } from "@/lib/api/people/contact-segments"

const readers: SegmentItem = {
  id: "s1",
  name: "Newsletter readers",
  description: "",
  kind: "static",
  rules: { conditions: [] },
  total: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
}

function click(label: string) {
  const found = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!found) throw new Error(`No "${label}" button`)
  return act(async () => found.click())
}

async function render(allMatching: boolean) {
  const onRefresh = vi.fn(async () => {})
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ContactBulkMenu
          selectedIds={["c1", "c2"]}
          allMatching={allMatching}
          total={12400}
          offerAll
          filter={{}}
          segments={[readers]}
          onSelectAllMatching={vi.fn()}
          onDeleted={vi.fn()}
          onDone={vi.fn()}
          onRefresh={onRefresh}
        />
      </TooltipProvider>
    )
  })
  return {
    onRefresh,
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

async function pickSegment(selected: string) {
  await click(selected)
  await click("Add to segment")
  await click("Newsletter readers")
}

describe("ContactBulkMenu, Add to segment", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.addIds.mockReset().mockResolvedValue(undefined)
    api.addMatching.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("asks before adding everybody the filters match, naming the count and the segment", async () => {
    const { onRefresh, close } = await render(true)
    await pickSegment("12,400 selected")

    expect(document.body.textContent).toContain("Add 12,400 people to Newsletter readers?")
    expect(api.addMatching).not.toHaveBeenCalled()

    await click("Add 12,400 people")
    expect(api.addMatching).toHaveBeenCalledWith("s1", {})
    expect(onRefresh).toHaveBeenCalled()
    await close()
  })

  it("Cancel adds nobody", async () => {
    const { close } = await render(true)
    await pickSegment("12,400 selected")
    await click("Cancel")

    expect(api.addMatching).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Newsletter readers?")
    await close()
  })

  it("ticked rows still join with one click and the list redraws", async () => {
    const { onRefresh, close } = await render(false)
    await pickSegment("2 selected")

    expect(api.addIds).toHaveBeenCalledWith("s1", ["c1", "c2"])
    expect(onRefresh).toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Newsletter readers?")
    await close()
  })
})

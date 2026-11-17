// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  saveSequence: vi.fn(),
  sendSequenceTestEmail: vi.fn(),
}))
vi.mock("@/lib/api/email/sequences", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveSequence: api.saveSequence,
  sendSequenceTestEmail: api.sendSequenceTestEmail,
}))
vi.mock("@/components/shell/shell-layout", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))
vi.mock("@/lib/branding", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAppName: () => "Flowfly",
}))
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

import { SequenceRecord } from "@/components/crm/sequence-records"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SequenceItem } from "@/lib/api/email/sequences"
import { newSequenceEmail } from "@/lib/broadcasts/sequence-graph"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const sequence: SequenceItem = {
  id: "seq-1",
  name: "Welcome series",
  steps: {
    emails: [
      { ...newSequenceEmail(true), id: "one", subject: "Welcome" },
      { ...newSequenceEmail(false), id: "two", subject: "Three days in" },
    ],
  },
  used_by: [],
  in_progress: 0,
  finished: 0,
  updated_at: "2026-11-17T00:00:00.000Z",
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  api.saveSequence.mockReset().mockResolvedValue(sequence)
  api.sendSequenceTestEmail.mockReset().mockResolvedValue({ ok: true })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function buttonNamed(name: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === name)
}

describe("the sequence footer's Send myself a test", () => {
  it("sends the open email, and only that one", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <SequenceRecord
            initial={sequence}
            blockDefaults={{}}
            onListChanged={vi.fn()}
            onCopy={vi.fn()}
            onDelete={vi.fn()}
          />
        </TooltipProvider>
      )
    })
    // On the list of emails the button is there too, as a picker.
    expect(buttonNamed("Send myself a test")).toBeDefined()

    const secondRow = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Three days in")
    )
    expect(secondRow).toBeDefined()
    await act(async () => secondRow!.click())
    expect(container.textContent).toContain("Email 2 of 2")

    await act(async () => buttonNamed("Send myself a test")!.click())
    expect(api.sendSequenceTestEmail).toHaveBeenCalledTimes(1)
    expect(api.sendSequenceTestEmail).toHaveBeenCalledWith("seq-1", "two")
  })
})

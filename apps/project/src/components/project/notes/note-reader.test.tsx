// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadTaskCards: vi.fn(),
  loadRecordCard: vi.fn(),
  previewNotePage: vi.fn(),
  loadNoteServices: vi.fn(),
}))

vi.mock("@/lib/api/project/note-blocks", () => api)

import { NoteView } from "@/components/project/notes/note-editor"
import type { NoteSetup } from "@/components/project/notes/note-setup"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cleanNoteBody } from "@/lib/project/note-blocks"

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
const file = { id: "file-1", name: "brief.pdf", sizeBytes: 2048, createdAt: "", uploadedBy: null, picture: false, canDelete: false, commentId: null }
const openTask = vi.fn()

function setup(): NoteSetup {
  return { where: "task", teamId: undefined, openTask, hold: () => undefined, task: { id: "task-1", files: [file], link: null, refresh: async () => undefined, comments: null } }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  window.localStorage.clear()
  api.loadTaskCards.mockResolvedValue([
    { taskId: "task-2", state: "open", title: "Book the photographer", projectId: "project-1", status: "stuck", assigneeName: "Leo Hart", dueDate: null },
    { taskId: "task-3", state: "hidden" },
  ])
  api.previewNotePage.mockResolvedValue({ url: "https://example.com/", title: "Example Domain", siteName: "example.com", imageUrl: null, iconUrl: null })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function show(content: unknown[]) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <NoteView setup={setup()} body={cleanNoteBody({ type: "doc", content })} />
      </TooltipProvider>
    )
  })
  // The Task cards and the web page card load a moment after the note draws.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

describe("a note drawn for someone who only reads it", () => {
  it("draws the words as before and every block with them", async () => {
    await show([
      paragraph("Plan for the shoot"),
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Book the studio")] }] },
      { type: "horizontalRule" },
      { type: "noteCallout", attrs: { kind: "warning" }, content: [paragraph("Budget is fixed")] },
      { type: "noteVideo", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } },
      { type: "noteFile", attrs: { fileId: "file-1" } },
      { type: "noteFile", attrs: { fileId: "gone" } },
      { type: "noteTask", attrs: { taskId: "task-2" } },
      { type: "noteTask", attrs: { taskId: "task-3" } },
      { type: "noteWebPage", attrs: { url: "https://example.com/" } },
    ])
    const text = container.textContent ?? ""
    expect(text).toContain("Plan for the shoot")
    expect(text).toContain("Budget is fixed")
    expect(container.querySelector("[aria-label=Warning]")).not.toBeNull()
    expect(container.querySelector("hr")).not.toBeNull()
    expect(container.querySelector('button[aria-label="Play the YouTube video"]')).not.toBeNull()
    expect(container.querySelector('a[aria-label="Download brief.pdf"]')?.getAttribute("href")).toBe("/api/project/task-files/file-1")
    expect(text).toContain("Removed: this file was deleted.")
    expect(text).toContain("Book the photographer")
    expect(text).toContain("Leo Hart")
    expect(text).toContain("A task you can't see.")
    expect(text).toContain("Example Domain")
    // One call for every Task card in the note.
    expect(api.loadTaskCards).toHaveBeenCalledTimes(1)
    expect(api.loadTaskCards.mock.calls[0][0]).toEqual(["task-2", "task-3"])
    // A reader can't tick, and has no bin on any block.
    const tick = container.querySelector<HTMLInputElement>("input[type=checkbox]")
    expect(tick?.checked).toBe(true)
    expect(tick?.disabled).toBe(true)
    expect(container.querySelector('[aria-label^="Remove"]')).toBeNull()
  })

  it("opens a Task card's task, and folds a section for this reader alone", async () => {
    await show([
      { type: "noteTask", attrs: { taskId: "task-2" } },
      { type: "noteFold", attrs: { id: "fold-1" }, content: [{ type: "text", text: "Shot list" }] },
      paragraph("Wide shot of the shop"),
      { type: "noteFold", attrs: { id: "fold-2" }, content: [{ type: "text", text: "After" }] },
      paragraph("Still shown"),
    ])
    // The task's name is the block's heading, which folds it; the tile under it opens the task.
    const card = container.querySelector<HTMLButtonElement>('[aria-label="Open Book the photographer"]')
    act(() => card!.click())
    expect(openTask).toHaveBeenCalledWith("task-2", "project-1")

    expect(container.textContent).toContain("Wide shot of the shop")
    const arrow = container.querySelector<HTMLButtonElement>('[aria-label="Hide what\'s under this heading"]')
    act(() => arrow!.click())
    expect(container.textContent).not.toContain("Wide shot of the shop")
    expect(container.textContent).toContain("Still shown")
    expect(JSON.parse(window.localStorage.getItem("project-note-folds") ?? "[]")).toEqual(["fold-1"])
  })

  it("never shows a block that wasn't filled in", async () => {
    await show([paragraph("Only words"), { type: "noteImage", attrs: { src: null } }, { type: "noteVideo", attrs: {} }])
    expect(container.querySelector("input")).toBeNull()
    expect(container.querySelector("[data-note-block]")).toBeNull()
    expect(container.textContent).toContain("Only words")
  })
})

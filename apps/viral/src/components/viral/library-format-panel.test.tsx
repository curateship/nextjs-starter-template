// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LibraryFormatPanel } from "@/components/viral/library-format-panel"
import type { ViralFormat } from "@/lib/viral/formats"

vi.mock("@/lib/api/viral/viral-library", () => ({
  deleteFormatFn: vi.fn(),
  loadFormatScripts: vi.fn(async () => []),
  renameFormatFn: vi.fn(),
  writeFromFormatFn: vi.fn(),
}))

const format: ViralFormat = {
  id: "format-1",
  name: "Mistake hook, three tips",
  parts: [{ role: "hook", seconds: 3, summary: "A common mistake." }],
  sourceTitle: null,
  sample: false,
  createdAt: "2099-01-01T00:00:00.000Z",
}

const projects = [
  { id: "project-a", name: "Meal prep" },
  { id: "project-b", name: "Home gym" },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function draw(writeForId: string) {
  return (
    <LibraryFormatPanel
      format={format}
      projects={projects}
      writeForId={writeForId}
      priceCents={1}
      onChanged={() => undefined}
      onDeleted={() => undefined}
    />
  )
}

describe("Write a script's project", () => {
  it("follows the project picked on the left while the format stays open", async () => {
    await act(async () => root.render(draw("project-a")))
    const trigger = () => container.querySelector("#format-project-format-1")
    expect(trigger()?.textContent).toContain("Meal prep")

    await act(async () => root.render(draw("project-b")))
    expect(trigger()?.textContent).toContain("Home gym")
  })
})

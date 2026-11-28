// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HookIdeasCards } from "@/components/viral/library-hook-ideas"

vi.mock("@/lib/api/viral/viral-library", () => ({
  loadHookIdeas: vi.fn(async () => [
    { id: "batch-1", projectId: "project-a", projectName: "Meal prep", hooks: ["One", "Two", "Three", "Four", "Five"], createdAt: "2099-01-01T00:00:00.000Z" },
  ]),
  writeHookIdeasFn: vi.fn(),
}))

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

function drawIdeas(writeForId: string) {
  return (
    <HookIdeasCards
      hook={{ kind: "own", id: "hook-1" }}
      projects={projects}
      writeForId={writeForId}
      price={{ cents: 1, writer: "Gemini Flash" }}
    />
  )
}

describe("Write hooks like this", () => {
  it("names the price and writer, follows the project picked on the left, and gives each written hook its Copy", async () => {
    await act(async () => root.render(drawIdeas("project-a")))
    const trigger = () => container.querySelector("#hook-ideas-project-hook-1")
    expect(trigger()?.textContent).toContain("Meal prep")
    // The price on the button, never cut short in a narrow card title; the title names the AI.
    expect(container.textContent).toContain("Write 5 hooks · about 1¢")
    expect(container.textContent).toContain("Gemini Flash")
    expect(container.querySelectorAll('button[aria-label^="Copy"]')).toHaveLength(5)

    await act(async () => root.render(drawIdeas("project-b")))
    expect(trigger()?.textContent).toContain("Home gym")
  })
})

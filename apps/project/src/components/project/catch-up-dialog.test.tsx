// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CatchUpDialog } from "@/components/project/catch-up-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TaskCard } from "@/lib/api/project/tasks"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sent = vi.hoisted(() => ({ calls: [] as { taskIds: string[]; change: unknown }[] }))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: async () => undefined }),
}))
vi.mock("@/lib/api/project/tasks", () => ({
  changeTasks: async (data: { taskIds: string[]; change: unknown }) => {
    sent.calls.push(data)
    return { changed: data.taskIds, refused: [] }
  },
}))
// Friday 6 March 2099 with a Monday-to-Friday team, so Tomorrow is Monday.
vi.mock("@/lib/project/use-quick-days", () => ({
  useQuickDays: () => [
    { key: "today", label: "Today", day: "2099-03-06" },
    { key: "tomorrow", label: "Tomorrow", day: "2099-03-09" },
    { key: "next_monday", label: "Next Monday", day: "2099-03-09" },
    { key: "week", label: "In a week", day: "2099-03-13" },
  ],
}))
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined, warning: () => undefined } }))

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => undefined
Element.prototype.hasPointerCapture ??= () => false

const task = { id: "t1", title: "Send the newsletter", projectName: "Just me", dueDate: "2099-03-02", dueAt: null, status: "todo" } as TaskCard

let root: ReturnType<typeof createRoot> | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
  sent.calls = []
})

function open() {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      <TooltipProvider>
        <CatchUpDialog open tasks={[task]} onClose={() => undefined} />
      </TooltipProvider>
    )
  )
}

function button(name: string) {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)
  if (!found) throw new Error(`No ${name} button`)
  return found
}

async function press(name: string) {
  await act(async () => button(name).click())
}

describe("Catch up's quick dates", () => {
  it("shows Today and Tomorrow beside the date, and no other quick date", () => {
    open()
    const row = document.getElementById("catch-up-day")!.parentElement!
    expect(row.contains(button("Today"))).toBe(true)
    expect(row.contains(button("Tomorrow"))).toBe(true)
    expect(() => button("No date")).toThrow()
    expect(() => button("Next Monday")).toThrow()
  })

  it("leaves them with no date from the footer", async () => {
    open()
    await press("Leave with no date")
    expect(sent.calls).toEqual([{ taskIds: ["t1"], change: { kind: "due", dueDate: null } }])
  })

  it.each([
    ["Today", "2099-03-06"],
    ["Tomorrow", "2099-03-09"],
  ])("%s picks the day, and Move moves to it", async (name, dueDate) => {
    open()
    await press(name)
    expect(button(name).getAttribute("aria-pressed")).toBe("true")
    await press("Move 1 task")
    expect(sent.calls).toEqual([{ taskIds: ["t1"], change: { kind: "due", dueDate } }])
  })

  it("still asks for a day when nothing is picked", async () => {
    open()
    await press("Move 1 task")
    expect(sent.calls).toEqual([])
  })
})

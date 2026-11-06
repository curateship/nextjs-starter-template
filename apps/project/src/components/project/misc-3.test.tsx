// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { QuickNewTask } from "@/components/project/quick-new-task"
import { TaskRightClickMenu } from "@/components/project/task-right-click"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { NewTaskProject } from "@/lib/api/project/tasks"
import { storedTaskNotes } from "@/lib/project/notes"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const made = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: async () => undefined }),
  useNavigate: () => async () => undefined,
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "me", name: "Tyler" } }) }),
}))
vi.mock("@/lib/api/project/tasks", () => ({
  createProjectTask: async (data: Record<string, unknown>) => {
    made.calls.push(data)
    return { id: "new-task" }
  },
}))
vi.mock("@/lib/project/new-task-status", () => ({ moveNewTasks: async () => undefined }))
vi.mock("@/lib/project/use-days-off", () => ({ useDaysOff: () => null }))
vi.mock("sonner", () => ({ toast: { success: () => undefined } }))

// Radix measures with these, which jsdom leaves out.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => undefined
Element.prototype.hasPointerCapture ??= () => false

const project: NewTaskProject = {
  id: "p1",
  name: "Website",
  color: "blue",
  members: [{ userId: "me", name: "Tyler", avatarUrl: "" }],
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function mount(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<TooltipProvider>{node}</TooltipProvider>))
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ""
  made.calls = []
})

const menuItems = () => [...document.querySelectorAll("[role=menuitem]")].map((item) => item.textContent)

describe("right-clicking a task", () => {
  it("offers Duplicate and Delete, and each does its own thing", () => {
    const onDuplicate = vi.fn()
    const onDelete = vi.fn()
    mount(
      <TaskRightClickMenu
        at={{ x: 40, y: 60 }}
        onClose={() => undefined}
        canDelete
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    )
    expect(menuItems()).toEqual(["Duplicate", "Delete"])
    const [duplicate, remove] = document.querySelectorAll<HTMLElement>("[role=menuitem]")
    act(() => duplicate.click())
    act(() => remove.click())
    expect(onDuplicate).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("leaves Delete off a task this person may not delete", () => {
    mount(
      <TaskRightClickMenu
        at={{ x: 40, y: 60 }}
        onClose={() => undefined}
        canDelete={false}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
      />
    )
    expect(menuItems()).toEqual(["Duplicate"])
  })

  it("opens at the mouse, not where the task sits", () => {
    mount(
      <TaskRightClickMenu
        at={{ x: 40, y: 60 }}
        onClose={() => undefined}
        canDelete
        onDuplicate={() => undefined}
        onDelete={() => undefined}
      />
    )
    const anchor = document.querySelector<HTMLElement>("span[aria-hidden].fixed")
    expect(anchor?.style.left).toBe("40px")
    expect(anchor?.style.top).toBe("60px")
  })
})

describe("New task's Description", () => {
  function openNewTask() {
    mount(
      <QuickNewTask
        projects={[project]}
        initialProjectId="p1"
        open
        onOpenChange={() => undefined}
        onMoreOptions={() => undefined}
      >
        <button type="button">New task</button>
      </QuickNewTask>
    )
  }

  it("sits under the title as an empty writing box", async () => {
    openNewTask()
    await act(async () => undefined)
    const labels = [...document.querySelectorAll("form label, form [data-slot=label]")].map((l) => l.textContent)
    expect(labels.slice(0, 2)).toEqual(["Title", "Description"])
    const box = document.querySelector("[aria-labelledby=quick-task-description-label] [contenteditable=true]")
    expect(box?.textContent).toBe("")
  })

  it("makes the task from its title, with nothing written in its notes", async () => {
    openNewTask()
    await act(async () => undefined)
    const title = document.querySelector<HTMLInputElement>("#quick-task-title")!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Login breaks")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      document.querySelector<HTMLFormElement>("form[aria-label='New task']")!.requestSubmit()
    })
    expect(made.calls).toHaveLength(1)
    expect(made.calls[0].title).toBe("Login breaks")
    expect(storedTaskNotes(made.calls[0].notes)).toBe("")
  })
})

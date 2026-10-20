// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const errorToast = vi.hoisted(() => ({ show: vi.fn() }))
const handoff = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock("@/lib/api/project/linked-records", () => ({
  openProjectTaskLink: handoff.open,
}))

vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: errorToast.show,
}))

import { TaskLinkButton } from "@/components/project/task-link"
import type { TaskDetail } from "@/lib/api/project/tasks"

type Link = NonNullable<TaskDetail["link"]>

function detailWith(link: Partial<Link> | null) {
  return {
    task: { id: "task-1" },
    link: link && { app: "video", address: null, canOpen: true, connected: true, ...link },
  } as unknown as TaskDetail
}

let container: HTMLDivElement
let root: Root

function render(detail: TaskDetail) {
  act(() => root.render(<TaskLinkButton detail={detail} />))
}

function button() {
  return Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Edit video")
}

async function press() {
  await act(async () => {
    button()!.click()
  })
}

describe("TaskLinkButton", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    errorToast.show.mockReset()
    handoff.open.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it("shows nothing on a task with no record", () => {
    render(detailWith(null))
    expect(container.textContent).toBe("")
  })

  it("tells someone who may not open it who can, with no button", () => {
    render(detailWith({ canOpen: false }))
    expect(button()).toBeUndefined()
    expect(container.textContent).toBe(
      "This task points at a video project. Only the person assigned and the site admin can open it."
    )
  })

  it("says so when Video isn't connected on this server, with no button", () => {
    render(detailWith({ connected: false }))
    expect(button()).toBeUndefined()
    expect(container.textContent).toContain("Video isn't connected to Project on this server yet.")
  })

  it("opens a new tab on the press and points it at the stamped address", async () => {
    const tab = { opener: window, location: { href: "" }, close: vi.fn() }
    const openWindow = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    handoff.open.mockResolvedValue({ url: "http://localhost:3016/handoff/project?note=abc.def" })

    render(detailWith({}))
    await press()

    expect(openWindow).toHaveBeenCalledWith("", "_blank")
    expect(tab.opener).toBeNull()
    expect(handoff.open).toHaveBeenCalledWith("task-1")
    expect(tab.location.href).toBe("http://localhost:3016/handoff/project?note=abc.def")
    expect(button()!.disabled).toBe(false)
  })

  it("closes the tab and says why when Project refuses", async () => {
    const tab = { opener: window, location: { href: "" }, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    handoff.open.mockRejectedValue(new Error("Only the person assigned and the site admin can open this task's record."))

    render(detailWith({}))
    await press()

    expect(tab.close).toHaveBeenCalled()
    expect(tab.location.href).toBe("")
    expect(errorToast.show).toHaveBeenCalledTimes(1)
  })
})

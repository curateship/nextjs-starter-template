// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useRememberedTask } from "@/lib/project/use-remembered-task"

const navigate = vi.hoisted(() => vi.fn((_options: unknown) => Promise.resolve()))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "me" } }) }),
}))

const KEY = "test-open-task"

/** The task each move put in the address, in order. */
function opened(): string[] {
  return navigate.mock.calls.map(([options]) => {
    const { search, replace } = options as { search: (previous: object) => { task: string }; replace: boolean }
    expect(replace).toBe(true)
    return search({}).task
  })
}

/**
 * Tyler, 23 Oct 2026: "There is no 'x' icon to close the right panel to show an
 * empty panel. The first load always show the first task and then it remembers
 * what task I'm on afterwards."
 */
describe("the task My dashboard opens by itself", () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let quiet: string | null = null

  function Screen({ taskId, ids }: { taskId: string | undefined; ids: string[] | null }) {
    quiet = useRememberedTask({ storageKey: KEY, taskId, ids })
    return null
  }

  async function show(taskId: string | undefined, ids: string[] | null) {
    await act(async () => root.render(<Screen taskId={taskId} ids={ids} />))
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    navigate.mockClear()
    quiet = null
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("opens the first row on a first visit, quietly", async () => {
    await show(undefined, null)
    expect(opened()).toEqual([])
    await show(undefined, ["a", "b"])
    expect(opened()).toEqual(["a"])
    expect(quiet).toBe("a")
  })

  it("opens the task last open here when it is still listed", async () => {
    localStorage.setItem(`${KEY}:me`, "b")
    await show(undefined, ["a", "b"])
    expect(opened()).toEqual(["b"])
  })

  it("opens the first row when the remembered task is gone", async () => {
    localStorage.setItem(`${KEY}:me`, "gone")
    await show(undefined, ["a", "b"])
    expect(opened()).toEqual(["a"])
  })

  it("leaves a link's own task open and remembers it", async () => {
    await show("b", ["a", "b"])
    expect(opened()).toEqual([])
    expect(localStorage.getItem(`${KEY}:me`)).toBe("b")
  })

  it("opens the first row again when the open task leaves the address", async () => {
    await show("b", ["a", "b"])
    await show(undefined, ["a"])
    expect(opened()).toEqual(["a"])
  })

  it("opens nothing when there are no tasks", async () => {
    await show(undefined, [])
    expect(opened()).toEqual([])
  })
})

// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/pomodoro/admin", () => ({
  getPomodoroAdminErrorMessage: (error: unknown) => String(error),
}))

import { useAdminList } from "@/components/pomodoro/admin-list"

/**
 * The operator lists open with the rows their loader already fetched. React
 * runs the fetch effect twice on mount in strict mode, and a list that asked
 * the server again there blanked an empty table for a moment and made its
 * footer jump (8 Oct 2026).
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function List({
  query,
  load,
}: {
  query: string
  load: (query: string) => Promise<{ rows: string[]; total: number }>
}) {
  const fetchPage = React.useCallback(() => load(query), [load, query])
  const list = useAdminList({
    initial: { rows: [], total: 0 },
    initialPageSize: 20,
    page: 1,
    onPageChange: () => {},
    load: fetchPage,
  })
  return <p>{list.loading ? "loading" : `${list.total} rows`}</p>
}

function draw(query: string, load: (query: string) => Promise<{ rows: string[]; total: number }>) {
  act(() => {
    root.render(
      <React.StrictMode>
        <List query={query} load={load} />
      </React.StrictMode>
    )
  })
}

describe("useAdminList", () => {
  it("does not ask the server again for the rows it opened with", async () => {
    const load = vi.fn(async () => ({ rows: [], total: 0 }))
    draw("", load)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(load).not.toHaveBeenCalled()
    expect(container.textContent).toBe("0 rows")
  })

  it("asks once when the address changes, after the quarter-second wait", async () => {
    const load = vi.fn(async () => ({ rows: ["a"], total: 1 }))
    draw("", load)
    draw("sam", load)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(load).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith("sam")
    expect(container.textContent).toBe("1 rows")
  })
})

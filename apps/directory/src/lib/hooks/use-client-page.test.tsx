// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useClientPage } from "@/lib/hooks/use-client-page"

const rows = Array.from({ length: 25 }, (_, index) => index + 1)

let seen: ReturnType<typeof useClientPage<number>>

function Probe({
  page,
  setPage,
}: {
  page: number
  setPage: (page: number) => void
}) {
  const result = useClientPage(rows, 10, undefined, { page, setPage })
  React.useEffect(() => {
    seen = result
  })
  return null
}

describe("useClientPage with the page in the address", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  // Opening ?page=3, or pressing Back to it, used to jump to page 1: the
  // dashboards reset the page as they appeared.
  it("opens on the page the address names and writes nothing back", () => {
    const setPage = vi.fn()
    act(() => root.render(<Probe page={3} setPage={setPage} />))

    expect(seen.page).toBe(3)
    expect(seen.visible).toEqual([21, 22, 23, 24, 25])
    expect(setPage).not.toHaveBeenCalled()
  })

  it("asks the address for the new page, and page 1 after a page-size change", () => {
    const setPage = vi.fn()
    act(() => root.render(<Probe page={2} setPage={setPage} />))

    act(() => seen.footer.onPageChange(3))
    expect(setPage).toHaveBeenLastCalledWith(3)

    act(() => seen.footer.onPageSizeChange(25))
    expect(setPage).toHaveBeenLastCalledWith(1)
  })

  it("shows the last page when the address names one past the end", () => {
    act(() => root.render(<Probe page={9} setPage={vi.fn()} />))

    expect(seen.page).toBe(3)
    expect(seen.visible).toEqual([21, 22, 23, 24, 25])
  })
})

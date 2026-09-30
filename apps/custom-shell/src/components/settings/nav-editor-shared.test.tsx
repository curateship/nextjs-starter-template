// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { stableItemIds } from "@/components/settings/nav-editor-shared"

/**
 * The id a chip drags under has to stay with the link, not with the slot it
 * sits in. When the id is the slot, dropping a chip leaves every id where it
 * was and the row snaps into its new order instead of sliding.
 */
describe("stableItemIds", () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let ids: string[] = []

  function Row({ items }: { items: object[] }) {
    ids = stableItemIds(items, "menu")
    return null
  }

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("keeps each item's id when the list is reordered", () => {
    const first = { label: "Pricing", href: "/pricing" }
    const second = { label: "About", href: "/about" }

    act(() => root.render(<Row items={[first, second]} />))
    const [firstId, secondId] = ids

    act(() => root.render(<Row items={[second, first]} />))

    expect(firstId).not.toBe(secondId)
    expect(ids).toEqual([secondId, firstId])
  })

  it("gives a new link an id no other link holds", () => {
    const first = { label: "Pricing", href: "/pricing" }

    act(() => root.render(<Row items={[first]} />))
    const [firstId] = ids

    act(() =>
      root.render(<Row items={[first, { label: "About", href: "/about" }]} />)
    )

    expect(ids[0]).toBe(firstId)
    expect(ids[1]).not.toBe(firstId)
  })

  it("gives the same object listed twice two different ids", () => {
    const link = { label: "Pricing", href: "/pricing" }

    act(() => root.render(<Row items={[link, link]} />))

    expect(new Set(ids).size).toBe(2)
  })
})

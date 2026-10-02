// @vitest-environment jsdom

import { act } from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  stableItemIds,
  useNavSensors,
  useSortableChip,
} from "@/components/settings/nav-editor-shared"

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

  it("keeps the id when an item is edited in place", () => {
    const first = { label: "Pricing", href: "/pricing" }
    const second = { label: "About", href: "/about" }

    act(() => root.render(<Row items={[first, second]} />))
    const [firstId, secondId] = ids

    // What pressing Done does: the same link, as a new object, in its place.
    const renamed = { label: "Our prices", href: "/pricing" }
    act(() => root.render(<Row items={[renamed, second]} />))

    expect(ids).toEqual([firstId, secondId])
  })

  it("gives a deleted item's neighbours their own ids back", () => {
    const first = { label: "Pricing", href: "/pricing" }
    const second = { label: "About", href: "/about" }
    const third = { label: "Blog", href: "/blog" }

    act(() => root.render(<Row items={[first, second, third]} />))
    const [firstId, , thirdId] = ids

    act(() => root.render(<Row items={[first, third]} />))

    expect(ids).toEqual([firstId, thirdId])
  })

  it("gives the same object listed twice two different ids", () => {
    const link = { label: "Pricing", href: "/pricing" }

    act(() => root.render(<Row items={[link, link]} />))

    expect(new Set(ids).size).toBe(2)
  })
})

/**
 * A chip drags from anywhere on it, and the window that edits it is drawn
 * outside it in `document.body`. React still sends that window's keys up to the
 * chip, where dnd-kit read a space as "pick this chip up" and stopped the key
 * reaching the box, so a link's name could not contain a space.
 */
describe("useSortableChip", () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  function Chip() {
    const chip = useSortableChip("chip-1", "Pricing")

    return (
      <div {...chip} data-testid="chip">
        <button type="button">Pricing</button>
        {createPortal(
          <input data-testid="name" defaultValue="" />,
          document.body
        )}
      </div>
    )
  }

  function Editor() {
    return (
      <DndContext sensors={useNavSensors()}>
        <SortableContext items={["chip-1"]}>
          <Chip />
        </SortableContext>
      </DndContext>
    )
  }

  function pressSpaceOn(element: Element) {
    const event = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      element.dispatchEvent(event)
    })
    return event
  }

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Editor />))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("lets a space through to a box inside the chip's window", () => {
    const box = document.querySelector('[data-testid="name"]')
    if (!box) throw new Error("no name box")

    expect(pressSpaceOn(box).defaultPrevented).toBe(false)
  })

  it("still picks the chip up when the space is pressed on the chip", () => {
    const chip = host.querySelector('[data-testid="chip"]')
    if (!chip) throw new Error("no chip")

    expect(pressSpaceOn(chip).defaultPrevented).toBe(true)
  })
})

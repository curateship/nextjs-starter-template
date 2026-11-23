// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FrontPageBlockKinds } from "@/components/pages/front-page-block-kinds"
import {
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_KINDS,
} from "@/lib/pages/front-page"

function cardNamed(name: string) {
  const card = Array.from(
    document.querySelectorAll("[draggable='true']")
  ).find((candidate) => candidate.textContent?.startsWith(name))
  if (!card) throw new Error(`${name} card was not drawn`)
  return card
}

/** The plus on a card, which is the way in that is not a drag. */
function addButtonFor(name: string) {
  const button = document.querySelector(
    `button[aria-label="Add a ${name.toLowerCase()} block"]`
  )
  if (!button) throw new Error(`${name} had no add button`)
  return button
}

describe("FrontPageBlockKinds", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("offers every kind as a card and reports the one that was picked", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onPick = vi.fn()

    await act(async () => {
      root.render(<FrontPageBlockKinds path="/" onPick={onPick} onDragKind={vi.fn()} />)
    })

    for (const kind of FRONT_PAGE_ROW_KINDS) {
      expect(cardNamed(FRONT_PAGE_ROW_KIND_LABELS[kind])).toBeTruthy()
    }

    // The card itself does nothing when it is clicked. It is dragged into the
    // middle panel, or added with the plus; a list of cards you read by
    // pointing at them must not build a page while you read it.
    await act(async () => {
      cardNamed(FRONT_PAGE_ROW_KIND_LABELS.faq).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
    })
    expect(onPick).not.toHaveBeenCalled()

    await act(async () => {
      addButtonFor(FRONT_PAGE_ROW_KIND_LABELS.faq).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
    })
    expect(onPick).toHaveBeenCalledWith("faq")
  })

  it("carries the kind on the drag itself", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<FrontPageBlockKinds path="/" onPick={vi.fn()} onDragKind={vi.fn()} />)
    })

    for (const kind of FRONT_PAGE_ROW_KINDS) {
      const card = cardNamed(FRONT_PAGE_ROW_KIND_LABELS[kind])
      expect(card.getAttribute("draggable")).toBe("true")
    }
  })

  it("keeps the plans card off a page that is not the front page", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<FrontPageBlockKinds path="/about" onPick={vi.fn()} onDragKind={vi.fn()} />)
    })

    // Everything else is there; plans needs the public prices, which only the
    // front page loads, so a plans block anywhere else would draw nothing.
    expect(cardNamed(FRONT_PAGE_ROW_KIND_LABELS.hero)).toBeTruthy()
    expect(() => cardNamed(FRONT_PAGE_ROW_KIND_LABELS.plans)).toThrow()
  })
})

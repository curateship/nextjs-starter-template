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
  const card = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.startsWith(name)
  )
  if (!card) throw new Error(`${name} card was not drawn`)
  return card
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
      root.render(<FrontPageBlockKinds path="/" onPick={onPick} />)
    })

    for (const kind of FRONT_PAGE_ROW_KINDS) {
      expect(cardNamed(FRONT_PAGE_ROW_KIND_LABELS[kind])).toBeTruthy()
    }

    await act(async () => {
      cardNamed(FRONT_PAGE_ROW_KIND_LABELS.faq).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
    })

    expect(onPick).toHaveBeenCalledWith("faq")
  })

  it("keeps the plans card off a page that is not the front page", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<FrontPageBlockKinds path="/about" onPick={vi.fn()} />)
    })

    // Everything else is there; plans needs the public prices, which only the
    // front page loads, so a plans block anywhere else would draw nothing.
    expect(cardNamed(FRONT_PAGE_ROW_KIND_LABELS.hero)).toBeTruthy()
    expect(() => cardNamed(FRONT_PAGE_ROW_KIND_LABELS.plans)).toThrow()
  })
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FrontPageRowPicker } from "@/components/settings/front-page-row-picker"
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

describe("FrontPageRowPicker", () => {
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
      root.render(
        <FrontPageRowPicker
          open
          onOpenChange={vi.fn()}
          onPick={onPick}
        />
      )
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
})

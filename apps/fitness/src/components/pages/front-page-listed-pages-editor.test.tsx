// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FrontPageListedPagesEditor,
  type FrontPageListedPageChoice,
} from "@/components/pages/front-page-listed-pages-editor"
import { MAX_FRONT_PAGE_LISTED_PAGES } from "@/lib/pages/front-page"

function choice(index: number): FrontPageListedPageChoice {
  return {
    id: `page-${index}`,
    title: `Page ${index}`,
    path: `/page-${index}`,
    visibility: "everyone",
  }
}

async function draw(
  choices: FrontPageListedPageChoice[],
  pageIds: string[],
  onChange = vi.fn()
) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <FrontPageListedPagesEditor
        choices={choices}
        pageIds={pageIds}
        onChange={onChange}
      />
    )
  })
  return onChange
}

function box(id: string) {
  const found = document.getElementById(`front-page-listed-page-${id}`)
  if (!found) throw new Error(`no box for ${id}`)
  return found as HTMLButtonElement
}

describe("FrontPageListedPagesEditor", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("saves the ticked pages in the list's order, whatever order they were ticked in", async () => {
    const choices = [choice(1), choice(2), choice(3)]
    const onChange = await draw(choices, ["page-3"])

    await act(async () => box("page-1").click())

    expect(onChange).toHaveBeenLastCalledWith(["page-1", "page-3"])
  })

  it("drops an id whose page is gone on the next tick", async () => {
    const onChange = await draw([choice(1), choice(2)], ["deleted", "page-1"])

    await act(async () => box("page-2").click())

    expect(onChange).toHaveBeenLastCalledWith(["page-1", "page-2"])
  })

  it("stops at the cap, counting only pages still on offer", async () => {
    const choices = Array.from(
      { length: MAX_FRONT_PAGE_LISTED_PAGES + 1 },
      (_, index) => choice(index)
    )
    const ticked = choices
      .slice(0, MAX_FRONT_PAGE_LISTED_PAGES - 1)
      .map((page) => page.id)
    const last = choices[MAX_FRONT_PAGE_LISTED_PAGES]!.id

    // One short of the cap, plus an id left behind by a deleted page: the
    // remaining boxes can still be ticked.
    await draw(choices, [...ticked, "deleted"])
    expect(box(last).disabled).toBe(false)

    document.body.replaceChildren()

    // At the cap, an unticked box is greyed out and a ticked one is not.
    await draw(choices, [...ticked, choices[MAX_FRONT_PAGE_LISTED_PAGES - 1]!.id])
    expect(box(last).disabled).toBe(true)
    expect(box(ticked[0]!).disabled).toBe(false)
  })
})

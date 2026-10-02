// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"

import { postRowWasClicked } from "@/components/social/post-row-click"

/**
 * Whether a click on a post row opens that post's window.
 *
 * The row is the whole click target, so every exception matters: a click meant
 * for the handle, a coin chip or Open on X must reach those and nothing else,
 * and dragging across the words to copy them is not a click at all.
 */
type FakeClick = {
  defaultPrevented?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  target: Element
  currentTarget: Element
}

// Each test builds its own row. Without clearing, the ids repeat across rows
// and `querySelector("#seen")` resolves the id against the whole document,
// then finds it is not inside this row and answers null.
afterEach(() => {
  document.body.innerHTML = ""
  window.getSelection()?.removeAllRanges()
})

/** A row with a link, a chip and some words, as the panels build it. */
function aRow() {
  const row = document.createElement("li")
  row.innerHTML = `
    <a href="/social/sam" id="handle">@sam</a>
    <a href="https://x.com/x" id="openx">Open on X</a>
    <button type="button" id="chip">$SOL</button>
    <span id="seen">1.2k seen</span>
    <p id="words">buying more sol here</p>`
  document.body.append(row)
  return row
}

const clickOn = (row: Element, id: string, extra: Partial<FakeClick> = {}) =>
  postRowWasClicked({
    target: row.querySelector(`#${id}`)!,
    currentTarget: row,
    ...extra,
  } as unknown as React.MouseEvent<HTMLElement>)

describe("a click on a post row", () => {
  it("opens the window when it lands on the words", () => {
    expect(clickOn(aRow(), "words")).toBe(true)
  })

  it("opens the window when it lands on plain text like the seen count", () => {
    expect(clickOn(aRow(), "seen")).toBe(true)
  })

  it("leaves the handle's link alone", () => {
    expect(clickOn(aRow(), "handle")).toBe(false)
  })

  it("leaves Open on X alone", () => {
    expect(clickOn(aRow(), "openx")).toBe(false)
  })

  it("leaves a coin chip alone", () => {
    expect(clickOn(aRow(), "chip")).toBe(false)
  })

  it("does nothing while a modifier is held", () => {
    const row = aRow()
    expect(clickOn(row, "words", { metaKey: true })).toBe(false)
    expect(clickOn(row, "words", { ctrlKey: true })).toBe(false)
    expect(clickOn(row, "words", { shiftKey: true })).toBe(false)
    expect(clickOn(row, "words", { altKey: true })).toBe(false)
  })

  it("does nothing when something else already handled the click", () => {
    expect(clickOn(aRow(), "words", { defaultPrevented: true })).toBe(false)
  })

  it("is not a click when words in the row were being selected", () => {
    const row = aRow()
    const words = row.querySelector("#words")!
    const range = document.createRange()
    range.selectNodeContents(words)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(clickOn(row, "words")).toBe(false)

    selection.removeAllRanges()
    expect(clickOn(row, "words")).toBe(true)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"

import { pickedWordsUnder, readRightClick } from "@/lib/project/right-click"

function page(html: string) {
  document.body.innerHTML = html
  return (selector: string) => document.querySelector(selector)
}

afterEach(() => {
  document.body.innerHTML = ""
  window.getSelection()?.removeAllRanges()
})

describe("what a right-click on the project's task tabs lands on", () => {
  it("names the task under the mouse, from anywhere inside it", () => {
    const at = page(`<section data-new-status="doing" data-new-lane="all"><li data-task-id="t1"><span class="title">Fix</span></li></section>`)
    expect(readRightClick(at(".title"))).toEqual({ kind: "task", taskId: "t1" })
  })

  it("starts a new task in the Board column and row under empty space", () => {
    const at = page(`<section data-new-status="review" data-new-lane="u2"><div class="gap"></div></section>`)
    expect(readRightClick(at(".gap"))).toEqual({ kind: "new", status: "review", lane: "u2", due: undefined, group: undefined })
  })

  it("starts a new task due on the Calendar day, or in the List heading's group", () => {
    const at = page(`<section data-new-due="2026-10-30"><p class="day"></p></section><table><tbody><tr data-new-group="high"><td class="head"></td></tr></tbody></table>`)
    expect(readRightClick(at(".day"))).toMatchObject({ kind: "new", due: "2026-10-30" })
    expect(readRightClick(at(".head"))).toMatchObject({ kind: "new", group: "high" })
  })

  it("starts a plain new task on space that says nothing", () => {
    const at = page(`<div class="blank"></div>`)
    expect(readRightClick(at(".blank"))).toEqual({ kind: "new", status: undefined, lane: undefined, due: undefined, group: undefined })
  })

  it("keeps the browser's own menu in a text box, a link or a task's notes", () => {
    const at = page(`<li data-task-id="t1"><input class="box" /><a class="link" href="/x">x</a><div contenteditable="true"><p class="words">w</p></div></li>`)
    expect(readRightClick(at(".box"))).toBeNull()
    expect(readRightClick(at(".link"))).toBeNull()
    expect(readRightClick(at(".words"))).toBeNull()
  })

  it("keeps the browser's own menu when the right button went down on words already picked", () => {
    const at = page(`<li data-task-id="t1"><span class="title">Fix the login</span><span class="other">Ben</span></li>`)
    const range = document.createRange()
    range.selectNodeContents(at(".title")!)
    window.getSelection()!.addRange(range)
    expect(pickedWordsUnder(at(".title"))).toBe(true)
    expect(readRightClick(at(".title"), true)).toBeNull()
    // Words picked somewhere else don't stop the menu on this task.
    expect(pickedWordsUnder(at(".other"))).toBe(false)
    expect(readRightClick(at(".other"), false)).toEqual({ kind: "task", taskId: "t1" })
  })
})

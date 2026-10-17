// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TaskTitleRename } from "@/components/pomodoro/today-task-list"

/** Tyler, 16 Oct 2026: "Double clicking on task should let me rename it." */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement

afterEach(() => container?.remove())

function render(onRename: (title: string) => Promise<boolean>) {
  container = document.createElement("div")
  document.body.append(container)
  act(() =>
    createRoot(container).render(
      <TaskTitleRename title="Write report" onRename={onRename}>
        <button>Write report</button>
      </TaskTitleRename>
    )
  )
}

function openBox() {
  act(() => {
    container
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  })
  return container.querySelector("input")!
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function press(input: HTMLInputElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  })
}

describe("renaming a task by double-clicking its title", () => {
  it("opens a box holding the title", () => {
    render(vi.fn())
    expect(openBox().value).toBe("Write report")
  })

  it("saves the new title on Enter and closes the box", async () => {
    const onRename = vi.fn().mockResolvedValue(true)
    render(onRename)
    const input = openBox()
    type(input, "  Write the report  ")
    await press(input, "Enter")
    expect(onRename).toHaveBeenCalledWith("Write the report")
    expect(container.querySelector("input")).toBeNull()
  })

  it("puts the old title back on Escape without saving", async () => {
    const onRename = vi.fn()
    render(onRename)
    const input = openBox()
    type(input, "Something else")
    await press(input, "Escape")
    expect(onRename).not.toHaveBeenCalled()
    expect(container.querySelector("button")?.textContent).toBe("Write report")
  })

  it("saves nothing for a blank or unchanged title", async () => {
    const onRename = vi.fn()
    render(onRename)
    let input = openBox()
    type(input, "   ")
    await press(input, "Enter")
    input = openBox()
    await press(input, "Enter")
    expect(onRename).not.toHaveBeenCalled()
  })

  it("keeps the box open with the typed title when the save fails", async () => {
    render(vi.fn().mockResolvedValue(false))
    const input = openBox()
    type(input, "Write the report")
    await press(input, "Enter")
    expect(container.querySelector("input")?.value).toBe("Write the report")
  })
})

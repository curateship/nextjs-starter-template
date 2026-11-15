// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TextPickRow } from "@/components/dashboard-page/text-pick-row"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/** A record ⋮'s typed row, which saves itself (Tyler, 12 Nov 2026: the right panel as the shell draws it). */
describe("a typed row in a record's ⋮", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const type = async (value: string) => {
    const input = document.getElementById("row") as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  const open = async () => {
    await act(async () => {
      Array.from(document.querySelectorAll("button")).find((one) => one.textContent?.startsWith("Port"))!.click()
    })
  }

  it("shows what it holds, saves on Enter, and saves nothing when nothing changed", async () => {
    const onSave = vi.fn(async () => true)
    await act(async () => root.render(<TextPickRow id="row" label="Port" value="8000" onSave={onSave} />))
    expect(container.textContent).toContain("Port8000")
    await open()
    const input = await type("8000")
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
    expect(onSave).not.toHaveBeenCalled()
    await type("8080")
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
    expect(onSave).toHaveBeenCalledWith("8080")
  })

  it("keeps what was typed when the save is refused, and takes a new saved value", async () => {
    const onSave = vi.fn(async () => false)
    await act(async () => root.render(<TextPickRow id="row" label="Port" value="8000" onSave={onSave} />))
    await open()
    const input = await type("abc")
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
    expect((document.getElementById("row") as HTMLInputElement).value).toBe("abc")
    await act(async () => root.render(<TextPickRow id="row" label="Port" value="9000" onSave={onSave} />))
    expect((document.getElementById("row") as HTMLInputElement).value).toBe("9000")
  })

  it("shows its own words in place of the value, as a password's Stored", async () => {
    await act(async () =>
      root.render(<TextPickRow id="row" label="Password" type="password" value="" shown="Stored" onSave={async () => true} />)
    )
    expect(container.textContent).toContain("PasswordStored")
  })
})

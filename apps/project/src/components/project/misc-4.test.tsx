// @vitest-environment jsdom
import { act } from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StepFields } from "@/components/project/step-fields"
import { foldOnHeadingClick } from "@/lib/project/heading-fold"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const saved = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }))

vi.mock("@/lib/api/project/tasks", () => ({
  updateTaskStep: async (data: Record<string, unknown>) => {
    saved.calls.push(data)
  },
}))
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }))

// Radix measures with these, which jsdom leaves out.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => undefined
Element.prototype.hasPointerCapture ??= () => false

let host: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = null
  root = null
  saved.calls = []
})

function render(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

// Misc 4, 28 Oct 2026: "Make section one click to uncollapsed".
describe("a List heading", () => {
  function heading(toggle: () => void) {
    return render(
      <h3 onClick={foldOnHeadingClick(toggle)}>
        <span>No date</span>
        <button type="button">+</button>
      </h3>
    )
  }

  it("folds or opens on a click anywhere on it", () => {
    const toggle = vi.fn()
    const box = heading(toggle)
    act(() => box.querySelector("span")!.click())
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it("leaves a click inside a dropdown opened from it alone", () => {
    const toggle = vi.fn()
    // React passes a portaled dropdown's clicks up to the heading, though the
    // dropdown sits elsewhere on the page.
    const outside = document.createElement("div")
    document.body.append(outside)
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <h3 onClick={foldOnHeadingClick(toggle)}>
          No date
          {createPortal(<div role="option">High</div>, outside)}
        </h3>
      )
    )
    act(() => (outside.querySelector("[role=option]") as HTMLElement).click())
    expect(toggle).not.toHaveBeenCalled()
    outside.remove()
  })

  it("leaves a click on its own buttons to them", () => {
    const toggle = vi.fn()
    const box = heading(toggle)
    act(() => box.querySelector("button")!.click())
    expect(toggle).not.toHaveBeenCalled()
  })
})

// Misc 4, 28 Oct 2026: a step's fields are a "name and value", with "a few options like url field".
describe("a step's fields", () => {
  const change = async (work: () => Promise<unknown>) => {
    await work()
    return true
  }

  function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  // Radix opens its menu on the pointer going down, which jsdom has to be told about.
  async function addField(box: HTMLElement, kind: string) {
    const trigger = [...box.querySelectorAll("button")].find((b) => b.textContent === "Add field")!
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }))
    })
    const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((each) => each.textContent === kind)
    await act(async () => item!.click())
  }

  it("adds a Link field and saves its name and address when the boxes are left", async () => {
    const box = render(<StepFields stepId="s1" fields={[]} readOnly={false} change={change} />)
    await addField(box, "Link")
    const [name, value] = box.querySelectorAll("input")
    type(name, "Cut")
    type(value, "dropbox.com/cut")
    await act(async () => {
      value.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    })
    expect(saved.calls).toEqual([
      { stepId: "s1", fields: [{ id: expect.any(String), name: "Cut", value: "dropbox.com/cut", kind: "link" }] },
    ])
    // The arrow opens it, with https:// added.
    expect(box.querySelector('a[href="https://dropbox.com/cut"]')).not.toBeNull()
  })

  it("saves a Tick box the moment it is ticked", async () => {
    const box = render(
      <StepFields stepId="s1" fields={[{ id: "f1", name: "Approved", value: "", kind: "tick" }]} readOnly={false} change={change} />
    )
    await act(async () => (box.querySelector("button[role=checkbox]") as HTMLElement).click())
    expect(saved.calls).toEqual([
      { stepId: "s1", fields: [{ id: "f1", name: "Approved", value: "yes", kind: "tick" }] },
    ])
  })

  it("drops an empty row without saving, and refuses a value with no name", async () => {
    const box = render(<StepFields stepId="s1" fields={[]} readOnly={false} change={change} />)
    await addField(box, "Text")
    const [name] = box.querySelectorAll("input")
    await act(async () => {
      name.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    })
    expect(saved.calls).toEqual([])
    expect(box.querySelectorAll("input")).toHaveLength(0)

    await addField(box, "Text")
    const [, value] = box.querySelectorAll("input")
    type(value, "60s")
    await act(async () => {
      value.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
    })
    expect(saved.calls).toEqual([])
    expect(box.querySelectorAll("input")).toHaveLength(2)
  })

  it("reads as a list for someone who can't change the task", () => {
    const box = render(
      <StepFields stepId="s1" fields={[{ id: "f1", name: "Link", value: "dropbox.com/cut", kind: "link" }]} readOnly change={change} />
    )
    expect(box.querySelector("dl")?.textContent).toBe("Linkdropbox.com/cut")
    expect(box.querySelector('dl a[href="https://dropbox.com/cut"]')).not.toBeNull()
    expect(box.querySelector("input")).toBeNull()
  })
})

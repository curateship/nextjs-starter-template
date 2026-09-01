// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TradeNumberField } from "@/components/recipes/trade-number-field"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function enter(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setValue?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("whole-number fields", () => {
  it("does not save a decimal", async () => {
    const changed = vi.fn()

    function Field() {
      const [value, setValue] = useState(2)
      return (
        <TradeNumberField
          id="borrowing"
          label="Borrowing"
          value={value}
          min={1}
          max={50}
          integer
          onChange={(next) => {
            changed(next)
            setValue(next)
          }}
        />
      )
    }

    await act(async () => root.render(<Field />))
    const input = host.querySelector<HTMLInputElement>("#borrowing")
    expect(input).not.toBeNull()

    await act(async () => enter(input!, "2.5"))
    expect(input?.getAttribute("aria-invalid")).toBe("true")
    expect(host.textContent).toContain(
      "Use a whole number. Anything else is not saved."
    )
    expect(changed).not.toHaveBeenCalled()

    await act(async () => enter(input!, "3"))
    expect(input?.getAttribute("aria-invalid")).toBe("false")
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith(3)
  })

  it("saves only values on a requested increment", async () => {
    const changed = vi.fn()

    function Field() {
      const [value, setValue] = useState(72)
      return (
        <TradeNumberField
          id="clean-hours"
          label="Clean hours"
          value={value}
          min={4}
          max={336}
          integer
          step={4}
          suffix="hours"
          onChange={(next) => {
            changed(next)
            setValue(next)
          }}
        />
      )
    }

    await act(async () => root.render(<Field />))
    const input = host.querySelector<HTMLInputElement>("#clean-hours")
    expect(input).not.toBeNull()

    await act(async () => enter(input!, "6"))
    expect(input?.getAttribute("aria-invalid")).toBe("true")
    expect(host.textContent).toContain(
      "Use increments of 4 hours. Anything else is not saved."
    )
    expect(changed).not.toHaveBeenCalled()

    await act(async () => enter(input!, "8"))
    expect(input?.getAttribute("aria-invalid")).toBe("false")
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith(8)
  })
})

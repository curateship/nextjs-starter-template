// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  parseOrderNumber,
  useOrderWindowForm,
} from "@/components/trade/order-window-form"

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

function Probe({ name }: { name: string }) {
  const { edited, touched, showValidation, setShowValidation } =
    useOrderWindowForm()
  const [value, setValue] = React.useState("")
  return (
    <section data-probe={name} data-edited={String(edited.current)}>
      <output>{value}</output>
      <button type="button" onClick={() => setShowValidation(true)}>
        validate
      </button>
      <button type="button" onClick={() => touched(setValue)("typed")}>
        type
      </button>
      <span>{showValidation ? "shown" : "hidden"}</span>
    </section>
  )
}

describe("the shared order-window form plumbing", () => {
  it("accepts a decimal that is still being typed", () => {
    expect(parseOrderNumber("0.")).toBe(0)
    expect(parseOrderNumber("5%")).toBe(5)
    expect(parseOrderNumber("5.5 %")).toBe(5.5)
    expect(parseOrderNumber("")).toBeNull()
    expect(parseOrderNumber("5%%")).toBeNull()
    expect(parseOrderNumber("not a number")).toBeNull()
  })

  it("keeps two open windows independent and resets after a remount", async () => {
    await act(async () => {
      root.render(
        <>
          <Probe key="first" name="first" />
          <Probe key="second" name="second" />
        </>
      )
    })

    const first = host.querySelector<HTMLElement>('[data-probe="first"]')
    const second = host.querySelector<HTMLElement>('[data-probe="second"]')
    await act(async () => {
      first?.querySelectorAll("button")[0]?.click()
      first?.querySelectorAll("button")[1]?.click()
    })

    expect(first?.dataset.edited).toBe("true")
    expect(first?.querySelector("output")?.textContent).toBe("typed")
    expect(first?.querySelector("span")?.textContent).toBe("hidden")
    expect(second?.dataset.edited).toBe("false")

    await act(async () => root.render(<Probe key="reopened" name="first" />))
    expect(
      host.querySelector<HTMLElement>('[data-probe="first"]')?.dataset.edited
    ).toBe("false")
  })
})

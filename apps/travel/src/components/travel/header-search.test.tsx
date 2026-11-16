// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { HeaderSearch } from "@/components/travel/header-search"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Harness() {
  const [value, setValue] = React.useState("")
  return <HeaderSearch name="activity-search" label="Search activities" placeholder="Search activities…" value={value} onChange={setValue} />
}

const box = () => host.querySelector<HTMLInputElement>('input[name="activity-search"]')!
const glass = () => host.querySelector<HTMLButtonElement>('button[aria-label="Search activities"]')

function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  act(() => {
    setter.call(box(), text)
    box().dispatchEvent(new Event("input", { bubbles: true }))
  })
}

// Tyler, 16 Nov 2026: "move the mass select and search outside".
describe("the trip's search, in the header instead of the ⋮", () => {
  it("is a box that is always there, folded to a magnifying glass only in a narrow header", () => {
    act(() => root.render(<Harness />))
    expect(box()).not.toBeNull()
    expect(box().parentElement!.className).toContain("@max-2xl:hidden")
    expect(glass()!.className).toContain("@max-2xl:inline-flex")
    expect(glass()!.className).toMatch(/(^| )hidden( |$)/)
  })

  it("opens from the magnifying glass with the cursor in it, and Escape empties it", () => {
    act(() => root.render(<Harness />))
    act(() => glass()!.click())
    expect(document.activeElement).toBe(box())
    expect(box().parentElement!.className).not.toContain("@max-2xl:hidden")
    type("ramen")
    expect(box().value).toBe("ramen")
    expect(glass()).toBeNull()
    act(() => box().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    expect(box().value).toBe("")
  })

  it("leaves only the bin in the schedule's ⋮, with Search and Mass select in the header", () => {
    const source = readFileSync(join(process.cwd(), "src/components/travel/schedule-panel.tsx"), "utf8")
    const menu = source.slice(source.indexOf("function ScheduleMenu"))
    expect(menu).toContain("Bin{binCount")
    expect(menu).not.toContain("Search activities")
    expect(menu).not.toContain("Mass select")
    const header = source.slice(source.indexOf("<HeaderSearch"), source.indexOf("<ScheduleMenu"))
    expect(header).toContain('aria-label={selecting ? "Hide select" : "Mass select"}')
  })
})

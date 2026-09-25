// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

describe("tooltip focus", () => {
  it("does not open when code moves focus onto the control", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Account details</button>
            </TooltipTrigger>
            <TooltipContent>Settled balance</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    })

    const button = host.querySelector("button")!
    await act(async () => button.focus())

    expect(document.body.textContent).not.toContain("Settled balance")

    await act(async () => root.unmount())
    host.remove()
  })

  it("still opens when Tab moves focus onto the control", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Account details</button>
            </TooltipTrigger>
            <TooltipContent>Settled balance</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    })

    const button = host.querySelector("button")!
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      )
      button.focus()
    })

    expect(document.body.textContent).toContain("Settled balance")

    await act(async () => root.unmount())
    host.remove()
  })
})

// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { BlockInspector } from "@/components/broadcasts/block-inspector"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createBroadcastBlock, type BroadcastBlock } from "@/lib/broadcasts/blocks"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  // The options' scroller measures itself; jsdom has nothing to measure.
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

describe("a Button block's Appearance", () => {
  it("has a Background for the strip behind the button, apart from the button's own colour", async () => {
    const block = createBroadcastBlock("button") as Extract<BroadcastBlock, { kind: "button" }>
    const onContentChange = vi.fn()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BlockInspector
            inMenu
            block={block}
            fields={{ subject: "", preheader: "", fromName: "" }}
            onContentChange={onContentChange}
            onFieldChange={vi.fn()}
            onDelete={vi.fn()}
          />
        </TooltipProvider>
      )
    })

    const text = container.textContent ?? ""
    expect(text).toContain("Background")
    expect(text.indexOf("Background")).toBeLessThan(text.indexOf("Button colour"))

    // A swatch under Background writes the strip's colour, never the button's.
    const label = Array.from(container.querySelectorAll("*")).find(
      (element) => element.children.length === 0 && element.textContent === "Background"
    )
    const backgroundSwatch = label?.closest(".grid")?.querySelector<HTMLButtonElement>("button")
    await act(async () => backgroundSwatch!.click())
    expect(onContentChange).toHaveBeenCalledWith("blockBackgroundColor", expect.any(String))
    expect(onContentChange).not.toHaveBeenCalledWith("backgroundColor", expect.anything())

    act(() => root.unmount())
    container.remove()
  })
})

// @vitest-environment jsdom

import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/shell/shell-layout", () => {
  const runtime = { config: { styling: { dashboardTabs: "underline" } } }
  return { useShellRuntime: () => runtime, useOptionalShellRuntime: () => runtime }
})

const { ProjectTabs } = await import("./project-tabs")

const CHOICES = [
  { value: "content", label: "Content" },
  { value: "research", label: "Research" },
  { value: "promote", label: "Promote" },
]

/**
 * Content, Research and Promote's line, when the header holding it is drawn
 * again mid-slide (Tyler, 27 Nov 2026: "CLicking on promote tab has a bug
 * that flashes the tab").
 */
describe("the project tabs", () => {
  let container: HTMLDivElement
  let root: Root
  // Frames come only when `frame()` says, so a line stays where a row first draws it until then.
  let frames: FrameRequestCallback[] = []
  const frame = () =>
    act(() => {
      const due = frames
      frames = []
      for (const callback of due) callback(0)
    })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    frames = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback))
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const line = () => container.querySelector<HTMLElement>("[data-pill] > span[aria-hidden]")

  it("carries the line on from where it had got to, not from the tab left", async () => {
    await act(async () => {
      root.render(<ProjectTabs key="first" value="content" onValueChange={() => undefined} choices={CHOICES} />)
    })
    frame()
    const promote = [...container.querySelectorAll("button")].find((button) => button.textContent === "Promote")!
    await act(async () => {
      promote.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    })
    // Partway through its slide to Promote.
    line()!.style.left = "123px"

    // The list under it finishes reading and draws its header, and these tabs, again.
    await act(async () => {
      root.render(<ProjectTabs key="second" value="promote" onValueChange={() => undefined} choices={CHOICES} />)
    })

    expect(line()!.style.left).toBe("123px")
  })

  it("starts from the line of a row still on the page, as when Research's page arrives late", async () => {
    await act(async () => {
      root.render(<ProjectTabs key="first" value="promote" onValueChange={() => undefined} choices={CHOICES} />)
    })
    frame()
    const research = [...container.querySelectorAll("button")].find((button) => button.textContent === "Research")!
    await act(async () => {
      research.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    })
    // The pressed tab shows at once, and its line is partway there.
    expect(research.getAttribute("data-state")).toBe("active")
    line()!.style.left = "77px"

    // Research's page arrives with its own row before Promote's has gone.
    await act(async () => {
      root.render(
        <>
          <ProjectTabs key="first" value="promote" onValueChange={() => undefined} choices={CHOICES} />
          <ProjectTabs key="second" value="research" onValueChange={() => undefined} choices={CHOICES} />
        </>
      )
    })

    const lines = container.querySelectorAll<HTMLElement>("[data-pill] > span[aria-hidden]")
    expect(lines[1].style.left).toBe("77px")
  })

  it("hands the place on again when a row goes before its first frame, as React's development check does", async () => {
    await act(async () => {
      root.render(<ProjectTabs key="first" value="promote" onValueChange={() => undefined} choices={CHOICES} />)
    })
    frame()
    const research = [...container.querySelectorAll("button")].find((button) => button.textContent === "Research")!
    await act(async () => {
      research.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    })
    line()!.style.left = "77px"

    // Research's row arrives under React's development check, which sets it up, takes it down and sets it
    // up again straight away, before it has drawn the place it was handed.
    await act(async () => {
      root.render(
        <StrictMode>
          <ProjectTabs key="second" value="research" onValueChange={() => undefined} choices={CHOICES} />
        </StrictMode>
      )
    })

    expect(line()!.style.left).toBe("77px")
  })
})

// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadProgress: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode
    to: string
    params?: { tab?: string }
    className?: string
  }) => (
    <a href={to.replace("$tab", params?.tab ?? "")} className={className}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

vi.mock("@/lib/api/people/contact-segments", () => ({
  getSegmentLoadErrorMessage: (error: unknown) => String(error),
  loadSegmentChoices: vi.fn(async () => [{ id: "s1", name: "Pomoder list" }]),
}))

vi.mock("@/lib/api/automations/segment-drip", () => ({
  getSegmentDripProgressErrorMessage: () =>
    "We could not work out how far through the segment this flow is. Please try again.",
  loadSegmentDripProgress: api.loadProgress,
}))

import SegmentDripFields from "@/components/automations/nodes/segment-drip-panel"
import WaitFields from "@/components/automations/nodes/wait-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { AutomationNode } from "@/lib/automations/graph"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  api.loadProgress.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function draw(element: React.ReactElement) {
  await act(async () => {
    root.render(<TooltipProvider>{element}</TooltipProvider>)
  })
}

const waitNode: AutomationNode = {
  id: "wait",
  kind: "wait",
  x: 0,
  y: 0,
  settings: { amount: 2, unit: "days", stopOnClick: true },
}

const startNode: AutomationNode = {
  id: "start",
  kind: "segmentDrip",
  x: 0,
  y: 0,
  settings: { segmentId: "s1", segmentName: "Pomoder list" },
}

/** Types into a controlled React input the way a keypress would. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("the Wait panel", () => {
  it("shows the saved wait and changes it", async () => {
    const onChange = vi.fn()
    await draw(<WaitFields node={waitNode} onChange={onChange} />)

    const amount = container.querySelector<HTMLInputElement>("#wait-wait-amount")!
    expect(amount.value).toBe("2")
    expect(container.textContent).toContain("Days")
    const toggle = container.querySelector<HTMLButtonElement>(
      "#wait-wait-stop-on-click"
    )!
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    expect(
      container.querySelector('label[for="wait-wait-stop-on-click"]')?.textContent
    ).toContain("Stop for anyone who clicked a link")

    await act(async () => typeInto(amount, "3"))
    expect(onChange).toHaveBeenLastCalledWith({
      ...waitNode,
      settings: { ...waitNode.settings, amount: 3 },
    })

    await act(async () => toggle.click())
    expect(onChange).toHaveBeenLastCalledWith({
      ...waitNode,
      settings: { ...waitNode.settings, stopOnClick: false },
    })
  })

  it("marks an empty wait as needing a number", async () => {
    await draw(
      <WaitFields
        node={{ ...waitNode, settings: { ...waitNode.settings, amount: 0 } }}
        onChange={() => {}}
      />
    )
    const amount = container.querySelector<HTMLInputElement>("#wait-wait-amount")!
    expect(amount.value).toBe("")
    expect(amount.getAttribute("aria-invalid")).toBe("true")
  })
})

describe("the Segment, a few at a time panel", () => {
  it("shows how far through the segment the flow is and where its pace is set", async () => {
    const nextBatchAt = new Date(Date.now() + 20 * 60_000).toISOString()
    api.loadProgress.mockResolvedValue({
      letIn: 1240,
      waiting: 7760,
      nextBatchAt,
      pace: "400–500 people at a time, 30–60 minutes apart, any time of day.",
    })
    await draw(
      <SegmentDripFields
        node={startNode}
        automationId="flow-1"
        onChange={() => {}}
      />
    )

    expect(api.loadProgress).toHaveBeenCalledWith("flow-1")
    expect(container.textContent).toContain(
      "1,240 let in, 7,760 people still to go."
    )
    expect(container.textContent).toMatch(/Next batch at .+\./)
    expect(container.textContent).toContain(
      "400–500 people at a time, 30–60 minutes apart, any time of day."
    )
    const link = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.textContent?.includes("Settings > Email")
    )
    expect(link?.getAttribute("href")).toBe("/admin/settings/email")
  })

  it("offers a retry when the progress cannot be read", async () => {
    api.loadProgress.mockRejectedValueOnce(new Error("down"))
    await draw(
      <SegmentDripFields
        node={startNode}
        automationId="flow-1"
        onChange={() => {}}
      />
    )
    expect(container.textContent).toContain(
      "We could not work out how far through the segment this flow is."
    )

    api.loadProgress.mockResolvedValueOnce({
      letIn: 0,
      waiting: 1,
      nextBatchAt: null,
      pace: "Any pace.",
    })
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Try again")
    )!
    await act(async () => retry.click())
    expect(container.textContent).toContain("0 let in, 1 person still to go.")
  })

  it("shows no progress for a template, which has no saved flow", async () => {
    await draw(<SegmentDripFields node={startNode} onChange={() => {}} />)
    expect(api.loadProgress).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("let in,")
  })
})

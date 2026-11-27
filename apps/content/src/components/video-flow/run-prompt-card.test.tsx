// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { suggest } = vi.hoisted(() => ({ suggest: vi.fn() }))
vi.mock("@/lib/api/video/flow", () => ({
  suggestFlowPrompt: suggest,
  getFlowErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

import { TooltipProvider } from "@/components/ui/tooltip"
import { RunPromptCard } from "@/components/video-flow/run-prompt-card"
import { usePromptIdeas } from "@/components/video-flow/use-prompt-ideas"
import type { FlowRunDetail } from "@/lib/api/video/flow"
import type { FlowRunStep } from "@/lib/video/flow/flows"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function step(nodeId: string, patch: Partial<FlowRunStep> = {}): FlowRunStep {
  return {
    id: `step-${nodeId}`,
    nodeId,
    kind: "flow.ai-picture",
    title: nodeId,
    position: 0,
    status: "needs_input",
    prompt: "A wide picture.",
    waitForOk: false,
    feedsFrom: [],
    feeds: [],
    boxes: [],
    heading: "",
    line: "",
    explanation: "",
    tip: "",
    button: "Paint the scene",
    input: null,
    output: null,
    promptSent: null,
    estimateCents: null,
    costCents: null,
    error: null,
    note: null,
    planned: false,
    changedWith: null,
    videoPrompt: null,
    videoPromptFromAi: false,
    suggestPrompt: true,
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    ...patch,
  }
}

function runWith(steps: FlowRunStep[]) {
  return { id: "run-1", status: "waiting", ideaCents: 0.2, steps } as unknown as FlowRunDetail
}

/** The run page's part: the hook holds the run, each step gets its card. */
function Harness({ initial }: { initial: FlowRunDetail }) {
  const [run, setRun] = React.useState(initial)
  const ideas = usePromptIdeas(run, setRun)
  return (
    <TooltipProvider>
      {run.steps.map((one) => (
        <div key={one.id} data-step={one.nodeId}>
          <RunPromptCard step={one} ideas={ideas} ideaCents={run.ideaCents} locked={false} />
        </div>
      ))}
    </TooltipProvider>
  )
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  suggest.mockReset()
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
})

const box = (nodeId: string) => host.querySelector<HTMLTextAreaElement>(`[data-step="${nodeId}"] textarea`)
const button = (name: string, within: ParentNode = document) =>
  [...within.querySelectorAll("button")].find((one) => one.textContent?.trim() === name)

function type(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("the run's Prompt card", () => {
  it("asks once for the first step's idea, shows it as it is written, and leaves a step whose feeder isn't made", async () => {
    let answer: (run: FlowRunDetail) => void = () => undefined
    suggest.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const scene = step("scene")
    const study = step("study", { kind: "flow.ai-video", status: "waiting", feeds: ["scene"] })
    await act(async () => root.render(<Harness initial={runWith([scene, study])} />))

    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest).toHaveBeenCalledWith("step-scene", false)
    expect(host.querySelector('[data-step="scene"]')?.textContent).toContain("Writing an idea…")

    await act(async () => answer(runWith([{ ...scene, videoPrompt: "A snowy cabin at dawn.", videoPromptFromAi: true }, study])))
    expect(box("scene")?.value).toBe("A snowy cabin at dawn.")
    expect(host.textContent).toContain("The AI's idea. Change anything.")
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it("asks before New idea throws away words you wrote, then puts the new idea in", async () => {
    const scene = step("scene", { videoPrompt: "A snowy cabin at dawn.", videoPromptFromAi: true })
    await act(async () => root.render(<Harness initial={runWith([scene])} />))
    expect(suggest).not.toHaveBeenCalled()

    await act(async () => type(box("scene")!, "A lighthouse at night."))
    expect(host.textContent).not.toContain("The AI's idea")
    await act(async () => button("New idea", host)!.click())
    expect(document.body.textContent).toContain("Replace your words?")
    expect(suggest).not.toHaveBeenCalled()

    suggest.mockResolvedValue(runWith([{ ...scene, videoPrompt: "A greenhouse in the morning." }]))
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]')!
    await act(async () => button("New idea", dialog)!.click())
    expect(suggest).toHaveBeenCalledWith("step-scene", true)
    expect(box("scene")?.value).toBe("A greenhouse in the morning.")
  })

  it("shows why an idea failed and keeps the card and New idea working", async () => {
    suggest.mockRejectedValue(new Error("OpenAI has no credit left on this key"))
    await act(async () => root.render(<Harness initial={runWith([step("scene")])} />))
    expect(host.textContent).toContain("OpenAI has no credit left on this key")
    expect(box("scene")?.value).toBe("")
    expect(button("New idea", host)?.disabled).toBe(false)
    // A failed first idea waits for New idea instead of asking again by itself.
    expect(suggest).toHaveBeenCalledTimes(1)
  })
})

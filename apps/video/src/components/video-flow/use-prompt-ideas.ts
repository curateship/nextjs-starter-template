import * as React from "react"

import { getFlowErrorMessage, suggestFlowPrompt, type FlowRunDetail } from "@/lib/api/video/flow"
import type { FlowRunStep } from "@/lib/video/flow/flows"

export type PromptIdeas = {
  /** This video's prompt for the step as the card shows it: what is typed, else what is kept. */
  promptFor: (step: FlowRunStep) => string
  setPrompt: (step: FlowRunStep, text: string) => void
  writing: (step: FlowRunStep) => boolean
  error: (step: FlowRunStep) => string | null
  /** New idea: throw the words away and ask the AI for another. */
  newIdea: (step: FlowRunStep) => void
}

/** A step whose switch is on, that has opened, reads only made steps and has no prompt yet. */
function wantsFirstIdea(run: FlowRunDetail, step: FlowRunStep) {
  if (!step.suggestPrompt || step.videoPrompt !== null || run.status === "stopped") return false
  if (step.status !== "waiting" && step.status !== "needs_input") return false
  return step.feeds.every((nodeId) => run.steps.find((one) => one.nodeId === nodeId)?.status === "done")
}

/**
 * Each video's prompts on a run (tasks/flow/03-each-video-its-own-prompts.md):
 * what is typed in each step's Prompt card, and the AI's ideas. A step whose
 * node has the switch on asks for its first idea as soon as it opens, which
 * for a step reading another is once that one is made, whether or not the
 * step is the one showing. Each step asks once; a failed idea waits for New
 * idea rather than asking again by itself.
 */
export function usePromptIdeas(run: FlowRunDetail, setRun: (run: FlowRunDetail) => void): PromptIdeas {
  const [typed, setTyped] = React.useState<Record<string, string>>({})
  const [writingIds, setWritingIds] = React.useState<Record<string, true>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const asked = React.useRef(new Set<string>())

  const ask = React.useCallback(
    (stepId: string, replace: boolean) => {
      setWritingIds((current) => ({ ...current, [stepId]: true }))
      setErrors(({ [stepId]: _dropped, ...rest }) => rest)
      suggestFlowPrompt(stepId, replace)
        .then((next) => {
          // The idea replaces whatever was typed: New idea asked first.
          setTyped(({ [stepId]: _dropped, ...rest }) => rest)
          setRun(next)
        })
        .catch((error: unknown) => setErrors((current) => ({ ...current, [stepId]: getFlowErrorMessage(error) })))
        .finally(() => setWritingIds(({ [stepId]: _dropped, ...rest }) => rest))
    },
    [setRun]
  )

  // Words typed but not sent yet are never written over by a first idea.
  const due = run.steps.filter((step) => wantsFirstIdea(run, step) && !typed[step.id]?.trim()).map((step) => step.id)
  const dueKey = due.join(",")
  React.useEffect(() => {
    for (const step of run.steps) {
      // A step whose AI prompt was dropped (a step above it made again) may ask again.
      if (step.videoPrompt !== null) asked.current.delete(step.id)
    }
    for (const stepId of dueKey ? dueKey.split(",") : []) {
      if (asked.current.has(stepId)) continue
      asked.current.add(stepId)
      ask(stepId, false)
    }
  }, [dueKey, run.steps, ask])

  return {
    promptFor: (step) => typed[step.id] ?? step.videoPrompt ?? "",
    setPrompt: (step, text) => setTyped((current) => ({ ...current, [step.id]: text })),
    writing: (step) => Boolean(writingIds[step.id]),
    error: (step) => errors[step.id] ?? null,
    newIdea: (step) => ask(step.id, true),
  }
}

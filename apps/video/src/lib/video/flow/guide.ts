import type { FlowRunStep } from "./flows"

/**
 * The run's stepped guide (workspace/docs/flow.md, "The stepped guide"). A
 * step is a node; the boxes it asks you for are inside it (`FlowRunStep.boxes`),
 * and the guide ends with Save to a project.
 */

/** The steps one step waits for that are not done yet, such as the AI step before it. */
export function waitsOn(step: FlowRunStep, steps: readonly FlowRunStep[]) {
  return step.feeds
    .map((id) => steps.find((one) => one.nodeId === id))
    .filter((feed): feed is FlowRunStep => feed !== undefined && feed.status !== "done")
}

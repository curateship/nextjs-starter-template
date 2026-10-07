/**
 * Steps inside a task: a short checklist, not a second task system. The caps
 * are shared by the server, which enforces them, and the screen, which stops
 * offering an eleventh step.
 */
export const MAX_TASK_STEPS = 10
export const STEP_TITLE_MAX_LENGTH = 120

export type TaskStepItem = { id: string; title: string; done: boolean }

/** "3 of 5", the count a collapsed task shows. */
export function stepCountLabel(steps: readonly TaskStepItem[]) {
  return `${steps.filter((step) => step.done).length} of ${steps.length}`
}

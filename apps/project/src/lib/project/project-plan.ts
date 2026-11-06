import type { ProjectColor, TaskPriority } from "@/lib/project/rules"
import type { StepField } from "@/lib/project/step-fields"

/**
 * A project's plan without its people, dates or progress: what Copy project
 * carries over. Milestones are listed once, and each task points at one by
 * its place in that list.
 */
export type PlanTask = {
  /** The task it was read from, so a copied note's Task cards can point at its copy. */
  sourceId: string
  title: string
  notes: string
  milestone: number | null
  typeId: string | null
  priority: TaskPriority
  steps: { text: string; fields: StepField[] }[]
  labelIds: string[]
  fieldValues: { fieldId: string; value: unknown }[]
}

export type ProjectPlan = {
  color: ProjectColor
  hiddenTypeIds: string[]
  defaultTypeId: string | null
  milestones: string[]
  tasks: PlanTask[]
}

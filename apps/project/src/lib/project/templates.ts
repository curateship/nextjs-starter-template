import type { ProjectColor, TaskPriority } from "@/lib/project/rules"

/**
 * A project's plan without its people, dates or progress: what Copy project
 * carries over and what a saved template keeps. Sections and milestones are
 * listed once, and each task points at them by their place in those lists.
 */
export type TemplateTask = {
  title: string
  notes: string
  section: number | null
  milestone: number | null
  typeId: string | null
  priority: TaskPriority
  steps: string[]
  labelIds: string[]
  fieldValues: { fieldId: string; value: unknown }[]
}

export type TemplateContent = {
  color: ProjectColor
  description: string
  hiddenTypeIds: string[]
  defaultTypeId: string | null
  sections: string[]
  milestones: string[]
  tasks: TemplateTask[]
}

/** A template as Team settings and New project list it. */
export type TemplateRow = { id: string; name: string; taskCount: number; color: ProjectColor }

/** "12 tasks". */
export function taskCount(template: TemplateRow) {
  return `${template.taskCount} ${template.taskCount === 1 ? "task" : "tasks"}`
}

import { z } from "zod"

import { LIMITS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/project/rules"
import { hasTaskFilters, type TaskFilters } from "@/lib/project/task-filters"

/**
 * Saved views: a person's own named filters, on one project's Board and List
 * or on My tasks. Opening one sets the same filters, and so the same address,
 * as picking them by hand. Nobody else sees them.
 */

export type SavedViewFilters = TaskFilters

/** The person's and label's names when the view was saved, so a missing one can be named. */
export type SavedViewNames = { person?: string; label?: string; type?: string }

const id = z.string().regex(/^[\w-]{1,36}$/)

export const savedViewFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  person: id.optional(),
  label: id.optional(),
  type: id.optional(),
})

export const saveViewSchema = z.object({
  /** Null is My tasks. */
  projectId: id.nullable(),
  name: z
    .string()
    .trim()
    .min(1, "Give the view a name.")
    .max(LIMITS.viewName, `A view's name can be at most ${LIMITS.viewName} characters.`),
  filters: savedViewFiltersSchema,
})

/** The filters a view keeps: only the ones set, so an empty search isn't saved as one. */
export function viewFilters(filters: TaskFilters): SavedViewFilters {
  const kept: SavedViewFilters = {}
  if (filters.q?.trim()) kept.q = filters.q.trim()
  if (filters.status) kept.status = filters.status
  if (filters.priority) kept.priority = filters.priority
  if (filters.person) kept.person = filters.person
  if (filters.label) kept.label = filters.label
  if (filters.type) kept.type = filters.type
  return kept
}

export function viewHasFilters(filters: TaskFilters) {
  return hasTaskFilters(viewFilters(filters))
}

/**
 * Opening a view: the filters that still make sense here, and a sentence for
 * each one that doesn't, such as a label deleted since or a person no longer
 * on the project. `NOBODY_FILTER` is always there.
 */
export function openView(
  view: { filters: SavedViewFilters; names: SavedViewNames },
  here: {
    people?: readonly { id: string }[]
    labels: readonly { id: string }[]
    types: readonly { id: string }[]
  },
  nobody: string
): { filters: SavedViewFilters; missing: string[] } {
  const filters: SavedViewFilters = { ...view.filters }
  const missing: string[] = []
  if (filters.person && filters.person !== nobody) {
    if (!here.people?.some((person) => person.id === filters.person)) {
      missing.push(
        view.names.person
          ? `${view.names.person} isn't on this project any more`
          : "The person it shows isn't on this project any more"
      )
      delete filters.person
    }
  }
  if (filters.label && !here.labels.some((label) => label.id === filters.label)) {
    missing.push(
      view.names.label ? `The label "${view.names.label}" was deleted` : "Its label was deleted"
    )
    delete filters.label
  }
  if (filters.type && !here.types.some((type) => type.id === filters.type)) {
    missing.push(view.names.type ? `The type "${view.names.type}" is gone` : "Its task type is gone")
    delete filters.type
  }
  return { filters, missing }
}

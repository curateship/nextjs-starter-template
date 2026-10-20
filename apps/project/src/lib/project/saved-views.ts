import { z } from "zod"

import { LIMITS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/project/rules"
import { DUE_FILTERS, hasTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { TASK_GROUPINGS, type TaskGrouping } from "@/lib/project/task-groups"

/**
 * Saved views: a person's own named filters, on one project's Board and List
 * or on My tasks. Opening one sets the same filters, and so the same address,
 * as picking them by hand, and the Group row's choice when the view has one.
 * Nobody else sees them.
 */

export type SavedViewFilters = TaskFilters & {
  /**
   * What the List and Timeline group by. A view with only a group is a view
   * too (Tyler, 20 Oct 2026: "sorting is also a filter"). "None" isn't kept.
   */
  group?: TaskGrouping
}

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
  due: z.enum(DUE_FILTERS.map((option) => option.key) as [DueKey, ...DueKey[]]).optional(),
  // A view keeps its client (Tyler, 16 Oct 2026).
  client: z.string().trim().min(1).max(LIMITS.clientName).optional(),
  group: z.enum(TASK_GROUPINGS).optional(),
})

type DueKey = (typeof DUE_FILTERS)[number]["key"]

/** The filters a view keeps: only the ones set, so an empty search isn't saved as one. */
export function viewFilters(filters: SavedViewFilters): SavedViewFilters {
  const kept: SavedViewFilters = {}
  if (filters.q?.trim()) kept.q = filters.q.trim()
  if (filters.status) kept.status = filters.status
  if (filters.priority) kept.priority = filters.priority
  if (filters.person) kept.person = filters.person
  if (filters.label) kept.label = filters.label
  if (filters.type) kept.type = filters.type
  if (filters.due) kept.due = filters.due
  if (filters.client) kept.client = filters.client
  if (filters.group && filters.group !== "none") kept.group = filters.group
  return kept
}

export function viewHasFilters(filters: SavedViewFilters) {
  const kept = viewFilters(filters)
  return hasTaskFilters(kept) || Boolean(kept.group)
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
      view.names.label ? `The tag "${view.names.label}" was deleted` : "Its tag was deleted"
    )
    delete filters.label
  }
  if (filters.type && !here.types.some((type) => type.id === filters.type)) {
    missing.push(view.names.type ? `The type "${view.names.type}" is gone` : "Its task type is gone")
    delete filters.type
  }
  return { filters, missing }
}

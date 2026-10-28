import { FilterRow, TaskFilterFields } from "@/components/project/task-filter-popover"
import {
  SaveViewDialog as ShellSaveViewDialog,
  SavedViewsControls as ShellSavedViewsControls,
  type EditFields,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SavedView } from "@/lib/api/project/finding"
import type { Label as TaskLabel } from "@/lib/api/project/sorting"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/project/rules"
import {
  openView,
  savedViewFiltersSchema,
  viewFilters,
  type SavedViewFilters,
  type SavedViewNames,
} from "@/lib/project/saved-views"
import { NOBODY_FILTER, type TaskFilters } from "@/lib/project/task-filters"
import { TASK_GROUPING_LABEL, type TaskGrouping } from "@/lib/project/task-groups"
import type { TaskType } from "@/lib/project/task-types"
import { SAVED_VIEW_ERRORS, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"

type Here = {
  /** The shell's key for these views: `project:<id>`, or `my-tasks:<team id>`. */
  screen: string
  /** The project's members, for the Person filter. My tasks has none. */
  people?: { id: string; name: string }[]
  labels: TaskLabel[]
  types: TaskType[]
  /** The clients of the tasks shown, for Edit view's Client row. Only My tasks has one. */
  clients?: readonly string[]
  /** The Group row's choices, for Edit view. My tasks has none. */
  groups?: readonly TaskGrouping[]
}

/**
 * Save view and the Views menu at the end of a task filter bar, on the shell's
 * saved views (`components/shared/saved-views.tsx`). A view is a person's own
 * named filters on one project or on My tasks; opening it sets the same
 * filters, and so the same address, as picking them by hand. A view with a
 * group sets the Group row too; one without leaves it as it is, the way Clear
 * does. A view naming someone no longer on the project, or a deleted label,
 * says so and opens with the rest. Each row's cog opens Edit view, to rename
 * it or change what it shows (Tyler, 20 Oct 2026).
 */
export function SavedViewsControls({
  views,
  filters,
  onChange,
  onGroup,
  here,
  saveButton = true,
  buttonVariant = "outline",
}: {
  views: SavedView[]
  filters: SavedViewFilters
  onChange: (patch: Partial<TaskFilters>) => void
  /** Sets the Group row from a view that has one. Left out where there is no Group row. */
  onGroup?: (group: TaskGrouping) => void
  here: Here
  /** Off where Save as view sits elsewhere, as in the project page's Filter popover. */
  saveButton?: boolean
  /** Ghost in the project page's header, where every control is. */
  buttonVariant?: "outline" | "ghost"
}) {
  function open(view: { name: string; filters: SavedViewValues; names: Record<string, string> }) {
    const {
      filters: { group, ...next },
      missing,
    } = openView(asTaskView(view), here, NOBODY_FILTER)
    onChange({
      q: undefined,
      status: undefined,
      priority: undefined,
      person: undefined,
      label: undefined,
      type: undefined,
      due: undefined,
      client: undefined,
      ...next,
    })
    if (group) onGroup?.(group)
    if (missing.length) {
      showErrorToast(`${missing.join(". ")}, so "${view.name}" opened without that filter.`)
    }
  }

  return (
    <ShellSavedViewsControls
      here={screenOf(here)}
      views={views}
      filters={filters as SavedViewValues}
      onOpen={open}
      editFields={editFields(here)}
      saveButton={saveButton}
      buttonVariant={buttonVariant}
    />
  )
}

/** The Save view window, for a screen that puts its own Save as view button somewhere else. */
export function SaveViewDialog({
  open,
  filters,
  here,
  onClose,
}: {
  open: boolean
  filters: SavedViewFilters
  here: Here
  onClose: () => void
}) {
  return (
    <ShellSaveViewDialog open={open} here={screenOf(here)} filters={filters as SavedViewValues} onClose={onClose} />
  )
}

/** A saved row read back as task filters; the server only ever keeps those. */
function asTaskView(view: { filters: SavedViewValues; names: Record<string, string> }) {
  const parsed = savedViewFiltersSchema.safeParse(view.filters)
  return { filters: parsed.success ? viewFilters(parsed.data) : {}, names: view.names as SavedViewNames }
}

function screenOf(here: Here): SavedViewsScreen {
  return {
    screen: here.screen,
    describe: (filters, names) => describeView(asTaskView({ filters, names }), here),
    kept: (filters) => asTaskView({ filters, names: {} }).filters as SavedViewValues,
    describeError: describeViewError,
  }
}

/** The shell's own refusals as they are, and Project's through its own lookup. */
function describeViewError(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return (Object.values(SAVED_VIEW_ERRORS) as string[]).includes(message) ? message : getProjectErrorMessage(error)
}

/** "Stuck · Leo · Bug", so a view says what it shows before it is opened. */
function describeView(view: { filters: SavedViewFilters; names: SavedViewNames }, here: Here) {
  const { filters, names } = view
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.status) parts.push(TASK_STATUS_LABEL[filters.status])
  if (filters.priority) parts.push(`${TASK_PRIORITY_LABEL[filters.priority]} priority`)
  if (filters.person) {
    parts.push(
      filters.person === NOBODY_FILTER
        ? "Nobody assigned"
        : (here.people?.find((person) => person.id === filters.person)?.name ?? names.person ?? "Someone who left")
    )
  }
  if (filters.label) {
    parts.push(here.labels.find((label) => label.id === filters.label)?.name ?? names.label ?? "A deleted label")
  }
  if (filters.type) {
    parts.push(here.types.find((type) => type.id === filters.type)?.name ?? names.type ?? "A deleted template")
  }
  if (filters.group) parts.push(`Group: ${TASK_GROUPING_LABEL[filters.group]}`)
  return parts.join(" · ")
}

/**
 * Edit view's rows: the search, the same filter and Group rows as the Filter
 * popover, and who the tasks are for, which the header holds.
 */
function editFields(here: Here): EditFields {
  return function TaskViewFields({ filters: values, change, names }) {
    const filters = values as SavedViewFilters
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor="edit-view-search">Search</Label>
          <Input
            id="edit-view-search"
            value={filters.q ?? ""}
            maxLength={200}
            placeholder="Words in the title or notes"
            onChange={(event) => change({ q: event.target.value || undefined })}
          />
        </div>
        <TaskFilterFields
          idPrefix="edit-view"
          filters={filters}
          onChange={(patch) => change(patch as Record<string, string | undefined>)}
          labels={here.labels}
          types={here.types}
          clients={here.clients}
        >
          {here.people ? (
            <FilterRow id="edit-view-person" label="Assigned to">
              <Select
                value={filters.person ?? ANYONE}
                onValueChange={(value) => change({ person: value === ANYONE ? undefined : value })}
              >
                <SelectTrigger id="edit-view-person" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANYONE}>Anyone</SelectItem>
                  <SelectItem value={NOBODY_FILTER}>Nobody assigned</SelectItem>
                  {peopleWith(here.people, filters.person, names.person).map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          ) : null}
          {here.groups ? (
            <FilterRow id="edit-view-group" label="Group">
              <Select value={filters.group ?? "none"} onValueChange={(value) => change({ group: value })}>
                <SelectTrigger id="edit-view-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {here.groups.map((option) => (
                    <SelectItem key={option} value={option}>
                      {TASK_GROUPING_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          ) : null}
        </TaskFilterFields>
      </>
    )
  }
}

const ANYONE = "anyone"

/** The project's people, plus the view's own person if they have left, so the choice never reads blank. */
function peopleWith(people: { id: string; name: string }[], person: string | undefined, savedName: string | undefined) {
  if (!person || person === NOBODY_FILTER || people.some((p) => p.id === person)) return people
  return [...people, { id: person, name: savedName ? `${savedName} (left)` : "Someone who left" }]
}

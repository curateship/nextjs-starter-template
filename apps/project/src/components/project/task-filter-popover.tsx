import type * as React from "react"
import { BookmarkIcon, ListFilterIcon } from "lucide-react"

import { ClientFilterSelect } from "@/components/project/client-filter-select"
import { ProjectDot } from "@/components/project/task-bits"
import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type { Label as TaskLabel } from "@/lib/api/project/sorting"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { DUE_FILTERS, type DueFilter, type TaskFilters } from "@/lib/project/task-filters"
import { TASK_GROUPING_LABEL, type TaskGrouping } from "@/lib/project/task-groups"
import type { TaskType } from "@/lib/project/task-types"

const ALL = "all"

/** Every filter the popover sets, emptied: what Clear sends. */
const NO_TASK_FILTERS: Partial<TaskFilters> = {
  q: undefined,
  status: undefined,
  priority: undefined,
  due: undefined,
  label: undefined,
  type: undefined,
  client: undefined,
}

/**
 * The project page's filters behind one Filter button, as Tyler drew them on
 * 13 Oct 2026: a row each for Status, Priority, Due, Tags and Type, then
 * Group (Tyler, 19 Oct 2026: "add a new row called 'Group' like notion"),
 * which took the Board's "Group by person" switch in, then Clear and Save as
 * view. Clear leaves Group alone, since it arranges the tasks rather than
 * hiding any. The button
 * counts the filters set. Where the panel is too narrow for the header's
 * search box, the search is the popover's first row instead. Due was a
 * dropdown of its own in the header until Tyler moved it in here on 19 Oct
 * 2026. Who the task is for is still a dropdown of its own in the project
 * page's header (Tyler, 14 Oct 2026), so Clear leaves it alone. My dashboard adds
 * a Client row (Features 16 Oct, part 9), since its tasks come from many
 * projects.
 */
export function TaskFilterPopover({
  filters,
  onChange,
  labels,
  types,
  search,
  group,
  extra,
  onSaveView,
  clients,
  buttonVariant = "outline",
}: {
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  labels: TaskLabel[]
  /** The team's task types; archived ones still find the tasks that have them. */
  types: TaskType[]
  /** Draw the search box inside, where the header has no room for its own. */
  search?: boolean
  /** What the tab groups by and its choices; left out where a tab has no groups. */
  group?: {
    value: TaskGrouping
    options: readonly TaskGrouping[]
    onChange: (next: TaskGrouping) => void
  }
  /** More controls under the switch, such as the List's Columns menu. */
  extra?: React.ReactNode
  onSaveView: () => void
  /** The clients of the projects shown, for a Client row. Left out, there is no row. */
  clients?: string[]
  /** Ghost in the project page's header, where every control is. */
  buttonVariant?: "outline" | "ghost"
}) {
  const count = [filters.status, filters.priority, filters.due, filters.label, filters.type, clients && filters.client].filter(
    Boolean
  ).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant={buttonVariant} aria-label={count ? `Filter, ${count} set` : "Filter"}>
          <ListFilterIcon className="size-4" />
          {/* The tasks panel's header is the container: on a phone the icon stays and the word goes. */}
          <span className="@max-4xl:sr-only">Filter</span>
          {count ? <span className="text-muted-foreground">{count}</span> : null}
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3 p-3">
        {search ? (
          <DashboardToolbarSearch
            className="sm:flex-1"
            inputClassName="sm:w-full lg:w-full"
            name="task-search-in-filters"
            aria-label="Search tasks by title and notes"
            placeholder="Search tasks"
            value={filters.q ?? ""}
            onChange={(event) => onChange({ q: event.target.value || undefined })}
          />
        ) : null}
        <TaskFilterFields
          idPrefix="filter"
          filters={filters}
          onChange={onChange}
          labels={labels}
          types={types}
          clients={clients}
        />
        {group || extra ? (
          <>
            <Separator className="-mx-3 w-auto" />
            {group ? (
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3">
                <FilterRow id="filter-group" label="Group">
                  <Select value={group.value} onValueChange={(value) => group.onChange(value as TaskGrouping)}>
                    <SelectTrigger id="filter-group" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {group.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {TASK_GROUPING_LABEL[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterRow>
              </div>
            ) : null}
            {extra}
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => onChange(NO_TASK_FILTERS)}>
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={onSaveView}>
            <BookmarkIcon className="size-4" />
            Save as view
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The filter rows, label beside choice: Status, Priority, Due, Tags and Type,
 * and Client where `clients` is given. The Filter popover and the Edit view
 * window both draw these, so a view is edited with the same choices it was
 * made with.
 */
export function TaskFilterFields({
  idPrefix,
  filters,
  onChange,
  labels,
  types,
  clients,
  children,
}: {
  /** Starts each row's id, so two sets on one page never share one. */
  idPrefix: string
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  labels: TaskLabel[]
  types: TaskType[]
  clients?: readonly string[]
  /** More rows after Type and Client, such as the Edit view window's Assigned to. */
  children?: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
      <FilterRow id={`${idPrefix}-status`} label="Status">
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) => onChange({ status: value === ALL ? undefined : (value as TaskStatus) })}
        >
          <SelectTrigger id={`${idPrefix}-status`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {TASK_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-priority`} label="Priority">
        <Select
          value={filters.priority ?? ALL}
          onValueChange={(value) =>
            onChange({ priority: value === ALL ? undefined : (value as TaskPriority) })
          }
        >
          <SelectTrigger id={`${idPrefix}-priority`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any priority</SelectItem>
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {TASK_PRIORITY_LABEL[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-due`} label="Due">
        <Select
          value={filters.due ?? ALL}
          onValueChange={(value) => onChange({ due: value === ALL ? undefined : (value as DueFilter) })}
        >
          <SelectTrigger id={`${idPrefix}-due`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any time</SelectItem>
            {DUE_FILTERS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-label`} label="Tags">
        <Select
          value={filters.label ?? ALL}
          onValueChange={(value) => onChange({ label: value === ALL ? undefined : value })}
        >
          <SelectTrigger id={`${idPrefix}-label`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any tag</SelectItem>
            {labels.map((label) => (
              <SelectItem key={label.id} value={label.id}>
                <ProjectDot color={label.color} />
                {label.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-type`} label="Template">
        <Select
          value={filters.type ?? ALL}
          onValueChange={(value) => onChange({ type: value === ALL ? undefined : value })}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any template</SelectItem>
            {types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                <TypeIconGlyph icon={type.icon} color={type.color} />
                {type.name}
                {type.archived ? <span className="text-muted-foreground"> (archived)</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      {clients ? (
        <FilterRow id={`${idPrefix}-client`} label="Client">
          <ClientFilterSelect
            id={`${idPrefix}-client`}
            value={filters.client}
            clients={clients}
            onChange={(client) => onChange({ client })}
          />
        </FilterRow>
      ) : null}
      {children}
    </div>
  )
}

export function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </>
  )
}

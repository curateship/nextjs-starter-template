import type * as React from "react"
import { BookmarkIcon, ListFilterIcon } from "lucide-react"

import { ProjectDot } from "@/components/project/task-bits"
import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { Label as TaskLabel } from "@/lib/api/project/sorting"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import type { TaskFilters } from "@/lib/project/task-filters"
import type { TaskType } from "@/lib/project/task-types"

const ALL = "all"

/** Every filter the popover sets, emptied: what Clear sends. */
const NO_TASK_FILTERS: Partial<TaskFilters> = {
  q: undefined,
  status: undefined,
  priority: undefined,
  label: undefined,
  type: undefined,
}

/**
 * The project page's filters behind one Filter button, as Tyler drew them on
 * 13 Oct 2026: a row each for Status, Priority, Label and Type, the
 * Board's "Group by person" switch, then Clear and Save as view. The button
 * counts the filters set. Where the panel is too narrow for the header's
 * search box, the search is the popover's first row instead. Who the task
 * is for and when it is due are dropdowns of their own in the project page's
 * header (Tyler, 14 Oct 2026), so Clear leaves them alone.
 */
export function TaskFilterPopover({
  filters,
  onChange,
  labels,
  types,
  search,
  groupByPerson,
  extra,
  onSaveView,
  buttonVariant = "outline",
}: {
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  labels: TaskLabel[]
  /** The team's task types; archived ones still find the tasks that have them. */
  types: TaskType[]
  /** Draw the search box inside, where the header has no room for its own. */
  search?: boolean
  /** The Board's switch. Left out on the other tabs. */
  groupByPerson?: { on: boolean; onChange: (on: boolean) => void }
  /** More controls under the switch, such as the List's Columns menu. */
  extra?: React.ReactNode
  onSaveView: () => void
  /** Ghost in the project page's header, where every control is. */
  buttonVariant?: "outline" | "ghost"
}) {
  const count = [filters.status, filters.priority, filters.label, filters.type].filter(Boolean).length

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
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <FilterRow id="filter-status" label="Status">
            <Select
              value={filters.status ?? ALL}
              onValueChange={(value) => onChange({ status: value === ALL ? undefined : (value as TaskStatus) })}
            >
              <SelectTrigger id="filter-status" className="w-full">
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
          <FilterRow id="filter-priority" label="Priority">
            <Select
              value={filters.priority ?? ALL}
              onValueChange={(value) =>
                onChange({ priority: value === ALL ? undefined : (value as TaskPriority) })
              }
            >
              <SelectTrigger id="filter-priority" className="w-full">
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
          <FilterRow id="filter-label" label="Label">
            <Select
              value={filters.label ?? ALL}
              onValueChange={(value) => onChange({ label: value === ALL ? undefined : value })}
            >
              <SelectTrigger id="filter-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any label</SelectItem>
                {labels.map((label) => (
                  <SelectItem key={label.id} value={label.id}>
                    <ProjectDot color={label.color} />
                    {label.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterRow>
          <FilterRow id="filter-type" label="Type">
            <Select
              value={filters.type ?? ALL}
              onValueChange={(value) => onChange({ type: value === ALL ? undefined : value })}
            >
              <SelectTrigger id="filter-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any type</SelectItem>
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
        </div>
        {groupByPerson || extra ? (
          <>
            <Separator className="-mx-3 w-auto" />
            {groupByPerson ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="board-group-by-person" className="font-normal">
                  Group by person
                </Label>
                <Switch
                  id="board-group-by-person"
                  checked={groupByPerson.on}
                  onCheckedChange={groupByPerson.onChange}
                />
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

function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </>
  )
}

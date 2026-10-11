import { XIcon } from "lucide-react"

import { ProjectDot } from "@/components/project/task-bits"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import type { Label } from "@/lib/api/project/sorting"
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from "@/lib/project/rules"
import { hasTaskFilters, NOBODY_FILTER, type TaskFilters } from "@/lib/project/task-filters"

const ALL = "all"

/**
 * Search and filters over a list of tasks, drawn under the tabs of a task
 * panel. The screen keeps the values in its address and passes them in.
 * `people` is left out where every task is already one person's.
 */
export function TaskFiltersBar({
  filters,
  onChange,
  people,
  labels,
}: {
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  people?: { id: string; name: string }[]
  labels: Label[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <DashboardToolbarSearch
        // Its own row on a phone, so it isn't squeezed to nothing by the filters.
        className="basis-full sm:basis-auto"
        name="task-search"
        aria-label="Search tasks by title and notes"
        placeholder="Search tasks…"
        value={filters.q ?? ""}
        onChange={(event) => onChange({ q: event.target.value || undefined })}
      />
      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) =>
          onChange({ status: value === ALL ? undefined : (value as TaskStatus) })
        }
      >
        <DashboardToolbarSelectTrigger aria-label="Filter by status">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          {TASK_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {TASK_STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {people ? (
        <Select
          value={filters.person ?? ALL}
          onValueChange={(value) => onChange({ person: value === ALL ? undefined : value })}
        >
          <DashboardToolbarSelectTrigger aria-label="Filter by person">
            <SelectValue />
          </DashboardToolbarSelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            <SelectItem value={NOBODY_FILTER}>Nobody assigned</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {labels.length ? (
        <Select
          value={filters.label ?? ALL}
          onValueChange={(value) => onChange({ label: value === ALL ? undefined : value })}
        >
          <DashboardToolbarSelectTrigger aria-label="Filter by label">
            <SelectValue />
          </DashboardToolbarSelectTrigger>
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
      ) : null}
      {hasTaskFilters(filters) ? (
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          onClick={() =>
            onChange({ q: undefined, status: undefined, person: undefined, label: undefined })
          }
        >
          <XIcon className="size-4" />
          Clear filters
        </DashboardToolbarButton>
      ) : null}
    </div>
  )
}

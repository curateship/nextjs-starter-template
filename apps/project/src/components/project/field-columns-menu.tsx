import { Columns3Icon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LIMITS } from "@/lib/project/rules"
import type { TaskTypeField } from "@/lib/project/task-types"

/**
 * Adds up to 3 of a task type's fields to the List as columns, while the List
 * is filtered to that type. The Board shows the same fields as lines on its
 * cards, so the menu there is named for that. On the List it also holds Time,
 * each task's time on the clock, off until picked.
 */
export function FieldColumnsMenu({
  fields,
  chosen,
  onChange,
  time,
  label = "Columns",
}: {
  fields: TaskTypeField[]
  chosen: string[]
  onChange: (ids: string[]) => void
  /** The List's Time column; left out, there is none to pick. */
  time?: { on: boolean; onChange: (on: boolean) => void }
  label?: string
}) {
  const full = chosen.length >= LIMITS.fieldColumns
  const count = chosen.length + (time?.on ? 1 : 0)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DashboardToolbarButton type="button" variant="outline">
          <Columns3Icon className="size-4" />
          {label}
          {count ? ` (${count})` : ""}
        </DashboardToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {time ? (
          <DropdownMenuCheckboxItem
            checked={time.on}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => time.onChange(checked === true)}
          >
            Time
          </DropdownMenuCheckboxItem>
        ) : null}
        {fields.length ? (
          <DropdownMenuLabel>
            {full ? `Up to ${LIMITS.fieldColumns} fields` : `Show up to ${LIMITS.fieldColumns} fields`}
          </DropdownMenuLabel>
        ) : null}
        {fields.map((field) => {
          const on = chosen.includes(field.id)
          return (
            <DropdownMenuCheckboxItem
              key={field.id}
              checked={on}
              disabled={!on && full}
              // The menu stays open, so several columns can be picked in a row.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange(checked ? [...chosen, field.id] : chosen.filter((id) => id !== field.id))
              }
            >
              {field.name}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

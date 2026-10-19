import * as React from "react"
import { ArrowDownUpIcon, FilterIcon, KanbanIcon, Loader2Icon, SettingsIcon, XIcon } from "lucide-react"

import { FieldInput } from "@/components/note-notes/field-input"
import { DashboardToolbarButton, DashboardToolbarSelectTrigger } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { parseFieldValue, type NoteField, type NoteFieldValue } from "@/lib/note/notes/fields"
import {
  FILTER_OP_LABELS,
  FILTER_OPS_FOR,
  MAX_FILTERS,
  type FilterOp,
  type NoteFilter,
  type NoteSort,
} from "@/lib/note/notes/views"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The view's own controls in the middle panel's toolbar: Filter, Sort, the
 * board's Group by, and Set a field for ticked notes. Each changes the view
 * on screen at once; the view tabs then offer Save.
 */

/** One filter row per field, each with the words its type offers (Tyler's task, part 22). */
export function FilterButton({
  fields,
  filters,
  onChange,
}: {
  fields: NoteField[]
  filters: NoteFilter[]
  onChange: (filters: NoteFilter[]) => void
}) {
  const usable = fields.filter((field) => FILTER_OPS_FOR[field.type].length)
  function update(at: number, filter: NoteFilter) {
    onChange(filters.map((each, index) => (index === at ? filter : each)))
  }
  function add() {
    const field = usable[0]
    if (!field) {
      showErrorToast("This folder has no fields to filter by yet")
      return
    }
    if (filters.length >= MAX_FILTERS) {
      showErrorToast(`Up to ${MAX_FILTERS} filters at a time`)
      return
    }
    onChange([...filters, blankFilter(field)])
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant={filters.length ? "secondary" : "outline"}>
          <FilterIcon className="size-4" />
          Filter{filters.length ? ` (${filters.length})` : ""}
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-[min(28rem,calc(100vw-2rem))] gap-3 p-3">
        {filters.length ? (
          filters.map((filter, at) => {
            const field = fields.find((each) => each.key === filter.fieldKey)
            if (!field) return null
            return (
              <div key={at} className="grid gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Select value={field.key} onValueChange={(key) => update(at, blankFilter(fields.find((each) => each.key === key) ?? field))}>
                    <SelectTrigger aria-label="Field" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {usable.map((each) => (
                        <SelectItem key={each.key} value={each.key}>
                          {each.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {FILTER_OPS_FOR[field.type].length > 1 ? (
                    <Select value={filter.op} onValueChange={(op) => update(at, { ...filter, op: op as FilterOp })}>
                      <SelectTrigger aria-label="Rule" className="w-fit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPS_FOR[field.type].map((op) => (
                          <SelectItem key={op} value={op}>
                            {FILTER_OP_LABELS[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="shrink-0 text-sm text-muted-foreground">{FILTER_OP_LABELS[filter.op]}</span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove the ${field.name} filter`}
                        onClick={() => onChange(filters.filter((_, index) => index !== at))}
                      >
                        <XIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove filter</TooltipContent>
                  </Tooltip>
                </div>
                <FilterValue field={field} filter={filter} onChange={(next) => update(at, next)} />
              </div>
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">No filters. Every note in the folder shows.</p>
        )}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={add}>
            Add filter
          </Button>
          {filters.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear all
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function blankFilter(field: NoteField): NoteFilter {
  const op = FILTER_OPS_FOR[field.type][0]
  if (op === "on" || op === "off") return { fieldKey: field.key, op }
  if (op === "is" || op === "has") return { fieldKey: field.key, op, value: field.options[0]?.id ?? "" }
  if (op === "above" || op === "below") return { fieldKey: field.key, op, value: 0 }
  if (op === "before" || op === "after") {
    return { fieldKey: field.key, op, value: new Date().toISOString().slice(0, 10) }
  }
  return { fieldKey: field.key, op, value: "" }
}

function FilterValue({ field, filter, onChange }: { field: NoteField; filter: NoteFilter; onChange: (filter: NoteFilter) => void }) {
  if (filter.op === "on" || filter.op === "off") {
    return (
      <Select value={filter.op} onValueChange={(op) => onChange({ fieldKey: field.key, op: op as FilterOp })}>
        <SelectTrigger aria-label="Ticked or not" className="w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="on">Ticked</SelectItem>
          <SelectItem value="off">Not ticked</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  if (filter.op === "is" || filter.op === "has") {
    return (
      <Select value={String(filter.value ?? "")} onValueChange={(value) => onChange({ ...filter, value })}>
        <SelectTrigger aria-label="Option" className="w-full">
          <SelectValue placeholder="Pick an option" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (filter.op === "before" || filter.op === "after") {
    const [y, m, d] = String(filter.value ?? "").split("-").map(Number)
    return (
      <DatePicker
        value={y ? new Date(y, m - 1, d) : undefined}
        onChange={(date) => {
          if (!date) return
          const pad = (n: number) => String(n).padStart(2, "0")
          onChange({ ...filter, value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` })
        }}
      />
    )
  }
  if (filter.op === "above" || filter.op === "below") {
    return <NumberFilter value={typeof filter.value === "number" ? filter.value : 0} onChange={(value) => onChange({ ...filter, value })} />
  }
  return (
    <Input
      aria-label="Words"
      placeholder="Words to look for"
      value={String(filter.value ?? "")}
      onChange={(event) => onChange({ ...filter, value: event.target.value })}
    />
  )
}

/**
 * The number box keeps what is typed, so "1." on its way to "1.5", a lone
 * "-" or an empty box are never turned into 0 under the cursor. The filter
 * takes the number once the text reads as one.
 */
function NumberFilter({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = React.useState(String(value))
  return (
    <Input
      aria-label="Number"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        const number = Number(event.target.value.replace(/,/g, ""))
        if (event.target.value.trim() && Number.isFinite(number)) onChange(number)
      }}
    />
  )
}

const SORT_NONE = "__none__"

/** Sort by the title, the edit time or any field, either way. */
export function SortButton({
  fields,
  sort,
  onChange,
}: {
  fields: NoteField[]
  sort: NoteSort | null
  onChange: (sort: NoteSort | null) => void
}) {
  const sortable = fields.filter((field) => field.type !== "checkbox")
  return (
    <Popover>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant={sort ? "secondary" : "outline"}>
          <ArrowDownUpIcon className="size-4" />
          Sort
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3 p-3">
        <div className="grid gap-2">
          <Label htmlFor="note-sort-by">Sort by</Label>
          <Select
            value={sort?.key ?? SORT_NONE}
            onValueChange={(key) => onChange(key === SORT_NONE ? null : { key, dir: sort?.dir ?? "asc" })}
          >
            <SelectTrigger id="note-sort-by" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SORT_NONE}>Newest edited</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="edited">Edited</SelectItem>
              {sortable.map((field) => (
                <SelectItem key={field.key} value={field.key}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {sort ? (
          <div className="grid gap-2">
            <Label htmlFor="note-sort-dir">Order</Label>
            <Select value={sort.dir} onValueChange={(dir) => onChange({ ...sort, dir: dir as NoteSort["dir"] })}>
              <SelectTrigger id="note-sort-dir" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">A to Z, low to high, oldest first</SelectItem>
                <SelectItem value="desc">Z to A, high to low, newest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Pinned notes stay at the top.</p>
      </PopoverContent>
    </Popover>
  )
}

/** The board's columns come from one choice field. */
export function GroupByButton({
  fields,
  groupBy,
  onChange,
}: {
  fields: NoteField[]
  groupBy: string | null
  onChange: (key: string) => void
}) {
  const choices = fields.filter((field) => field.type === "select")
  if (!choices.length) return null
  const current = choices.find((field) => field.key === groupBy) ?? choices[0]
  return (
    <Select value={current.key} onValueChange={onChange}>
      <DashboardToolbarSelectTrigger aria-label="Group the board by" className="gap-2">
        <KanbanIcon className="size-4" />
        <SelectValue />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        {choices.map((field) => (
          <SelectItem key={field.key} value={field.key}>
            By {field.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Set one field to one value on every ticked note in the folder. */
export function SetFieldButton({
  fields,
  busy,
  onApply,
}: {
  fields: NoteField[]
  busy: boolean
  onApply: (field: NoteField, value: NoteFieldValue | null) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [key, setKey] = React.useState(fields[0]?.key ?? "")
  const [value, setValue] = React.useState<NoteFieldValue | null>(null)
  const field = fields.find((each) => each.key === key) ?? fields[0]
  if (!field) return null
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setValue(null)
      }}
    >
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant="outline">
          <SettingsIcon className="size-4" />
          Set a field
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3 p-3">
        <div className="grid gap-2">
          <Label htmlFor="note-bulk-field">Field</Label>
          <Select
            value={field.key}
            onValueChange={(next) => {
              setKey(next)
              setValue(null)
            }}
          >
            <SelectTrigger id="note-bulk-field" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fields.map((each) => (
                <SelectItem key={each.key} value={each.key}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note-bulk-value">Value</Label>
          <FieldInput
            key={field.key}
            id="note-bulk-value"
            field={field}
            value={value ?? undefined}
            onSave={async (next) => {
              const parsed = parseFieldValue(field, next)
              if (!parsed.ok) {
                showErrorToast(parsed.reason)
                return false
              }
              setValue(parsed.value)
              return true
            }}
          />
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void onApply(field, value).then((ok) => {
              if (ok) setOpen(false)
            })
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          {value === null ? `Clear ${field.name}` : `Set ${field.name}`}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

import * as React from "react"
import {
  CalendarIcon,
  ExternalLinkIcon,
  HashIcon,
  LinkIcon,
  PlusIcon,
  SquareCheckIcon,
  TypeIcon,
  XIcon,
} from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { updateTaskStep } from "@/lib/api/project/tasks"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { shortDayLabel } from "@/lib/project/days"
import { LIMITS } from "@/lib/project/rules"
import {
  linkHref,
  STEP_FIELD_KIND_LABEL,
  STEP_FIELD_KINDS,
  type StepField,
  type StepFieldKind,
} from "@/lib/project/step-fields"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A field's boxes read as plain words on the step's card until pointed at or typed in. */
const QUIET_INPUT =
  "h-7 border-transparent !bg-transparent px-1.5 text-xs shadow-none hover:border-input focus-visible:border-input"

/** Takes no room until the row is pointed at, so the value keeps it. */
const ROW_ACTION =
  "hidden group-focus-within/field:inline-flex group-hover/field:inline-flex [@media(hover:none)]:inline-flex"

const KIND_ICON: Record<StepFieldKind, React.ReactNode> = {
  text: <TypeIcon />,
  link: <LinkIcon />,
  number: <HashIcon />,
  date: <CalendarIcon />,
  tick: <SquareCheckIcon />,
}

/**
 * A step's own fields under its words, a name and a value each (Tyler, 28 Oct
 * 2026, Misc 4: "name and value", then "the step fields should have a few
 * options like url field"). "Add field" lists the kinds: Text, Link, Number,
 * Date and Tick box, and puts an empty row of that kind in with the cursor in
 * its name. A Link's arrow, shown when the row is pointed at, opens it in a new tab, "https://" added when it was
 * left out.
 *
 * Text, Link and Number save whole when their boxes are left; a Date or a Tick
 * box saves the moment it is picked. A row with neither a name nor a value is
 * dropped, and a value with no name is refused and kept to fix.
 */
export function StepFields({
  stepId,
  fields,
  readOnly,
  change,
}: {
  stepId: string
  fields: StepField[]
  readOnly: boolean
  change: Change
}) {
  // Compared by what they hold, so a fresh copy of the same fields from the
  // server never wipes a row being typed in.
  const [savedKey, setSavedKey] = useSyncedDraft(JSON.stringify(fields))
  const [rows, setRows] = useSyncedDraft<StepField[]>(React.useMemo(() => JSON.parse(savedKey), [savedKey]))
  // The row just added, whose name gets the cursor once the kinds menu has closed.
  const added = React.useRef<string | null>(null)
  const list = React.useRef<HTMLUListElement>(null)

  async function save(next: StepField[], leaving: HTMLElement | null) {
    // Moving between the boxes of the same fields isn't leaving them.
    if (leaving && list.current?.contains(leaving)) return
    const kept = next
      .map((row) => ({ ...row, name: row.name.trim(), value: row.value.trim() }))
      .filter((row) => row.name || row.value)
    if (kept.some((row) => !row.name)) {
      showErrorToast("Give the field a name.")
      return
    }
    const key = JSON.stringify(kept)
    if (key === savedKey) {
      setRows(kept)
      return
    }
    if (await change(() => updateTaskStep({ stepId, fields: kept }))) setSavedKey(key)
  }

  function addField(kind: StepFieldKind) {
    if (rows.length >= LIMITS.fieldsPerStep) {
      showErrorToast(`A step can have at most ${LIMITS.fieldsPerStep} fields.`)
      return
    }
    const id = crypto.randomUUID()
    setRows([...rows, { id, name: "", value: "", kind }])
    added.current = id
  }

  function edit(id: string, value: string) {
    setRows(rows.map((row) => (row.id === id ? { ...row, value } : row)))
  }

  // A Date or a Tick box is one pick, so it saves at once.
  function pick(id: string, value: string) {
    const next = rows.map((row) => (row.id === id ? { ...row, value } : row))
    setRows(next)
    void save(next, null)
  }

  if (readOnly) {
    if (rows.length === 0) return null
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map((row) => (
          <React.Fragment key={row.id}>
            <dt className="text-muted-foreground">{row.name}</dt>
            <dd className="min-w-0 break-words">
              <ReadValue field={row} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    )
  }

  return (
    <div className="grid gap-1">
      {rows.length ? (
        <ul
          ref={list}
          className="grid gap-1"
          onBlur={(event) => void save(rows, event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null)}
        >
          {rows.map((row) => {
            const kind = row.kind
            const valueLabel = row.name ? `${row.name} value` : "Field value"
            return (
              <li key={row.id} className="group/field flex items-center gap-1">
                <span
                  className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5"
                  aria-label={STEP_FIELD_KIND_LABEL[kind]}
                  role="img"
                >
                  {KIND_ICON[kind]}
                </span>
                <Input
                  aria-label="Field name"
                  placeholder="Name"
                  value={row.name}
                  maxLength={LIMITS.stepFieldName}
                  data-field-name={row.id}
                  // As wide as its words, so the value gets the rest of a narrow panel.
                  className={cn(QUIET_INPUT, "w-auto max-w-24 min-w-12 shrink-0 text-muted-foreground field-sizing-content")}
                  onChange={(event) => setRows(rows.map((each) => (each.id === row.id ? { ...each, name: event.target.value } : each)))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
                {kind === "tick" ? (
                  <div className="flex min-w-0 flex-1 items-center px-1.5">
                    <Checkbox
                      aria-label={valueLabel}
                      checked={row.value === "yes"}
                      onCheckedChange={(checked) => pick(row.id, checked === true ? "yes" : "")}
                    />
                  </div>
                ) : kind === "date" ? (
                  <div className="min-w-0 flex-1">
                    <DatePicker
                      value={dateFromKey(row.value || null)}
                      placeholder="Pick a date"
                      className={cn(QUIET_INPUT, "w-full justify-start font-normal")}
                      onChange={(date) => pick(row.id, keyFromDate(date) ?? "")}
                    />
                  </div>
                ) : (
                  <Input
                    aria-label={valueLabel}
                    placeholder={kind === "link" ? "dropbox.com/…" : kind === "number" ? "0" : "Value"}
                    type={kind === "number" ? "number" : kind === "link" ? "url" : "text"}
                    inputMode={kind === "number" ? "decimal" : undefined}
                    value={row.value}
                    maxLength={LIMITS.stepFieldValue}
                    className={cn(QUIET_INPUT, "min-w-0 flex-1")}
                    onChange={(event) => edit(row.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                  />
                )}
                {kind === "link" && row.value.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    // Shows with the cross when the row is pointed at, like it.
                    className={ROW_ACTION}
                    asChild
                  >
                    <a
                      href={linkHref(row.value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${row.name || "the link"}`}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${row.name || "this field"}`}
                  className={ROW_ACTION}
                  onClick={() => void save(rows.filter((each) => each.id !== row.id), null)}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
              <PlusIcon className="size-3.5" />
              Add field
            </Button>
          </DropdownMenuTrigger>
          {/* The menu would hand the cursor back to "Add field" as it closes,
              taking it from the new row, which would then count as left empty. */}
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(event) => {
              if (!added.current) return
              event.preventDefault()
              list.current?.querySelector<HTMLInputElement>(`[data-field-name="${added.current}"]`)?.focus()
              added.current = null
            }}
          >
            {STEP_FIELD_KINDS.map((kind) => (
              <DropdownMenuItem key={kind} onSelect={() => addField(kind)}>
                {KIND_ICON[kind]}
                {STEP_FIELD_KIND_LABEL[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/** A field's value for someone who can only read it. */
function ReadValue({ field }: { field: StepField }) {
  const kind = field.kind
  if (kind === "tick") return <>{field.value ? "Yes" : "No"}</>
  if (kind === "date") return <>{field.value ? shortDayLabel(field.value) : ""}</>
  if (kind === "link" && field.value) {
    return (
      <a href={linkHref(field.value)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
        {field.value}
      </a>
    )
  }
  return <>{field.value}</>
}

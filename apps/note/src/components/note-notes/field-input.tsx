import * as React from "react"
import { CheckIcon, ExternalLinkIcon, SparklesIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { OPTION_BADGE_CLASS } from "@/lib/note/notes/colours"
import {
  fieldValueText,
  formatNoteDate,
  hasValue,
  parseFieldValue,
  type NoteField,
  type NoteFieldValue,
} from "@/lib/note/notes/fields"
import { cn } from "@/lib/utils"

/** How long a typed value waits after the last key before it saves. */
const TYPE_SAVE_DELAY_MS = 700
const CLEAR = "__clear__"

/**
 * One field's control on a note, the right one for its type. Every change
 * saves by itself: a tick, a pick and a date at once, typed text 700ms after
 * the last key and at once on leaving the box. A refused value stays in the
 * box, marked, and the reason shows in the error toast.
 */
export function FieldInput({
  id,
  field,
  value,
  disabled,
  onSave,
}: {
  id: string
  field: NoteField
  value: NoteFieldValue | undefined
  disabled?: boolean
  /** Saves the value; resolves false when it was refused. */
  onSave: (value: NoteFieldValue | null) => Promise<boolean>
}) {
  switch (field.type) {
    case "checkbox":
      return (
        <Checkbox
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => void onSave(checked === true)}
        />
      )
    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : CLEAR}
          disabled={disabled}
          onValueChange={(next) => void onSave(next === CLEAR ? null : next)}
        >
          <SelectTrigger id={id} className="w-full sm:w-fit sm:min-w-40">
            <SelectValue placeholder="Empty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLEAR}>
              <span className="text-muted-foreground">Empty</span>
            </SelectItem>
            {field.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <OptionBadge label={option.label} colour={option.colour} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "multi_select": {
      const picked = Array.isArray(value) ? value : []
      return (
        <MultiCombobox
          id={id}
          value={picked.map((each) => field.options.find((option) => option.id === each)?.label ?? "").filter(Boolean)}
          options={field.options.map((option) => option.label)}
          disabled={disabled}
          placeholder="Empty"
          searchPlaceholder={`Find in ${field.name}`}
          onChange={(labels) =>
            void onSave(
              labels
                .map((label) => field.options.find((option) => option.label === label)?.id)
                .filter((each): each is string => Boolean(each))
            )
          }
        />
      )
    }
    case "date":
      return <DateInput id={id} value={typeof value === "string" ? value : ""} disabled={disabled} onSave={onSave} />
    default:
      return <TypedInput id={id} field={field} value={value} disabled={disabled} onSave={onSave} />
  }
}

export function OptionBadge({ label, colour }: { label: string; colour: keyof typeof OPTION_BADGE_CLASS }) {
  return (
    <Badge variant="outline" className={cn("max-w-full truncate font-normal", OPTION_BADGE_CLASS[colour])}>
      {label}
    </Badge>
  )
}

/** A field's value drawn for reading: choices as their coloured badges. */
export function FieldValue({ field, value }: { field: NoteField; value: NoteFieldValue | undefined }) {
  if (!hasValue(value)) return null
  if (field.type === "select" || field.type === "multi_select") {
    const ids = Array.isArray(value) ? value : [value as string]
    return (
      <span className="flex min-w-0 flex-wrap gap-1">
        {ids.map((each) => {
          const option = field.options.find((candidate) => candidate.id === each)
          return option ? <OptionBadge key={each} label={option.label} colour={option.colour} /> : null
        })}
      </span>
    )
  }
  if (field.type === "checkbox") return <CheckIcon aria-label="Ticked" className="size-4" />
  if (field.type === "date") return <span className="truncate">{formatNoteDate(value as string)}</span>
  return <span className="truncate">{fieldValueText(field, value)}</span>
}

function TypedInput({
  id,
  field,
  value,
  disabled,
  onSave,
}: {
  id: string
  field: NoteField
  value: NoteFieldValue | undefined
  disabled?: boolean
  onSave: (value: NoteFieldValue | null) => Promise<boolean>
}) {
  const shown = value === undefined ? "" : String(value)
  const [draft, setDraft] = React.useState({ from: shown, text: shown })
  // A new value from outside (a kept suggestion, another note) replaces the box,
  // but never letters typed since the last value: a save that lands mid-typing
  // leaves the newer text alone.
  if (draft.from !== shown) setDraft({ from: shown, text: draft.text === draft.from ? shown : draft.text })
  const [invalid, setInvalid] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = React.useRef(draft.text)
  const saved = React.useRef(shown)
  React.useEffect(() => {
    saved.current = shown
  }, [shown])

  // Kept in refs so the save below never changes, and the one on leaving
  // (the cleanup) runs once when the box goes, not on every draw.
  const current = React.useRef({ field, onSave })
  React.useEffect(() => {
    current.current = { field, onSave }
  })

  const save = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const text = latest.current
    if (text.trim() === saved.current.trim()) return
    const parsed = parseFieldValue(current.current.field, text)
    // A value that does not fit still goes, so the server's reason is what
    // the toast says; it is refused there and the box keeps the text.
    const ok = await current.current.onSave(parsed.ok ? parsed.value : text)
    if (ok) saved.current = text
    setInvalid(!ok)
  }, [])

  React.useEffect(() => () => void save(), [save])

  const link =
    field.type === "url" && typeof value === "string"
      ? value
      : field.type === "email" && typeof value === "string"
        ? `mailto:${value}`
        : field.type === "phone" && typeof value === "string"
          ? `tel:${value.replace(/[^\d+]/g, "")}`
          : null

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        id={id}
        value={draft.text}
        disabled={disabled}
        inputMode={field.type === "number" ? "decimal" : field.type === "phone" ? "tel" : undefined}
        type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
        placeholder="Empty"
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft({ from: shown, text: event.target.value })
          latest.current = event.target.value
          setInvalid(false)
          if (timer.current) clearTimeout(timer.current)
          // A number is only checked once it is finished, so "1," on its way
          // to "1,250" is never refused half typed.
          if (field.type !== "number") timer.current = setTimeout(() => void save(), TYPE_SAVE_DELAY_MS)
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void save()
          }
        }}
      />
      {link ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm">
              <a
                href={link}
                target={field.type === "url" ? "_blank" : undefined}
                rel="noopener noreferrer"
                aria-label={`Open ${field.name}`}
              >
                <ExternalLinkIcon />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open {field.name}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function toDate(value: string) {
  const [day] = value.split("T")
  const [y, m, d] = day.split("-").map(Number)
  return y ? new Date(y, m - 1, d) : undefined
}

function fromDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A day from the calendar, with an optional time beside it. */
function DateInput({
  id,
  value,
  disabled,
  onSave,
}: {
  id: string
  value: string
  disabled?: boolean
  onSave: (value: NoteFieldValue | null) => Promise<boolean>
}) {
  const [day, time = ""] = value.split("T")
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DatePicker
        id={id}
        value={day ? toDate(day) : undefined}
        disabled={disabled}
        placeholder="Empty"
        className="w-full sm:w-44"
        onChange={(date) => void onSave(date ? `${fromDate(date)}${time ? `T${time}` : ""}` : null)}
      />
      {day ? (
        <Input
          type="time"
          aria-label="Time"
          className="w-full sm:w-32"
          value={time}
          disabled={disabled}
          onChange={(event) => void onSave(event.target.value ? `${day}T${event.target.value}` : day)}
        />
      ) : null}
    </div>
  )
}

/**
 * An AI suggestion under its field: the value it would set, a tick to keep
 * it and a cross to drop it (Tyler, 18 Oct 2026).
 */
export function SuggestionRow({
  field,
  value,
  busy,
  onKeep,
  onDrop,
}: {
  field: NoteField
  value: NoteFieldValue
  busy: boolean
  onKeep: () => void
  onDrop: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-dashed px-2 py-1 text-sm">
      <SparklesIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="sr-only">Suggested:</span>
      <span className="min-w-0 flex-1">
        <FieldValue field={field} value={value} />
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" disabled={busy} aria-label={`Keep the suggested ${field.name}`} onClick={onKeep}>
            <CheckIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keep it</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" disabled={busy} aria-label={`Drop the suggested ${field.name}`} onClick={onDrop}>
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Drop it</TooltipContent>
      </Tooltip>
    </div>
  )
}

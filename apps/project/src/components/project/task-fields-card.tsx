import * as React from "react"
import { ExternalLinkIcon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { TaskFileDrop } from "@/components/project/task-files-card"
import { PersonAvatar } from "@/components/project/task-bits"
import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveFieldValue, saveTaskTypeOf, type TaskFieldView } from "@/lib/api/project/task-types"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import {
  draftFromValue,
  fieldValueText,
  isHttpsLink,
  liveChoices,
  valueFromDraft,
  visibleFieldIds,
  type FieldDraft,
  type FieldRule,
} from "@/lib/project/task-fields"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const NO_TYPE = "none"
const NONE = "none"

type Person = { id: string; name: string; avatarUrl: string }

/**
 * The task's type, picked from the ones its project offers. Picking one only
 * changes the type: it never adds steps or touches the notes. The values in
 * the old type's fields are kept for if it's picked again.
 */
export function TaskTypeField({
  detail,
  readOnly,
  busy,
  change,
}: {
  detail: TaskDetail
  readOnly: boolean
  busy: boolean
  change: Change
}) {
  const { typeChoices, type, canChangeType } = detail.fields
  if (typeChoices.length === 0 && !type) return null
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-type">Template</Label>
      <Select
        value={type?.id ?? NO_TYPE}
        onValueChange={(value) =>
          void change(() => saveTaskTypeOf(detail.task.id, value === NO_TYPE ? null : value))
        }
        disabled={readOnly || busy || !canChangeType}
      >
        <SelectTrigger id="task-type" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TYPE}>No template</SelectItem>
          {typeChoices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              <TypeIconGlyph icon={choice.icon} color={choice.color} />
              {choice.name}
              {choice.archived ? <span className="text-muted-foreground"> (archived)</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!readOnly && !canChangeType ? (
        <p className="text-xs text-muted-foreground">{PROJECT_ERRORS.cantChangeType}</p>
      ) : null}
    </div>
  )
}

/**
 * The fields of the task's type, under the Task card. Each saves when it is
 * left, or the moment a pick is made. A field this person can't change reads
 * as plain words, and an empty one then shows nothing. A field with "Show
 * only when" shows while its dropdown says so, and keeps its value while
 * hidden.
 */
export function TaskFieldsCard({
  detail,
  readOnly,
  change,
  refresh,
}: {
  detail: TaskDetail
  readOnly: boolean
  change: Change
  refresh: () => Promise<void>
}) {
  const { type, values } = detail.fields
  if (!type || type.fields.length === 0) return null
  const visible = visibleFieldIds(type.fields, values)
  const people = new Map(detail.assignable.map((person) => [person.id, person.name]))
  const shown = type.fields.filter(
    (field) =>
      visible.has(field.id) &&
      ((field.canChange && !readOnly) ||
        (field.kind === "file" ? (detail.fields.fieldFiles[field.id]?.length ?? 0) > 0 : values[field.id] !== undefined))
  )
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TypeIconGlyph icon={type.icon} color={type.color} />
          {type.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing filled in yet.</p>
        ) : (
          shown.map((field) =>
            field.kind === "file" ? (
              <FileFieldRow
                key={field.id}
                field={field}
                detail={detail}
                readOnly={readOnly || !field.canChange}
                change={change}
                refresh={refresh}
              />
            ) : field.canChange && !readOnly ? (
              <SavedField
                key={field.id}
                field={field}
                taskId={detail.task.id}
                saved={values[field.id]}
                people={detail.assignable}
                change={change}
              />
            ) : (
              <ReadField key={field.id} field={field} value={values[field.id]} people={people} />
            )
          )
        )}
      </CardContent>
    </Card>
  )
}

/** The label, with "Needed before Done" beside it when the field is. */
function FieldName({ field, htmlFor, id }: { field: TaskFieldView; htmlFor?: string; id?: string }) {
  return (
    <Label htmlFor={htmlFor} id={id} className="flex flex-wrap items-baseline gap-x-2">
      {field.name}
      {field.neededBeforeDone ? (
        <span className="text-xs font-normal text-muted-foreground">Needed before Done</span>
      ) : null}
    </Label>
  )
}

/** A field this person can't change, or an archived task's, as plain words. */
function ReadField({
  field,
  value,
  people,
}: {
  field: TaskFieldView
  value: string | number | boolean | undefined
  people: ReadonlyMap<string, string>
}) {
  const text = fieldValueText(field, value, people)
  if (text === null) return null
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">{field.name}</p>
      {field.kind === "link" && typeof value === "string" && isHttpsLink(value) ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-primary underline-offset-4 hover:underline"
        >
          {text}
        </a>
      ) : (
        <p className="text-sm break-words whitespace-pre-wrap">{text}</p>
      )}
      {field.lockedReason ? <p className="text-xs text-muted-foreground">{field.lockedReason}</p> : null}
    </div>
  )
}

/** One field that saves itself: when it is left, or the moment a pick is made. */
function SavedField({
  field,
  taskId,
  saved,
  people,
  change,
}: {
  field: TaskFieldView
  taskId: string
  saved: string | number | boolean | undefined
  people: Person[]
  change: Change
}) {
  const [draft, setDraft] = useSyncedDraft<FieldDraft>(draftFromValue(field.kind, saved))
  const [invalid, setInvalid] = React.useState(false)
  const id = `task-field-${field.id}`

  async function commit(next: FieldDraft) {
    const result = valueFromDraft(field.kind, next)
    if ("error" in result) {
      setInvalid(true)
      showErrorToast(result.error)
      return
    }
    if ((result.value ?? undefined) === saved) return
    const ok = await change(() => saveFieldValue({ taskId, fieldId: field.id, value: result.value }))
    setInvalid(!ok)
  }

  return (
    <div className="grid gap-2">
      <FieldName field={field} htmlFor={id} />
      <FieldControl
        id={id}
        field={field}
        draft={draft}
        people={people}
        invalid={invalid}
        onDraft={(next) => {
          setDraft(next)
          setInvalid(false)
        }}
        onCommit={(next) => void commit(next)}
      />
    </div>
  )
}

/**
 * The control for one kind of field. Words are typed and sent when the box
 * is left (`onCommit`); a pick is sent the moment it is made. New task uses
 * it without `onCommit`, and sends everything with Create task.
 */
export function FieldControl({
  id,
  field,
  draft,
  people,
  invalid,
  onDraft,
  onCommit,
}: {
  id: string
  field: Pick<FieldRule, "kind" | "settings" | "name">
  draft: FieldDraft
  people: Person[]
  invalid?: boolean
  onDraft: (next: FieldDraft) => void
  onCommit?: (next: FieldDraft) => void
}) {
  const text = typeof draft === "string" ? draft : ""
  const pick = (next: FieldDraft) => {
    onDraft(next)
    onCommit?.(next)
  }
  const leave = () => onCommit?.(draft)
  const typing = {
    id,
    value: text,
    "aria-invalid": invalid || undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onDraft(event.target.value),
    onBlur: leave,
  }
  const enterLeaves = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onCommit) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  switch (field.kind) {
    case "long_text":
      return <Textarea {...typing} maxLength={LIMITS.fieldLongText} />
    case "number":
      return (
        <Input {...typing} type="number" inputMode="decimal" className="w-full sm:w-40" onKeyDown={enterLeaves} />
      )
    case "link":
      return (
        <div className="flex items-center gap-2">
          <Input
            {...typing}
            type="url"
            inputMode="url"
            placeholder="https://"
            maxLength={LIMITS.fieldLink}
            onKeyDown={enterLeaves}
          />
          {isHttpsLink(text.trim()) ? (
            <Button asChild variant="ghost" size="icon" aria-label={`Open ${field.name} in a new tab`}>
              <a href={text.trim()} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-4" />
              </a>
            </Button>
          ) : null}
        </div>
      )
    case "date":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            id={id}
            value={dateFromKey(text || null)}
            placeholder="No date"
            aria-invalid={invalid || undefined}
            onChange={(date) => pick(keyFromDate(date) ?? "")}
          />
          {text ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => pick("")}>
              Clear
            </Button>
          ) : null}
        </div>
      )
    case "dropdown": {
      const choices = liveChoices(field.settings)
      // A removed choice still reads as it was until someone picks another.
      const removed = (field.settings.choices ?? []).find((c) => c.id === text && c.removed)
      return (
        <Select value={text || NONE} onValueChange={(value) => pick(value === NONE ? "" : value)}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {removed ? (
              <SelectItem value={removed.id} disabled>
                {removed.name} (removed)
              </SelectItem>
            ) : null}
            {choices.map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox id={id} checked={draft === true} onCheckedChange={(checked) => pick(checked === true)} />
          <Label htmlFor={id} className="font-normal">
            {draft === true ? "Yes" : "Not yet"}
          </Label>
        </div>
      )
    case "person":
      return (
        <Select value={text || NONE} onValueChange={(value) => pick(value === NONE ? "" : value)}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nobody</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "file":
      return null
    default:
      return <Input {...typing} maxLength={LIMITS.fieldText} onKeyDown={enterLeaves} />
  }
}

function FileFieldRow({
  field,
  detail,
  readOnly,
  change,
  refresh,
}: {
  field: TaskFieldView
  detail: TaskDetail
  readOnly: boolean
  change: Change
  refresh: () => Promise<void>
}) {
  const labelId = `task-field-${field.id}-label`
  return (
    <div className="grid gap-2">
      <FieldName field={field} id={labelId} />
      <TaskFileDrop
        taskId={detail.task.id}
        fieldId={field.id}
        files={detail.fields.fieldFiles[field.id] ?? []}
        taskFileCount={detail.fields.fileCount}
        readOnly={readOnly}
        refresh={refresh}
        change={change}
        emptyText="No files yet."
        labelledBy={labelId}
      />
      {readOnly && field.lockedReason ? (
        <p className="text-xs text-muted-foreground">{field.lockedReason}</p>
      ) : null}
    </div>
  )
}

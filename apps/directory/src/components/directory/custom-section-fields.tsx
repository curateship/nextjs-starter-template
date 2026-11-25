import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CUSTOM_FIELD_LABEL_MAX,
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES,
  CUSTOM_SIMPLE_FIELD_TYPES,
  MAX_CUSTOM_OPTIONS,
  MAX_CUSTOM_REPEATER_FIELDS,
  canFilterByType,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldType,
  type CustomSimpleField,
  type CustomSimpleFieldType,
} from "@/lib/directory/custom-fields"

/**
 * One section's invented fields, edited in place in the section's record on
 * the right of the Listings dashboard (`sections/fields-section.tsx`). It
 * was a window with Save until the Listings pages became one dashboard on
 * 18 Nov 2026; these are its parts.
 *
 * The fields are edited in place rather than each opening a window of its own.
 * Somebody defining a section is thinking about all of it at once, and a
 * window per field would put a modal over a modal to change one word.
 *
 * Removing a field that listings or events have already filled in asks first, and says
 * how many would lose an answer. That question is the only thing standing
 * between "I renamed a section" and a hundred businesses quietly losing their
 * opening times.
 */

let rowCounter = 0
function freshId(prefix: string) {
  rowCounter += 1
  return `${prefix}-new-${rowCounter}`
}

export function newField(): CustomSimpleField {
  // No key: a field the server has not seen has not been filed under one yet,
  // and letting the server make it is what keeps the two from disagreeing.
  return {
    id: freshId("field"),
    key: "",
    label: "",
    type: "text",
    options: [],
    filter: false,
  }
}

function newOption(): CustomFieldOption {
  return { id: freshId("option"), label: "", value: "" }
}

/** What the window sends, which is also what it compares against for edits. */
export function fieldsSnapshot(fields: CustomField[]) {
  return JSON.stringify(
    fields.map((field) => ({
      key: field.key,
      label: field.label.trim(),
      type: field.type,
      options: field.type === "select" ? field.options : [],
      filter: field.type !== "repeater" && field.filter,
      fields:
        field.type === "repeater"
          ? field.fields.map((row) => ({
              key: row.key,
              label: row.label.trim(),
              type: row.type,
              options: row.type === "select" ? row.options : [],
            }))
          : [],
    }))
  )
}

export function FieldRow({
  field,
  index,
  count,
  filters,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  field: CustomField
  index: number
  count: number
  /**
   * Whether "Use as a filter" is offered. Only a listing's fields filter the
   * directory; an event's never do (task events/07 leaves that to task 14).
   */
  filters: boolean
  disabled: boolean
  onChange: (patch: Partial<CustomField>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const labelId = `custom-field-label-${field.id}`
  const typeId = `custom-field-type-${field.id}`
  const filterId = `custom-field-filter-${field.id}`

  return (
    <div className="grid gap-4 rounded-md border p-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor={labelId}>Field name</Label>
          <Input
            id={labelId}
            value={field.label}
            maxLength={CUSTOM_FIELD_LABEL_MAX}
            placeholder="Grape"
            disabled={disabled}
            aria-invalid={field.label.trim() === "" ? true : undefined}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={typeId}>Kind</Label>
          <Select
            value={field.type}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(patchForType(field, value as CustomFieldType))
            }
          >
            {/* A set width rather than content-width: these sit in a column of
                identical rows, and letting each one size to its own words
                leaves every row's name box a different length. */}
            <SelectTrigger id={typeId} className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_FIELD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CUSTOM_FIELD_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || index === 0}
            aria-label={`Move ${field.label || "this field"} up`}
            onClick={() => onMove(-1)}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || index === count - 1}
            aria-label={`Move ${field.label || "this field"} down`}
            onClick={() => onMove(1)}
          >
            <ChevronDownIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Remove ${field.label || "this field"}`}
            onClick={onRemove}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      {filters && field.type !== "repeater" && canFilterByType(field.type) ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id={filterId}
            checked={field.filter}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ filter: checked === true } as Partial<CustomField>)
            }
          />
          <FieldLabel
            htmlFor={filterId}
            hint="Visitors can narrow the directory and category pages to the listings that gave this answer."
          >
            Use as a filter
          </FieldLabel>
        </div>
      ) : null}

      {field.type === "select" ? (
        <OptionsEditor
          field={field}
          disabled={disabled}
          onChange={(options) => onChange({ options } as Partial<CustomField>)}
        />
      ) : null}

      {field.type === "repeater" ? (
        <RepeaterEditor
          field={field}
          disabled={disabled}
          onChange={(rowFields) =>
            onChange({ fields: rowFields } as Partial<CustomField>)
          }
        />
      ) : null}
    </div>
  )
}

/**
 * Changing a field's kind keeps its name and its key. The parts that only
 * belong to one kind are cleared, because a repeater's rows mean nothing to a
 * number and a choice's options mean nothing to a picture.
 */
function patchForType(
  field: CustomField,
  type: CustomFieldType
): Partial<CustomField> {
  if (type === "repeater") {
    return { type, fields: field.type === "repeater" ? field.fields : [] }
  }
  return {
    type,
    options: type === "select" && field.type === "select" ? field.options : [],
    // Only a yes or no and a choice can be filtered on, so a field turned into
    // anything else stops being a filter rather than keeping a hidden tick.
    filter: canFilterByType(type) && field.type !== "repeater" && field.filter,
  }
}

function OptionsEditor({
  field,
  disabled,
  onChange,
}: {
  field: CustomSimpleField
  disabled: boolean
  onChange: (options: CustomFieldOption[]) => void
}) {
  const full = field.options.length >= MAX_CUSTOM_OPTIONS
  return (
    <div className="grid gap-2">
      <Label>Choices</Label>
      {field.options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          A choice field with nothing to choose from saves nothing. Add the
          answers to pick from.
        </p>
      ) : null}
      {field.options.map((option, index) => (
        <div key={option.id} className="flex items-center gap-2">
          <Input
            value={option.label}
            maxLength={CUSTOM_FIELD_LABEL_MAX}
            placeholder="Red"
            disabled={disabled}
            aria-label={`Choice ${index + 1}`}
            onChange={(event) =>
              onChange(
                field.options.map((entry) =>
                  entry.id === option.id
                    ? { ...entry, label: event.target.value }
                    : entry
                )
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Remove choice ${option.label || index + 1}`}
            onClick={() =>
              onChange(field.options.filter((entry) => entry.id !== option.id))
            }
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <DisabledReason
          disabled={full}
          reason={`A choice can offer ${MAX_CUSTOM_OPTIONS} answers.`}
        >
          <Button
            type="button"
            variant="outline"
            disabled={disabled || full}
            onClick={() => onChange([...field.options, newOption()])}
          >
            <PlusIcon className="size-4" />
            Add choice
          </Button>
        </DisabledReason>
      </div>
    </div>
  )
}

function RepeaterEditor({
  field,
  disabled,
  onChange,
}: {
  field: Extract<CustomField, { type: "repeater" }>
  disabled: boolean
  onChange: (fields: CustomSimpleField[]) => void
}) {
  const full = field.fields.length >= MAX_CUSTOM_REPEATER_FIELDS
  return (
    <div className="grid gap-2">
      <Label>What one row holds</Label>
      {field.fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          A repeating field needs at least one thing in a row, such as a class
          name or a time.
        </p>
      ) : null}
      {field.fields.map((rowField, index) => (
        <div key={rowField.id} className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="sm:flex-1"
            value={rowField.label}
            maxLength={CUSTOM_FIELD_LABEL_MAX}
            placeholder="Class"
            disabled={disabled}
            aria-label={`Row field ${index + 1} name`}
            onChange={(event) =>
              onChange(
                field.fields.map((entry) =>
                  entry.id === rowField.id
                    ? { ...entry, label: event.target.value }
                    : entry
                )
              )
            }
          />
          <div className="flex items-center gap-2">
            <Select
              value={rowField.type}
              disabled={disabled}
              onValueChange={(value) =>
                onChange(
                  field.fields.map((entry) =>
                    entry.id === rowField.id
                      ? {
                          ...entry,
                          type: value as CustomSimpleFieldType,
                          options: value === "select" ? entry.options : [],
                        }
                      : entry
                  )
                )
              }
            >
              <SelectTrigger
                className="w-full sm:w-40"
                aria-label={`Row field ${index + 1} kind`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_SIMPLE_FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CUSTOM_FIELD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Remove row field ${rowField.label || index + 1}`}
              onClick={() =>
                onChange(field.fields.filter((entry) => entry.id !== rowField.id))
              }
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <div>
        <DisabledReason
          disabled={full}
          reason={`A row holds ${MAX_CUSTOM_REPEATER_FIELDS} things. Remove one before adding another.`}
        >
          <Button
            type="button"
            variant="outline"
            disabled={disabled || full}
            onClick={() => onChange([...field.fields, newField()])}
          >
            <PlusIcon className="size-4" />
            Add to a row
          </Button>
        </DisabledReason>
      </div>
    </div>
  )
}

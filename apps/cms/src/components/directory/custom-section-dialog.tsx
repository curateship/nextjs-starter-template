import * as React from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
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
  CUSTOM_SECTION_LAYOUT_LABELS,
  CUSTOM_SECTION_LAYOUTS,
  CUSTOM_SECTION_NAME_MAX,
  CUSTOM_SIMPLE_FIELD_TYPES,
  MAX_CUSTOM_FIELDS_PER_SECTION,
  MAX_CUSTOM_OPTIONS,
  MAX_CUSTOM_REPEATER_FIELDS,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldType,
  type CustomSection,
  type CustomSectionLayout,
  type CustomSimpleField,
  type CustomSimpleFieldType,
} from "@/lib/directory/custom-fields"
import {
  getCustomSectionErrorMessage,
  loadCustomFieldsRemovalImpact,
  saveCustomSection,
  saveNewCustomSection,
} from "@/lib/api/directory/custom-sections"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One section of invented fields, edited in a single window: what it is
 * called, how its fields sit on the page, and the fields themselves.
 *
 * The fields are edited in place rather than each opening a window of its own.
 * Somebody defining a section is thinking about all of it at once, and a
 * window per field would put a modal over a modal to change one word.
 *
 * A save that drops fields listings have already filled in asks first, and
 * says how many would lose an answer. That question is the only thing standing
 * between "I renamed a section" and a hundred businesses quietly losing their
 * opening times.
 */

let rowCounter = 0
function freshId(prefix: string) {
  rowCounter += 1
  return `${prefix}-new-${rowCounter}`
}

function newField(): CustomSimpleField {
  // No key: a field the server has not seen has not been filed under one yet,
  // and letting the server make it is what keeps the two from disagreeing.
  return { id: freshId("field"), key: "", label: "", type: "text", options: [] }
}

function newOption(): CustomFieldOption {
  return { id: freshId("option"), label: "", value: "" }
}

/** What the window sends, which is also what it compares against for edits. */
function fieldsSnapshot(fields: CustomField[]) {
  return JSON.stringify(
    fields.map((field) => ({
      key: field.key,
      label: field.label.trim(),
      type: field.type,
      options: field.type === "select" ? field.options : [],
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

export function CustomSectionDialog({
  open,
  section,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The section being edited, or null when creating one. */
  section: CustomSection | null
  onClose: () => void
  onSaved: (saved: CustomSection, wasNew: boolean) => void
}) {
  const [name, setName] = React.useState("")
  const [layout, setLayout] = React.useState<CustomSectionLayout>("stack")
  const [fields, setFields] = React.useState<CustomField[]>([])
  const [saving, setSaving] = React.useState(false)
  /**
   * Set the moment a create's first request lands, so a failure in the rest of
   * the save leaves the window editing that section rather than making a
   * second one on the next press.
   */
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  const [confirmDrop, setConfirmDrop] = React.useState<
    { label: string; listings: number }[] | null
  >(null)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (section?.id ?? "new") : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setName(section?.name ?? "")
    setLayout(section?.layout ?? "stack")
    setFields(section?.fields ?? [])
    setCreatedId(null)
    setConfirmDrop(null)
  }

  const openedWith = React.useMemo(
    () =>
      JSON.stringify({
        name: section?.name ?? "",
        layout: section?.layout ?? "stack",
        fields: fieldsSnapshot(section?.fields ?? []),
      }),
    [section]
  )
  const dirty =
    openedFor === key &&
    JSON.stringify({ name, layout, fields: fieldsSnapshot(fields) }) !==
      openedWith

  const editingId = section?.id ?? createdId

  function updateField(id: string, patch: Partial<CustomField>) {
    setFields((current) =>
      current.map((field) =>
        field.id === id ? ({ ...field, ...patch } as CustomField) : field
      )
    )
  }

  function move(id: string, by: -1 | 1) {
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id)
      const next = index + by
      if (index === -1 || next < 0 || next >= current.length) return current
      const reordered = [...current]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(next, 0, moved)
      return reordered
    })
  }

  async function save(force = false) {
    dismissErrorToast()
    if (!name.trim()) {
      showErrorToast("A section needs a name.")
      return
    }
    const unnamed = fields.some((field) => !field.label.trim())
    if (unnamed) {
      showErrorToast("Every field needs a name. Give it one or remove it.")
      return
    }

    setSaving(true)
    try {
      let id = editingId
      if (!id) {
        const created = await saveNewCustomSection({ name, layout })
        setCreatedId(created.id)
        id = created.id
      } else if (!force) {
        // Only an existing section can lose answers — a brand new one has
        // none. Asked before the save, not after, so "cancel" still means it.
        const { removed } = await loadCustomFieldsRemovalImpact(id, fields)
        if (removed.length) {
          setConfirmDrop(removed)
          return
        }
      }
      const saved = await saveCustomSection({ id, name, layout, fields })
      onSaved(saved, !section)
    } catch (error) {
      showErrorToast(getCustomSectionErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const full = fields.length >= MAX_CUSTOM_FIELDS_PER_SECTION

  return (
    <>
      <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin" className="h-[44rem]">
            <DialogHeader>
              <DialogTitle>
                {section ? name.trim() || "Untitled section" : "New section"}
              </DialogTitle>
              <DialogDescription>
                These fields appear on every listing's form, and on its page
                under the write-up.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The section</CardTitle>
                  <CardDescription>
                    The heading its fields sit under on a listing's page.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="custom-section-name">Name</FieldLabel>
                    <Input
                      id="custom-section-name"
                      value={name}
                      maxLength={CUSTOM_SECTION_NAME_MAX}
                      placeholder="The wine"
                      disabled={saving}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="custom-section-layout"
                      hint="How this section's own fields are arranged. It always sits after the write-up."
                    >
                      Arrangement
                    </FieldLabel>
                    <Select
                      value={layout}
                      disabled={saving}
                      onValueChange={(value) =>
                        setLayout(value as CustomSectionLayout)
                      }
                    >
                      <SelectTrigger
                        id="custom-section-layout"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOM_SECTION_LAYOUTS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {CUSTOM_SECTION_LAYOUT_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Fields</CardTitle>
                  <CardDescription>
                    {fields.length
                      ? "A listing shows only the ones it has filled in."
                      : "No fields yet. Add the first one."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {fields.map((field, index) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      index={index}
                      count={fields.length}
                      disabled={saving}
                      onChange={(patch) => updateField(field.id, patch)}
                      onMove={(by) => move(field.id, by)}
                      onRemove={() =>
                        setFields((current) =>
                          current.filter((entry) => entry.id !== field.id)
                        )
                      }
                    />
                  ))}
                  <div>
                    <DisabledReason
                      disabled={full}
                      reason={`A section holds ${MAX_CUSTOM_FIELDS_PER_SECTION} fields. Remove one before adding another.`}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving || full}
                        onClick={() =>
                          setFields((current) => [...current, newField()])
                        }
                      >
                        <PlusIcon className="size-4" />
                        Add field
                      </Button>
                    </DisabledReason>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {section ? "Save changes" : "Create section"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={confirmDrop !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmDrop(null)
        }}
        title="Throw these answers away?"
        description={
          confirmDrop
            ? `Saving removes ${confirmDrop
                .map(
                  (entry) =>
                    `${entry.label} (${entry.listings} ${plural(entry.listings, "listing", "listings")})`
                )
                .join(", ")}. What those listings typed in goes with the field.`
            : null
        }
        confirmLabel="Save and throw them away"
        cancelLabel="Keep editing"
        loading={saving}
        onConfirm={() => {
          setConfirmDrop(null)
          void save(true)
        }}
      />
    </>
  )
}

function FieldRow({
  field,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  field: CustomField
  index: number
  count: number
  disabled: boolean
  onChange: (patch: Partial<CustomField>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const labelId = `custom-field-label-${field.id}`
  const typeId = `custom-field-type-${field.id}`

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
          answers a listing may pick.
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
          A repeating field needs at least one thing in a row — a class name, a
          time.
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

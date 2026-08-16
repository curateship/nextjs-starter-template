import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { CharacterCount } from "@/components/shared/character-count"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  blankCustomValue,
  blankSimpleValue,
  CUSTOM_TAG_MAX,
  CUSTOM_TEXT_MAX,
  CUSTOM_TEXTAREA_MAX,
  MAX_CUSTOM_REPEATER_ROWS,
  MAX_CUSTOM_TAGS,
  type CustomField,
  type CustomFieldValue,
  type CustomRepeaterRow,
  type CustomSection,
  type CustomSimpleField,
  type CustomSimpleValue,
  type CustomValues,
} from "@/lib/directory/custom-fields"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"

/**
 * The fields a site invented, on the listing form: one card per section, in
 * the order the admin arranged them, after everything built in.
 *
 * The form holds every field whether or not it has an answer — that is what a
 * form is for. Deciding which of them is empty enough to leave off the page is
 * the server's job on the way in, not this component's.
 */
export function ListingCustomFields({
  sections,
  values,
  disabled,
  onChange,
}: {
  sections: CustomSection[]
  values: CustomValues
  disabled: boolean
  onChange: (values: CustomValues) => void
}) {
  if (!sections.length) return null

  const setValue = (
    section: CustomSection,
    field: CustomField,
    value: CustomFieldValue
  ) =>
    onChange({
      ...values,
      [section.slug]: { ...(values[section.slug] ?? {}), [field.key]: value },
    })

  return (
    <>
      {sections.map((section) => (
        <CollapsibleSettingsCard
          key={section.id}
          size="sm"
          // Keyed on the section's own slug, which never changes, so which
          // sections somebody keeps folded away survives renaming them.
          storageId={`listing-section-${section.slug}`}
          title={section.name}
          description="Only what is filled in shows on the listing's page."
          contentClassName={
            section.layout === "two-column"
              ? "grid gap-4 sm:grid-cols-2"
              : "grid gap-4"
          }
        >
          {section.fields.length ? (
            section.fields.map((field) => (
              <CustomFieldControl
                key={field.id}
                section={section}
                field={field}
                value={values[section.slug]?.[field.key]}
                disabled={disabled}
                onChange={(value) => setValue(section, field, value)}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              This section has no fields yet. Add them on the Listing fields
              screen.
            </p>
          )}
        </CollapsibleSettingsCard>
      ))}
    </>
  )
}

function CustomFieldControl({
  section,
  field,
  value,
  disabled,
  onChange,
}: {
  section: CustomSection
  field: CustomField
  value: CustomFieldValue | undefined
  disabled: boolean
  onChange: (value: CustomFieldValue) => void
}) {
  const id = `custom-${section.slug}-${field.key || field.id}`
  const current = value === undefined ? blankCustomValue(field) : value

  if (field.type === "repeater") {
    return (
      <RepeaterRows
        id={id}
        field={field}
        rows={Array.isArray(current) ? (current as CustomRepeaterRow[]) : []}
        disabled={disabled}
        onChange={onChange}
      />
    )
  }

  return (
    <SimpleFieldControl
      id={id}
      field={field}
      value={current as CustomSimpleValue}
      disabled={disabled}
      onChange={onChange}
    />
  )
}

function SimpleFieldControl({
  id,
  field,
  value,
  disabled,
  onChange,
  compact = false,
}: {
  id: string
  field: CustomSimpleField
  value: CustomSimpleValue
  disabled: boolean
  onChange: (value: CustomSimpleValue) => void
  /** Inside a repeating row, where the row itself carries the spacing. */
  compact?: boolean
}) {
  const label = compact ? (
    <Label htmlFor={id}>{field.label}</Label>
  ) : (
    <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
  )

  switch (field.type) {
    case "toggle":
      // Its own row, and the switch beside its name rather than under it —
      // a yes-or-no reads as one thing, not a label with a control below.
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(next) => onChange(next === true)}
          />
          <Label htmlFor={id}>{field.label}</Label>
        </div>
      )

    case "textarea":
      return (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            {label}
            <CharacterCount
              value={typeof value === "string" ? value : ""}
              max={CUSTOM_TEXTAREA_MAX}
            />
          </div>
          <Textarea
            id={id}
            rows={1}
            maxLength={CUSTOM_TEXTAREA_MAX}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )

    case "richText":
      return (
        <div className="grid gap-2">
          {label}
          <DocumentEditor
            value={
              value && typeof value === "object" && !Array.isArray(value)
                ? (value as WrittenPageNode)
                : { type: "doc", content: [] }
            }
            disabled={disabled}
            onChange={(next) => onChange(next)}
          />
        </div>
      )

    case "image":
      return (
        <div className="grid gap-2">
          {/* The label sits outside the width cap so it stays on one line. */}
          <FieldLabel>{field.label}</FieldLabel>
          {/* The picker opens as its own window, the way every other image
              field in a form does. Kept inside the window instead, it unfolds
              under a box capped at six rems and spills out of the column. */}
          <ImageUpload
            label={field.label}
            showLabel={false}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={(url) => onChange(url)}
            aspect="square"
            fit="cover"
            className="max-w-24"
          />
        </div>
      )

    case "number":
      return (
        <div className="grid gap-2 sm:max-w-40">
          {label}
          <Input
            id={id}
            inputMode="decimal"
            value={typeof value === "number" ? String(value) : ""}
            disabled={disabled}
            onChange={(event) => {
              const text = event.target.value.trim()
              if (!text) return onChange(null)
              const next = Number(text)
              onChange(Number.isFinite(next) ? next : null)
            }}
          />
        </div>
      )

    case "select":
      return (
        <div className="grid gap-2">
          {label}
          <Select
            value={typeof value === "string" && value ? value : "none"}
            disabled={disabled || field.options.length === 0}
            onValueChange={(next) => onChange(next === "none" ? "" : next)}
          >
            <SelectTrigger id={id} className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {field.options.map((option) => (
                <SelectItem key={option.id} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )

    case "tags":
      return (
        <TagsField
          id={id}
          label={label}
          tags={Array.isArray(value) ? (value as string[]) : []}
          disabled={disabled}
          onChange={onChange}
        />
      )

    case "link":
      return (
        <div className="grid gap-2">
          {compact ? (
            <Label htmlFor={id}>{field.label}</Label>
          ) : (
            <FieldLabel
              htmlFor={id}
              hint="A web address. A bare domain gets https:// added for you."
            >
              {field.label}
            </FieldLabel>
          )}
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder="example.com"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )

    default:
      return (
        <div className="grid gap-2">
          {label}
          <Input
            id={id}
            maxLength={CUSTOM_TEXT_MAX}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )
  }
}

/**
 * Tags, added one at a time.
 *
 * The half-typed word lives here rather than in the saved value: splitting a
 * text box on every comma as somebody types moves their cursor out from under
 * them, and a tag list that fights the person filling it in gets left empty.
 */
function TagsField({
  id,
  label,
  tags,
  disabled,
  onChange,
}: {
  id: string
  label: React.ReactNode
  tags: string[]
  disabled: boolean
  onChange: (tags: string[]) => void
}) {
  const [text, setText] = React.useState("")
  const full = tags.length >= MAX_CUSTOM_TAGS

  const commit = (raw: string) => {
    const tag = raw.trim().slice(0, CUSTOM_TAG_MAX)
    if (!tag || full || tags.includes(tag)) {
      setText("")
      return
    }
    onChange([...tags, tag])
    setText("")
  }

  return (
    <div className="grid gap-2">
      {label}
      {tags.length ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            >
              {tag}
              <button
                type="button"
                className="text-muted-foreground"
                disabled={disabled}
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(tags.filter((entry) => entry !== tag))}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        value={text}
        placeholder={full ? "" : "Type a tag and press Enter"}
        disabled={disabled || full}
        onChange={(event) => {
          // A typed comma ends the tag, which is how most people expect a
          // list like this to work without being told.
          if (event.target.value.includes(",")) {
            commit(event.target.value.replace(",", ""))
            return
          }
          setText(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          // Otherwise Enter reaches the window and saves a half-typed tag.
          event.preventDefault()
          commit(text)
        }}
        onBlur={() => commit(text)}
      />
    </div>
  )
}

let rowCounter = 0
function freshRowKey() {
  rowCounter += 1
  return `row-${rowCounter}`
}

function RepeaterRows({
  id,
  field,
  rows,
  disabled,
  onChange,
}: {
  id: string
  field: Extract<CustomField, { type: "repeater" }>
  rows: CustomRepeaterRow[]
  disabled: boolean
  onChange: (rows: CustomRepeaterRow[]) => void
}) {
  const full = rows.length >= MAX_CUSTOM_REPEATER_ROWS

  /**
   * A name per row that stays with that row.
   *
   * Numbering the rows instead would look fine and quietly corrupt them: React
   * reuses the controls when a row in the middle goes, and the written-text
   * editor only reads its value when it is first drawn. Remove the first of two
   * rows and the second one inherits the first one's words — and then saves
   * them.
   *
   * Adding and removing keep the names in step themselves. A count that moves
   * any other way means the rows were replaced wholesale, so every name is
   * made afresh and every control is rebuilt rather than half of them keeping
   * a stranger's contents.
   */
  const [keys, setKeys] = React.useState<string[]>(() => rows.map(freshRowKey))
  if (keys.length !== rows.length) setKeys(rows.map(freshRowKey))

  if (!field.fields.length) {
    return (
      <div className="grid gap-2">
        <FieldLabel>{field.label}</FieldLabel>
        <p className="text-xs text-muted-foreground">
          A row has nothing in it yet. Add what a row holds on the Listing
          fields screen.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <FieldLabel>{field.label}</FieldLabel>
      {rows.map((row, index) => (
        <div key={keys[index]} className="grid gap-4 rounded-md border p-3">
          <div className="grid gap-4">
            {field.fields.map((rowField) => (
              <SimpleFieldControl
                key={rowField.id}
                id={`${id}-${index}-${rowField.key || rowField.id}`}
                field={rowField}
                value={row[rowField.key] ?? blankSimpleValue(rowField.type)}
                disabled={disabled}
                compact
                onChange={(value) =>
                  onChange(
                    rows.map((entry, position) =>
                      position === index
                        ? { ...entry, [rowField.key]: value }
                        : entry
                    )
                  )
                }
              />
            ))}
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setKeys(keys.filter((_, position) => position !== index))
                onChange(rows.filter((_, position) => position !== index))
              }}
            >
              <XIcon className="size-4" />
              Remove row
            </Button>
          </div>
        </div>
      ))}
      <div>
        <DisabledReason
          disabled={full}
          reason={`A listing can hold ${MAX_CUSTOM_REPEATER_ROWS} rows here. Remove one before adding another.`}
        >
          <Button
            type="button"
            variant="outline"
            disabled={disabled || full}
            onClick={() => {
              setKeys([...keys, freshRowKey()])
              onChange([
                ...rows,
                Object.fromEntries(
                  field.fields.map((rowField) => [
                    rowField.key,
                    blankSimpleValue(rowField.type),
                  ])
                ),
              ])
            }}
          >
            <PlusIcon className="size-4" />
            Add row
          </Button>
        </DisabledReason>
      </div>
    </div>
  )
}

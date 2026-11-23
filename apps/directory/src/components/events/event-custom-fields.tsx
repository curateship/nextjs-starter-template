import { CustomFieldControl } from "@/components/directory/listing-custom-fields"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import {
  isBlankValue,
  type CustomField,
  type CustomFieldValue,
  type CustomSection,
  type CustomValues,
} from "@/lib/directory/custom-fields"
import { plural } from "@/lib/format/plural"

/**
 * The site's own event fields in the event record's ⋮ (task events/07): one
 * grey list per section, named after it, and one row per field showing its
 * answer. A row opens a small box with the field's control, the same as Title
 * or Tickets link in the list above. Every card of the record lives in the ⋮
 * (Tyler, 19 Nov 2026: "Move all these blocks into the right panel header 3
 * dot dropdown"), so these do too, rather than as cards in the panel the way
 * a listing's record has them.
 */
export function EventCustomFieldGroups({
  sections,
  values,
  onChange,
}: {
  sections: CustomSection[]
  values: CustomValues
  onChange: (values: CustomValues) => void
}) {
  return sections
    .filter((section) => section.fields.length > 0)
    .map((section) => (
      <PickGroup
        key={section.id}
        title={section.name}
        after={<p className="px-0.5 text-xs text-muted-foreground">Only what is filled in shows on the event's page.</p>}
      >
        {section.fields.map((field) => {
          const value = values[section.slug]?.[field.key]
          const blank = value === undefined || isBlankValue(field, value)
          return (
            <PickRow key={field.id} label={field.label} value={blank ? "None" : answerText(field, value)} empty={blank}>
              <CustomFieldControl
                section={section}
                field={field}
                value={value}
                disabled={false}
                onChange={(next) =>
                  onChange({ ...values, [section.slug]: { ...(values[section.slug] ?? {}), [field.key]: next } })
                }
              />
            </PickRow>
          )
        })}
      </PickGroup>
    ))
}

/** The answer as the row shows it, short: the choice's wording, Yes, a number, the words. */
function answerText(field: CustomField, value: CustomFieldValue): string {
  if (field.type === "repeater") {
    const rows = Array.isArray(value) ? value.length : 0
    return `${rows} ${plural(rows, "row", "rows")}`
  }
  if (field.type === "select") return field.options.find((option) => option.value === value)?.label ?? String(value)
  if (field.type === "toggle") return "Yes"
  if (field.type === "tags" && Array.isArray(value)) return value.join(", ")
  if (field.type === "image") return "A picture"
  if (field.type === "richText") return "Written"
  if (typeof value === "number") return value.toLocaleString()
  return String(value)
}

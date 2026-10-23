import type { CustomSection } from "@/lib/directory/custom-fields"
import type { DirectoryFilterOption } from "@/lib/directory/filter-groups"

/**
 * Filters made from the fields a site invented for its own listings.
 *
 * An admin marks a yes or no field, or a choice field, as a filter in the
 * section's window. Each one then becomes a button above the browse page's
 * listings, beside the category groups: "Has wifi" is one tick box, and
 * "Price" is one box per answer.
 *
 * **The address holds one key, `?filter=`**, a comma-separated list the same
 * way `?category=` is. A yes or no is `section.field`, and an answer to a
 * choice is `section.field:answer`, so `?filter=amenities.has_wifi,amenities.price:cheap`
 * reads as wifi and cheap. Section and field names are letters, digits and
 * underscores by construction (`customKeyFromLabel`), so neither can hold the
 * dot, colon or comma that split the value. An answer is URI-encoded inside
 * its part, because one imported from elsewhere could hold anything.
 *
 * Browser-safe: the route, the endpoint and the server's query all read it.
 */

/** One filter button: a field, and the boxes it offers. */
export type DirectoryFieldFilter = {
  /** `section.field`, which is also the start of every option's token. */
  id: string
  name: string
  /**
   * The section the field belongs to. The filter panel puts every yes or no
   * from one section under that section's name, "Amenities", and gives each
   * choice a heading of its own, "Price".
   */
  sectionName: string
  kind: "toggle" | "select"
  /**
   * The boxes, each with its token in `slug` so the filter bar can draw them
   * with the same rows it draws categories with. A yes or no has exactly one.
   */
  options: DirectoryFilterOption[]
}

/** As many as a toolbar could hold, and a stop on a pasted address. */
const MAX_FIELD_FILTER_TOKENS = 20
const MAX_FIELD_FILTER_TOKEN_LENGTH = 400

function fieldFilterId(sectionSlug: string, fieldKey: string) {
  return `${sectionSlug}.${fieldKey}`
}

export function fieldFilterToken(
  sectionSlug: string,
  fieldKey: string,
  answer?: string
) {
  const id = fieldFilterId(sectionSlug, fieldKey)
  return answer === undefined ? id : `${id}:${encodeURIComponent(answer)}`
}

/**
 * The ticked field filters, read out of the address. Blanks and duplicates go
 * and the list is capped. Nothing here checks a token names a real field: the
 * server does that against the site's definitions and drops what it cannot
 * find, so a stale link shows the directory rather than an error.
 */
export function readDirectoryFieldFilters(value: unknown): string[] {
  if (typeof value !== "string") return []
  const seen = new Set<string>()
  for (const part of value.split(",")) {
    const token = part.trim()
    if (token && token.length <= MAX_FIELD_FILTER_TOKEN_LENGTH) seen.add(token)
    if (seen.size >= MAX_FIELD_FILTER_TOKENS) break
  }
  return [...seen]
}

export function formatDirectoryFieldFilters(tokens: readonly string[]) {
  return tokens.length ? tokens.join(",") : undefined
}

/** The address value after one box is clicked: the token added, or taken out. */
export function toggleDirectoryFieldFilter(value: unknown, token: string) {
  const current = readDirectoryFieldFilters(value)
  const next = current.includes(token)
    ? current.filter((row) => row !== token)
    : [...current, token]
  return formatDirectoryFieldFilters(next)
}

/** What the server filters on: one entry per field, either-of within it. */
export type FieldFilterCondition =
  | { section: string; key: string; kind: "toggle" }
  | { section: string; key: string; kind: "select"; answers: string[] }

/** Every field this site has marked as a filter, in the order it defined them. */
function filterableFields(sections: readonly CustomSection[]) {
  return sections.flatMap((section) =>
    section.fields.flatMap((field) =>
      field.type === "toggle" || field.type === "select"
        ? field.filter
          ? [{ section, field }]
          : []
        : []
    )
  )
}

/**
 * The address's tokens matched against what the site defines.
 *
 * A token for a field that is not marked as a filter, or an answer the field
 * no longer offers, is dropped rather than applied. Filtering on something
 * the page cannot show a box for would narrow the list with no way to see why.
 * Two answers of one choice mean either of them; two fields mean both.
 */
export function fieldFilterConditions(
  sections: readonly CustomSection[],
  tokens: readonly string[]
): FieldFilterCondition[] {
  if (!tokens.length) return []
  const wanted = new Set(tokens)
  const conditions: FieldFilterCondition[] = []

  for (const { section, field } of filterableFields(sections)) {
    if (field.type === "toggle") {
      if (wanted.has(fieldFilterToken(section.slug, field.key))) {
        conditions.push({ section: section.slug, key: field.key, kind: "toggle" })
      }
      continue
    }
    const answers = field.options
      .map((option) => option.value)
      .filter((answer) =>
        wanted.has(fieldFilterToken(section.slug, field.key, answer))
      )
    if (answers.length) {
      conditions.push({
        section: section.slug,
        key: field.key,
        kind: "select",
        answers,
      })
    }
  }

  return conditions
}

/**
 * Every box the bar could draw, before counting. The server counts each one
 * under the page's other filters and drops the empty ones with
 * `countedFieldFilters`.
 */
export function fieldFilterBoxes(sections: readonly CustomSection[]) {
  return filterableFields(sections).map(({ section, field }) => ({
    id: fieldFilterId(section.slug, field.key),
    section: section.slug,
    sectionName: section.name,
    key: field.key,
    name: field.label,
    kind: field.type === "toggle" ? ("toggle" as const) : ("select" as const),
    boxes:
      field.type === "toggle"
        ? [
            {
              token: fieldFilterToken(section.slug, field.key),
              name: field.label,
              stored: { [section.slug]: { [field.key]: true } },
            },
          ]
        : field.options.map((option) => ({
            token: fieldFilterToken(section.slug, field.key, option.value),
            name: option.label,
            stored: { [section.slug]: { [field.key]: option.value } },
          })),
  }))
}

/**
 * The boxes with their counts, leaving out every box that would empty the
 * page, and every field left with no box: a box that can only return an empty
 * page is a dead end. A ticked box always stays, even at 0, or there would be
 * no way to untick it.
 */
export function countedFieldFilters(
  fields: ReturnType<typeof fieldFilterBoxes>,
  countFor: (token: string) => number,
  ticked: readonly string[] = []
): DirectoryFieldFilter[] {
  return fields.flatMap((field) => {
    const options = field.boxes.flatMap((box) => {
      const count = countFor(box.token)
      return count > 0 || ticked.includes(box.token)
        ? [{ slug: box.token, name: box.name, count }]
        : []
    })
    return options.length
      ? [
          {
            id: field.id,
            name: field.name,
            sectionName: field.sectionName,
            kind: field.kind,
            options,
          },
        ]
      : []
  })
}

/**
 * The ticked boxes in the visitor's own words, for the sentence over the
 * results: "Has wifi" for a yes or no, "Price: Cheap" for an answer.
 */
export function tickedFieldFilterNames(
  filters: readonly DirectoryFieldFilter[],
  tokens: readonly string[]
): string[] {
  const names: string[] = []
  for (const filter of filters) {
    for (const option of filter.options) {
      if (!tokens.includes(option.slug)) continue
      names.push(
        filter.kind === "toggle" ? filter.name : `${filter.name}: ${option.name}`
      )
    }
  }
  return names
}

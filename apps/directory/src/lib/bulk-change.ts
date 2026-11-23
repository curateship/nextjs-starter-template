/**
 * Changing several records at once from a dashboard's action bar.
 *
 * Deleting many already counted honestly: `done` went, `kept` did not. A change
 * needs a third pile. Asking forty listings to join a category when three are
 * already in it did not fail on those three and did not change them either,
 * and a result that calls them either one is a lie the admin cannot check.
 *
 * The type lives here rather than beside the tables because the dashboards
 * read it too, and a client file may not import from `@/server/*`.
 */

/** The one field an action bar change writes. */
export type BulkRecordChange =
  | { kind: "status"; status: "draft" | "published" }
  | {
      kind: "category"
      categoryId: string
      /** Add it to the categories the record already has, or replace them. */
      mode: "add" | "replace"
    }
  /** Events only: the free featured switch an admin sets by hand. */
  | { kind: "featured"; featured: boolean }

export type BulkChange = {
  /** The records that changed. */
  done: string[]
  /** The records already like that, so nothing was written to them. */
  same: string[]
  /** The records that could not change, each with the reason for it. */
  kept: { id: string; reason: string }[]
}

/** The reason a record that was on screen a moment ago cannot be changed. */
export const RECORD_IS_GONE = "it no longer exists"

/**
 * Counts one bulk change. Anything asked for that neither changed nor was
 * already that way is gone: somebody deleted it between the list loading and
 * the button being pressed.
 */
export function countBulkChange(
  ids: string[],
  done: string[],
  same: string[]
): BulkChange {
  const accounted = new Set([...done, ...same])
  return {
    done,
    same,
    kept: ids
      .filter((id) => !accounted.has(id))
      .map((id) => ({ id, reason: RECORD_IS_GONE })),
  }
}

/**
 * Nothing was asked for, so nothing happened.
 *
 * A function rather than one shared object, because this is returned straight
 * out of a server function and a caller that pushed an id into its `done` would
 * be writing into every other caller's answer.
 */
export function noBulkChange(): BulkChange {
  return { done: [], same: [], kept: [] }
}

/**
 * The four dashboards hand their action bar the same change object, and each
 * screen's door takes only the actions that screen offers. These two narrow it
 * on the way. A change a screen never shows reaching its door is a caller bug,
 * so it is said out loud rather than quietly dropped.
 */
export function withoutFeatured(
  change: BulkRecordChange
): Exclude<BulkRecordChange, { kind: "featured" }> {
  if (change.kind === "featured") {
    throw new Error("Only an event has a free featured flag.")
  }
  return change
}

export function statusOnly(
  change: BulkRecordChange
): Extract<BulkRecordChange, { kind: "status" }> {
  if (change.kind !== "status") {
    throw new Error("A deal has no categories and no featured flag.")
  }
  return change
}

/**
 * What happened to the records, past tense, for the result line to say.
 *
 * Each one has to read right in all three of "40 changed", "2 were already
 * that way" and "1 could not be". That is why unfeaturing is "taken off the
 * featured list" rather than "unfeatured", and why replacing a category says
 * "only": the word carries which of the two category actions ran.
 */
export function bulkChangeVerb(
  change: BulkRecordChange,
  /** The chosen category's name. Only read for a category change. */
  categoryName: string
): string {
  if (change.kind === "status") {
    return change.status === "published" ? "published" : "unpublished"
  }
  if (change.kind === "featured") {
    return change.featured ? "featured" : "taken off the featured list"
  }
  return change.mode === "replace"
    ? `filed under ${categoryName} only`
    : `added to ${categoryName}`
}

/** "a", "a and b", "a, b and c" — names in a sentence, not a list. */
function namesInASentence(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * The refusals in words: which records did not change and why, one sentence per
 * reason. Empty when every record was accounted for, so the caller can skip the
 * failure toast entirely.
 */
export function describeBulkRefusals(
  kept: { id: string; reason: string }[],
  /** The row's name as the screen shows it. */
  titleOf: (id: string) => string
): string {
  if (kept.length === 0) return ""
  const byReason = new Map<string, string[]>()
  for (const refusal of kept) {
    byReason.set(refusal.reason, [
      ...(byReason.get(refusal.reason) ?? []),
      titleOf(refusal.id),
    ])
  }
  return [...byReason]
    .map(
      ([reason, names]) =>
        `${namesInASentence(names)} could not be changed: ${reason}.`
    )
    .join(" ")
}

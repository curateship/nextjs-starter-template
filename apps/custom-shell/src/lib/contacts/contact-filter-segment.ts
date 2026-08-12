import type { SegmentCondition } from "@/lib/contacts/contact-segments"

/**
 * Copies the contacts list's rules into a new segment draft.
 *
 * Search text is deliberately not an input. It searches names and addresses,
 * which a segment rule cannot honestly express. The list filters already use
 * the segment rule shape, so the only mapping needed is a copy that keeps the
 * draft independent from the address-bar state.
 */
export function segmentConditionsFromContactFilters(
  conditions: SegmentCondition[]
): SegmentCondition[] {
  return conditions.map((condition) => {
    if (condition.type === "tag") {
      return { ...condition, tags: [...condition.tags] }
    }
    if (condition.type === "notIn") {
      return { ...condition, segmentIds: [...condition.segmentIds] }
    }
    return { ...condition }
  })
}

/**
 * Whether the list total may still include search words.
 *
 * The text box updates before the address and loader. Checking both sides
 * covers typing new words and clearing old ones during that short handoff.
 */
export function contactSearchAffectsDisplayedTotal(
  searchText: string,
  appliedSearch: string
): boolean {
  return Boolean(searchText.trim() || appliedSearch.trim())
}

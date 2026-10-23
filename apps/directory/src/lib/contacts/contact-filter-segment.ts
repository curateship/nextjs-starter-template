import type { SegmentRules } from "@/lib/contacts/contact-segments"

/**
 * Copies the contacts list's rules into a new segment draft.
 *
 * Search text is deliberately not an input. It searches names and addresses,
 * which a segment rule cannot honestly express. The list filters already use
 * the segment rule shape, so the only mapping needed is a copy that keeps the
 * draft independent from the address-bar state.
 */
export function segmentRulesFromContactFilters(
  rules: SegmentRules
): SegmentRules {
  return {
    ...(rules.match === "any" ? { match: "any" as const } : {}),
    conditions: rules.conditions.map((condition) => {
      if (condition.type === "tag") {
        return { ...condition, tags: [...condition.tags] }
      }
      if (condition.type === "in" || condition.type === "notIn") {
        return { ...condition, segmentIds: [...condition.segmentIds] }
      }
      return { ...condition }
    }),
  }
}

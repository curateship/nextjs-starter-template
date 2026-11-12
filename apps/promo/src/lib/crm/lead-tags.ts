/**
 * The rules for a lead's tags (CRM task 27), shared by the screen and the
 * server: one spelling, lowered and trimmed, with no comma, because a comma
 * is what splits a typed list into tags.
 */
export const CRM_LEAD_TAG_MAX_LENGTH = 60
export const CRM_LEAD_TAG_LIMIT = 30

/** The one spelling a tag is stored and found by, or null when nothing usable is left. */
export function normalizeLeadTag(value: string): string | null {
  const tag = value.trim().toLowerCase().replace(/\s+/g, " ")
  if (!tag || tag.includes(",") || tag.length > CRM_LEAD_TAG_MAX_LENGTH) return null
  return tag
}

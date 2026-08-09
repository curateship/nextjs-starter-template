/**
 * Listing and category addresses: what somebody typed, turned into the slug it
 * will actually answer on. Shared by the edit forms (to suggest a slug as the
 * title is typed) and the server (which is the one that enforces it).
 */

/** "Joe's Diner & Grill " → "joes-diner-grill". */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160)
}

/** Slugs are plain: lowercase letters, numbers, dashes between them. */
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Why this slug cannot be used, or null when it can. A sentence rather than a
 * code, because it is something the admin typed and the form shows it back.
 */
export function slugProblem(slug: string): string | null {
  if (!slug) {
    return "The address part cannot be empty — something like joes-diner."
  }
  if (!VALID_SLUG.test(slug)) {
    return "An address part can use lowercase letters, numbers and dashes, like joes-diner."
  }
  return null
}

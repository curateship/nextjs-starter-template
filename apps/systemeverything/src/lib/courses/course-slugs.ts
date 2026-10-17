/**
 * The address names of courses and chapters: `/courses/<course>/<chapter>`.
 * Lower-case letters, digits and single dashes, so an address reads the same
 * when it is typed, said aloud or pasted.
 */

export const MAX_SLUG_LENGTH = 160

/**
 * Words a course may not be called, because `/courses/<word>` is already
 * another page: the stable chapter links and the Saved list.
 */
export const RESERVED_COURSE_SLUGS = ["to", "saved"] as const

export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "")
}

/** Why an address name will not do, in words for the admin, or null. */
export function slugProblem(slug: string, kind: "course" | "chapter"): string | null {
  if (!slug) return "The address can't be empty."
  if (slug.length > MAX_SLUG_LENGTH) {
    return `The address can be at most ${MAX_SLUG_LENGTH} characters.`
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "The address can only hold lower-case letters, numbers and single dashes."
  }
  if (
    kind === "course" &&
    (RESERVED_COURSE_SLUGS as readonly string[]).includes(slug)
  ) {
    return `"${slug}" is already another page under /courses. Pick a different address.`
  }
  return null
}

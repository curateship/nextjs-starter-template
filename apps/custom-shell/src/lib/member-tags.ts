export const MEMBER_TAG_LIMIT = 50
export const MEMBER_TAG_MAX_LENGTH = 100
export const MEMBER_TAG_SEPARATOR = ","

/** The one spelling every manual edit, flow step and audience query uses. */
export function normalizeMemberTag(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizeMemberTags(values: string[]): string[] {
  const tags = [...new Set(values.map(normalizeMemberTag).filter(Boolean))]
  if (tags.some((tag) => tag.length > MEMBER_TAG_MAX_LENGTH)) {
    throw new Error("MEMBER_TAG_TOO_LONG")
  }
  if (tags.some((tag) => tag.includes(MEMBER_TAG_SEPARATOR))) {
    throw new Error("MEMBER_TAG_INVALID")
  }
  if (tags.length > MEMBER_TAG_LIMIT) throw new Error("MEMBER_TAG_LIMIT")
  return tags.sort((left, right) => left.localeCompare(right))
}

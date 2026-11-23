/**
 * Tags on tasks: short labels such as "admin" or "email" that cut across
 * projects. Tyler set the cap at three per task on 7 Oct 2026, so a row stays
 * readable beside its project and priority.
 */
export const MAX_TASK_TAGS = 3
export const TAG_NAME_MAX_LENGTH = 24

/**
 * The one spelling a tag is stored and compared in: trimmed, inner spaces
 * squeezed to one, lower case. "Admin " and "admin" are the same tag, so the
 * picker never offers both. Returns "" for a name with nothing in it.
 */
export function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase().slice(0, TAG_NAME_MAX_LENGTH)
}

/** Whether two tag lists hold the same names, ignoring order. */
export function sameTags(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((tag) => right.includes(tag))
  )
}

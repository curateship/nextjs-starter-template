/**
 * Whether a database error is a unique-index refusal.
 *
 * Drizzle wraps the driver error, so the code is found by walking the `cause`
 * chain rather than trusting the top-level error.
 */
export function isUniqueViolation(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

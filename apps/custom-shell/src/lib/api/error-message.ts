/**
 * Builds the error-to-sentence lookup every API file used to hand-write: take
 * the thrown error, find the first known code inside its message, and return
 * the sentence the toast should show. Unknown errors fall back to one honest
 * default per feature.
 *
 * FORBIDDEN and AUTH_REQUIRED — thrown by the shared guards in
 * `@/server/security` — are folded into every lookup here; a feature map can
 * still override either with wording of its own.
 */
const AUTH_ERRORS: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function createErrorMessage(
  messages: Record<string, string>,
  fallback: string
) {
  const map: Record<string, string> = { ...AUTH_ERRORS, ...messages }

  return (error: unknown) => {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : ""
    const matched = Object.keys(map).find((code) => message.includes(code))
    return matched ? map[matched] : fallback
  }
}

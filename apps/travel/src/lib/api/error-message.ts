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

/**
 * The two guard codes said in words, or null when the failure is something
 * else. For the handful of features whose errors are already written for the
 * reader ("File is empty") and so pass their message straight through — those
 * still need the guards' bare codes turned into a sentence first.
 */
export function describeAuthError(message: string) {
  const matched = Object.keys(AUTH_ERRORS).find((code) => message.includes(code))
  return matched ? AUTH_ERRORS[matched] : null
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

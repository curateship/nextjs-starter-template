import { describeAuthError } from "@/lib/api/error-message"

/**
 * What a failed course action says on screen. The server's refusals are
 * sentences about what the person did, so they pass through. Anything that
 * reads like the database talking does not.
 */
export function getCourseErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  const auth = describeAuthError(message)
  if (auth) return auth
  if (
    !message ||
    message.length > 300 ||
    /violates|duplicate key|syntax|ECONN/i.test(message)
  ) {
    return "That could not be saved. Please try again."
  }
  return message
}

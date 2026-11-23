import { describeAuthError } from "@/lib/api/error-message"

/**
 * The words a failed Dating request shows. Date's server functions already
 * throw sentences written for the reader, so they pass straight through; the
 * shell's two guard codes are turned into sentences first.
 */
export function datingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (message === "ENCRYPTION_NOT_CONFIGURED") {
    return "The server has no encryption key set, so it cannot keep a phone's key. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY and restart it."
  }
  return describeAuthError(message) ?? (message || "Date could not do that. Try again.")
}

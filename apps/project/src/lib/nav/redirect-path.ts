/**
 * Only same-origin, root-relative paths are honoured after signing in. A
 * protocol-relative ("//evil.com") or absolute ("https://evil.com") value would
 * be an open redirect, so anything that is not a plain "/path" is dropped.
 *
 * The one rule for every sign-in path — the password form's `?redirect=` and
 * the same value carried out to Google and back — so none of them can be looser
 * than another.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (!value.startsWith("/")) return undefined
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined
  return value
}

// Shared validation for public event slugs, used by the event page and the
// per-event calendar route so both reject the same inputs.
export function isValidEventSlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}
